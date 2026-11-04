/**
 * Cache accounting engine — pure functions, no I/O.
 *
 * Semantics follow deepseek-harness (dsh) statistics:
 * - four disjoint buckets: uncached input, cache read, cache write, output
 * - prompt tokens = uncached + read + write (output never enters the denominator)
 * - hit rate = read / prompt tokens, clamped to [0, 1]
 * - no billed prompt → null (callers hide the metric, never render 0 %)
 * - turn and session rates are token weighted, never an average of step rates
 */

/** Hit rate below which a sample counts as a cache miss. */
export const MISS_THRESHOLD = 0.5

/**
 * One-line Chinese description per part of the structural view.
 * Consumers (CLI, JSON, later a dashboard widget) print these verbatim so a
 * reader knows what each bucket actually holds.
 */
export const GLOSSARY = {
  rate: '缓存命中率：缓存读 ÷ 提示词合计；没有计费提示词时为空，不显示 0%。',
  promptTokens: '提示词合计：未命中输入＋缓存读＋缓存写，是命中率的分母；输出不在其中。',
  latestPromptTokens: '最新上下文：该轮最后一步实际发送的提示词规模，反映当下占了多少上下文。',
  cumulativePromptTokens: '累计请求量：该轮各步重复发送的提示词总和，随步数膨胀，不是上下文大小。',
  uncachedInput: '未命中输入：这次请求新发送、没有被前缀缓存覆盖的提示词 token，按全价计费。',
  cacheRead: '缓存读：命中已有前缀缓存、按折扣价复用的提示词 token；DeepSeek 直连即自动前缀缓存命中。',
  cacheWrite: '缓存写：为建立或刷新缓存而按输入价计费的提示词 token；DeepSeek 直连不报此桶，通常为 0。',
  output: '输出：模型生成的 token，含推理内容；按输出价计费，不参与命中率。',
  miss: '未命中标记：该轮 token 加权命中率低于 50%，多半是冷启动、压缩重启或前缀被改写。',
  steps: '样本数：该轮携带 usage 的 assistant 消息条数，也就是实际发出的请求次数。',
}

/** Read a finite non-negative number, else undefined. */
function count(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** First defined count among candidates. */
function first(...values) {
  for (const value of values) if (value !== undefined) return value
  return undefined
}

/** Absolute difference, safe on undefined. */
function diff(total, part) {
  return total === undefined || part === undefined ? undefined : total - part
}

/**
 * Normalize one provider usage object into disjoint buckets.
 * Accepts OpenClaw's normalized shape ({ input, output, cacheRead, cacheWrite }),
 * Anthropic's wire shape, and OpenAI's prompt/completion shape.
 * @param {unknown} raw provider usage object.
 * @returns {{uncachedInput: number, cacheRead: number, cacheWrite: number, output: number, promptTokens: number, totalTokens: number} | null}
 *   buckets, or null when the object reports no token bucket at all.
 */
export function normalizeUsage(raw) {
  if (raw === null || typeof raw !== 'object') return null
  const source = /** @type {Record<string, any>} */ (raw)
  const details = source.prompt_tokens_details ?? source.input_tokens_details ?? null

  const promptTotal = count(source.prompt_tokens)
  const cacheRead = first(
    count(source.cacheRead),
    count(source.cache_read_input_tokens),
    count(source.cachedInputTokens),
    count(details?.cached_tokens),
    count(details?.cache_read),
  )
  const cacheWrite = first(
    count(source.cacheWrite),
    count(source.cache_creation_input_tokens),
    count(details?.cache_write),
  )
  const output = first(count(source.output), count(source.outputTokens), count(source.completion_tokens))

  const explicitInput = first(count(source.input), count(source.inputTokens), count(source.input_tokens), count(source.uncachedInputTokens))
  const uncachedInput = first(explicitInput, diff(promptTotal, (cacheRead ?? 0) + (cacheWrite ?? 0)))

  if (uncachedInput === undefined && output === undefined && cacheRead === undefined && cacheWrite === undefined) {
    return null
  }

  const input = uncachedInput ?? 0
  const read = cacheRead ?? 0
  const write = cacheWrite ?? 0
  const produced = output ?? 0
  const promptTokens = input + read + write
  return {
    uncachedInput: input,
    cacheRead: read,
    cacheWrite: write,
    output: produced,
    promptTokens,
    totalTokens: promptTokens + produced,
  }
}

/**
 * Share of the prompt served from cache.
 * @param {{promptTokens: number, cacheRead: number} | null} usage normalized usage.
 * @returns {number | null} rate in [0, 1], or null when no prompt token was billed.
 */
export function cacheHitRate(usage) {
  if (usage === null || !(usage.promptTokens > 0)) return null
  return Math.min(1, Math.max(0, usage.cacheRead / usage.promptTokens))
}

/**
 * Turn one raw usage object into a measured sample.
 * @param {unknown} raw provider usage object.
 * @returns {{usage: ReturnType<typeof normalizeUsage>, rate: number | null, miss: boolean} | null}
 */
export function toSample(raw) {
  const usage = normalizeUsage(raw)
  if (usage === null) return null
  const rate = cacheHitRate(usage)
  return { usage, rate, miss: rate !== null && rate < MISS_THRESHOLD }
}

/** Add two bucket sets, treating missing cache fields as zero. */
function addBuckets(total, usage) {
  return {
    uncachedInput: total.uncachedInput + usage.uncachedInput,
    cacheRead: total.cacheRead + usage.cacheRead,
    cacheWrite: total.cacheWrite + usage.cacheWrite,
    output: total.output + usage.output,
    promptTokens: total.promptTokens + usage.promptTokens,
    totalTokens: total.totalTokens + usage.totalTokens,
  }
}

/** Empty bucket set. */
function zeroBuckets() {
  return { uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0, promptTokens: 0, totalTokens: 0 }
}

/**
 * Token-weighted rate over samples that reported a prompt.
 * @param {Array<{usage: {promptTokens: number, cacheRead: number}} | null>} samples
 * @returns {number | null}
 */
function weightedRate(samples) {
  let read = 0
  let prompt = 0
  for (const sample of samples) {
    if (sample === null || sample === undefined) continue
    read += sample.usage.cacheRead
    prompt += sample.usage.promptTokens
  }
  return prompt > 0 ? Math.min(1, read / prompt) : null
}

/**
 * Fold samples into per-turn rows, session totals, and a rate histogram.
 * @param {Array<{turn: number, sample: ReturnType<typeof toSample>}>} entries measured samples with their turn index.
 * @param {{bins?: number}} [options]
 */
export function fold(entries, options = {}) {
  const bins = options.bins ?? 10
  /** @type {Map<number, any[]>} */
  const byTurn = new Map()
  const totals = zeroBuckets()
  let measured = 0
  let misses = 0

  for (const entry of entries) {
    if (entry === null || entry.sample === null) continue
    const list = byTurn.get(entry.turn) ?? []
    list.push(entry.sample)
    byTurn.set(entry.turn, list)
    measured += 1
    if (entry.sample.miss) misses += 1
    Object.assign(totals, addBuckets(totals, entry.sample.usage))
  }

  const turns = [...byTurn.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([turn, samples]) => {
      const rows = samples.filter((sample) => sample.rate !== null)
      const latest = samples.filter((sample) => sample.usage.promptTokens > 0).at(-1)
      return {
        turn,
        steps: samples.length,
        measured: rows.length,
        rate: weightedRate(samples),
        cacheRead: samples.reduce((sum, sample) => sum + sample.usage.cacheRead, 0),
        cacheWrite: samples.reduce((sum, sample) => sum + sample.usage.cacheWrite, 0),
        uncachedInput: samples.reduce((sum, sample) => sum + sample.usage.uncachedInput, 0),
        cumulativePromptTokens: samples.reduce((sum, sample) => sum + sample.usage.promptTokens, 0),
        latestPromptTokens: latest === undefined ? null : latest.usage.promptTokens,
        output: samples.reduce((sum, sample) => sum + sample.usage.output, 0),
        miss: rows.length > 0 && weightedRate(samples) < MISS_THRESHOLD,
      }
    })

  return {
    totals,
    rate: weightedRate(entries.map((entry) => entry?.sample ?? null)),
    measured,
    misses,
    turns,
    histogram: histogram(turns, bins),
  }
}

/**
 * Distribution of turn hit rates over usage weights.
 * Buckets are fixed-width [0,0.1) … [0.9,1]; the last bucket includes 100 %.
 * @param {Array<{rate: number | null, cumulativePromptTokens: number}>} turns
 * @param {number} bins
 */
export function histogram(turns, bins = 10) {
  const width = 1 / bins
  const rows = Array.from({ length: bins }, (_unused, index) => ({
    from: index * width,
    to: index === bins - 1 ? 1 : (index + 1) * width,
    count: 0,
    promptTokens: 0,
    share: 0,
  }))
  let total = 0
  for (const turn of turns) {
    if (turn.rate === null || !(turn.cumulativePromptTokens > 0)) continue
    const index = Math.min(bins - 1, Math.floor(turn.rate / width))
    rows[index].count += 1
    rows[index].promptTokens += turn.cumulativePromptTokens
    total += turn.cumulativePromptTokens
  }
  for (const row of rows) row.share = total > 0 ? row.promptTokens / total : 0
  return rows
}

/** Render a rate as a percentage string, or a dash when it does not exist. */
export function formatRate(rate) {
  return rate === null || rate === undefined ? '—' : `${(rate * 100).toFixed(2)}%`
}

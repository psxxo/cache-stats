/**
 * Read-only adapter: OpenClaw agent transcript databases → measured cache samples.
 *
 * Never writes, never migrates, never opens the file for anything but SELECT.
 * Live transcripts sit in transcript_events; cold rows keep their JSON in
 * event_zstd, so decoding falls back to node:zlib zstd.
 */

import { DatabaseSync } from 'node:sqlite'
import { zstdDecompressSync } from 'node:zlib'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { toSample, fold } from './engine.mjs'

/** Root of the OpenClaw state directory. */
export const HOME = process.env.OPENCLAW_HOME ?? join(os.homedir(), '.openclaw')

/** Absolute path of one agent's transcript database. */
export function agentDbPath(agentId, home = HOME) {
  return join(home, 'agents', agentId, 'agent', 'openclaw-agent.sqlite')
}

/** Agents that have a readable transcript database, from the state registry when possible. */
export function listAgents(home = HOME) {
  const registry = join(home, 'state', 'openclaw.sqlite')
  if (existsSync(registry)) {
    try {
      const db = new DatabaseSync(registry, { readOnly: true })
      try {
        return db.prepare('select agent_id as agentId, path from agent_databases order by agent_id').all()
          .map((row) => ({ agentId: row.agentId, path: join(home, row.path) }))
          .filter((row) => existsSync(row.path))
      } finally {
        db.close()
      }
    } catch {
      // Fall through to the directory scan when the registry is unreadable.
    }
  }
  const agentsDir = join(home, 'agents')
  if (!existsSync(agentsDir)) return []
  return readdirSync(agentsDir)
    .map((agentId) => ({ agentId, path: agentDbPath(agentId, home) }))
    .filter((row) => existsSync(row.path))
}

/** Open one agent database read-only. */
export function openAgentDb(agentId, home = HOME) {
  const path = agentDbPath(agentId, home)
  if (!existsSync(path)) throw new Error(`no transcript database for agent ${agentId}: ${path}`)
  return new DatabaseSync(path, { readOnly: true })
}

/** Decode one transcript row to JSON text, decompressing cold rows. */
function eventText(row) {
  if (typeof row.event_json === 'string') return row.event_json
  if (row.event_zstd !== null && row.event_zstd !== undefined) {
    return zstdDecompressSync(Buffer.from(row.event_zstd)).toString('utf8')
  }
  return null
}

/**
 * Sessions recorded in one agent database.
 * @returns {Array<{sessionId: string, events: number, lastAt: number}>}
 */
export function listSessions(db, { limit = 40 } = {}) {
  return db.prepare(`
    select session_id as sessionId, count(*) as events, max(created_at) as lastAt
    from transcript_events
    group by session_id
    order by lastAt desc
    limit ?
  `).all(limit).map((row) => ({ sessionId: row.sessionId, events: row.events, lastAt: row.lastAt }))
}

/**
 * Assign a turn number to each ordered message.
 *
 * Basis, in order of preference: user messages (chat sessions), runId changes
 * (cron / subagent sessions that never record a user message), otherwise one
 * single turn. Keeping this pure lets the boundary rule be tested without a
 * database.
 * @param {Array<{role: string, runId?: string}>} messages messages in log order.
 * @returns {{turns: number[], basis: 'user' | 'runId' | 'single'}}
 */
export function assignTurns(messages) {
  const basis = messages.some((message) => message.role === 'user')
    ? 'user'
    : messages.some((message) => typeof message.runId === 'string' && message.runId !== '')
      ? 'runId'
      : 'single'

  const turns = []
  let turn = 0
  let lastKey
  for (const message of messages) {
    if (basis === 'user') {
      if (message.role === 'user') turn += 1
    } else if (basis === 'runId') {
      const key = message.runId ?? ''
      if (key !== '' && key !== lastKey) {
        turn += 1
        lastKey = key
      }
    }
    turns.push(turn)
  }
  return { turns, basis }
}

/**
 * Measured samples of one session, with a turn index that opens on each user message.
 * @param {DatabaseSync} db
 * @param {string} sessionId full id, or the shortest unambiguous prefix.
 * @returns {{sessionId: string, entries: Array<{turn: number, sample: ReturnType<typeof toSample>}>, skipped: number, basis: string}}
 */
export function readSession(db, sessionId, options = {}) {
  const ids = db.prepare('select distinct session_id as id from transcript_events where session_id like ? limit 2')
    .all(`${sessionId}%`).map((row) => row.id)
  if (ids.length === 0) throw new Error(`no session matching ${sessionId}`)
  if (ids.length > 1) throw new Error(`session prefix ${sessionId} is ambiguous: ${ids.join(', ')}`)
  const id = ids[0]

  const rows = db.prepare(`
    select seq, created_at as createdAt, event_json, event_zstd
    from transcript_events
    where session_id = ?
    order by seq
  `).all(id)

  const metas = []
  let skipped = 0
  for (const row of rows) {
    const text = eventText(row)
    if (text === null) {
      skipped += 1
      continue
    }
    let event
    try {
      event = JSON.parse(text)
    } catch {
      skipped += 1
      continue
    }
    const message = event?.message
    if (!message) continue
    const sample = message.role === 'assistant' && message.usage ? toSample(message.usage) : null
    if (message.role === 'assistant' && message.usage && sample === null) skipped += 1
    metas.push({
      role: typeof message.role === 'string' ? message.role : '',
      runId: typeof message.__openclaw?.runId === 'string' ? message.__openclaw.runId : undefined,
      at: typeof row.createdAt === 'number' ? row.createdAt : undefined,
      sample,
    })
  }

  const { turns, basis } = assignTurns(metas)
  let entries = metas.flatMap((meta, index) => (meta.sample === null
    ? []
    : [{ turn: turns[index], sample: meta.sample, at: meta.at }]))
    .filter((entry) => !options.since || (typeof entry.at === 'number' && entry.at >= options.since))
  // 重置后轮次从 1 重新编号，面板显示“第1轮”而不是原始会话轮号。
  if (options.since) {
    const unique = [...new Set(entries.map((entry) => entry.turn))].sort((a, b) => a - b)
    const renumber = new Map(unique.map((turn, index) => [turn, index + 1]))
    entries = entries.map((entry) => ({ ...entry, turn: renumber.get(entry.turn) }))
  }
  return { sessionId: id, entries, skipped, basis }
}

/**
 * Fold one session into turns, totals, and a hit-rate histogram.
 * @param {string} agentId
 * @param {{session?: string, bins?: number}} [options] session defaults to the latest.
 */
export function collect(agentId, options = {}) {
  const db = openAgentDb(agentId)
  try {
    const sessionId = options.session ?? listSessions(db, { limit: 1 })[0]?.sessionId
    if (!sessionId) throw new Error(`agent ${agentId} has no sessions`)
    const { sessionId: id, entries, skipped, basis } = readSession(db, sessionId, { since: options.since })
    return { agentId, sessionId: id, skipped, basis, ...fold(entries, { bins: options.bins ?? 10 }) }
  } finally {
    db.close()
  }
}

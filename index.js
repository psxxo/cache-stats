// Cache Stats — backend surface.
//
// Two jobs:
// 1. Serve `cache-stats.session` for the composer pill / popover (read-only).
// 2. P0 reporter: push per-turn cache accounting into 灵犀's efficiency module
//    (`POST /efficiency/pool/report`). Report-only: it never changes prompts.

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const PLUGIN_ID = "cache-stats";
const METHOD = "cache-stats.session";
const RESET_METHOD = "cache-stats.reset";
const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_HOME = process.env.OPENCLAW_HOME ?? join(os.homedir(), ".openclaw");
// 插件可能从 tmp 快照目录加载，状态必须写到稳定位置，否则重启即丢。
const RESET_STATE = join(STATE_HOME, "cache-stats", "reset-state.json");

/** 重置时间表：sessionId → epochMs；只存在插件目录，不碰会话数据。 */
function readResetMap() {
  try { return JSON.parse(readFileSync(RESET_STATE, "utf8")) ?? {}; } catch { return {}; }
}
function writeResetMap(map) {
  try {
    mkdirSync(dirname(RESET_STATE), { recursive: true });
    writeFileSync(RESET_STATE, JSON.stringify(map, null, 2) + "\n");
  } catch (error) {
    console.error(`[cache-stats] reset state write failed: ${error?.message ?? error}`);
  }
}
function resetAtOf(sessionId) {
  const value = readResetMap()[sessionId];
  return typeof value === "number" ? value : undefined;
}
const HOME = process.env.OPENCLAW_HOME ?? join(os.homedir(), ".openclaw");
// 发布包自带只读适配器；本地开发时仍可回落到工作区 lib。
const ENGINE_DIR = existsSync(join(HERE, "lib", "store.mjs"))
  ? join(HERE, "lib")
  : join(HOME, "workspace", "lib", "cache-stats");

/** Agent id embedded in a session key (`agent:<id>:...`). */
function agentOf(sessionKey) {
  const match = /^agent:([^:]+):/.exec(typeof sessionKey === "string" ? sessionKey : "");
  return match ? match[1] : null;
}

/** Resolve the transcript session id recorded for one session key. */
function sessionIdOf(sessionKey) {
  // Prefer the agent store's current window: after a fork or reset the key
  // keeps a chain of session ids, and session_state_events can still point at
  // the retired branch (the UI then shows that branch's frozen turn count).
  const agentId = agentOf(sessionKey);
  if (agentId) {
    try {
      const db = new DatabaseSync(join(HOME, "agents", agentId, "agent", "openclaw-agent.sqlite"), { readOnly: true });
      try {
        const row = db.prepare(
          "select session_id as id from session_windows where session_key = ? order by updated_at desc limit 1",
        ).get(sessionKey);
        if (row?.id) return row.id;
      } finally {
        db.close();
      }
    } catch {
      // Fall through to the legacy event mapping.
    }
  }
  const db = new DatabaseSync(join(HOME, "state", "openclaw.sqlite"), { readOnly: true });
  try {
    const row = db.prepare(
      "select session_id as id from session_state_events where session_key = ? order by occurred_at desc limit 1",
    ).get(sessionKey);
    return row?.id ?? null;
  } finally {
    db.close();
  }
}

/** Reverse lookup: session key recorded for one transcript id. */
function sessionKeyOf(sessionId) {
  const db = new DatabaseSync(join(HOME, "state", "openclaw.sqlite"), { readOnly: true });
  try {
    const row = db.prepare(
      "select session_key as key from session_state_events where session_id = ? order by occurred_at desc limit 1",
    ).get(sessionId);
    return row?.key ?? null;
  } finally {
    db.close();
  }
}

/** One-shot "open the settings panel" flag, written by the operator/agent. */
function readOpenSetup(sessionKey) {
  try {
    const file = join(HOME, "cache-stats-show-setup.json");
    if (!existsSync(file)) return false;
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (parsed?.sessionKey !== sessionKey) return false;
    return Date.now() - Number(parsed.at ?? 0) < 120_000;
  } catch {
    return false;
  }
}

/**
 * Fold one session's cache statistics.
 * @param {string} sessionKey Control UI session key (`agent:<id>:<rest>`).
 * @param {{turns?: number, bins?: number}} [options] visible turn rows and histogram bins.
 */
export async function sessionStats(sessionKey, options = {}) {
  const agentId = agentOf(sessionKey);
  if (!agentId) throw new Error(`不是可识别的会话 key：${sessionKey ?? "(空)"}`);
  const sessionId = sessionIdOf(sessionKey);
  if (!sessionId) throw new Error(`会话还没有落盘记录：${sessionKey}`);

  const store = await import(join(ENGINE_DIR, "store.mjs"));
  const engine = await import(join(ENGINE_DIR, "engine.mjs"));
  const since = resetAtOf(sessionId) ?? resetAtOf(sessionKey);
  const folded = store.collect(agentId, { session: sessionId, bins: options.bins ?? 10, since });
  const turns = options.turns ?? 8;
  return {
    sessionKey,
    agentId,
    resetAt: since ?? null,
    ...folded,
    turns: folded.turns.slice(-turns),
    totalTurns: folded.turns.length,
    descriptions: engine.GLOSSARY,
    openSetup: readOpenSetup(sessionKey),
  };
}

/** Send one batch of turn reports to 灵犀; never throws. */
async function postReport(pool, payload) {
  const headers = { "content-type": "application/json" };
  if (pool.token) headers.authorization = `Bearer ${pool.token}`;
  try {
    const response = await fetch(`${pool.url.replace(/\/+$/, "")}/efficiency/pool/report`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { ok: false, status: response.status };
    return await response.json();
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}

/** Process-wide slot holding the single active reporter, shared across plugin reloads. */
const REPORTER_SLOT = Symbol.for("openclaw.cache-stats.pool-reporter");

/** Stop whichever reporter a previous plugin load left running. */
function stopReporter(api) {
  const current = globalThis[REPORTER_SLOT];
  if (current?.timer) {
    current.stopped = true;
    clearInterval(current.timer);
    api?.logger?.info?.(`[${PLUGIN_ID}] pool reporter stopped previous instance (${current.url})`);
  }
  delete globalThis[REPORTER_SLOT];
}

/**
 * P0 cycle: report every recent session of every agent, once per turn sample set.
 * @param {object} api plugin api.
 * @param {{url: string, token?: string, intervalMs?: number, agentsTurns?: number}} pool config.
 */
function startReporter(api, pool) {
  stopReporter(api);
  const sent = new Set();
  const cap = 5000;
  let lastErrorAt = 0;

  const cycle = async () => {
    try {
      const store = await import(join(ENGINE_DIR, "store.mjs"));
      for (const agent of store.listAgents()) {
        const db = store.openAgentDb(agent.agentId);
        let sessions = [];
        try {
          sessions = store.listSessions(db, { limit: 2 });
        } finally {
          db.close();
        }
        for (const session of sessions) {
          const key = sessionKeyOf(session.sessionId) ?? `agent:${agent.agentId}:${session.sessionId}`;
          const folded = store.collect(agent.agentId, { session: session.sessionId, bins: 10 });
          const turns = folded.turns.filter((turn) => turn.measured > 0);
          const fresh = turns.filter((turn) => {
            const signature = `${key}|${turn.turn}|${turn.cumulativePromptTokens}|${turn.cacheRead}`;
            if (sent.has(signature)) return false;
            sent.add(signature);
            return true;
          });
          if (fresh.length === 0) continue;
          if (sent.size > cap) sent.clear();
          for (let offset = 0; offset < fresh.length; offset += 50) {
            const chunk = fresh.slice(offset, offset + 50);
            const result = await postReport(pool, {
              agentId: agent.agentId,
              sessionKey: key,
              lineage: { reason: "p0-observe", messagesSent: turns.length },
              turns: chunk.map((turn) => ({
                turn: turn.turn,
                cacheRead: turn.cacheRead,
                cacheWrite: turn.cacheWrite,
                uncachedInput: turn.uncachedInput,
                output: turn.output,
                contextTokens: turn.cumulativePromptTokens,
                coldStart: turn.rate !== null && turn.rate < 0.5,
                reason: turn.miss ? "cold" : "warm",
              })),
            });
            if (result?.ok === false && Date.now() - lastErrorAt > 60_000) {
              lastErrorAt = Date.now();
              api.logger?.warn?.(`[${PLUGIN_ID}] pool report failed: ${result.error ?? result.status}`);
            }
          }
        }
      }
    } catch (error) {
      if (Date.now() - lastErrorAt > 60_000) {
        lastErrorAt = Date.now();
        api.logger?.warn?.(`[${PLUGIN_ID}] pool cycle failed: ${error?.message ?? error}`);
      }
    }
  };

  const timer = setInterval(() => { void cycle(); }, Math.max(60_000, pool.intervalMs ?? 600_000));
  timer.unref?.();
  const slot = { timer, url: pool.url, stopped: false };
  globalThis[REPORTER_SLOT] = slot;
  void cycle();
  return () => {
    slot.stopped = true;
    clearInterval(timer);
    if (globalThis[REPORTER_SLOT] === slot) delete globalThis[REPORTER_SLOT];
  };
}

/** Pool settings: file first (survives manifest-cache limits), then plugin config. */
function readPoolConfig(api) {
  const fromConfig = api.pluginConfig?.pool;
  if (fromConfig && fromConfig.enabled === true && typeof fromConfig.url === "string") return fromConfig;
  const file = join(HOME, "cache-stats-pool.json");
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (parsed?.enabled === true && typeof parsed.url === "string" && parsed.url.length > 0) return parsed;
  } catch {
    // A malformed file simply leaves the reporter off.
  }
  return null;
}

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "Cache Stats",
  description: "Composer cache hit-rate pill with a cache-structure popover.",
  register(api) {
    let lastBuild = null;
    // Every open pane polls this method, and each call re-reads the session
    // database (observed 1.7-4.2 s per call). Several panes polling every 15 s
    // made that the dominant recurring load on the gateway; under a burst the
    // admission queue gave up at 30 s and unrelated requests failed with it.
    // Collapse the load at its source: one read per session per TTL, and every
    // concurrent caller shares the in-flight read.
    const STATS_TTL_MS = 15_000;
    const statsCache = new Map();
    const statsPending = new Map();
    const cachedSessionStats = (sessionKey, options) => {
      const key = sessionKey ?? "";
      const hit = statsCache.get(key);
      if (hit && Date.now() - hit.at < STATS_TTL_MS) return Promise.resolve(hit.value);
      const running = statsPending.get(key);
      if (running) return running;
      const run = sessionStats(sessionKey, options)
        .then((value) => {
          statsCache.set(key, { at: Date.now(), value });
          return value;
        })
        .finally(() => {
          statsPending.delete(key);
        });
      statsPending.set(key, run);
      return run;
    };
    try {
      api.registerGatewayMethod?.(METHOD, async ({ params, respond }) => {
        try {
          const build = params?.build ?? "legacy";
          if (build !== lastBuild) {
            lastBuild = build;
            api.logger?.info?.(`[cache-stats] browser build=${build} session=${params?.sessionKey ?? "?"}`);
          }
          respond(true, await cachedSessionStats(params?.sessionKey, params ?? {}), undefined);
        } catch (error) {
          respond(false, undefined, { message: error?.message ?? String(error) });
        }
      }, { scope: "operator.read" });
    } catch (error) {
      api.logger?.warn?.(`[${PLUGIN_ID}] ${METHOD} unavailable: ${error?.message ?? error}`);
    }

    try {
      api.registerGatewayMethod?.(RESET_METHOD, async ({ params, respond }) => {
        try {
          const sessionKey = params?.sessionKey;
          const agentId = agentOf(sessionKey);
          if (!agentId) throw new Error("无法识别当前会话");
          const sessionId = sessionIdOf(sessionKey);
          const key = sessionId || sessionKey;
          const map = readResetMap();
          map[key] = Date.now();
          writeResetMap(map);
          statsCache.delete(sessionKey ?? "");
          api.logger?.info?.(`[cache-stats] reset ${sessionKey} -> ${key}`);
          respond(true, { ok: true, sessionId, resetAt: map[key] }, undefined);
        } catch (error) {
          api.logger?.warn?.(`[cache-stats] reset failed: ${error?.message ?? error}`);
          respond(false, undefined, { message: error?.message ?? String(error) });
        }
      }, { scope: "operator.read" });
    } catch (error) {
      api.logger?.warn?.(`[${PLUGIN_ID}] ${RESET_METHOD} unavailable: ${error?.message ?? error}`);
    }

    const pool = readPoolConfig(api);
    if (pool) {
      try {
        startReporter(api, pool);
        api.logger?.info?.(`[${PLUGIN_ID}] pool reporter on: ${pool.url}`);
      } catch (error) {
        api.logger?.warn?.(`[${PLUGIN_ID}] pool reporter failed to start: ${error?.message ?? error}`);
      }
    }

    // Host cleanup hook: tear the reporter down so a reload can retire this
    // instance instead of timing out on a live timer.
    return () => {
      stopReporter(api);
      statsCache.clear();
      statsPending.clear();
    };
  },
});

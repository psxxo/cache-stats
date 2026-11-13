import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CFG = process.env.SYS_STATUS_CONFIG || "/data/work/sys-status-board/config.json";
const cfg = JSON.parse(fs.readFileSync(CFG, "utf8"));
const M = cfg.metrics || {};
const PORT = Number(M.port || 18575);
const BIND = M.bind || "0.0.0.0";
const INTERVAL = Number(M.intervalMs || 3000);
const CACHE_DIR = M.cacheDir || "/data/work/sys-status-board/cache";
const CACHE_FILE = path.join(CACHE_DIR, "metrics.json");
const expand = function (p) { return p ? p.replace(/^~(?=\/)/, os.homedir()) : p; };
const CERT = expand(M.cert || "~/.openclaw/tls/memgraph-cert.pem");
const KEY = expand(M.key || "~/.openclaw/tls/memgraph-key.pem");

function readCpu() {
  return os.cpus().map(function (c) {
    const t = c.times;
    return { idle: t.idle + (t.irq || 0), total: Object.values(t).reduce(function (a, b) { return a + b; }, 0) };
  });
}
function cpuBusy(prev, cur) {
  let busy = 0, total = 0;
  const perCore = [];
  for (let i = 0; i < cur.length; i++) {
    const dIdle = cur[i].idle - prev[i].idle;
    const dTotal = cur[i].total - prev[i].total;
    const b = dTotal > 0 ? Math.max(0, Math.round(((dTotal - dIdle) / dTotal) * 100)) : 0;
    perCore.push(b);
    busy += dTotal - dIdle; total += dTotal;
  }
  return { busyPct: total > 0 ? Math.round((busy / total) * 100) : 0, perCore: perCore };
}
function readNet() {
  const txt = fs.readFileSync("/proc/net/dev", "utf8");
  let rx = 0, tx = 0;
  txt.split("\n").forEach(function (line) {
    const i = line.indexOf(":");
    if (i < 0) return;
    if (line.slice(0, i).trim() === "lo") return;
    const c = line.slice(i + 1).trim().split(/\s+/).map(Number);
    rx += c[0] || 0; tx += c[8] || 0;
  });
  return { rx: rx, tx: tx };
}
function meminfo() {
  const txt = fs.readFileSync("/proc/meminfo", "utf8");
  const m = {};
  txt.split("\n").forEach(function (line) {
    const kv = line.split(":");
    if (kv.length === 2) m[kv[0].trim()] = parseInt(kv[1], 10) * 1024;
  });
  const total = m["MemTotal"] || 0, avail = m["MemAvailable"] || 0, used = total - avail;
  const st = m["SwapTotal"] || 0, sf = m["SwapFree"] || 0;
  return {
    mem: { totalBytes: total, usedBytes: used, availableBytes: avail, usedPct: total ? Math.round((used / total) * 100) : 0 },
    swap: { totalBytes: st, usedBytes: st - sf, usedPct: st ? Math.round(((st - sf) / st) * 100) : 0 }
  };
}
function disk() {
  const s = fs.statfsSync("/");
  const total = s.blocks * s.bsize, avail = s.bavail * s.bsize;
  return { mount: "/", totalBytes: total, usedBytes: total - avail, availableBytes: avail, usedPct: total ? Math.round(((total - avail) / total) * 100) : 0 };
}
function loadavg() {
  const p = fs.readFileSync("/proc/loadavg", "utf8").trim().split(/\s+/).slice(0, 3).map(Number);
  return { load1: p[0], load5: p[1], load15: p[2] };
}

let prevCpu = readCpu(), prevNet = readNet(), prevNetAt = Date.now(), snapshot = null;
function sample() {
  const curCpu = readCpu();
  const cc = cpuBusy(prevCpu, curCpu);
  prevCpu = curCpu;
  const curNet = readNet();
  const now = Date.now();
  const dt = Math.max(1, (now - prevNetAt) / 1000);
  const rxBps = Math.round((curNet.rx - prevNet.rx) / dt);
  const txBps = Math.round((curNet.tx - prevNet.tx) / dt);
  prevNet = curNet; prevNetAt = now;
  const mi = meminfo();
  snapshot = {
    ts: now, host: os.hostname(), uptimeSec: Math.round(os.uptime()),
    cpu: { cores: os.cpus().length, busyPct: cc.busyPct, perCore: cc.perCore, load1: loadavg().load1, load5: loadavg().load5, load15: loadavg().load15 },
    mem: mi.mem, swap: mi.swap,
    net: { rxBps: rxBps, txBps: txBps, rxTotalBytes: curNet.rx, txTotalBytes: curNet.tx },
    disk: disk(), pid: process.pid
  };
}
fs.mkdirSync(CACHE_DIR, { recursive: true });
function publish() {
  try {
    const tmp = CACHE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(snapshot));
    fs.renameSync(tmp, CACHE_FILE);
  } catch (e) { console.error("cache write failed: " + e.message); }
}
sample(); publish();
setInterval(function () { sample(); publish(); }, INTERVAL);

https.createServer({ key: fs.readFileSync(KEY), cert: fs.readFileSync(CERT) }, function (req, res) {
  res.setHeader("content-type", "application/json");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", "no-store");
  try { res.end(fs.readFileSync(CACHE_FILE)); } catch { res.end(JSON.stringify(snapshot)); }
}).listen(PORT, BIND, function () { console.log("sys-status metrics on " + BIND + ":" + PORT); });

import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";

const CFG = process.env.SYS_STATUS_CONFIG || "/data/work/sys-status-board/config.json";
const cfg = JSON.parse(fs.readFileSync(CFG, "utf8"));
const S = cfg.sandbox || {};
const PORT = Number(S.port || 18574);
const BIND = S.listen || "0.0.0.0";
const TARGET = { host: "127.0.0.1", port: Number(S.targetPort || 18790) };
const expand = function (p) { return p ? p.replace(/^~(?=\/)/, os.homedir()) : p; };
const CERT = expand(S.cert || "~/.openclaw/tls/memgraph-cert.pem");
const KEY = expand(S.key || "~/.openclaw/tls/memgraph-key.pem");

const server = https.createServer({ key: fs.readFileSync(KEY), cert: fs.readFileSync(CERT) }, function (req, res) {
  const headers = Object.assign({}, req.headers, { host: "127.0.0.1:" + TARGET.port });
  const up = http.request(Object.assign({}, TARGET, { method: req.method, path: req.url, headers: headers }), function (r) {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  up.on("error", function () { try { res.writeHead(502); res.end("bad gateway"); } catch (e) {} });
  req.pipe(up);
});
server.on("upgrade", function (req, socket) {
  const up = http.request(Object.assign({}, TARGET, { method: req.method, path: req.url, headers: Object.assign({}, req.headers, { host: "127.0.0.1:" + TARGET.port }) }));
  up.on("upgrade", function (r, upSocket, upHead) {
    socket.write("HTTP/1.1 101 Switching Protocols\r\n" + Object.entries(r.headers).map(function (kv) { return kv[0] + ": " + kv[1]; }).join("\r\n") + "\r\n\r\n");
    if (upHead && upHead.length) socket.write(upHead);
    upSocket.pipe(socket);
    socket.pipe(upSocket);
  });
  up.on("error", function () { socket.destroy(); });
  up.end();
});
server.listen(PORT, BIND, function () { console.log("sys-status sandbox proxy on " + BIND + ":" + PORT + " -> " + TARGET.port); });

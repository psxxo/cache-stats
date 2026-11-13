import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "..");
const cfgPath = process.argv[2] || process.env.SYS_STATUS_CONFIG || "/data/work/sys-status-board/config.json";
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const tpl = fs.readFileSync(path.join(root, "assets/card.template.html"), "utf8");
const port = (cfg.metrics && cfg.metrics.port) || 18575;
const url = (cfg.ui && cfg.ui.metricsUrl) || ("https://" + cfg.host + ":" + port + "/metrics.json");
const origin = (cfg.ui && cfg.ui.metricsOrigin) || ("https://" + cfg.host + ":" + port);
const cols = String((cfg.board && cfg.board.gridCols) || 4);
const out = tpl.split("__METRICS_URL__").join(url).split("__METRICS_ORIGIN__").join(origin).split("__GRID_COLS__").join(cols);
const target = path.join(root, "assets/card.html");
fs.writeFileSync(target, out);
console.log("card rendered:", target, out.length, "bytes", "cols=" + cols);

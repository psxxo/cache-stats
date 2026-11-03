// Builds the plugin's native Control UI bundle into a content-hashed directory
// and points the manifest at it.
//
// The hashed path is what defeats browser module caching: a rebuild changes the
// URL, so a normal page refresh picks up the new bundle. The host serves
// user-installed plugin UI without an import map, so the SDK is inlined.
//
// Usage: node scripts/build-ui.mjs

import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const hostRequire = createRequire("/home/admin/.openclaw/extensions/typed-decisions/package.json");
const { build } = hostRequire("esbuild");

const sdkDir = "/usr/local/lib/node_modules/openclaw/dist/plugin-sdk";
const alias = {};
for (const name of readdirSync(sdkDir)) {
  if (name.endsWith(".d.ts")) continue;
  alias[`openclaw/plugin-sdk/${name.replace(/\.js$/, "")}`] = join(sdkDir, name);
}

const result = await build({
  entryPoints: [join(rootDir, "src", "control-ui.js")],
  bundle: true,
  write: false,
  format: "esm",
  target: ["es2022"],
  platform: "browser",
  legalComments: "none",
  sourcemap: false,
  alias,
  outdir: join(rootDir, "dist", ".build"),
  entryNames: "index",
});

const js = result.outputFiles.find((file) => file.path.endsWith(".js")) ?? result.outputFiles[0];
if (!js) throw new Error("control-ui build produced no JavaScript entry");

const hash = createHash("sha256").update(js.contents).digest("hex").slice(0, 12);
const targetDir = join(rootDir, "dist", "control-ui", hash);
rmSync(join(rootDir, "dist", "control-ui"), { recursive: true, force: true });
const { mkdir } = await import("node:fs/promises");
await mkdir(targetDir, { recursive: true });
await writeFile(join(targetDir, "index.js"), js.contents);

// Retain only the current revision.
for (const name of readdirSync(join(rootDir, "dist", "control-ui"))) {
  if (name !== hash) rmSync(join(rootDir, "dist", "control-ui", name), { recursive: true, force: true });
}

const manifestPath = join(rootDir, "openclaw.plugin.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.controlUi = { ...(manifest.controlUi ?? {}), entry: `dist/control-ui/${hash}/index.js` };
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`built dist/control-ui/${hash}/index.js and updated manifest`);

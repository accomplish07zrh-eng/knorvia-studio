import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../.."),
  assets = resolve(repo, "packages/web/dist/assets");
const repoPath = (path) => relative(repo, path).split(sep).join("/");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const names = [
  "flip-metric-value.tsx",
  "flip-metric-preference.ts",
  "scroll-fade-viewport.tsx",
  "scroll-fade-controller.ts",
  "toast.tsx",
  "toast-admission.ts",
  "toast-anchor-position.ts",
  "toast-presentation.tsx",
];
const owned = names.map((n) => "packages/ui/src/components/ui/" + n);
const consumers = [
  "packages/ui/src/ToolCallBlocks/renderers.tsx",
  "packages/ui/src/ToolCallBlocks/renderers/ExecuteOutput.tsx",
  "packages/ui/src/app-shell/BackgroundBashOutputSidePane.tsx",
];
const wanted = new Set([...owned, ...consumers]),
  found = new Map();
for (const filename of (await readdir(assets)).filter((n) => n.endsWith(".map"))) {
  const full = resolve(assets, filename),
    map = JSON.parse(await readFile(full, "utf8"));
  for (let i = 0; i < map.sources.length; i++) {
    const path = repoPath(resolve(dirname(full), map.sources[i]));
    if (!wanted.has(path)) continue;
    const actual = await readFile(resolve(repo, path), "utf8");
    const committed = execFileSync("git", ["show", `HEAD:${path}`], {
      cwd: repo,
      encoding: "utf8",
    });
    if (actual !== committed) throw Error("source differs from HEAD: " + path);
    if (actual !== map.sourcesContent[i]) throw Error("map bytes differ: " + path);
    if (!found.has(path))
      found.set(path, {
        sourceSha256: hash(actual),
        map: repoPath(full),
        mapSha256: hash(await readFile(full)),
        bundle: repoPath(full.slice(0, -4)),
        bundleSha256: hash(await readFile(full.slice(0, -4))),
      });
  }
}
for (const path of wanted) if (!found.has(path)) throw Error("missing emitted consumer: " + path);
const cssfiles = (await readdir(assets)).filter((n) => n.endsWith(".css"));
let css = "";
for (const path of cssfiles) css += await readFile(resolve(assets, path), "utf8");
const gradients = [
  "linear-gradient(#000 0 calc(100% - 24px),#0000 100%)",
  "linear-gradient(#0000 0,#000 24px 100%)",
  "linear-gradient(#0000 0,#000 24px calc(100% - 24px),#0000 100%)",
];
for (const gradient of gradients)
  for (const property of ["mask-image:", "-webkit-mask-image:"])
    if (!css.includes(property + gradient))
      throw Error("missing compiled gradient: " + property + gradient);
if (!css.includes("bottom:calc(1rem + env(safe-area-inset-bottom))"))
  throw Error("missing safe-area inset");
const dist = {};
for (const path of [...owned, ...consumers]) {
  const compiled = path.replace("/src/", "/dist/").replace(/\.tsx?$/, ".js");
  dist[compiled] = hash(await readFile(resolve(repo, compiled)));
}
const receipt = {
  productionCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).trim(),
  node: process.version,
  sourceMaps: Object.fromEntries(found),
  uiDist: dist,
  css: await Promise.all(
    cssfiles.map(async (name) => ({
      path: "packages/web/dist/assets/" + name,
      sha256: hash(await readFile(resolve(assets, name))),
    })),
  ),
  frozenMarkupSha256: hash(
    await readFile(resolve(repo, "packages/ui/test/ui-b5-view-hashes-20261001.json")),
  ),
};
if (process.env.KNORVIA_UI_B5_RECEIPT)
  await writeFile(process.env.KNORVIA_UI_B5_RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));

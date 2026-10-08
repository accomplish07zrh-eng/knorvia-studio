import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { ESM_REQUIRE_BANNER } from "./esm-require-banner.mjs";

// 回归：0.11.0 安装包因内联的 pngjs 7 动态 require("util") 启动即崩。
// 用 services 实际依赖的 pngjs 版本打成 ESM bundle，确认无 banner 时复现、有 banner 时可用。
const servicesRequire = createRequire(
  resolve(import.meta.dirname, "../packages/services/package.json"),
);
const pngjsEntry = servicesRequire.resolve("pngjs");

async function bundleAndRun(t, banner) {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-esm-banner-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const entry = join(dir, "entry.mjs");
  await writeFile(
    entry,
    `import { PNG } from ${JSON.stringify(pngjsEntry)};
const png = new PNG({ width: 2, height: 1 });
png.data.fill(255);
export const size = PNG.sync.read(PNG.sync.write(png)).width;`,
  );
  const outfile = join(dir, "out.mjs");
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
    absWorkingDir: dirname(pngjsEntry),
    ...(banner ? { banner } : {}),
  });
  return import(pathToFileURL(outfile).href);
}

test("inlined CommonJS pngjs fails in plain ESM bundles and loads with the require banner", async (t) => {
  await assert.rejects(bundleAndRun(t, undefined), /Dynamic require of "util"/);
  const loaded = await bundleAndRun(t, { ...ESM_REQUIRE_BANNER });
  assert.equal(loaded.size, 2);
});

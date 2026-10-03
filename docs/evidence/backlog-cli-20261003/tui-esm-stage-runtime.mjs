import assert from "node:assert/strict";
import { chmod, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const repository = process.cwd();
const { collectSeaTuiAssets, seaTuiAssetPrefix } = await import(pathToFileURL(resolve(repository, "apps/cli/packages/cli/scripts/sea-tui-assets.mjs")));
const { copyRuntimeNodeModules, patchNodePtyPrebuilds } = await import(pathToFileURL(resolve(repository, "scripts/distribution/assets.mjs")));
const directory = await mkdtemp(join(tmpdir(), "knorvia-tui-distribution-"));
const root = join(directory, "knorvia");
const target = "linux-x64";
const { assets, manifest } = await collectSeaTuiAssets({ root: resolve(repository, "apps/cli"), stagingDirectory: join(directory, "collector"), target });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const file of manifest.files) {
  const destination = join(root, "agent", file.path);
  await mkdir(dirname(destination), { recursive: true });
  await cp(assets[`${seaTuiAssetPrefix}${file.path}`], destination);
  await chmod(destination, file.mode);
  assert.equal(sha256(await readFile(destination)), file.sha256, file.path);
}
await cp(resolve(repository, "apps/cli/packages/cli/dist/knorvia.cjs"), join(root, "agent/knorvia.cjs"));
await chmod(join(root, "agent/knorvia.cjs"), 0o755);
for (const entry of ["provider", "THIRD-PARTY-NOTICES.md"]) {
  await cp(resolve(repository, "apps/cli/packages/cli/dist", entry), join(root, "agent", entry), { recursive: true });
}
await mkdir(join(root, "bin"), { recursive: true });
await cp(resolve(repository, "scripts/distribution/runner.mjs"), join(root, "bin/knorvia.mjs"));
await chmod(join(root, "bin/knorvia.mjs"), 0o755);
const { version } = JSON.parse(await readFile(resolve(repository, "package.json"), "utf8"));
await writeFile(join(root, "package.json"), JSON.stringify({ name: "knorvia-runtime", private: true, type: "module", version }, null, 2));
await copyRuntimeNodeModules(root);
await patchNodePtyPrebuilds(root);
await writeFile("/tmp/knorvia-cli-tui-esm-20261003/staged-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
const result = {
  sourceCheckpoint: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim(),
  node: process.version, target, packageRoot: root,
  productionCollector: "apps/cli/packages/cli/scripts/sea-tui-assets.mjs#collectSeaTuiAssets",
  runtimeStaging: "Unmodified scripts/distribution/assets.mjs#copyRuntimeNodeModules + patchNodePtyPrebuilds",
  runner: "Unmodified scripts/distribution/runner.mjs",
  collectorFiles: manifest.files.length, collectorManifestHash: manifest.hash,
  perFileVerification: "All collected files copied with their production mode and verified SHA-256",
  qualification: "Real host-target CLI/TUI layout; no full Web/server/desktop/SEA/archive build. Only the native host target collector closure was staged.",
};
await writeFile("/tmp/knorvia-cli-tui-esm-20261003/staged-runtime.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));

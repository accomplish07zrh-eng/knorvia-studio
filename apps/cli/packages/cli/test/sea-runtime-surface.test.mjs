import assert from "node:assert/strict";
import test from "node:test";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import {
  resolveRuntimePackageDirectory,
  placeRuntimePackage,
} from "../scripts/sea-runtime-package-resolution.mjs";
import {
  collectSeaTuiAssets,
  opentuiNativePackageForTarget,
  seaTuiAssetPrefix,
} from "../scripts/sea-tui-assets.mjs";
import { stageSeaPackageAssets } from "../scripts/sea-workspace-package-assets.mjs";

const repository = fileURLToPath(new URL("../../../../../", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cuaSource = resolve(repository, "packages/cua");
const rootRuntimeFile = /\.(?:[cm]?js|json|d\.[cm]?ts)$/u;

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-sea-surface-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
async function put(directory, path, bytes) {
  const location = join(directory, path);
  await mkdir(dirname(location), { recursive: true });
  await writeFile(
    location,
    typeof bytes === "object" ? JSON.stringify(bytes, null, 2) + "\n" : bytes,
  );
  return location;
}
async function locate(directory, name, manifest, files) {
  const packageDirectory = join(directory, "workspace");
  await put(packageDirectory, "package.json", { name, type: "module", ...manifest });
  for (const [path, bytes] of Object.entries(files)) await put(packageDirectory, path, bytes);
  return {
    packageDirectory,
    resolve: () =>
      resolveRuntimePackageDirectory({
        root: directory,
        packageName: name,
        workspacePackageDirectories: new Map([[name, packageDirectory]]),
      }),
  };
}

async function collectionFixture(directory, target, compatibilityDist = false) {
  const root = join(directory, "repo", "apps", "cli");
  const cua = join(directory, "repo", "packages", "cua");
  const cuaFiles = (await readdir(cuaSource)).filter((name) => rootRuntimeFile.test(name));
  await mkdir(cua, { recursive: true });
  for (const name of cuaFiles) await copyFile(join(cuaSource, name), join(cua, name));
  await put(cua, "private-helper.js", "export const syntheticPrivate = true;\n");
  await put(cua, "index.js.map", "excluded source map");
  await put(cua, "src/ignored.ts", "excluded source");
  await put(cua, "test/ignored.js", "excluded test");
  await put(cua, "scripts/ignored.js", "excluded script");
  if (compatibilityDist) await put(cua, "dist/index.js", "export {};\n");
  await put(root, "packages/tui/package.json", {
    name: "@knorvia/tui",
    type: "module",
    exports: { ".": "./dist/index.js" },
    dependencies: { "@knorvia/cua": "workspace:*", "@knorvia/i18n": "workspace:*" },
  });
  await put(root, "packages/tui/dist/index.js", "export {};\n");
  await put(root, "packages/i18n/package.json", {
    name: "@knorvia/i18n",
    type: "module",
    exports: { ".": "./src/index.ts" },
  });
  await put(root, "packages/i18n/dist/index.js", "export {};\n");
  await put(root, "packages/i18n/dist/nested/data.json", '{"synthetic":true}\n');
  await put(root, "packages/i18n/dist/index.js.map", "excluded map");
  await put(root, "packages/i18n/src/index.ts", "excluded source");
  for (const name of [
    "@mbears/opentui-core",
    "@mbears/opentui-react",
    "react",
    "react-devtools-core",
    "ws",
    opentuiNativePackageForTarget(target),
  ]) {
    await put(root, `node_modules/${name}/package.json`, { name, main: "index.js" });
    await put(root, `node_modules/${name}/index.js`, "module.exports = {};\n");
  }
  const originalManifest = await readFile(join(cua, "package.json"));
  const stagingDirectory = join(directory, "stage");
  const collected = await collectSeaTuiAssets({ root, target, stagingDirectory });
  assert.deepEqual(await readFile(join(cua, "package.json")), originalManifest);
  return { root, cua, cuaFiles, originalManifest, collected };
}

test("explicit root JS workspace resolves without a fictitious dist build", () =>
  fixture(async (directory) => {
    const entry = await locate(
      directory,
      "@knorvia/cua",
      { exports: { ".": { types: "./index.d.ts", import: "./index.js" } } },
      { "index.js": "export {};\n" },
    );
    assert.equal(await entry.resolve(), entry.packageDirectory);
  }));

test("compiled src export and legacy dist fallback resolve their actual output", () =>
  fixture(async (directory) => {
    const entry = await locate(
      directory,
      "synthetic",
      { exports: { ".": { types: "./src/api.d.ts", import: "./src/api.ts" } } },
      { "dist/api.js": "export {};\n" },
    );
    assert.equal(await entry.resolve(), entry.packageDirectory);
    const legacy = await locate(
      join(directory, "legacy"),
      "legacy",
      {},
      { "dist/index.js": "export {};\n" },
    );
    assert.equal(await legacy.resolve(), legacy.packageDirectory);
  }));

test("missing explicit entry fails even when stale dist/index.js exists", () =>
  fixture(async (directory) => {
    const entry = await locate(
      directory,
      "synthetic",
      { exports: { ".": { import: "./index.js" } } },
      { "dist/index.js": "export {};\n" },
    );
    await assert.rejects(entry.resolve(), /Missing synthetic runtime entry \.\/index\.js/u);
  }));

test("collector includes root exports and private siblings despite stale dist", () =>
  fixture(async (directory) => {
    const { collected, cuaFiles, originalManifest } = await collectionFixture(
      directory,
      "linux-x64",
      true,
    );
    const paths = new Set(collected.manifest.files.map((file) => file.path));
    for (const name of [...cuaFiles, "private-helper.js"]) {
      assert.ok(paths.has(`node_modules/@knorvia/cua/${name}`), name);
    }
    assert.ok(paths.has("node_modules/@knorvia/cua/dist/index.js"));
    const staged = JSON.parse(
      await readFile(
        collected.assets[seaTuiAssetPrefix + "node_modules/@knorvia/cua/package.json"],
        "utf8",
      ),
    );
    assert.deepEqual(staged.exports, JSON.parse(originalManifest).exports);
  }));

test("actual CUA root layout collects, stages and resolves for Linux and Windows fixtures", async () => {
  for (const target of ["linux-x64", "win-x64"])
    await fixture(async (directory) => {
      const { collected, cua, cuaFiles } = await collectionFixture(directory, target);
      const files = collected.manifest.files;
      const paths = files.map((file) => file.path);
      assert.ok(paths.includes("node_modules/@knorvia/cua/windows-runtime.js"));
      assert.ok(paths.includes("node_modules/@knorvia/cua/windows-driver.js"));
      assert.ok(paths.includes("node_modules/@knorvia/i18n/dist/nested/data.json"));
      assert.ok(paths.includes(`node_modules/${opentuiNativePackageForTarget(target)}/index.js`));
      assert.ok(
        !paths.some((path) => path.endsWith(".map") || /\/(?:src|test|scripts)\//u.test(path)),
      );
      assert.deepEqual(
        paths,
        [...paths].sort((left, right) => left.localeCompare(right)),
      );
      assert.equal(
        collected.manifest.hash,
        hash(JSON.stringify(files.map(({ path, sha256 }) => [path, sha256]))),
      );
      const cache = join(directory, "cache");
      for (const file of files) {
        const bytes = await readFile(collected.assets[seaTuiAssetPrefix + file.path]);
        assert.equal(hash(bytes), file.sha256, file.path);
        await mkdir(dirname(join(cache, file.path)), { recursive: true });
        await writeFile(join(cache, file.path), bytes);
      }
      for (const name of cuaFiles.filter((name) => name !== "package.json")) {
        assert.deepEqual(
          await readFile(join(cache, "node_modules/@knorvia/cua", name)),
          await readFile(join(cua, name)),
          name,
        );
      }
      const entry = await put(
        cache,
        "probe.mjs",
        'import * as root from "@knorvia/cua"; import * as windows from "@knorvia/cua/windows"; export {root,windows};\n',
      );
      const loaded = await import(pathToFileURL(entry));
      assert.equal(typeof loaded.root.createComputerUseRuntime, "function");
      assert.equal(typeof loaded.windows.createWindowsComputerUseRuntime, "function");
    });
});

test("staging maps development exports/imports only in the copied manifest", () =>
  fixture(async (directory) => {
    const packageJson = await put(directory, "source/package.json", {
      exports: { ".": { import: "./src/api.ts", types: "./src/api.d.ts" }, "./root": "./index.js" },
      imports: { "#helper": "./src/helper.mts" },
    });
    const original = await readFile(packageJson);
    const result = await stageSeaPackageAssets({
      packageFiles: [{ assetPath: "node_modules/synthetic/package.json", sourcePath: packageJson }],
      workspacePackage: true,
      stagingDirectory: join(directory, "staged"),
      assetPrefix: seaTuiAssetPrefix,
    });
    assert.deepEqual(await readFile(packageJson), original);
    const staged = JSON.parse(
      await readFile(
        result.assets[seaTuiAssetPrefix + "node_modules/synthetic/package.json"],
        "utf8",
      ),
    );
    assert.deepEqual(staged.exports, {
      ".": { import: "./dist/api.js", types: "./dist/api.d.ts" },
      "./root": "./index.js",
    });
    assert.deepEqual(staged.imports, { "#helper": "./dist/helper.mjs" });
  }));

test("physical runtime placement keeps two consumers' dependency versions distinct", () => {
  const placements = new Map();
  const place = (packageDirectory, fromAssetPath) =>
    placeRuntimePackage({ packageName: "zod", packageDirectory, fromAssetPath, placements });
  assert.equal(place("/synthetic/v3", "node_modules/contracts"), "node_modules/zod");
  assert.equal(place("/synthetic/v3", "node_modules/other"), undefined);
  assert.equal(
    place("/synthetic/v4", "node_modules/shared"),
    "node_modules/shared/node_modules/zod",
  );
  assert.equal(place("/synthetic/v4", "node_modules/shared/dist"), undefined);
});

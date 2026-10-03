import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { buildTui } from "../scripts/build.mjs";

const exec = promisify(execFile);
const nativeImportTimeoutMs = 15_000;
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-tui-esm-"));
  const directory = join(root, "workspace with spaces 合成");
  const cwd = join(root, "different-cwd");
  await mkdir(join(directory, "src"), { recursive: true });
  await mkdir(cwd);
  try {
    return await run({ root, directory, cwd });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function put(file, text) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}
async function importInNativeProcess({ file, cwd, assertions }) {
  const check = join(cwd, "check.mjs");
  await writeFile(
    check,
    `import assert from "node:assert/strict";
    const previousRequire = globalThis.require;
    const previousFilename = globalThis.__filename;
    const previousDirname = globalThis.__dirname;
    const loaded = await import(${JSON.stringify(pathToFileURL(file).href)});
    assert.equal(globalThis.require, previousRequire);
    assert.equal(globalThis.__filename, previousFilename);
    assert.equal(globalThis.__dirname, previousDirname);
    ${assertions}
    console.log("native-tui-esm-ok");`,
  );

  const result = await exec(process.execPath, [check], {
    cwd,
    env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
    timeout: nativeImportTimeoutMs,
  });
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim(), "native-tui-esm-ok");
}

test("bundled CommonJS file context belongs to the emitted ESM module", () =>
  fixture(async ({ directory, cwd }) => {
    await put(
      join(directory, "package.json"),
      JSON.stringify({ type: "module", dependencies: {} }),
    );
    await put(
      join(directory, "src/context.cjs"),
      "exports.context = { filename: __filename, dirname: __dirname };",
    );
    await put(
      join(directory, "src/index.ts"),
      'import common from "./context.cjs"; export const context = common.context;',
    );
    await buildTui({ directory });
    await importInNativeProcess({
      file: join(directory, "dist/index.js"),
      cwd,
      assertions: `assert.deepEqual(loaded.context, ${JSON.stringify({ filename: join(directory, "dist/index.js"), dirname: join(directory, "dist") })});`,
    });
  }));

test("real producer preserves ESM top-level await and the external package boundary", () =>
  fixture(async ({ directory, cwd }) => {
    await put(
      join(directory, "package.json"),
      JSON.stringify({ type: "module", dependencies: { "fixture-external": "1.0.0" } }),
    );
    await put(
      join(directory, "node_modules/fixture-external/package.json"),
      JSON.stringify({ name: "fixture-external", main: "index.cjs" }),
    );
    await put(
      join(directory, "node_modules/fixture-external/index.cjs"),
      "module.exports = { external: true, file: __filename };",
    );
    await put(
      join(directory, "src/index.ts"),
      'import external from "fixture-external"; export const ready = await Promise.resolve("ready"); export const runTui = async () => external;',
    );
    await buildTui({ directory });
    await importInNativeProcess({
      file: join(directory, "dist/index.js"),
      cwd,
      assertions: `
    assert.equal(loaded.ready, "ready");
    const result = await loaded.runTui();
    assert.equal(result.external, true);
    assert.equal(result.file, ${JSON.stringify(join(directory, "node_modules/fixture-external/index.cjs"))});`,
    });
  }));

test("bundled CommonJS uses native builtins and module-relative require without global injection", () =>
  fixture(async ({ directory, cwd }) => {
    await put(
      join(directory, "package.json"),
      JSON.stringify({ type: "module", dependencies: {} }),
    );
    await put(
      join(directory, "src/probe.cjs"),
      `
    const processModule = require("process");
    const fs = require("node:fs");
    const path = require("path");
    const crypto = require("node:crypto");
    const module = require("node:module");
    const dataSpecifier = "./runtime-data.cjs";
    exports.probe = () => ({ processModule, fs, path, crypto, module,
      data: () => require(dataSpecifier), resolve: () => require.resolve(dataSpecifier) });`,
    );
    await put(
      join(directory, "src/index.ts"),
      'import common from "./probe.cjs"; await Promise.resolve(); export const runTui = async () => common.probe();',
    );
    await buildTui({ directory });
    await put(
      join(directory, "dist/runtime-data.cjs"),
      'module.exports = { synthetic: "module-relative" };',
    );
    await importInNativeProcess({
      file: join(directory, "dist/index.js"),
      cwd,
      assertions: `
    const result = await loaded.runTui();
    assert.equal(result.processModule, process);
    for (const [name, actual] of [["fs", result.fs], ["path", result.path], ["crypto", result.crypto], ["module", result.module]]) {
      assert.equal(actual, (await import("node:" + name)).default);
    }
    assert.deepEqual(result.data(), { synthetic: "module-relative" });
    assert.equal(result.resolve(), ${JSON.stringify(join(directory, "dist/runtime-data.cjs"))});`,
    });
  }));

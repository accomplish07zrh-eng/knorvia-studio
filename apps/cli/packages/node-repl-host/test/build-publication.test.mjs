// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { beforeEach, mock } from "node:test";

const originalBytes = new Uint8Array([1, 2, 3]);
const builtBytes = new Uint8Array([4, 5, 6]);
let state;
const fresh = () => ({
  files: new Map(),
  events: [],
  options: [],
  error: {},
  outputFiles: undefined,
});
state = fresh();
beforeEach(() => {
  state = fresh();
});
const failure = (code) => Object.assign(new Error(code), { code });
mock.module("node:fs/promises", {
  namedExports: {
    async mkdir(path) {
      state.events.push(["mkdir", path]);
    },
    async open(path, flags) {
      assert.equal(flags, "wx");
      state.events.push(["open", path]);
      if (state.error.open) {
        state.files.set(path, originalBytes);
        throw state.error.open;
      }
      assert.equal(state.files.has(path), false);
      state.files.set(path, new Uint8Array());
      return {
        async writeFile(bytes) {
          state.events.push(["write", path]);
          state.files.set(path, bytes);
          if (state.error.write) throw state.error.write;
        },
        async close() {
          state.events.push(["close", path]);
          if (state.error.close) throw state.error.close;
        },
      };
    },
    async rename(from, to) {
      state.events.push(["rename", from, to]);
      state.entered?.resolve();
      if (state.release) await state.release.promise;
      if (state.error.rename) throw state.error.rename;
      assert.ok(state.files.has(from));
      state.files.set(to, state.files.get(from));
      state.files.delete(from);
    },
    async unlink(path) {
      state.events.push(["unlink", path]);
      if (state.error.unlink) throw state.error.unlink;
      state.files.delete(path);
    },
  },
});
mock.module("esbuild", {
  namedExports: {
    async build(options) {
      state.options.push(options);
      state.compiling?.resolve();
      if (state.error.compile) throw state.error.compile;
      const outputFiles = state.outputFiles ?? [
        { path: resolve(options.outfile), contents: builtBytes },
      ];
      if (options.write === false) return { outputFiles };
      // 旧入口让编译器直接写目标；替身保留该已发布 API 行为以建立基线。
      for (const output of outputFiles) state.files.set(output.path, output.contents);
      return {};
    },
  },
});
const { buildNodeReplHostBundle } = await import("../scripts/build.mjs");
assert.equal(state.options.length, 0, "Importing the helper must not build");
const target = resolve("fixture-output", "server.js");
const build = (options = {}) =>
  buildNodeReplHostBundle({ outfile: target, cuaHelperBuildId: "fixture", ...options });

test("a query-qualified import is not mistaken for the direct command entrypoint", async () => {
  const prior = process.argv[1];
  process.argv[1] = fileURLToPath(new URL("../scripts/build.mjs", import.meta.url));
  try {
    await import(new URL("../scripts/build.mjs?inspection", import.meta.url).href);
  } finally {
    process.argv[1] = prior;
  }
  assert.equal(state.options.length, 0);
});

test("public build entry preserves compiler/runtime contract and caller result spelling", async () => {
  const outfile = "fixture-output/../fixture-output/server.js";
  const cuaHelperBuildId = ' helper "quoted"\nline ';
  assert.deepEqual(await build({ outfile, cuaHelperBuildId }), { outfile, cuaHelperBuildId });
  const options = state.options[0];
  assert.deepEqual(options.entryPoints, [
    fileURLToPath(new URL("../src/server.ts", import.meta.url)),
  ]);
  assert.equal(options.bundle, true);
  assert.equal(options.platform, "node");
  assert.equal(options.target, "node24");
  assert.equal(options.format, "esm");
  assert.equal(options.legalComments, "eof");
  assert.deepEqual(options.define, {
    __KNORVIA_CUA_HELPER_BUILD_ID__: JSON.stringify(cuaHelperBuildId),
  });
  assert.match(options.banner.js, /node:module/);
  assert.match(options.banner.js, /createRuntimeRequire\(import.meta.url\)/);
  assert.deepEqual(state.files.get(target), builtBytes);
});

test("default path stays package-relative while the existing environment default is trimmed", async (t) => {
  const prior = process.env.KNORVIA_CUA_HELPER_BUILD_ID;
  t.after(() => {
    if (prior === undefined) delete process.env.KNORVIA_CUA_HELPER_BUILD_ID;
    else process.env.KNORVIA_CUA_HELPER_BUILD_ID = prior;
  });
  process.env.KNORVIA_CUA_HELPER_BUILD_ID = " fixture-build ";
  assert.deepEqual(await buildNodeReplHostBundle(), {
    outfile: fileURLToPath(new URL("../dist/mcp/server.js", import.meta.url)),
    cuaHelperBuildId: "fixture-build",
  });
  delete process.env.KNORVIA_CUA_HELPER_BUILD_ID;
  assert.equal((await buildNodeReplHostBundle()).cuaHelperBuildId, "");
});

test("compiler failure preserves its error and does not enter publication", async () => {
  state.files.set(target, originalBytes);
  const error = (state.error.compile = new Error("compile failed"));
  await assert.rejects(build(), (value) => value === error);
  assert.equal(state.options[0].write, false);
  assert.deepEqual(state.events, []);
  assert.equal(state.files.get(target), originalBytes);
});

test("unexpected output count or target is rejected before creating publication files", async () => {
  for (const outputFiles of [
    [],
    [
      { path: target, contents: builtBytes },
      { path: target + ".map", contents: builtBytes },
    ],
    [{ path: target + ".other", contents: builtBytes }],
  ]) {
    state.outputFiles = outputFiles;
    await assert.rejects(build(), /single requested output/);
    assert.deepEqual(state.events, []);
  }
});

test("the prior target stays visible until the completed temporary file is committed", async (t) => {
  state.files.set(target, originalBytes);
  state.entered = Promise.withResolvers();
  state.release = Promise.withResolvers();
  state.compiling = Promise.withResolvers();
  t.after(() => state.release.resolve());
  const pending = build();
  try {
    await state.compiling.promise;
    assert.equal(state.options[0].write, false);
    await state.entered.promise;
    assert.equal(state.files.get(target), originalBytes);
    const temporary = state.events.find(([operation]) => operation === "open")[1];
    assert.equal(dirname(temporary), dirname(target));
    assert.deepEqual(state.files.get(temporary), builtBytes);
    assert.deepEqual(
      state.events.map(([operation]) => operation),
      ["mkdir", "open", "write", "close", "rename"],
    );
  } finally {
    state.release.resolve();
    await pending;
  }
  assert.deepEqual([...state.files.keys()], [target]);
  assert.deepEqual(state.files.get(target), builtBytes);
});

test("write and commit failures close and remove only this invocation's temporary file", async () => {
  for (const stage of ["write", "close", "rename"]) {
    state = fresh();
    const other = target + ".other-owner.tmp";
    state.files.set(target, originalBytes);
    state.files.set(other, originalBytes);
    const error = (state.error[stage] = new Error(stage));
    await assert.rejects(build(), (value) => value === error);
    assert.equal(state.events.filter(([name]) => name === "close").length, 1);
    assert.deepEqual([...state.files.keys()].sort(), [target, other].sort());
    assert.equal(state.files.get(target), originalBytes);
  }
});

test("exclusive-open collision leaves the unowned file untouched", async () => {
  const error = (state.error.open = failure("EEXIST"));
  await assert.rejects(build(), (value) => value === error);
  assert.equal(
    state.events.some(([name]) => name === "unlink"),
    false,
  );
  const collided = state.events.find(([name]) => name === "open")[1];
  assert.equal(state.files.get(collided), originalBytes);
});

test("write, close and cleanup failures remain visible together", async () => {
  const errors = ["write", "close", "unlink"].map(
    (stage) => (state.error[stage] = new Error(stage)),
  );
  await assert.rejects(build(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, errors);
    return true;
  });
  assert.equal(
    state.events.some(([name]) => name === "rename"),
    false,
  );
});

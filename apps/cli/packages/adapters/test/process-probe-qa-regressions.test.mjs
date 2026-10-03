// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// Restore the existing specs/knorvia-process-probe-runtime.md contract:
// each call owns its deadline; roots are sampled once; finite counters and RSS keep old parsing.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { proc, readers, result, rows, world } from "./process-probe-contract/fixture.mjs";

const SAMPLE_TIMEOUT_MS = 1000;
const FIRST_PID = 11;
const BATCH_SIZE = 64;
const TREE_SIZE = 100;
const DUPLICATE_ROOTS = 1000;

/** Only this bundle sees the virtual clock and Set counter; runner globals remain native. */
async function loadProbe(mode) {
  const root = fileURLToPath(
    new URL(`../${mode === "source" ? "src" : "dist"}/device/`, import.meta.url),
  );
  const ext = mode === "source" ? ".ts" : ".js";
  const directory = await mkdtemp(join(tmpdir(), "knorvia-probe-qa-"));
  const key = Symbol.for(`knorvia.probe.qa.${process.pid}.${mode}`);
  let current;
  const state = () => {
    if (!current) throw new Error("Probe ran outside a controlled QA world");
    return current;
  };
  const bridge = {
    now: () => state().now,
    add: () => state().setAdds++,
    setTimeout: (callback, delay) => state().clock.schedule(callback, delay),
    clearTimeout: (handle) => state().clock.cancel(handle),
  };
  globalThis[key] = bridge;
  try {
    const output = await build({
      stdin: {
        contents: `export * as factory from ${JSON.stringify(join(root, "process-probe" + ext))};
export * as linux from ${JSON.stringify(join(root, "process-probe-linux" + ext))};`,
        resolveDir: root,
        loader: "ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      banner: {
        js: `const bridge = globalThis[Symbol.for(${JSON.stringify(Symbol.keyFor(key))})];
const setTimeout = bridge.setTimeout, clearTimeout = bridge.clearTimeout;
const Date = class extends globalThis.Date { static now() { return bridge.now(); } };
const Set = class extends globalThis.Set {
  add(value) { bridge.add(); return super.add(value); }
};`,
      },
      plugins: [
        {
          name: "sealed-qa-probe-io",
          setup(plugin) {
            plugin.onResolve({ filter: /^node:(?:fs\/promises|child_process)$/ }, (args) => ({
              path: args.path,
              namespace: "qa-io",
            }));
            plugin.onLoad({ filter: /.*/, namespace: "qa-io" }, ({ path }) => ({
              loader: "js",
              contents:
                path === "node:fs/promises"
                  ? 'const fail = () => { throw new Error("Unexpected native /proc I/O"); }; export const readdir = fail, readFile = fail;'
                  : 'export const execFile = () => { throw new Error("Unexpected native process execution"); };',
            }));
          },
        },
      ],
    });
    const file = join(directory, "subject.mjs");
    await writeFile(file, output.outputFiles[0].contents);
    const subject = await import(pathToFileURL(file).href);
    return {
      subject,
      use(value) {
        current = Object.assign(value, { now: 0, setAdds: 0 });
      },
      async dispose() {
        delete globalThis[key];
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    delete globalThis[key];
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

for (const mode of ["source", "dist"]) {
  const loaded = await loadProbe(mode);
  after(() => loaded.dispose());

  test(`probe QA ${mode}: elapsed deadline stops batches/RSS before queued timer dispatch`, async () => {
    for (const size of [1, BATCH_SIZE + 1]) {
      const ids = Array.from({ length: size }, (_, index) => FIRST_PID + index);
      const w = world(Object.assign({}, ...ids.map((pid) => proc(pid))), ids.map(String));
      loaded.use(w);
      const failures = [];
      const read = w.readFile;
      w.readFile = async (...args) => {
        const content = await read(...args);
        // Model an event-loop stall: wall time passes, but its pending timer has not dispatched.
        if (args[0] === `/proc/${FIRST_PID}/stat`) w.now = SAMPLE_TIMEOUT_MS + 1;
        return content;
      };
      const probe = loaded.subject.factory.createProcessProbe({
        platform: "linux",
        ...readers(w),
        onSampleFailed: (reason) => failures.push(reason),
      });
      assert.equal(await probe.sampleProcessTrees([FIRST_PID]), undefined);
      assert.deepEqual(failures, ["/proc 扫描超时"]);
      const paths = w.trace.filter(([kind]) => kind === "read").map(([, path]) => path);
      assert.equal(paths.length, Math.min(size, BATCH_SIZE));
      assert.ok(paths.every((path) => path.endsWith("/stat")));
      assert.equal(w.timers.length, 1);
      assert.equal(w.timers[0].delay, SAMPLE_TIMEOUT_MS);
      assert.equal(w.timers[0].cleared, true);
    }
  });

  test(`probe QA ${mode}: repeated roots traverse one tree once`, async () => {
    const w = world();
    loaded.use(w);
    let commands = 0;
    const probe = loaded.subject.factory.createProcessProbe({
      platform: "darwin",
      execFile: async () => {
        commands++;
        return result(
          Array.from(
            { length: TREE_SIZE },
            (_, index) => `${FIRST_PID + index} ${index === 0 ? 0 : FIRST_PID + index - 1} 1 0:01`,
          ).join("\n"),
        );
      },
    });
    const first = rows(await probe.sampleProcessTrees([FIRST_PID]));
    const singleTraversal = w.setAdds;
    w.setAdds = 0;
    const repeated = rows(await probe.sampleProcessTrees(Array(DUPLICATE_ROOTS).fill(FIRST_PID)));
    assert.deepEqual(repeated, first);
    assert.equal(first[0][1].length, TREE_SIZE);
    // Allow input deduplication cost, but reject roots × tree-size traversal growth.
    assert.ok(w.setAdds <= DUPLICATE_ROOTS + singleTraversal);
    assert.equal(commands, 2);
  });

  test(`probe QA ${mode}: finite fractional stat ticks retain integer millisecond rounding`, async () => {
    const w = world(proc(FIRST_PID, 0, 7, 12, [0.01, 0.01]), [String(FIRST_PID)]);
    loaded.use(w);
    assert.deepEqual(
      rows(await loaded.subject.linux.sampleLinuxProcessTrees(readers(w), [FIRST_PID])),
      [[FIRST_PID, [{ pid: FIRST_PID, rssKb: 12, cpuTimeMs: 0 }]]],
    );
  });

  test(`probe QA ${mode}: VmRSS unit requires no separating whitespace`, async () => {
    for (const spacing of ["", " ", "\t"]) {
      const w = world(
        { ...proc(FIRST_PID), [`/proc/${FIRST_PID}/status`]: `VmRSS:\t12${spacing}kB\n` },
        [String(FIRST_PID)],
      );
      loaded.use(w);
      assert.deepEqual(
        rows(await loaded.subject.linux.sampleLinuxProcessTrees(readers(w), [FIRST_PID])),
        [[FIRST_PID, [{ pid: FIRST_PID, rssKb: 12, cpuTimeMs: 50 }]]],
      );
    }
  });
}

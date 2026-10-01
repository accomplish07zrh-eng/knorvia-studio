import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  ReadInputSchema,
  ReadInputJsonSchema,
  ReadOutputSchema,
  ReadOutputJsonSchema,
  CoreErrorType,
} from "@knorvia/contracts";
import { cacheEntry, directCases, getterCases } from "./read-orchestration-cases.js";
import {
  clock,
  clockEvents,
  declaration,
  entry,
  fixture,
  json,
  observe,
  publicDeclaration,
  readers,
  readModule,
  stateModule,
  ROOT,
  CWD,
} from "./read-orchestration-fixture.js";
import {
  freshnessMatrix,
  modelContexts,
  modelObservation,
} from "./read-orchestration-consumer-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./read-orchestration-contract.json", import.meta.url), "utf8"),
);
test("Read public exports/d.ts/declaration and inherited prose are frozen", () => {
  assert.deepEqual(Object.keys(readModule), frozen.exports);
  assert.equal(publicDeclaration, frozen.publicDeclaration);
  assert.deepEqual(declaration(), frozen.declaration);
  assert.equal(readModule.addReadLineNumbers, readers[0].addReadLineNumbers);
  assert.equal(entry.formatModelContent, readers[4].formatReadModelContent);
});
test("public schemas, permissions, read-only/approval/timeout and resolvers retain exact identities", () => {
  assert.equal(entry.runtimeInputSchema, ReadInputSchema);
  assert.equal(entry.inputSchema, ReadInputJsonSchema);
  assert.equal(entry.runtimeOutputSchema, ReadOutputSchema);
  assert.equal(entry.outputSchema, ReadOutputJsonSchema);
  assert.equal(entry.metadata.readOnly, true);
  assert.equal(entry.metadata.needsApproval, false);
  assert.equal(entry.permission.needsApproval, false);
  assert.equal(entry.metadata.sideEffectScope, "none");
  assert.equal(entry.timeout.defaultMs, 30000);
  assert.equal(entry.timeout.maxMs, 150000);
  assert.equal(entry.resolveTimeoutBudgetMs, readers[3].resolveReadTimeoutBudgetMs);
  assert.deepEqual(json(modelContexts.map(modelObservation)), frozen.models);
  assert.equal(entry.resolveTimeoutBudgetMs({}, {}), undefined);
});
test("unchanged direct orchestration, malformed ports, window/budget/media/state and exact errors", async () => {
  for (const [i, c] of directCases.entries())
    assert.deepEqual(await observe(c), frozen.direct[i].observed, c.label);
});
test("context/method/stat/state getter read count/order and original short circuits are frozen", async () => {
  for (const [i, p] of getterCases.entries()) {
    const c = {
      label: "getters",
      ...(p.route === "cached" ? { cache: cacheEntry } : {}),
      ...(p.route === "image" ? { suffix: "png" } : {}),
      ...(p.route === "video" ? { suffix: "mp4" } : {}),
      ...(p.route === "pdf" ? { suffix: "pdf", pdf: true } : {}),
    };
    assert.deepEqual(await observe(c, p), frozen.getters[i].observed, JSON.stringify(p));
  }
});
test("snapshot freshness priority matrix stays frozen without another cache owner", async () => {
  assert.deepEqual(await freshnessMatrix(), frozen.freshnessMatrix);
  assert.equal(frozen.freshnessMatrix.comparisons, 216);
});
test("runtime schema/preflight errors precede all port and path context reads", async () => {
  for (const input of [
    null,
    { file_path: "blocked.zip" },
    { file_path: "/dev/zero" },
    { file_path: "synthetic.pdf", pages: "0" },
  ]) {
    const f = fixture({ label: "schema first" });
    let reads = 0;
    for (const key of ["fileSystemPort", "workingDirectory", "workspaceRoot"])
      Object.defineProperty(f.context, key, {
        get() {
          reads++;
          throw new Error("Synthetic forbidden context getter");
        },
      });
    await assert.rejects(entry.handler(input, f.context));
    assert.equal(reads, 0);
  }
});
test("missing-port guard precedes path resolution; malformed path facts never touch ports", async () => {
  const f = fixture({ label: "missing", noFileSystem: true });
  Object.defineProperty(f.context, "workingDirectory", {
    get() {
      assert.fail("missing port must precede cwd");
    },
  });
  await assert.rejects(
    entry.handler(f.input, f.context),
    (e: any) => e.type === CoreErrorType.ConfigurationError && e.recoverable === false,
  );
  for (const change of [
    { cwd: "relative" },
    { workspace: "relative" },
    { input: { file_path: "" } },
  ]) {
    const f = fixture({ label: "path", ...change });
    await assert.rejects(entry.handler(f.input, f.context));
    assert.equal(f.calls.length, 0);
  }
});
test("real path policy preserves relative/absolute/sibling/outside paths with synthetic effects only", async () => {
  for (const file_path of [
    "synthetic.txt",
    "../synthetic-sibling.txt",
    join(ROOT, "..", "synthetic-outside-read.txt"),
    join(CWD, "nested", "..", "synthetic.txt"),
  ]) {
    const f = fixture({ label: "path", input: { file_path } });
    const output = await entry.handler(f.input, f.context);
    assert.equal(output.filePath, resolve(CWD, file_path));
    assert.equal(f.rawCalls.find((c) => c.target === "stat").args[0].path, output.filePath);
  }
});
test("text captures one filesystem receiver while media re-reads its existing lower port", async () => {
  for (const suffix of ["txt", "png", "mp4"]) {
    const f = fixture({ label: "receiver", suffix });
    let reads = 0;
    const admission = {};
    Object.defineProperty(f.context, "fileSystemPort", {
      get() {
        return ++reads === 1 ? admission : f.fs;
      },
    });
    if (suffix === "txt")
      await assert.rejects(entry.handler(f.input, f.context), { name: "TypeError" });
    else {
      assert.ok(await entry.handler(f.input, f.context));
      assert.equal(f.calls[0].receiver, true);
    }
    assert.equal(reads, suffix === "txt" ? 1 : 2);
  }
});
test("stat/read share one new ordered trace while context.traceContext is never consulted", async () => {
  const f = fixture({ label: "trace" });
  Object.defineProperty(f.context, "traceContext", {
    get() {
      assert.fail("Read does not use traceContext");
    },
  });
  await entry.handler(f.input, f.context);
  const [stat, range] = f.rawCalls.filter((c) => ["stat", "readTextFileRange"].includes(c.target));
  assert.equal(stat.args[0].trace, range.args[0].trace);
  assert.deepEqual(Object.keys(stat.args[0].trace), [
    "traceId",
    "spanId",
    "parentSpanId",
    "sessionId",
    "turnId",
  ]);
  assert.equal(stat.args[1].signal, f.controller.signal);
  assert.equal(range.args[1].signal, f.controller.signal);
  assert.deepEqual(Object.keys(stat.args[1]), ["signal"]);
});
test("completed read then metadata use distinct ordered timestamps; cache hit retains its entry", async () =>
  clock(async () => {
    const f = fixture({ label: "timestamps" });
    await entry.handler(f.input, f.context);
    const key = stateModule.createReadFileStateKey(f.filePath, 1, undefined),
      snapshot = Map.prototype.get.call(f.states, key);
    assert.equal(snapshot.readAt.getTime() + 1, f.metadata[0].readAtMs);
    assert.equal(snapshot.revisionId, "synthetic-stat-revision");
    const before = clockEvents.length;
    await entry.handler(f.input, f.context);
    assert.equal(Map.prototype.get.call(f.states, key), snapshot);
    assert.equal(clockEvents.length, before + 1);
    assert.equal(f.metadata[1].readAtMs, f.metadata[0].readAtMs + 1);
    assert.equal(f.calls.filter((c) => c.target === "readTextFileRange").length, 1);
  }));
test("metadata receiver/raw input and live state getter count remain; callback failure keeps prior commit", async () =>
  clock(async () => {
    const f = fixture({ label: "metadata failure", fault: { target: "metadata", kind: "throw" } });
    await assert.rejects(entry.handler(f.input, f.context), (e) => e === f.originalError);
    assert.equal(f.states.size, 1);
    assert.equal(f.calls.at(-1).receiver, true);
    assert.deepEqual(
      f.rawCalls.find((c) => c.target === "metadata").args[0].content,
      "synthetic\nlines",
    );
  }));
test("metadata uses the original input window even if it changes after parsing", async () => {
  const f = fixture({ label: "raw input", input: { file_path: "synthetic.txt", offset: 1 } });
  const stat = f.fs.stat;
  f.fs.stat = function (...args: any[]) {
    f.input.offset = 2;
    return stat.apply(this, args);
  };
  await entry.handler(f.input, f.context);
  assert.equal([...f.states.values()][0].offset, 1);
  assert.equal(f.metadata.length, 0);
});
test("throwing input getters precede filesystem access and keep original thrown identity", async () => {
  const f = fixture({ label: "input getter" }),
    original = new Error("Synthetic input getter");
  Object.defineProperty(f.input, "file_path", {
    get() {
      throw original;
    },
  });
  await assert.rejects(entry.handler(f.input, f.context), (error) => error === original);
  assert.equal(f.calls.length, 0);
});
test("same context fallback is reused, separate contexts stay isolated, supplied maps remain live owners", async () => {
  const first = fixture({ label: "fallback", fallback: true }),
    second = fixture({ label: "fallback", fallback: true });
  assert.equal((await entry.handler(first.input, first.context)).type, "text");
  assert.equal((await entry.handler(first.input, first.context)).type, "file_unchanged");
  assert.equal((await entry.handler(second.input, second.context)).type, "text");
  const map = new Map();
  first.context.readFileState = map;
  assert.equal((await entry.handler(first.input, first.context)).type, "text");
  assert.equal(map.size, 1);
  first.context.readFileState = undefined;
  assert.equal((await entry.handler(first.input, first.context)).type, "file_unchanged");
});
test("offset zero/default/one and explicit limits keep distinct window facts and lower byte parameters", async () => {
  const f = fixture({ label: "windows" });
  for (const offset of [undefined, 0, 1, 2])
    for (const limit of [undefined, 1]) {
      const input = { file_path: "synthetic.txt", offset, limit };
      await entry.handler(input, f.context);
      const key = stateModule.createReadFileStateKey(f.filePath, offset, limit);
      const snapshot = Map.prototype.get.call(f.states, key);
      assert.equal(snapshot.limit, limit);
      if (offset !== 1) assert.equal(snapshot.offset, offset);
    }
  assert.equal(f.states.size, 6);
  for (const c of f.rawCalls.filter((c) => c.target === "readTextFileRange")) {
    assert.equal(Object.hasOwn(c.args[0], "maxBytes"), true);
    assert.equal(c.args[0].maxBytes, c.args[0].limitLines === undefined ? 256 * 1024 : undefined);
  }
});
test("not-found suggestion is one best-effort listing; failures preserve original cause and prose", async () => {
  const f = fixture({
    label: "not found",
    fault: { target: "stat", kind: "filesystem", code: "not_found" },
  });
  f.fs.listDirectory = async () => {
    throw new Error("Synthetic suggestion rejection");
  };
  await assert.rejects(entry.handler(f.input, f.context), (e: any) => {
    assert.equal(e.cause, f.originalError);
    assert.equal(e.context.code, "read_file_not_found");
    assert.equal(e.message, `File does not exist. Note: your current working directory is ${CWD}.`);
    return true;
  });
});
test("thrown/rejected Error and non-Error values preserve direct identity outside conversions", async () => {
  for (const target of ["stat", "readTextFileRange", "metadata"])
    for (const kind of ["throw", "reject"]) {
      const f = fixture({ label: "identity", fault: { target, kind } });
      if (target === "metadata" && kind === "reject") {
        await entry.handler(f.input, f.context);
        continue;
      }
      await assert.rejects(entry.handler(f.input, f.context), (e) => e === f.originalError);
    }
  const f = fixture({ label: "value", fault: { target: "stat", kind: "value" } });
  try {
    await entry.handler(f.input, f.context);
    assert.fail();
  } catch (e) {
    assert.equal(e, "Synthetic thrown value");
  }
});

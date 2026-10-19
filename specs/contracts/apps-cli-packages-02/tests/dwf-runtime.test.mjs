// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-02 批次 C（B9–B23）：dynamic-workflow-runtime 的公开面、入口文件与沙箱桥接。
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { load, loadDynamicWorkflow, packageJson, waitFor } from "./entry.mjs";

const runtime = await load("dynamic-workflow-runtime");
const dwf = await loadDynamicWorkflow();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function removeDir(dir) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      await delay(50);
    }
  }
}

function tempDir(t, prefix = "acp02-dwf-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => removeDir(dir));
  return dir;
}

function inProcessChild({ args, autoRespond, lowered }) {
  const messages = [];
  let lineListener;
  let interfaceCount = 0;
  let closeCount = 0;
  const deliver = (line) => {
    if (lineListener === undefined) throw new Error("child reader is not installed");
    lineListener(line);
  };
  const payload = { lowered, ...(args === undefined ? {} : { args }) };
  const deps = {
    vm,
    createInterface() {
      interfaceCount += 1;
      return {
        on(event, listener) {
          if (event === "line") lineListener = listener;
        },
        close() {
          closeCount += 1;
        },
      };
    },
    stdin: {},
    stdout: {
      write(chunk) {
        assert.equal(typeof chunk, "string");
        for (const line of chunk.split("\n")) {
          if (line === "") continue;
          const message = JSON.parse(line);
          messages.push(message);
          autoRespond?.(message, deliver);
        }
      },
    },
    payload,
  };
  const done = runtime.childMain(deps);
  return {
    closeCount: () => closeCount,
    deliver,
    interfaceCount: () => interfaceCount,
    messages,
    payload,
    done,
  };
}

function createDriver(overrides = {}) {
  const sinkRef = { current: undefined };
  const journal = new overrides.JournalStore();
  const events = [];
  const asks = [];
  const cancellations = [];
  const sessions = [];
  const worldReads = [];
  const publishes = [];
  let disposals = 0;
  let releaseAskDispatch;
  const askDispatched = new Promise((resolve) => {
    releaseAskDispatch = resolve;
  });
  const driver = {
    journal,
    emit(event) {
      events.push(event);
    },
    createActorSession(actor, persona, seed) {
      sessions.push({ actor, persona, seed });
      return Promise.resolve({ id: `sess:${actor.siteId}@${actor.ordinal}` });
    },
    startAsk(session, instance, message) {
      asks.push({ session, instance, message });
      releaseAskDispatch();
      if (overrides.settleAsk !== false) {
        queueMicrotask(() =>
          sinkRef.current.askTurnEnded(instance, `answer:${message.instructions}`),
        );
      }
    },
    respondToSubmit() {},
    cancelAsk(instance) {
      cancellations.push(instance);
    },
    executeWorldRead(op, args) {
      worldReads.push({ op, args });
      if (overrides.gateWorldRead === true) {
        return askDispatched.then(() => ({ op, args }));
      }
      if (overrides.worldReadValue !== undefined) return Promise.resolve(overrides.worldReadValue);
      return Promise.resolve({ op, args });
    },
    ...(overrides.publishRecord === false
      ? {}
      : {
          executeArtifactPublish(request) {
            publishes.push(request);
            return Promise.resolve(
              overrides.publishRecord ?? {
                bytes: 12,
                contentType: "text/plain",
                id: request.id,
                kind: request.op,
                version: request.version,
              },
            );
          },
        }),
    dispose() {
      disposals += 1;
    },
  };
  return {
    driver,
    events,
    asks,
    cancellations,
    disposeCount: () => disposals,
    journal,
    publishes,
    sessions,
    setSink(sink) {
      sinkRef.current = sink;
    },
    worldReads,
  };
}

function harnessOptions(harness, overrides = {}) {
  return {
    askSpecs: new Map(),
    caps: { maxConcurrency: 4 },
    makeDriver(sink) {
      harness.setSink(sink);
      return harness.driver;
    },
    validate: () => [],
    ...overrides,
  };
}

async function runHarness(t, options, harnessOverrides = {}) {
  const cwd = options.cwd ?? tempDir(t);
  const harness = createDriver({ JournalStore: dwf.InMemoryJournalStore, ...harnessOverrides });
  const settlement = await runtime.runWorkflowScript(harnessOptions(harness, { cwd, ...options }));
  return { cwd, harness, settlement };
}

test("B9 包公开面与协议类型面", async () => {
  assert.deepEqual(Object.keys(runtime).sort(), [
    "childEntryFileName",
    "childMain",
    "fallbackWorkflowRunsDir",
    "renderChildEntry",
    "runWorkflowScript",
    "workflowRunsDir",
    "writeChildEntryFile",
  ]);
  const protocol = await load("dynamic-workflow-runtime", "protocol");
  assert.deepEqual(Object.keys(protocol), []);
  assert.equal(runtime.childEntryFileName("contract"), "contract.mjs");
  const pkg = packageJson("dynamic-workflow-runtime");
  assert.equal(pkg.name, "@knorvia/dynamic-workflow-runtime");
  assert.equal(pkg.version, "0.1.0");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.exports["."].import, "./dist/index.js");
});

test("B10 目录与入口文件命名", () => {
  assert.equal(
    runtime.workflowRunsDir(join("work", "dir")),
    join("work", "dir", ".knorvia-studio", "workflow-runs"),
  );
  assert.equal(runtime.fallbackWorkflowRunsDir(), join(tmpdir(), "knorvia-workflow-runs"));
  assert.equal(runtime.childEntryFileName("run-1.2_3"), "run-1.2_3.mjs");
  assert.equal(runtime.childEntryFileName("a/b\\c: d 中"), "a_b_c__d__.mjs");
  assert.equal(runtime.childEntryFileName(""), ".mjs");
  assert.equal(runtime.childEntryFileName(".."), "...mjs");
});

test("B11 入口文件、.gitignore 与覆写", (t) => {
  const cwd = tempDir(t);
  const source = "console.log('first')\n";
  const first = runtime.writeChildEntryFile({ cwd, runId: "run/1", source });
  assert.equal(first.location, "project");
  assert.equal(first.path, join(cwd, ".knorvia-studio", "workflow-runs", "run_1.mjs"));
  assert.equal(readFileSync(first.path, "utf8"), source);
  const ignorePath = join(dirname(first.path), ".gitignore");
  assert.equal(readFileSync(ignorePath, "utf8"), "*\n");

  writeFileSync(ignorePath, "keep\n");
  const warnings = [];
  const second = runtime.writeChildEntryFile({
    cwd,
    runId: "run/1",
    source: "console.log('second')\n",
    onWarning: (warning) => warnings.push(warning),
  });
  assert.equal(second.path, first.path);
  assert.equal(readFileSync(second.path, "utf8"), "console.log('second')\n");
  assert.equal(readFileSync(ignorePath, "utf8"), "keep\n");
  assert.equal(warnings.length, 0);

  const nested = runtime.writeChildEntryFile({ cwd, runId: "a b", source: "x" });
  assert.equal(nested.path, join(cwd, ".knorvia-studio", "workflow-runs", "a_b.mjs"));
  assert.equal(readFileSync(nested.path, "utf8"), "x");
});

test("B12 项目目录失败回落与二次失败", (t) => {
  const dir = tempDir(t);
  const blocker = join(dir, "blocker");
  writeFileSync(blocker, "not a directory");
  const warnings = [];
  const runId = `fallback-${process.pid}`;
  const result = runtime.writeChildEntryFile({
    cwd: blocker,
    runId,
    source: "fallback source",
    onWarning: (warning) => warnings.push(warning),
  });
  t.after(() => rmSync(result.path, { force: true }));
  assert.equal(result.location, "tmpdir");
  assert.equal(result.path, join(runtime.fallbackWorkflowRunsDir(), `${runId}.mjs`));
  assert.equal(readFileSync(result.path, "utf8"), "fallback source");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].kind, "entry_file_fallback");
  assert.equal(warnings[0].projectDir, join(blocker, ".knorvia-studio", "workflow-runs"));
  assert.equal(warnings[0].fallbackDir, runtime.fallbackWorkflowRunsDir());
  assert.equal(typeof warnings[0].error, "string");
  assert.notEqual(warnings[0].error.length, 0);

  const envKeys = ["TMPDIR", "TMP", "TEMP"];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const secondWarnings = [];
  try {
    for (const key of envKeys) process.env[key] = blocker;
    assert.throws(() =>
      runtime.writeChildEntryFile({
        cwd: blocker,
        runId: "double-failure",
        source: "never written",
        onWarning: (warning) => secondWarnings.push(warning),
      }),
    );
  } finally {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
  assert.equal(secondWarnings.length, 1);
  assert.equal(secondWarnings[0].kind, "entry_file_fallback");
});

test("B13 renderChildEntry 生成自包含 ESM", async (t) => {
  const payload = { lowered: "return 1;", args: { flag: true }, maxOldSpaceSizeMb: 128 };
  const text = runtime.renderChildEntry(payload, { runId: "run/one two" });
  assert.ok(text.startsWith("// knorvia dynamic workflow run run_one_two\n"));
  assert.ok(text.includes(`export const payload = ${JSON.stringify(payload)};`));
  assert.ok(text.includes("export const start = (deps) => main({ ...deps, payload });"));
  assert.ok(text.includes("const main = function childMain(deps)"));
  for (const specifier of [
    '"node:fs"',
    '"node:readline"',
    '"node:url"',
    '"node:v8"',
    '"node:vm"',
  ]) {
    assert.ok(text.includes(`from ${specifier};`), `generated entry imports ${specifier}`);
  }
  assert.ok(text.includes('setFlagsFromString("--max-old-space-size=" + Math.trunc('));
  assert.ok(
    text.includes('process.execArgv.some((arg) => arg.startsWith("--max-old-space-size"))'),
  );
  assert.ok(
    text.includes("realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))"),
  );
  assert.equal(runtime.renderChildEntry(payload, { runId: "run/one two" }), text);

  const dir = tempDir(t);
  const file = join(dir, "entry.mjs");
  const importable = { lowered: "return 1;", args: { nested: { value: 1 } } };
  writeFileSync(file, runtime.renderChildEntry(importable, { runId: "importable" }));
  const entry = await import(pathToFileURL(file).href);
  assert.deepEqual(entry.payload, importable);
  assert.equal(typeof entry.start, "function");
  assert.equal(entry.start.length, 1);

  assert.throws(
    () => runtime.renderChildEntry({ lowered: "x", args: { big: 1n } }, { runId: "r" }),
    TypeError,
  );
});

test("B14 childMain 宿主面、消息顺序与实参", async () => {
  const args = { flag: true, nested: { value: 1 } };
  const child = inProcessChild({
    args,
    lowered: `
__host.log("first");
const actor = __host.createActor("site-actor", "worker", "persona");
__host.enterPhase("phase-a");
const answer = await __host.ask("site-ask", actor, "do it");
__host.report("site-report", { note: "untagged" });
__host.declareArtifact("site-declare", "table", ["t1", { columns: [{ field: "a" }] }]);
const read = await __host.worldRead("site-world", "grep", ["needle"]);
const published = await __host.publishArtifact("site-publish", "file", ["f1", "out.txt"]);
__host.report("site-report", { note: "tagged" }, "t1");
(__host.args.nested.value = 2);
return {
  actor,
  answer,
  args: __host.args,
  argsFrozen: Object.isFrozen(__host.args),
  hostKeys: Object.keys(__host).sort(),
  nestedFrozen: Object.isFrozen(__host.args.nested),
  published,
  read,
  reassigned: (() => { try { __host.args.flag = "changed"; } catch { return "threw"; } return __host.args.flag; })(),
};
`,
    autoRespond(message, deliver) {
      if (message.kind !== "request") return;
      const values = {
        ask: "answer-1",
        "publish-artifact": { id: "f1", version: 1 },
        "world-read": { matches: ["n"] },
      };
      deliver(
        JSON.stringify({ id: message.id, kind: "response", ok: true, value: values[message.type] }),
      );
    },
  });
  child.deliver("");
  child.deliver("   ");
  child.deliver(JSON.stringify({ id: "unknown", kind: "response", ok: true, value: 1 }));
  child.deliver(JSON.stringify({ kind: "event" }));
  await child.done;

  const kinds = child.messages.map((message) =>
    message.kind === "event" ? `event:${message.type}` : message.kind,
  );
  assert.deepEqual(kinds, [
    "event:log",
    "create-actor",
    "event:phase-entered",
    "request",
    "event:report",
    "event:declare-artifact",
    "request",
    "request",
    "event:report",
    "complete",
  ]);
  const [log, created, phase, ask, untagged, declared, world, published, tagged, complete] =
    child.messages;
  assert.equal(log.message, "first");
  assert.equal(created.localId, "local#1");
  assert.equal(created.siteId, "site-actor");
  assert.equal(created.name, "worker");
  assert.equal(created.persona, "persona");
  assert.equal(phase.name, "phase-a");
  assert.equal(ask.id, "r1");
  assert.equal(ask.type, "ask");
  assert.equal(ask.actor, "local#1");
  assert.equal(ask.instructions, "do it");
  assert.equal(untagged.item.note, "untagged");
  assert.equal("artifactId" in untagged, false);
  assert.equal(declared.op, "table");
  assert.deepEqual(declared.args, ["t1", { columns: [{ field: "a" }] }]);
  assert.equal(world.id, "r2");
  assert.equal(world.op, "grep");
  assert.deepEqual(world.args, ["needle"]);
  assert.equal(published.id, "r3");
  assert.equal(published.artifactOp, "file");
  assert.deepEqual(published.args, ["f1", "out.txt"]);
  assert.equal(tagged.artifactId, "t1");
  assert.equal(complete.ok, true);
  assert.deepEqual(complete.value.hostKeys, [
    "args",
    "ask",
    "createActor",
    "declareArtifact",
    "enterPhase",
    "log",
    "publishArtifact",
    "report",
    "worldRead",
  ]);
  assert.equal(complete.value.actor, "local#1");
  assert.equal(complete.value.answer, "answer-1");
  assert.deepEqual(complete.value.read, { matches: ["n"] });
  assert.deepEqual(complete.value.published, { id: "f1", version: 1 });
  assert.equal(complete.value.argsFrozen, true);
  assert.equal(complete.value.nestedFrozen, false);
  assert.equal(complete.value.reassigned, true);
  assert.equal(complete.value.args.nested.value, 2);
  assert.equal(child.closeCount(), 1);
  assert.equal(child.interfaceCount(), 1);
});

test("B15 运行期禁令与编译失败", async () => {
  const child = inProcessChild({
    lowered: `
const messages = [];
try { Date.now(); } catch (error) { messages.push(String(error)); }
try { new Date(); } catch (error) { messages.push(String(error)); }
try { Math.random(); } catch (error) { messages.push(String(error)); }
return {
  messages,
  parsed: Date.parse("1970-01-01T00:00:00.000Z"),
  dated: new Date(0).toISOString(),
  utc: Date.UTC(1970, 0, 1),
};
`,
  });
  await child.done;
  const complete = child.messages.at(-1);
  assert.equal(complete.ok, true);
  assert.deepEqual(complete.value.messages, [
    "Error: Date.now() is disabled in workflows",
    "Error: argless new Date() is disabled in workflows",
    "Error: Math.random() is disabled in workflows",
  ]);
  assert.equal(complete.value.parsed, 0);
  assert.equal(complete.value.dated, "1970-01-01T00:00:00.000Z");
  assert.equal(complete.value.utc, 0);

  const broken = inProcessChild({ lowered: "if (" });
  await broken.done;
  assert.equal(broken.messages.length, 1);
  const failure = broken.messages[0];
  assert.equal(failure.kind, "complete");
  assert.equal(failure.ok, false);
  assert.equal(failure.error.name, "SyntaxError");
  assert.equal(typeof failure.error.message, "string");
  assert.notEqual(failure.error.message.length, 0);
  assert.equal(broken.interfaceCount(), 0);
  assert.equal(broken.closeCount(), 0);
});

test("B16 完成、响应错误与收尾", async () => {
  const empty = inProcessChild({ lowered: "undefined;" });
  await empty.done;
  assert.deepEqual(empty.messages, [{ kind: "complete", ok: true }]);
  assert.equal(empty.closeCount(), 1);

  const thrown = inProcessChild({ lowered: 'throw new Error("boom");' });
  await thrown.done;
  const thrownComplete = thrown.messages.at(-1);
  assert.equal(thrownComplete.ok, false);
  assert.equal(thrownComplete.error.name, "Error");
  assert.equal(thrownComplete.error.message, "boom");
  assert.ok(thrownComplete.error.stack.includes("boom"));
  assert.equal("code" in thrownComplete.error, false);
  assert.equal(thrown.closeCount(), 1);

  const custom = inProcessChild({
    lowered: `
const error = new Error("custom");
error.code = "E_CUSTOM";
error.violations = [{ path: "x" }];
error.finalText = "last";
throw error;
`,
  });
  await custom.done;
  const customComplete = custom.messages.at(-1);
  assert.equal(customComplete.error.name, "Error");
  assert.equal(customComplete.error.message, "custom");
  assert.equal(customComplete.error.code, "E_CUSTOM");
  assert.deepEqual(customComplete.error.violations, [{ path: "x" }]);
  assert.equal(customComplete.error.finalText, "last");

  const plain = inProcessChild({ lowered: 'throw "plain";' });
  await plain.done;
  const plainComplete = plain.messages.at(-1);
  assert.deepEqual(
    { message: plainComplete.error.message, name: plainComplete.error.name },
    { message: "plain", name: "Error" },
  );

  const responses = inProcessChild({
    lowered: `
const first = await __host.ask("site", "actor", "one").then(
  (value) => ({ ok: true, value }),
  (error) => ({
    code: error.code,
    finalText: error.finalText,
    message: error.message,
    name: error.name,
    ok: false,
    violations: error.violations,
  }),
);
const second = await __host.ask("site", "actor", "two").then(
  (value) => ({ ok: true, value }),
  (error) => ({ hasCode: "code" in error, message: error.message, name: error.name, ok: false }),
);
return { first, second };
`,
    autoRespond(message, deliver) {
      if (message.kind !== "request") return;
      if (message.id === "r1") {
        deliver(
          JSON.stringify({
            error: {
              code: "UnknownActor",
              finalText: "last",
              message: "",
              name: "UnknownActor",
              violations: [{ path: "x" }],
            },
            id: message.id,
            kind: "response",
            ok: false,
          }),
        );
        deliver(
          JSON.stringify({
            error: { message: "duplicate" },
            id: message.id,
            kind: "response",
            ok: false,
          }),
        );
        return;
      }
      deliver(JSON.stringify({ id: message.id, kind: "response", ok: false }));
    },
  });
  await responses.done;
  const value = responses.messages.at(-1).value;
  assert.deepEqual(value.first, {
    code: "UnknownActor",
    finalText: "last",
    message: "workflow host error",
    name: "UnknownActor",
    ok: false,
    violations: [{ path: "x" }],
  });
  assert.deepEqual(value.second, {
    hasCode: false,
    message: "workflow host error",
    name: "Error",
    ok: false,
  });
  assert.equal(responses.closeCount(), 1);
});

test("B17 执行体选择、元数据转交与入口载荷", async (t) => {
  const noopOptions = {
    askSpecs: new Map(),
    caps: { maxConcurrency: 1 },
    makeDriver() {
      throw new Error("driver must not be built");
    },
    validate: () => [],
  };
  await assert.rejects(runtime.runWorkflowScript(noopOptions), {
    message: "runWorkflowScript: pass either scriptText or lowered",
  });
  await assert.rejects(
    runtime.runWorkflowScript({ ...noopOptions, scriptText: "if (" }),
    (error) => {
      assert.ok(
        error.message.startsWith(
          "runWorkflowScript: the script failed compilation/analysis and is not run degraded: ",
        ),
      );
      return true;
    },
  );

  const cwd = tempDir(t);
  const importedHash = dwf.inputHash({ args: ["needle"], op: "grep" });
  const { harness, settlement } = await runHarness(
    t,
    {
      args: { x: 1 },
      cwd,
      importedCache: {
        actors: new Map(),
        world: new Map([
          [
            importedHash,
            [{ inputHash: importedHash, kind: "world-read", result: { cached: true } }],
          ],
        ]),
      },
      inheritedTokens: 42,
      launch: { inputId: "input-1", phaseNames: ["P1"], subagentModel: "provider/model" },
      lowered: 'return await __host.worldRead("world-1", "grep", ["needle"]);',
      maxOldSpaceSizeMb: 96,
      name: "Meta run",
      parentSessionId: "sess-parent",
      resumedFrom: "run-prev",
      runId: "meta-run",
      scriptHash: "hash-1",
      scriptText: "NOT A COMPILABLE SCRIPT",
      toolCallId: "call-1",
    },
    { worldReadValue: { live: true } },
  );
  assert.deepEqual(settlement, { status: "completed", artifact: { cached: true } });
  assert.equal(harness.worldReads.length, 0);
  const run = harness.journal.getRun("meta-run");
  assert.equal(run.scriptText, "NOT A COMPILABLE SCRIPT");
  assert.equal(run.name, "Meta run");
  assert.deepEqual(run.args, { x: 1 });
  assert.equal(run.scriptHash, "hash-1");
  assert.equal(run.parentSessionId, "sess-parent");
  assert.equal(run.toolCallId, "call-1");
  assert.equal(run.resumedFrom, "run-prev");
  assert.equal(run.cwd, cwd);
  assert.equal(run.spentTokens, 42);
  const launched = harness.events.find((event) => event.type === "run-launched");
  assert.equal(launched.inputId, "input-1");
  assert.deepEqual(launched.phaseNames, ["P1"]);
  assert.equal(launched.subagentModel, "provider/model");
  assert.deepEqual(
    harness.events.find((event) => event.type === "usage-updated"),
    { spentTokens: 42, type: "usage-updated" },
  );
  const entryText = readFileSync(
    join(cwd, ".knorvia-studio", "workflow-runs", "meta-run.mjs"),
    "utf8",
  );
  assert.ok(entryText.includes('"maxOldSpaceSizeMb":96'));
  assert.ok(
    entryText.includes(
      `"lowered":${JSON.stringify('return await __host.worldRead("world-1", "grep", ["needle"]);')}`,
    ),
  );

  const plain = await runHarness(t, {
    cwd: tempDir(t),
    lowered: "return 1;",
    runId: "defaults-run",
  });
  assert.deepEqual(plain.settlement, { status: "completed", artifact: 1 });
  assert.equal(plain.harness.journal.getRun("defaults-run").cwd, plain.cwd);
  assert.equal("scriptText" in plain.harness.journal.getRun("defaults-run"), false);
  assert.equal("name" in plain.harness.journal.getRun("defaults-run"), false);
  const defaultEntry = readFileSync(
    join(plain.cwd, ".knorvia-studio", "workflow-runs", "defaults-run.mjs"),
    "utf8",
  );
  assert.ok(defaultEntry.includes('"maxOldSpaceSizeMb":256'));

  const childCode = [
    'const readline = require("node:readline");',
    "const reader = readline.createInterface({ input: process.stdin });",
    'process.stdout.write(JSON.stringify({kind:"complete",ok:true,value:{argv:process.argv.slice(1),heapFlags:process.execArgv.filter((arg)=>arg.startsWith("--max-old-space-size")),runAsNode:process.env.ELECTRON_RUN_AS_NODE}})+"\\n");',
    "reader.close();",
  ].join("\n");
  const prefixed = await runHarness(t, {
    childSpawn: { argsPrefix: ["-e", childCode] },
    cwd: tempDir(t),
    lowered: "return 1;",
    runId: "prefixed-run",
  });
  assert.equal(prefixed.settlement.status, "completed");
  assert.deepEqual(prefixed.settlement.artifact.heapFlags, []);
  assert.equal(prefixed.settlement.artifact.argv.length, 1);
  assert.ok(
    prefixed.settlement.artifact.argv[0].endsWith(
      join(".knorvia-studio", "workflow-runs", "prefixed-run.mjs"),
    ),
  );
  assert.equal(prefixed.settlement.artifact.runAsNode, "1");
});

test("B18 宿主事件桥接", async (t) => {
  const { harness, settlement } = await runHarness(t, {
    cwd: tempDir(t),
    lowered: `
__host.log("hello");
__host.enterPhase("P1");
__host.declareArtifact("decl", "table", ["t1", { columns: [{ field: "a" }] }]);
__host.report("rep", { value: 1 }, "t1");
const read = await __host.worldRead("wr", "grep", ["needle", "*.ts"]);
const published = await __host.publishArtifact("pub", "file", ["f1", "out/report.txt"]);
__host.report("rep2", { value: 2 });
return { published, read };
`,
    runId: "bridge-run",
  });
  assert.deepEqual(settlement, {
    artifact: {
      published: { id: "f1", version: 1 },
      read: { args: ["needle", "*.ts"], op: "grep" },
    },
    status: "completed",
  });
  assert.deepEqual(harness.worldReads, [{ args: ["needle", "*.ts"], op: "grep" }]);
  assert.deepEqual(harness.publishes, [
    {
      id: "f1",
      op: "file",
      ordinal: 1,
      path: "out/report.txt",
      runId: "bridge-run",
      siteId: "pub",
      version: 1,
    },
  ]);
  const eventTypes = harness.events.map((event) => event.type);
  assert.ok(eventTypes.indexOf("artifact-published") < eventTypes.indexOf("report"));
  const phase = harness.events.find((event) => event.type === "phase-entered");
  assert.deepEqual(phase, { name: "P1", ordinal: 1, type: "phase-entered" });
  const log = harness.events.find((event) => event.type === "log");
  assert.deepEqual(log, { message: "hello", type: "log" });
  const tagged = harness.events.find(
    (event) => event.type === "report" && event.artifactId === "t1",
  );
  assert.deepEqual(tagged.item, { value: 1 });
  const untagged = harness.events.find(
    (event) => event.type === "report" && event.artifactId === undefined,
  );
  assert.deepEqual(untagged.item, { value: 2 });
  assert.equal("artifactId" in untagged, false);

  const missingOp = await runHarness(t, {
    cwd: tempDir(t),
    lowered: `
try {
  await __host.publishArtifact("pub", undefined, ["f9", "out.txt"]);
  return { caught: false };
} catch (error) {
  return { caught: true, code: error.code, message: error.message, name: error.name };
}
`,
    runId: "missing-op",
  });
  assert.deepEqual(missingOp.settlement.artifact, {
    caught: true,
    code: "DriverError",
    message: "publish-artifact request is missing artifactOp (site pub)",
    name: "WorkflowError",
  });
  assert.equal(missingOp.harness.publishes.length, 0);

  const rawChild = [
    'const readline = require("node:readline");',
    "const reader = readline.createInterface({ input: process.stdin });",
    'process.stdout.write(JSON.stringify({kind:"request",id:"r1",type:"world-read",siteId:"raw"})+"\\n");',
    'reader.on("line", (line) => {',
    "  const message = JSON.parse(line);",
    '  process.stdout.write(JSON.stringify({kind:"complete",ok:true,value:message.value})+"\\n");',
    "  reader.close();",
    "});",
  ].join("\n");
  const defaults = await runHarness(t, {
    childSpawn: { argsPrefix: ["-e", rawChild] },
    cwd: tempDir(t),
    lowered: "return 1;",
    runId: "raw-defaults",
  });
  assert.deepEqual(defaults.settlement.artifact, { args: [], op: "read" });
  assert.deepEqual(defaults.harness.worldReads, [{ args: [], op: "read" }]);

  const rawPublish = [
    'const readline = require("node:readline");',
    "const reader = readline.createInterface({ input: process.stdin });",
    'process.stdout.write(JSON.stringify({kind:"request",id:"r1",type:"publish-artifact",siteId:"raw",artifactOp:"file"})+"\\n");',
    'reader.on("line", (line) => {',
    "  const message = JSON.parse(line);",
    '  process.stdout.write(JSON.stringify({kind:"complete",ok:false,error:{name:"Error",message:message.error.message}})+"\\n");',
    "  reader.close();",
    "});",
  ].join("\n");
  const publishDefaults = await runHarness(t, {
    childSpawn: { argsPrefix: ["-e", rawPublish] },
    cwd: tempDir(t),
    lowered: "return 1;",
    runId: "raw-publish",
  });
  assert.equal(publishDefaults.settlement.status, "errored");
  assert.match(publishDefaults.settlement.error.message, /id must be a non-empty string/u);
});

test("B19 create-actor 句柄映射与 ask", async (t) => {
  const cwd = tempDir(t);
  const harness = createDriver({ JournalStore: dwf.InMemoryJournalStore });
  const settlement = await runtime.runWorkflowScript(
    harnessOptions(harness, {
      askSpecs: new Map([["site-ask", { typed: false }]]),
      cwd,
      lowered: `
const actor = __host.createActor("site-actor", "worker", "persona");
const answer = await __host.ask("site-ask", actor, "do the work");
return { actor, answer };
`,
      runId: "ask-run",
    }),
  );
  assert.deepEqual(settlement, {
    artifact: { actor: "local#1", answer: "answer:do the work" },
    status: "completed",
  });
  assert.equal(harness.sessions.length, 1);
  assert.deepEqual(harness.sessions[0].actor, { ordinal: 1, siteId: "site-actor" });
  assert.equal(harness.asks.length, 1);
  assert.equal(harness.asks[0].session.id, "sess:site-actor@1");
  assert.deepEqual(harness.asks[0].instance, { ordinal: 1, siteId: "site-ask" });
  assert.equal(harness.asks[0].message.instructions, "do the work");
  assert.equal(harness.asks[0].message.typed, false);

  const unknown = await runHarness(t, {
    askSpecs: new Map([["site-ask", { typed: false }]]),
    cwd: tempDir(t),
    lowered: `
try {
  await __host.ask("site-ask", "local#99", "nobody");
  return { caught: false };
} catch (error) {
  return { caught: true, code: error.code, message: error.message, name: error.name };
}
`,
    runId: "unknown-actor",
  });
  assert.deepEqual(unknown.settlement.artifact, {
    caught: true,
    code: "UnknownActor",
    message: "Unknown subagent handle: local#99",
    name: "WorkflowError",
  });
  assert.equal(unknown.harness.asks.length, 0);

  const duplicate = await runHarness(t, {
    cwd: tempDir(t),
    lowered: `
__host.createActor("site-actor", "same-name", "persona");
__host.createActor("site-actor", "same-name", "persona");
return 1;
`,
    runId: "duplicate-actor",
  });
  assert.equal(duplicate.settlement.status, "errored");
  assert.equal(duplicate.settlement.error.code, "DuplicateActorName");
  assert.equal(duplicate.settlement.error.name, "WorkflowError");
});

test("B20 脚本抛错 → errored", async (t) => {
  const normal = await runHarness(t, {
    cwd: tempDir(t),
    lowered: 'throw new Error("script boom");',
    runId: "script-throw",
  });
  assert.equal(normal.settlement.status, "errored");
  assert.equal(normal.settlement.error.name, "WorkflowError");
  assert.equal(normal.settlement.error.code, "DriverError");
  assert.equal(normal.settlement.error.message, "script boom");
  assert.equal(typeof normal.settlement.error.cause, "string");
  assert.ok(normal.settlement.error.cause.includes("script boom"));
  const failedRun = normal.harness.journal.getRun("script-throw");
  assert.equal(failedRun.status, "errored");
  assert.equal(failedRun.failure.code, "DriverError");
  assert.equal(failedRun.failure.message, "script boom");
  assert.equal(normal.harness.disposeCount(), 1);

  const nonError = await runHarness(t, {
    cwd: tempDir(t),
    lowered: 'throw "plain";',
    runId: "plain-throw",
  });
  assert.equal(nonError.settlement.status, "errored");
  assert.equal(nonError.settlement.error.message, "plain");

  const fallback = await runHarness(t, {
    childSpawn: {
      argsPrefix: [
        "-e",
        'process.stdout.write(JSON.stringify({kind:"complete",ok:false,error:{}})+"\\n");',
      ],
    },
    cwd: tempDir(t),
    lowered: "return 1;",
    runId: "fallback-message",
  });
  assert.equal(fallback.settlement.status, "errored");
  assert.equal(fallback.settlement.error.message, "The workflow script threw an error");
  assert.equal(fallback.settlement.error.cause, undefined);

  const inFlight = await runHarness(
    t,
    {
      askSpecs: new Map([["site-ask", { typed: false }]]),
      cwd: tempDir(t),
      lowered: `
const actor = __host.createActor("site-actor", "worker", "persona");
void __host.ask("site-ask", actor, "hang");
await __host.worldRead("site-wait", "wait", []);
throw new Error("late failure");
`,
      runId: "in-flight-failure",
    },
    { gateWorldRead: true, settleAsk: false },
  );
  assert.equal(inFlight.settlement.status, "errored");
  assert.equal(inFlight.settlement.error.message, "late failure");
  await waitFor(() => inFlight.harness.cancellations.length > 0);
  assert.deepEqual(inFlight.harness.cancellations[0], { ordinal: 1, siteId: "site-ask" });
});

test("B21 宿主故障 → stopped(interrupted)", async (t) => {
  const stalled = (t, overrides) =>
    runHarness(t, {
      cwd: tempDir(t),
      lowered: "return 1;",
      runId: "host-fault",
      ...overrides,
    });

  const invalidLine = await stalled(t, {
    childSpawn: {
      argsPrefix: ["-e", 'process.stdout.write("not-ndjson\\n"); setInterval(() => {}, 1000);'],
    },
  });
  assert.equal(invalidLine.settlement.status, "stopped");
  assert.equal(invalidLine.settlement.reason, "interrupted");
  assert.equal(invalidLine.settlement.error.name, "WorkflowError");
  assert.equal(invalidLine.settlement.error.code, "Interrupted");
  assert.equal(
    invalidLine.settlement.error.message,
    "The workflow sandbox process emitted a line that is not valid NDJSON: not-ndjson",
  );

  const stderrExit = await stalled(t, {
    childSpawn: {
      argsPrefix: ["-e", 'process.stderr.write("child stderr detail\\n"); process.exit(7);'],
    },
  });
  assert.equal(stderrExit.settlement.status, "stopped");
  assert.equal(stderrExit.settlement.error.message, "child stderr detail");

  const silentExit = await stalled(t, {
    childSpawn: { argsPrefix: ["-e", "process.exit(7);"] },
  });
  assert.equal(silentExit.settlement.status, "stopped");
  assert.equal(
    silentExit.settlement.error.message,
    "The workflow sandbox process exited (code=7, signal=null) before completing",
  );

  const cwd = tempDir(t);
  const blocker = join(cwd, "blocker-file");
  writeFileSync(blocker, "x");
  const spawnFailure = await runHarness(t, {
    cwd: blocker,
    lowered: "return 1;",
    runId: "spawn-failure",
  });
  assert.equal(spawnFailure.settlement.status, "stopped");
  assert.equal(spawnFailure.settlement.reason, "interrupted");
  assert.match(
    spawnFailure.settlement.error.message,
    /^Could not start the workflow sandbox process: /u,
  );
});

test("B22 墙钟超时", async (t) => {
  const { harness, settlement } = await runHarness(t, {
    childSpawn: { argsPrefix: ["-e", "setInterval(() => {}, 1000);"] },
    cwd: tempDir(t),
    lowered: "return 1;",
    runId: "timeout-run",
    timeoutMs: 250,
  });
  assert.equal(settlement.status, "stopped");
  assert.equal(settlement.reason, "interrupted");
  assert.equal(settlement.error.name, "WorkflowError");
  assert.equal(settlement.error.code, "Interrupted");
  assert.equal(
    settlement.error.message,
    "The workflow sandbox process exceeded its wall-clock timeout of 250ms",
  );
  assert.equal(harness.journal.getRun("timeout-run").stopReason, "interrupted");
});

test("B23 abort 归因", async (t) => {
  const runAborted = async (reason, runId = "abort-run") => {
    const controller = new AbortController();
    controller.abort(reason);
    const result = await runHarness(t, {
      childSpawn: { argsPrefix: ["-e", "setInterval(() => {}, 1000);"] },
      cwd: tempDir(t),
      lowered: "return 1;",
      runId,
      signal: controller.signal,
    });
    return result.settlement;
  };

  const superseded = await runAborted({ superseded: "next-run" });
  assert.deepEqual(superseded, {
    reason: "superseded",
    status: "stopped",
    supersededBy: "next-run",
  });

  const emptySuperseded = await runAborted({ superseded: "" });
  assert.deepEqual(emptySuperseded, { reason: "user", status: "stopped" });

  const interrupted = await runAborted("interrupted", "abort-interrupted");
  assert.equal(interrupted.status, "stopped");
  assert.equal(interrupted.reason, "interrupted");
  assert.equal(interrupted.error.name, "WorkflowError");
  assert.equal(interrupted.error.code, "Interrupted");
  assert.equal(
    interrupted.error.message,
    "dynamic workflow run abort-interrupted was interrupted: the owning session closed before the run settled",
  );

  assert.deepEqual(await runAborted("model"), { reason: "model", status: "stopped" });
  assert.deepEqual(await runAborted("user"), { reason: "user", status: "stopped" });
  assert.deepEqual(await runAborted({ unknown: true }), { reason: "user", status: "stopped" });
  assert.deepEqual(await runAborted(undefined), { reason: "user", status: "stopped" });
});

// Minimal synthetic data boundaries; dependency behavior is injected, never integrated.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";

// 根统一入口没有 positional root；显式历史输入仍优先，默认核对本包当前源码。
const root = process.argv[2] ?? fileURLToPath(new URL("../src/", import.meta.url));
assert.ok(root, "Supply baseline or candidate source root.");
const { z } = createRequire(import.meta.url)("zod");
const plain = (value) => JSON.parse(JSON.stringify(value));
const ports = {
  "./assistant-message-parts.js":
    'export const getLatestAssistantContentPart=(parts)=>parts.findLast(p=>p.type==="content")??null;',
  "./core.js": 'import {z} from "zod"; export const timestampSchema=z.number();',
  "./workflow-runs.js":
    'import {z} from "zod"; export const WORKFLOW_RUNS_LIMITS={maxPhases:32,maxPhaseNameLength:128};export const workflowRunSchema=z.object({status:z.enum(["pending","running","completed","errored","stopped"]),stopReason:z.enum(["fixture-stop"]).optional()});',
};
async function load(name) {
  const output = await build({
    entryPoints: [resolve(root, name + ".ts")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    external: ["zod"],
    plugins: [
      {
        name: "synthetic-owner-ports",
        setup(builder) {
          builder.onResolve({ filter: /\.js$/ }, (args) =>
            ports[args.path] ? { path: args.path, namespace: "synthetic" } : undefined,
          );
          builder.onLoad({ filter: /.*/, namespace: "synthetic" }, (args) => ({
            contents: ports[args.path],
          }));
        },
      },
    ],
  });
  const module = { exports: {} };
  runInNewContext(output.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: (name) => {
      assert.equal(name, "zod");
      return { z };
    },
    Date: { now: () => 0, parse: Date.parse },
  });
  return module.exports;
}

test("assistant presentation preserves root tool identity and ordered partial/settled content", async () => {
  const { buildKnorviaAssistantPresentation: derive } = await load("assistant-presentation");
  const parent = { toolId: "parent", kind: "fixture", input: {}, status: "running" };
  const child = { ...parent, toolId: "child", parentToolUseId: "parent" };
  const orphan = { ...parent, toolId: "orphan", parentToolUseId: "missing" };
  const parts = [
    { type: "content", content: "same" },
    { type: "tool-call", toolId: "child" },
    { type: "tool-call", toolId: "parent" },
    { type: "tool-call", toolId: "parent" },
    { type: "thought", content: "fixture" },
    { type: "content", content: "same" },
    { type: "tool-call", toolId: "missing" },
  ];
  const output = derive({ content: "unused", parts, toolCalls: [parent, child, orphan] });
  assert.notEqual(output.messageParts, parts);
  assert.equal(output.messageParts[0], parts[0]);
  assert.equal(output.blocks[1].toolCall, parent);
  assert.equal(output.latestPart, output.blocks[3]);
  assert.equal(output.historyBlocks.length, 3);
  const partial = derive({ content: "", parts, toolCalls: [parent, child], streaming: true });
  assert.equal(partial.latestPart, null);
  assert.equal(partial.historyBlocks.length, partial.blocks.length);
  assert.deepEqual(
    plain(
      derive({ content: "done", thought: "think", toolCalls: [parent, child, orphan] })
        .messageParts,
    ),
    [
      { type: "thought", content: "think" },
      { type: "tool-call", toolId: "parent" },
      { type: "tool-call", toolId: "orphan" },
      { type: "content", content: "done" },
    ],
  );
  const longPartial = Array.from({ length: 140000 }, () => ({ type: "thought", content: "" }));
  assert.equal(
    derive({ content: "", parts: longPartial, streaming: true }).messageParts.length,
    longPartial.length,
  );
});

test("background control validates aliases and keeps cancel task identity without executing", async () => {
  const api = await load("background-task-controls");
  const raw = {
    taskId: " task-1 ",
    toolCallId: "call-1",
    taskKind: "unsupported",
    toolName: " Task ",
    description: " work ",
    command: "ignored shell command",
    status: "in progress",
    startedAt: "2020-01-01T00:00:00Z",
    start_time: "10",
    cancellable: "no",
  };
  const jobs = api.parseKnorviaBackgroundTaskControlItems([
    null,
    { type: "bash", command: "deny bare type" },
    raw,
    { taskId: "task-2", taskKind: "bash", command: [" echo ", 3, " synthetic "], status: "queued" },
  ]);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].jobId, "task-1");
  assert.equal(jobs[0].toolCallId, "call-1");
  assert.equal(jobs[0].raw, raw);
  assert.equal(jobs[0].command, "work");
  assert.equal(jobs[0].startedAt, 10);
  assert.equal(jobs[0].cancellable, false);
  assert.equal(jobs[1].command, "echo synthetic");
  const visible = api.collectVisibleKnorviaBackgroundTaskControlItems(jobs, 30010);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].elapsedMs, 30000);
  assert.notEqual(visible[0], jobs[0]);
  const overwritten = api.parseKnorviaBackgroundTaskControlItems([raw, { ...raw, title: "last" }]);
  assert.equal(overwritten.length, 1);
  assert.equal(overwritten[0].title, "last");
  assert.deepEqual(plain(api.parseKnorviaBackgroundTaskControlItems({ jobs: [raw] })), []);
  const displayOnly = { taskKind: "agent", description: "display only", taskId: "display" };
  Object.defineProperty(displayOnly, "command", {
    get() {
      throw new Error("unused synthetic command");
    },
  });
  Object.defineProperty(displayOnly, "input", {
    get() {
      throw new Error("unused synthetic input");
    },
  });
  assert.equal(
    api.parseKnorviaBackgroundTaskControlItems([displayOnly])[0].command,
    "display only",
  );
});

test("memory gate snapshots only write admissions and registry isolates provider/replacement disposal", async () => {
  const api = await load("memoryDiagnostics");
  const gate = api.createMemorySampleWriteGate();
  const initial = { role: "main", heapUsedKb: 100, rssKb: 100, counters: { jobs: 1 } };
  assert.equal(gate.evaluate(initial, 0), "first");
  initial.counters.jobs = 8;
  assert.equal(gate.evaluate({ ...initial, counters: { jobs: 1 }, heapUsedKb: 105 }, 10), null);
  assert.equal(
    gate.evaluate({ ...initial, counters: { jobs: 1 }, heapUsedKb: 106 }, 11),
    "changed",
  );
  assert.equal(
    gate.evaluate({ ...initial, counters: { jobs: 1 }, heapUsedKb: 106 }, 300011),
    "heartbeat",
  );
  const registry = api.createMemoryDiagnosticsRegistry();
  const old = registry.register("fixture", () => ({ old: 1 }));
  registry.register("fixture", () => ({ fresh: 2, deny: Infinity }));
  old.dispose();
  registry.register("broken", () => {
    throw new Error("synthetic");
  });
  registry.register("after", () => ({ value: 3 }));
  assert.deepEqual(plain(registry.collect()), { "fixture.fresh": 2, "after.value": 3 });
  assert.equal(
    api.formatMemorySampleLine(
      { role: "main", rssKb: 1.6, externalKb: Infinity, counters: { z: 3.5, a: 1, deny: NaN } },
      "first",
    ),
    "[memory] role=main reason=first rssKb=2 a=1 z=4",
  );
});

test("workflow activity bounds snapshot projection and validates summary fields through fake ports", async () => {
  const api = await load("protocol-v4/sessions-index-workflow-activity");
  const station = "s".repeat(128);
  const live = {
    runId: "live",
    status: "running",
    currentPhase: "B",
    phaseNames: [station, "B", "C"],
    phases: [{ name: station }],
    phaseAlongside: [[1, 1, 0, 3, 1.5], [0]],
    nodes: [{ phase: "executing", phaseName: station + "tail" }],
    actors: [{ status: "running" }],
  };
  const settled = [1, 2, 3, 4].map((i) => ({
    runId: "done-" + i,
    status: "completed",
    nodes: [],
    actors: [],
    phases: [],
  }));
  const input = {
    workflowRuns: { runs: [settled[0], live, ...settled.slice(1)] },
    backgroundWorks: [
      { kind: "workflow", workId: "live", title: " name ", startedAt: 1 },
      { kind: "other", workId: "live", title: "deny", startedAt: 2 },
    ],
  };
  const output = api.deriveSessionWorkflowActivity(input);
  assert.deepEqual(plain(output.runs.map((r) => r.runId)), ["live", "done-4", "done-3", "done-2"]);
  assert.equal(output.runs[0].name, "name");
  assert.deepEqual(plain(output.runs[0].phases), [
    { name: station, status: "running", alongside: [1, 1] },
    { name: "B", status: "running", alongside: [0] },
    { name: "C", status: "pending" },
  ]);
  assert.equal(output.runs[0].agentsWorking, 1);
  assert.equal(api.sessionWorkflowActivitySchema.safeParse(output).success, true);
  assert.equal(
    api.sessionWorkflowActivitySchema.safeParse({ runs: [...output.runs, output.runs[0]] }).success,
    false,
  );
  assert.equal(
    api.sessionWorkflowPhaseSummarySchema.safeParse({ name: "", status: "running" }).success,
    false,
  );
  assert.equal(
    api.deriveSessionWorkflowActivity({ workflowRuns: undefined, backgroundWorks: [] }),
    undefined,
  );
  assert.equal(live.phaseAlongside[0].length, 5);
  const sparseRuns = [];
  sparseRuns[2] = live;
  assert.equal(
    api.deriveSessionWorkflowActivity({ workflowRuns: { runs: sparseRuns }, backgroundWorks: [] })
      .runs.length,
    1,
  );
});

test("tool projection preserves explicit undefined and cached input identity while releasing partial raw data", async () => {
  const api = await load("tool-projection-memory");
  const memory = api.createKnorviaToolProjectionMemory();
  assert.equal(api.ensureKnorviaToolProjectionMemory(memory), memory);
  const input = { fixture: true };
  const partial = { rawInput: "synthetic", deltaCount: 2, lastPreviewAt: 4 };
  memory.streamingToolInputById.set("tool", partial);
  api.finalizeKnorviaToolProjectionInput("tool", input, memory);
  assert.equal(memory.completeToolInputById.get("tool"), input);
  assert.equal(memory.streamingToolInputById.get("tool"), partial);
  assert.equal(partial.rawInput, "");
  assert.equal(partial.lastPreviewRawInputLength, 9);
  assert.equal(partial.deltaCount, 2);
  const absent = api.resolveKnorviaToolProjectionMetadata({ toolName: " " }, "tool", memory);
  assert.equal(absent.input, input);
  assert.equal(absent.hasInput, true);
  assert.equal(absent.toolName, " ");
  const explicit = api.resolveKnorviaToolProjectionMetadata({ input: undefined }, "tool", memory);
  assert.equal(explicit.hasInput, false);
  assert.equal(Object.hasOwn(explicit, "input"), true);
  assert.equal(explicit.input, undefined);
  assert.equal(
    api.resolveKnorviaToolProjectionMetadata(Object.create({ input: 7 }), "tool", memory).input,
    7,
  );
  const empty = {};
  api.resolveKnorviaToolProjectionMetadata({ toolName: "fixture" }, "other", empty);
  assert.deepEqual(plain(empty), {});
  api.forgetKnorviaToolProjectionMetadata("tool", memory);
  assert.equal(memory.completeToolInputById.has("tool"), false);
  assert.equal(memory.streamingToolInputById.has("tool"), false);
  assert.equal(memory.toolNameById.has("tool"), false);
});

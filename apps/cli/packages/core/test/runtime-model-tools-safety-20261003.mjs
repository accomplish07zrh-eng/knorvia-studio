import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(core, "../../../..");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const mode = process.argv[2];
assert.ok(["baseline", "current"].includes(mode));
const pins = {
  "model-request": "3a4852a727e775de2c333d3544efc05e369834be377c83f2748dab1a450deae9",
  "turn-tool-batch": "329fca789759a6464f934185f2dc87bae1d467c1443a6fc947451edeab1731fb",
};
const files = {},
  locations = {};
if (mode === "baseline") {
  for (const [n, pin] of Object.entries(pins)) {
    const b = await readFile(path.join(core, "test", `runtime-${n}-baseline-20261003.json`));
    assert.equal(hash(b), pin);
    const f = JSON.parse(b).files[n];
    for (const k of ["source", "compiled", "declaration"])
      assert.equal(hash(f[k]), f[k + "Sha256"]);
    files[n] = f.compiled;
    locations[n] = path.join(
      core,
      "src/runtime/methods",
      n === "model-request" ? "model.js" : "turn-tools.js",
    );
  }
} else {
  const b = await readFile(
    path.join(repo, "docs/evidence/knorvia-runtime-model-tools-current-20261003.json"),
  );
  assert.equal(
    hash(b),
    "2a1e933bbe0972e1191365df848f5de1502b1a4903b9c6b7c930874b69fc50ae",
    "exact current manifest, no oracle fallback",
  );
  for (const [n, entries] of Object.entries(JSON.parse(b).files)) {
    for (const [k, e] of Object.entries(entries)) {
      const b = await readFile(path.join(repo, e.path));
      assert.equal(hash(b), e.sha256, e.path);
      if (k === "compiled") files[n] = b.toString();
    }
    locations[n] = path.join(repo, entries.source.path.replace(/\.ts$/u, ".js"));
  }
}
const dir = await mkdtemp(path.join(tmpdir(), "knorvia-model-tools-owned-"));
for (const [n, b] of Object.entries(files)) {
  const rebound = b.replace(/(from\s+|import\s+)(['"])([^'"]+)\2/gu, (all, pre, q, spec) => {
    let target;
    if (spec === "@knorvia/contracts") target = path.join(core, "../contracts/dist/index.js");
    else if (spec.startsWith(".")) {
      target = path.resolve(path.dirname(locations[n]), spec);
      const own = Object.keys(locations).find((k) => locations[k] === target);
      if (own) target = path.join(dir, own + ".mjs");
    } else return all;
    return pre + q + pathToFileURL(target).href + q;
  });
  await writeFile(path.join(dir, n + ".mjs"), rebound);
}
const modelOwner = await import(pathToFileURL(path.join(dir, "model-request.mjs")).href);
const toolOwner = await import(pathToFileURL(path.join(dir, "turn-tool-batch.mjs")).href);
const deps = await import(pathToFileURL(path.join(core, "src/runtime/deps.ts")).href);
const trace = { traceId: "owned-trace", spanId: "owned-span", turnId: "owned-turn" };
const groups = [];
{
  const control = new AbortController();
  control.abort("owned preabort");
  const messages = [{ role: "user", content: "Owned request" }],
    tools = [];
  const original = {
    text: "Owned result",
    finishReason: "stop",
    usage: { totalTokens: 3 },
    providerMetadata: { owned: true },
  };
  let request,
    context,
    count = 0;
  const statuses = [];
  const model = {
    providerId: "owned-provider",
    modelId: "owned-model",
    properties: {
      inputFormat: { supportsImage: true, supportsPdf: true, supportsVideo: true },
      contextWindow: 100,
    },
    async generateText(input) {
      assert.equal(this, model);
      count++;
      request = input;
      context = deps.getCurrentModelInvocationContext();
      return original;
    },
  };
  const runtime = {
    config: { taskType: "task" },
    agentTelemetry: { actorKind: "main" },
    createModelStatusSink(...args) {
      assert.equal(this, runtime);
      statuses.push(args);
      return () => {};
    },
    buildContextUsageSnapshot() {
      assert.equal(this, runtime);
      return {};
    },
    buildContextUsageBreakdownFromSnapshot() {
      return [];
    },
    logContextUsageSnapshot() {},
    shouldStreamModelText() {
      return false;
    },
  };
  const result = await modelOwner.runModelTextRequest.call(runtime, {
    model,
    messages,
    tools,
    abortSignal: control.signal,
    assistantMessageId: "owned-assistant",
    events: [],
    traceContext: trace,
    maxOutputTokens: 0,
    streamRecovery: { retryNumber: 2 },
  });
  assert.equal(count, 1);
  assert.equal(request.messages, messages);
  assert.equal(request.tools, tools);
  assert.equal(request.abortSignal, control.signal);
  assert.deepEqual(request.options, { maxOutputTokens: 0 });
  assert.deepEqual(Object.keys(request), ["messages", "tools", "abortSignal", "options"]);
  assert.equal(context.traceContext, trace);
  assert.equal(context.modelCall.actorKind, "main");
  assert.equal(context.modelCall.operation, "agent_step");
  assert.equal(context.modelCall.operationId, trace.spanId);
  assert.equal(context.modelCall.callCause, "recovery");
  assert.equal(context.streamIdleTimeoutRetryNumber, 2);
  assert.equal(result.usage, original.usage);
  assert.equal(result.providerMetadata, original.providerMetadata);
  assert.ok(Object.hasOwn(result, "toolCalls"));
  assert.equal(statuses.length, 1);
  groups.push("captured model authority and no extra preabort admission");
}
{
  const abort = new AbortController();
  abort.abort("owned stop");
  const cancellation = new Error("Owned checkpoint cancellation");
  const calls = [
    { id: "owned-call-a", name: "OwnedTool", input: { a: 1 } },
    { id: "owned-call-b", name: "OwnedTool", input: { b: 2 } },
  ];
  const records = [],
    history = [],
    checkpoints = [],
    executions = [],
    events = [];
  let schedule;
  const model = { providerId: "owned-provider", modelId: "owned-model" };
  const runtime = {
    sessionId: "owned-session",
    registry: {
      getMetadata() {
        return undefined;
      },
      get() {
        return undefined;
      },
    },
    messageHistory: {
      addEntries(entries) {
        history.push(...entries);
      },
      getMessageCount() {
        return history.length;
      },
    },
    async persistPart(part) {
      assert.equal(this, runtime);
      records.push(part);
    },
    createEvent(type, payload) {
      return { type, payload };
    },
    async appendEvent(event) {
      events.push(event);
    },
    async scheduleTools(input) {
      assert.equal(this, runtime);
      schedule = { input };
      return schedule;
    },
    toScheduleState() {
      return { groups: [] };
    },
    async emitToolScheduledEvents() {
      return [];
    },
    async executeTools(input, plan, options) {
      assert.equal(this, runtime);
      assert.equal(plan, schedule);
      assert.equal(options.signal, abort.signal);
      assert.equal(options.model, model);
      assert.equal(options.automationTurn, true);
      assert.equal(options.offPeakTurn, false);
      executions.push(input);
      await options.onBatchStart(input.map((x) => x.id));
      return {
        events: [],
        results: input.map((x) => ({
          toolCallId: x.id,
          toolName: x.name,
          success: false,
          output: null,
          error: { type: "tool_cancelled", message: "Owned cancelled tool" },
          startedAt: new Date(10),
          completedAt: new Date(20),
          durationMs: 10,
        })),
      };
    },
    async emitFileMutationCheckpoint(options) {
      checkpoints.push(options.result.toolCallId);
      throw cancellation;
    },
    async persistAssistantMessage() {
      throw new Error("Owned finish must not run");
    },
  };
  let machine = new deps.TurnMachineImpl(
    deps.TurnMachineImpl.create(
      runtime.sessionId,
      1,
      "Owned input",
      trace.traceId,
      trace.turnId,
    ).start(),
  );
  machine = new deps.TurnMachineImpl(machine.startModelRequest("owned-provider/owned-model", []));
  machine = new deps.TurnMachineImpl(machine.receiveModelResponse("Owned response"));
  const state = {
    model,
    automationId: "owned-automation",
    turnTraceContext: trace,
    turnId: trace.turnId,
    turnAbortSignal: abort.signal,
    turnMachine: machine,
    events: [],
    userMessageId: "owned-user",
    turnRequestState: { entries: [], outputTokenContinuationCount: 0 },
  };
  await assert.rejects(
    toolOwner.executeToolCallsForModelStep.call(runtime, state, {
      assistantCreatedAt: 1,
      assistantMessageId: "owned-assistant",
      modelTraceContext: trace,
      result: { text: "", finishReason: "tool-calls", usage: {} },
      toolCalls: calls,
    }),
    (e) => e === cancellation,
  );
  assert.equal(executions.length, 1);
  assert.deepEqual(
    executions[0].map((x) => x.id),
    calls.map((x) => x.id),
  );
  assert.deepEqual(
    records.map((x) => [x.callID, x.state.status]),
    [
      ["owned-call-a", "pending"],
      ["owned-call-b", "pending"],
      ["owned-call-a", "error"],
      ["owned-call-b", "error"],
    ],
  );
  assert.deepEqual(
    checkpoints,
    calls.map((x) => x.id),
  );
  assert.equal(history.length, 2);
  assert.equal(state.turnRequestState.entries.length, 2);
  assert.deepEqual(history, state.turnRequestState.entries);
  assert.ok(
    !events.some(
      (x) => x.payload?.status === "tool_started" || x.payload?.status === "tool_result_committed",
    ),
  );
  groups.push("unchanged authority flags, aborted batch and sibling durable closure");
}
console.log(
  JSON.stringify({
    mode,
    groups,
    count: groups.length,
    dependencies:
      "unchanged real source dependencies; selected owners are exact compiler-emitted JS",
    liveIO: false,
  }),
);

import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  repo = path.resolve(core, "../../../..");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const mode = process.argv[2];
assert.ok(["baseline", "current", "draft"].includes(mode));
const files = {},
  locations = {};
if (mode === "baseline") {
  const b = await readFile(path.join(core, "test/runtime-turn-model-step-baseline-20261003.json"));
  assert.equal(hash(b), "889a560e94454d06330622bcd0b3c46872df40bf3e9a9c17e9c020ff4157b84c");
  const f = JSON.parse(b).files["turn-model-step"];
  for (const k of ["source", "compiled", "declaration"]) assert.equal(hash(f[k]), f[k + "Sha256"]);
  files["turn-model-step"] = f.compiled;
  locations["turn-model-step"] = path.join(core, "src/runtime/methods/turn-model-step.js");
} else if (mode === "draft") {
  const artifact = JSON.parse(await readFile(process.argv[3], "utf8"));
  assert.equal(artifact.diagnostics.length, 0);
  for (const [f, t] of artifact.emissions)
    if (f.endsWith(".js") && f.includes("/runtime/methods/turn-model-step")) {
      const n = path.basename(f, ".js");
      files[n] = t;
      locations[n] = path.join(core, "src/runtime/methods", n + ".js");
    }
  assert.ok(files["turn-model-step"]);
} else {
  const b = await readFile(
    path.join(repo, "docs/evidence/knorvia-runtime-turn-model-step-current-20261003.json"),
  );
  assert.equal(hash(b), "c26360942ea6f1de1867fce6e473ca2c5b310a30ea3776d90b70ffc6b737da3b");
  for (const [n, entries] of Object.entries(JSON.parse(b).files)) {
    for (const [k, e] of Object.entries(entries)) {
      const b = await readFile(path.join(repo, e.path));
      assert.equal(hash(b), e.sha256, e.path);
      if (k === "compiled") files[n] = b.toString();
    }
    locations[n] = path.join(repo, entries.source.path.replace(/\.ts$/u, ".js"));
  }
}
const dir = await mkdtemp(path.join(tmpdir(), "knorvia-model-step-safety-"));
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
const { runModelBackedTurnStep } = await import(
  pathToFileURL(path.join(dir, "turn-model-step.mjs")).href
);
const deps = await import(pathToFileURL(path.join(core, "src/runtime/deps.ts")).href);
const trace = { traceId: "owned-trace", spanId: "owned-span", turnId: "owned-turn" };
function fixture(which) {
  const controller = new AbortController(),
    records = [],
    events = [],
    history = [],
    order = [],
    telemetry = [],
    usage = [];
  const model = {
    providerId: "owned-provider",
    modelId: "owned-model",
    optionSpecs: { maxOutputTokens: { max: 1234 } },
    properties: { contextWindow: 50000 },
    options: {},
  };
  const modelResult = {
    text: "Owned completed text",
    reasoning: [],
    finishReason: "stop",
    usage: { totalTokens: 3 },
  };
  const failure = new Error("Owned preparation write failed");
  let request;
  const runtime = {
    sessionId: "owned-session",
    turnNumber: 1,
    config: { taskType: "task", modelStreaming: "off" },
    currentTurnFileChanges: new Map(),
    mainTurnCacheHitAggregate: {
      requestCount: 0,
      totalInputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
    },
    agentTelemetry: {
      step(input) {
        telemetry.push(["step", input.stepIndex]);
        return {
          async run(fn) {
            order.push("telemetry.run");
            return await fn();
          },
          finishCompleted(reason) {
            telemetry.push(["completed", reason]);
          },
          finishCancelled(reason) {
            telemetry.push(["cancelled", reason]);
          },
          finishFailed(...args) {
            telemetry.push(["failed", ...args]);
          },
        };
      },
    },
    sessionStore: {
      async recordModelUsage(input) {
        usage.push(input);
        order.push("usage:" + input.status);
      },
      upsertTurnUsage() {},
      upsertToolUsage() {},
      pruneUsage() {},
    },
    messageHistory: {
      addEntries(entries) {
        history.push(...entries);
        order.push("history");
      },
      setCacheHit() {},
      getEntries() {
        return history;
      },
    },
    logModelRequestSteeringContext() {
      assert.equal(this, runtime);
      order.push("steering");
    },
    async persistAssistantMessage(id, parent, created, update, context, boundModel) {
      assert.equal(this, runtime);
      assert.equal(boundModel, model);
      records.push({ kind: "assistant", id, parent, update });
      order.push(update?.error ? "assistant:error" : "assistant:start");
      if (which === "preparation") throw failure;
    },
    async persistPart(part) {
      assert.equal(this, runtime);
      records.push({ kind: "part", part });
      order.push("part:" + part.type);
    },
    createEvent(type, payload) {
      assert.equal(this, runtime);
      return { type, payload, timestamp: new Date(10) };
    },
    async appendEvent(event) {
      assert.equal(this, runtime);
      events.push(event);
      order.push("event:" + event.type);
      if (which === "completion" && event.type === deps.SessionEventType.ModelComplete)
        controller.abort("owned completion abort");
    },
    async runModelTextRequest(input) {
      assert.equal(this, runtime);
      request = input;
      order.push("model");
      assert.equal(input.model, model);
      assert.equal(input.abortSignal, controller.signal);
      if (which === "request") {
        input.onStreamSnapshot({
          text: "Owned partial text",
          reasoning: [{ text: "Owned partial reasoning", providerOptions: { owned: true } }],
        });
        controller.abort("owned request abort");
      }
      return modelResult;
    },
    extractToolCallsFromResult(result) {
      assert.equal(result, modelResult);
      order.push("extract");
      return [];
    },
    async reactiveCompactAfterContextExceeded() {
      throw Error("Unexpected owned compact");
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
  const state = {
    model,
    modelStepCount: 0,
    toolCallCount: 0,
    tokenCount: 0,
    historyRoundCount: 0,
    streamRecoveryRetryCount: 99,
    reactiveCompactAttemptedInCurrentModelStep: false,
    turnAbortSignal: controller.signal,
    turnTraceContext: trace,
    turnMachine: machine,
    events: [],
    currentUserMessageId: "owned-user",
    userMessageId: "owned-user",
    input: "Owned input",
    modelResponse: "",
    turnRequestState: { entries: [], outputTokenContinuationCount: 0 },
  };
  const messages = [{ role: "user", content: "Owned input" }],
    recordedMessages = [{ role: "user", content: "Owned recorded input" }];
  const options = { messages, recordedMessages, sourceEntries: [], requestEntries: [], tools: [] };
  return {
    runtime,
    state,
    options,
    records,
    events,
    history,
    order,
    telemetry,
    usage,
    model,
    modelResult,
    failure,
    get request() {
      return request;
    },
  };
}
const f = fixture("completion");
const originalMachine = f.state.turnMachine;
await assert.rejects(
  runModelBackedTurnStep.call(f.runtime, f.state, f.options),
  (e) => e.type === deps.CoreErrorType.TurnCancelled,
);
assert.notEqual(
  f.state.turnMachine,
  originalMachine,
  "completed publication must adopt returned machine instead of leaving stale request identity",
);
assert.equal(f.state.turnMachine.state.phase, "streaming");
assert.equal(f.state.turnMachine.state.streamingContent, f.modelResult.text);
console.log(
  JSON.stringify({
    mode,
    count: 1,
    group: "completion cancellation retains adopted model-response machine",
    overlap: "completion cohort from three-group minimum safety fixture",
    liveIO: false,
  }),
);

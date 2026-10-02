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
  const b = await readFile(path.join(core, "test/runtime-turn-command-baseline-20261003.json"));
  assert.equal(hash(b), "7957aa55629c1982c1faf5234bf1025f0ac1bfc7b5eb55487caf6cdfa1d4c3bd");
  const f = JSON.parse(b).files["turn-command"];
  for (const k of ["source", "compiled", "declaration"]) assert.equal(hash(f[k]), f[k + "Sha256"]);
  files["turn"] = f.compiled;
  locations["turn"] = path.join(core, "src/runtime/methods/turn.js");
} else if (mode === "draft") {
  const artifact = JSON.parse(await readFile(process.argv[3], "utf8"));
  assert.equal(artifact.diagnostics.length, 0);
  for (const [f, t] of artifact.emissions)
    if (
      f.endsWith(".js") &&
      (f.endsWith("/runtime/methods/turn.js") || f.includes("/runtime/methods/turn-command-"))
    ) {
      const n = path.basename(f, ".js");
      files[n] = t;
      locations[n] = path.join(core, "src/runtime/methods", n + ".js");
    }
  assert.ok(files["turn"]);
} else {
  const b = await readFile(
    path.join(repo, "docs/evidence/knorvia-runtime-turn-command-current-20261003.json"),
  );
  assert.equal(hash(b), "CURRENT_COMMAND_MANIFEST_PIN");
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
const { executeTurnCommand } = await import(pathToFileURL(path.join(dir, "turn.mjs")).href);
const deps = await import(pathToFileURL(path.join(core, "src/runtime/deps.ts")).href);
const trace = { traceId: "owned-trace", spanId: "owned-span", turnId: "owned-turn" };
function fixture(kind) {
  const order = [],
    events = [],
    telemetry = [],
    factoryFailure = new Error("Owned model constructor failure"),
    cleanupFailure = new Error("Owned browser callback failure");
  const selection = { providerId: "owned-provider", modelId: "owned-model" },
    controller = new AbortController();
  if (kind === "preabort") controller.abort("Owned early stop");
  const browser = {
    async turnEnded(input) {
      assert.equal(this, browser);
      assert.equal(input.sessionId, runtime.sessionId);
      order.push("browser-ended");
      throw cleanupFailure;
    },
  };
  const runtime = {
    sessionId: "owned-session",
    turnNumber: 1,
    rootTraceContext: trace,
    config: { taskType: "task", outputStyle: { owned: true } },
    currentTurnFileChanges: new Map([["owned", {}]]),
    browserControlPort: browser,
    getSessionModelSelection() {
      assert.equal(this, runtime);
      order.push("selection");
      return selection;
    },
    reserveTurnStart(id, context, kind) {
      assert.equal(this, runtime);
      assert.equal(kind, "regular");
      order.push("reserve");
    },
    releaseTurnStart() {
      assert.equal(this, runtime);
      order.push("release");
    },
    finishActiveTurn(active) {
      assert.equal(this, runtime);
      assert.equal(active, undefined);
      order.push("finish-active");
    },
    modelFactory(input) {
      assert.equal(this, runtime);
      assert.equal(input.selection, selection);
      order.push("model-factory");
      throw factoryFailure;
    },
    createEvent(type, payload, context) {
      assert.equal(this, runtime);
      assert.equal(context.traceId, trace.traceId);
      return { type, payload, timestamp: new Date(10) };
    },
    async appendEvent(event) {
      assert.equal(this, runtime);
      events.push(event);
      order.push("append-outcome");
    },
    logger: {
      warn(message, fields) {
        if (message === "Browser turn cleanup failed") {
          assert.equal(fields.error, cleanupFailure.message);
          assert.equal(typeof fields.turnId, "string");
          assert.deepEqual(Object.keys(fields), ["error", "event", "turnId"]);
        }
        order.push(message === "Browser turn cleanup failed" ? "warn-browser" : "warn-escaped");
      },
      error() {
        order.push("log-outcome");
      },
    },
    agentTelemetry: {
      turn(input) {
        order.push("telemetry-turn");
        return {
          async run(fn) {
            order.push("telemetry-run");
            return await fn();
          },
          finishCompleted(reason) {
            telemetry.push(["completed", reason]);
            order.push("telemetry-completed");
          },
          finishCancelled(reason) {
            telemetry.push(["cancelled", reason]);
            order.push("telemetry-cancelled");
          },
          finishFailed(...args) {
            telemetry.push(["failed", ...args]);
            order.push("telemetry-failed");
          },
        };
      },
    },
  };
  return {
    runtime,
    controller,
    order,
    events,
    telemetry,
    factoryFailure,
    cleanupFailure,
    selection,
  };
}
const groups = [];
{
  const f = fixture("preabort");
  await assert.rejects(
    executeTurnCommand.call(f.runtime, "Owned input", undefined, {
      abortSignal: f.controller.signal,
    }),
    (e) => e.type === deps.CoreErrorType.TurnCancelled,
  );
  assert.deepEqual(f.order, [
    "selection",
    "reserve",
    "telemetry-turn",
    "telemetry-run",
    "warn-escaped",
    "telemetry-cancelled",
    "release",
    "finish-active",
    "browser-ended",
    "warn-browser",
  ]);
  assert.equal(f.runtime.currentTurnFileChanges.size, 0);
  assert.equal(f.events.length, 0);
  assert.deepEqual(f.telemetry, [["cancelled", "abort_signal"]]);
  groups.push("early abort retains admission and ordered cleanup, no model/data writes");
}
{
  const f = fixture("factory");
  let rejected;
  await assert.rejects(
    executeTurnCommand.call(f.runtime, "Owned input", undefined, {
      abortSignal: f.controller.signal,
      inputId: "owned-input",
    }),
    (e) => {
      rejected = e;
      return e.cause === f.factoryFailure;
    },
  );
  assert.deepEqual(f.order, [
    "selection",
    "reserve",
    "telemetry-turn",
    "telemetry-run",
    "model-factory",
    "append-outcome",
    "log-outcome",
    "telemetry-failed",
    "release",
    "finish-active",
    "browser-ended",
    "warn-browser",
  ]);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].type, deps.SessionEventType.TurnError);
  assert.equal(f.events[0].payload.turnPhase, "model_creation");
  assert.equal(f.events[0].payload.inputId, "owned-input");
  assert.equal(f.events[0].payload.error.message, f.factoryFailure.message);
  assert.equal(f.telemetry[0][3], rejected);
  assert.equal(rejected.message, "Model creation failed");
  groups.push(
    "synchronous model creation failure publishes before telemetry/cleanup, browser error swallowed",
  );
}
console.log(
  JSON.stringify({
    mode,
    count: groups.length,
    groups,
    selected:
      "exact compiler-emitted owner; unchanged real dependency owners through source loader",
    liveIO: false,
  }),
);

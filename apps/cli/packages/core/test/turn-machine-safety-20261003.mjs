import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const baselinePath = "apps/cli/packages/core/test/turn-machine-baseline-20261003.json";
const baselineBytes = await readFile(path.join(repo, baselinePath));
assert.equal(
  hash(baselineBytes),
  "e9b7e9fd95ef3c059050c4951072c7cf1077176ea5b26c2de265993dbe3d4452",
);
const baseline = JSON.parse(baselineBytes);
for (const k of ["source", "compiled", "declaration"])
  assert.equal(hash(baseline.file[k]), baseline.file[k + "Sha256"]);
assert.equal(hash(baseline.dependency.compiled), baseline.dependency.compiledSha256);
assert.equal(
  hash(await readFile(path.join(repo, baseline.dependency.logicalPath))),
  baseline.dependency.sourceSha256,
);
const mode = process.argv[2];
assert.ok(["baseline", "current"].includes(mode));
let selected = baseline.file.compiled;
if (mode === "current") {
  const manifestBytes = await readFile(
    path.join(repo, "docs/evidence/knorvia-turn-machine-current-20261003.json"),
  );
  assert.equal(hash(manifestBytes), "CURRENT_PIN");
  const manifest = JSON.parse(manifestBytes);
  for (const [kind, entry] of Object.entries(manifest.file)) {
    const bytes = await readFile(path.join(repo, entry.path));
    assert.equal(hash(bytes), entry.sha256, kind);
    if (kind === "compiled") selected = bytes.toString();
  }
}
const clock = [],
  errors = [],
  ids = [];
class OwnedDate {
  constructor() {
    this.tick = clock.length;
    clock.push(this.tick);
  }
}
const context = vm.createContext({
  Date: OwnedDate,
  crypto: {
    randomUUID() {
      ids.push("trace");
      return "owned-trace";
    },
  },
});
const contract = new vm.SyntheticModule(
  ["createTurnId", "createCoreError", "CoreErrorType", "modelMessageContentToText"],
  function () {
    this.setExport("createTurnId", () => {
      ids.push("turn");
      return "owned-turn";
    });
    this.setExport("CoreErrorType", { InvalidTurnPhase: "invalid_turn_phase" });
    this.setExport("createCoreError", (type, message, options) => {
      const e = { type, message, ...options };
      errors.push(e);
      return e;
    });
    this.setExport("modelMessageContentToText", (content) => {
      if (content === textFailure) throw textFailure;
      return typeof content === "string" ? content : "Owned failed content";
    });
  },
  { context },
);
const dependency = new vm.SourceTextModule(baseline.dependency.compiled, { context });
const owner = new vm.SourceTextModule(selected, { context });
await dependency.link((s) => {
  assert.equal(s, "@knorvia/contracts");
  return contract;
});
await owner.link((s) => {
  if (s === "./turn-state.js") return dependency;
  assert.equal(s, "@knorvia/contracts");
  return contract;
});
await owner.evaluate();
const { TurnMachineImpl: Machine } = owner.namespace;
const Phase = dependency.namespace.TurnPhase;
const plain = (x) => JSON.parse(JSON.stringify(x));
const textFailure = { owned: "text failure" };
const fresh = () => Machine.create("owned-session", 2, "Owned input", "fixed-trace", "fixed-turn");
const observations = [];
function group(name, fn) {
  fn();
  observations.push(name);
  console.log("ok", name);
}
group("native state and actual turn consumer phase chain", () => {
  ids.length = 0;
  const generated = Machine.create("owned-session", 0, "Owned");
  assert.deepEqual(ids, ["turn", "trace"]);
  assert.equal(generated.state.id, "owned-turn");
  ids.length = 0;
  const supplied = Machine.create("owned-session", 0, "Owned", "", "");
  assert.deepEqual(ids, []);
  assert.equal(supplied.state.traceId, "");
  let m = fresh();
  const original = m.state;
  const started = m.start();
  assert.equal(m.state, original);
  assert.equal(started.phase, Phase.ProcessingInput);
  m = new Machine(started);
  const messages = [{ role: "user", content: "Owned" }];
  const requested = m.startModelRequest("owned-model", messages);
  assert.equal(requested.modelRequest.messages, messages);
  m = new Machine(requested);
  m = new Machine(m.receiveModelResponse("Owned response"));
  assert.equal(m.getNextPhase(), Phase.Completing);
  const schedule = { items: [], parallelGroups: [], executionOrder: [] },
    input = {};
  const scheduled = m.scheduleTools([{ id: "tool", name: "Owned", input }], schedule);
  assert.equal(scheduled.scheduledTools, schedule);
  assert.equal(scheduled.toolCalls[0].input, input);
  assert.deepEqual(Object.keys(scheduled.toolCalls[0]), [
    "id",
    "name",
    "input",
    "status",
    "scheduledAt",
  ]);
  m = new Machine(scheduled);
  m = new Machine(m.startToolExecution());
  assert.equal(m.state.toolCalls[0].status, "running");
  m = new Machine(m.completeTool("tool", { success: true, content: "Owned result" }));
  assert.equal(m.getNextPhase(), Phase.AggregatingResults);
  m = new Machine(m.aggregateResults());
  assert.equal(m.getNextPhase(), Phase.AwaitingModelResponse);
  m = new Machine(m.complete("Owned final"));
  assert.equal(m.isComplete(), true);
  assert.equal(m.state.resultType, "success");
});
group(
  "permission projections preserve authority-neutral identity and all duplicate targets",
  () => {
    const m = fresh();
    const a = { id: "same", name: "A", input: "old", status: "scheduled" },
      b = { id: "other", input: {}, status: "completed" };
    m.state.phase = Phase.SchedulingTools;
    m.state.toolCalls = [a, a, b];
    const req = { toolCallId: "same", toolName: "A", riskLevel: "high", requestedAt: {} };
    const pending = m.requestPermission(req);
    assert.equal(m.state.toolCalls[0], a);
    assert.equal(pending.toolCalls[2], b);
    assert.equal(pending.pendingPermissions[0], req);
    const n = new Machine(pending),
      before = clock.length;
    const running = new Machine({ ...pending, phase: Phase.SchedulingTools }).startToolExecution();
    assert.equal(running.phase, Phase.AwaitingPermission);
    assert.equal(clock.length, before + 1);
    assert.equal(running.toolCalls[0].startedAt, undefined);
    for (const decision of ["allow", "deny", "escalate", "modify"]) {
      const resolved = n.resolvePermission("same", decision, false);
      assert.equal(resolved.toolCalls[2], b);
      assert.equal(resolved.toolCalls[0].input, false);
      assert.equal(
        resolved.toolCalls[0].status,
        decision === "deny" ? "permission_denied" : "waiting_permission",
      );
      assert.equal(resolved.pendingPermissions.length, 0);
      assert.deepEqual(Object.keys(resolved.resolvedPermissions[0]), [
        "toolCallId",
        "decision",
        "modifiedInput",
        "resolvedAt",
      ]);
    }
    assert.equal(n.resolvePermission("same", "modify", null).toolCalls[0].input, "old");
    const failure = n.completeTool("same", {
      success: false,
      content: [{ type: "text", text: "Owned" }],
    });
    assert.equal(failure.toolCalls[2], b);
    assert.notEqual(failure.toolCalls[0], failure.toolCalls[1]);
    assert.deepEqual(plain(failure.toolResults[0].error), {
      type: "tool_error",
      message: "Owned failed content",
      recoverable: true,
    });
    assert.equal(
      new Machine({ ...failure, phase: Phase.AggregatingResults }).getNextPhase(),
      Phase.Completing,
    );
  },
);
group("queue reference ownership and admission or helper failure leaves state intact", () => {
  const m = fresh(),
    state = m.state,
    input = { inputId: "owned", input: "Owned pending" };
  const queued = m.queuePendingInput(input);
  assert.equal(queued.pendingInputs[0], input);
  assert.equal(state.pendingInputs.length, 0);
  const n = new Machine(queued),
    drained = n.drainPendingInputs();
  assert.equal(drained.inputs, queued.pendingInputs);
  assert.notEqual(drained.state.pendingInputs, queued.pendingInputs);
  const before = clock.length;
  assert.throws(
    () => m.complete("invalid"),
    (e) => {
      assert.deepEqual(plain(e), {
        type: "invalid_turn_phase",
        message: "Cannot transition from idle to completing",
        context: { current: "idle", target: "completing" },
        recoverable: true,
      });
      return true;
    },
  );
  assert.throws(
    () => m.startModelRequest("x", []),
    (e) => e.message === "Must be in ProcessingInput or AggregatingResults phase",
  );
  assert.throws(
    () => m.completeTool("missing", { success: false, content: textFailure }),
    (e) => e === textFailure,
  );
  assert.equal(clock.length, before);
  assert.equal(m.state, state);
  const failed = m.fail(textFailure);
  assert.equal(failed.error, textFailure);
  assert.equal(failed.phase, Phase.Error);
  assert.equal(new Machine(failed).isComplete(), true);
  const absent = m.completeTool("missing", { success: true, content: "Owned" });
  assert.equal(absent.toolResults.length, 1);
  assert.ok(Object.hasOwn(absent.toolResults[0], "error"));
});
console.log(
  JSON.stringify({ mode, groups: observations.length, realIO: 0, synchronousOnly: true }),
);

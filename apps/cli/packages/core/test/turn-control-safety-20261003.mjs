import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const mode = process.argv[2];
assert.ok(["baseline", "current"].includes(mode));
const bytes = await readFile(
  path.join(repo, "apps/cli/packages/core/test/turn-control-baseline-20261003.json"),
);
assert.equal(hash(bytes), "c9a7caf599ac40c22bc20e50f8b67fc6af97ae72ff9aae5e5485a3addd530bbd");
const baseline = JSON.parse(bytes),
  texts = new Map();
for (const row of Object.values(baseline.files)) {
  for (const k of ["source", "compiled", "declaration"])
    assert.equal(hash(row[k]), row[k + "Sha256"]);
  texts.set(row.logicalPath.replace(/\.ts$/u, ".js"), row.compiled);
  if (!row.logicalPath.endsWith("/turn-control.ts"))
    assert.equal(hash(await readFile(path.join(repo, row.logicalPath))), row.sourceSha256);
}
if (mode === "current") {
  const b = await readFile(
    path.join(repo, "docs/evidence/knorvia-turn-control-current-20261003.json"),
  );
  assert.equal(hash(b), "CURRENT_PIN");
  for (const [logical, row] of Object.entries(JSON.parse(b).files)) {
    for (const e of Object.values(row))
      assert.equal(hash(await readFile(path.join(repo, e.path))), e.sha256);
    texts.set(
      logical.replace(/\.ts$/u, ".js"),
      (await readFile(path.join(repo, row.compiled.path))).toString(),
    );
  }
}
const context = vm.createContext({}),
  limit = { owned: "retained-task limit" },
  predicateReads = [],
  hookCalls = [];
let returnedError;
const contracts = {
  CoreErrorType: { PermissionDenied: "PermissionDenied" },
  CREATE_WORKFLOW_TOOL_NAME: "CreateWorkflow",
  AMEND_WORKFLOW_TOOL_NAME: "AmendWorkflow",
  EXIT_PLAN_MODE_TOOL_NAME: "ExitPlanMode",
  isAutomationCreateLimitError: (error) => {
    predicateReads.push(error);
    return error === limit;
  },
  createCoreError: () => {
    throw Error("no new errors");
  },
};
const synthetic = (exports) =>
  new vm.SyntheticModule(
    Object.keys(exports),
    function () {
      for (const [k, v] of Object.entries(exports)) this.setExport(k, v);
    },
    { context },
  );
const fail = () => {
  throw Error("unused dependency must not execute");
};
const externals = new Map([
  ["@knorvia/contracts", synthetic(contracts)],
  [
    "@knorvia/cua/frame-contract",
    synthetic({
      OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION: "owned",
      attestOfficialCuaFrameContent: fail,
    }),
  ],
  [
    "apps/cli/packages/core/src/mcp/image-normalization.js",
    synthetic({ hasOfficialCuaFrameAuthority: fail }),
  ],
  [
    "apps/cli/packages/core/src/tool/input-normalization.js",
    synthetic({ normalizeToolExecutionInput: fail, prepareInitialToolExecutionInput: fail }),
  ],
  [
    "apps/cli/packages/core/src/tool/executor/errors.js",
    synthetic({
      createErrorResult: () => returnedError,
      createPermissionErrorResult: fail,
      createToolHandlerFailureError: fail,
      isToolHandlerFailure: fail,
      isToolHandlerFailureError: () => false,
    }),
  ],
  [
    "apps/cli/packages/core/src/tool/executor/validation.js",
    synthetic({ validateInitialModelToolInput: fail, validateInput: fail }),
  ],
  [
    "apps/cli/packages/core/src/tool/executor/hook-flow.js",
    synthetic({
      formatHookAdditionalContexts: (x) => {
        hookCalls.push(x);
        return x.join("|");
      },
    }),
  ],
]);
const modules = new Map(
  [...texts].map(([n, t]) => [n, new vm.SourceTextModule(t, { context, identifier: n })]),
);
for (const module of modules.values())
  if (module.status === "unlinked")
    await module.link((specifier, ref) => {
      const logical = path.posix.normalize(
        path.posix.join(path.posix.dirname(ref.identifier), specifier),
      );
      const target = externals.get(specifier) ?? modules.get(logical) ?? externals.get(logical);
      assert.ok(target, specifier);
      return target;
    });
for (const module of modules.values()) if (module.status === "linked") await module.evaluate();
const owner = modules.get("apps/cli/packages/core/src/tool/executor/turn-control.js").namespace;
const symbol = Symbol("owned retained identity"),
  output = { owned: "output" },
  serialization = { owned: "serialization" },
  existingControl = { owned: "previous control" },
  existingFollowUp = { owned: "previous followup" };
function result(error, success = false) {
  return {
    toolCallId: "owned-call",
    toolName: "owned-tool",
    success,
    output,
    modelContent: "Owned original content",
    turnControl: existingControl,
    followUpUserInput: existingFollowUp,
    serialization,
    error,
    durationMs: 1,
    startedAt: new Date(0),
    completedAt: new Date(1),
    [symbol]: output,
  };
}
function view(name, base, value) {
  assert.equal(value.output, base.output);
  assert.equal(value.error, base.error);
  assert.equal(value.serialization, base.serialization);
  assert.equal(value.startedAt, base.startedAt);
  assert.equal(value[symbol], base[symbol]);
  assert.equal(Object.getOwnPropertySymbols(value).length, 1);
  assert.equal(typeof value.then, "undefined");
  return {
    name,
    same: value === base,
    keys: Object.keys(value),
    modelContent: value.modelContent,
    turnControl: value.turnControl,
    followUpUserInput: value.followUpUserInput,
  };
}
const observations = [],
  ordinary = {
    type: "PermissionDenied",
    message: " Owned feedback ",
    reasonSource: "plan_approval_feedback",
  };
{
  const rows = [],
    base = result(ordinary);
  const successful = Object.freeze({ ...base, success: true });
  const skipContext = {
    get toolName() {
      throw Error("successful automation must short-circuit");
    },
    error: limit,
  };
  const skipped = owner.withAutomationCreateLimitTurnStop(successful, skipContext);
  assert.equal(skipped, successful);
  rows.push(view("automation success guard", successful, skipped));
  const n = predicateReads.length;
  assert.equal(
    owner.withAutomationCreateLimitTurnStop(base, { toolName: "Other", error: limit }),
    base,
  );
  assert.equal(predicateReads.length, n);
  const automation = owner.withAutomationCreateLimitTurnStop(base, {
    toolName: "CronCreate",
    error: limit,
  });
  assert.notEqual(automation, base);
  rows.push(view("automation raw context error and retained fields", base, automation));
  const disabled = {
    planEnabled: false,
    mode: "plan",
    get toolName() {
      throw Error("explicit false must short-circuit");
    },
  };
  assert.equal(owner.withPlanExitDeniedTurnStop(base, disabled), base);
  rows.push(
    view(
      "plan feedback retains previous turn control",
      base,
      owner.withPlanExitDeniedTurnStop(base, { mode: "plan", toolName: "ExitPlanMode" }),
    ),
  );
  const untrusted = result({
    type: "PermissionDenied",
    reasonSource: "project_rule",
    get message() {
      throw Error("untrusted feedback must not read message");
    },
  });
  rows.push(
    view(
      "plan refusal does not trust generic reason",
      untrusted,
      owner.withPlanExitDeniedTurnStop(untrusted, { mode: "plan", toolName: "ExitPlanMode" }),
    ),
  );
  const defaultText = result({ ...ordinary, message: " Permission denied for ExitPlanMode " });
  rows.push(
    view(
      "default refusal is not feedback",
      defaultText,
      owner.withPlanExitDeniedTurnStop(defaultText, {
        mode: "build",
        planEnabled: true,
        toolName: "ExitPlanMode",
      }),
    ),
  );
  const workflow = result({ ...ordinary, reasonSource: "workflow_refine_feedback" });
  for (const toolName of ["CreateWorkflow", "AmendWorkflow", "ResumeWorkflowRun"])
    rows.push(
      view(toolName, workflow, owner.withWorkflowRefineDeniedFollowUp(workflow, { toolName })),
    );
  const failed = result(ordinary);
  assert.equal(
    owner.withTerminalToolTurnStop(failed, {
      get entry() {
        throw Error("failed result must not read entry");
      },
    }),
    failed,
  );
  const success = result(ordinary, true);
  rows.push(
    view(
      "terminal strict true",
      success,
      owner.withTerminalToolTurnStop(success, { entry: { metadata: { stopTurnOnSuccess: true } } }),
    ),
  );
  assert.equal(
    owner.withTerminalToolTurnStop(success, { entry: { metadata: { stopTurnOnSuccess: 1 } } }),
    success,
  );
  assert.equal(base.modelContent, "Owned original content");
  assert.equal(base.turnControl, existingControl);
  assert.equal(base.followUpUserInput, existingFollowUp);
  observations.push({
    name: "public authority admission and identity",
    rows,
    predicateCalls: predicateReads.length,
  });
}
{
  const Admission = modules.get("apps/cli/packages/core/src/tool/executor/invocation/admission.js")
      .namespace.Admission,
    failedExecution = modules.get("apps/cli/packages/core/src/tool/executor/invocation/outcome.js")
      .namespace.failedExecution;
  const reads = [],
    deps = {
      sessionModePort: {
        isPlanEnabled() {
          assert.equal(this, deps.sessionModePort);
          reads.push("isPlanEnabled");
          return true;
        },
      },
    };
  const plan = result(ordinary),
    admission = new Admission({ deps, call: { name: "ExitPlanMode" } }, "build");
  const denied = admission.rejectPermission(plan);
  assert.equal(denied.result.error, plan.error);
  const wf = result({ ...ordinary, reasonSource: "workflow_refine_feedback" }),
    workflow = new Admission({ deps, call: { name: "AmendWorkflow" } }, "build");
  workflow.hooks.additionalContexts = ["Owned hook context"];
  const refined = workflow.rejectPermission(wf);
  const failure = result({ type: "ToolExecutionFailed", message: "Owned planner limit" });
  returnedError = failure;
  const outcome = failedExecution(
    { id: "owned-call", name: "CronCreate" },
    limit,
    1,
    { additionalContexts: [] },
    { additionalContexts: [] },
  );
  assert.equal(outcome.error, failure.error);
  assert.equal(predicateReads.at(-1), limit);
  observations.push({
    name: "actual Admission and failedExecution consumers with synthetic dependencies",
    denied: {
      kind: denied.kind,
      reason: denied.reason,
      result: view("plan consumer", plan, denied.result),
    },
    refined: {
      kind: refined.kind,
      reason: refined.reason,
      result: view("workflow consumer", wf, refined.result),
    },
    outcome: view("limit consumer", failure, outcome),
    reads,
    hookCalls,
  });
}
const plain = JSON.parse(JSON.stringify(observations)),
  golden = "apps/cli/packages/core/test/turn-control-observations-20261003.json";
if (mode === "baseline")
  await writeFile(path.join(repo, golden), JSON.stringify(plain, null, 2) + "\n");
else {
  const b = await readFile(path.join(repo, golden));
  assert.equal(hash(b), "573faae5e61e2aa4ed82127e3b8f8f6c678939da6073141261492ec77ac0f604");
  assert.deepEqual(plain, JSON.parse(b));
}
console.log(
  JSON.stringify({
    mode,
    groups: 2,
    actualConsumers: ["Admission.rejectPermission", "failedExecution"],
    currentComparedToImmutableObservations: mode === "current",
    liveToolsTasksProcessesPermissionsProvidersUserData: 0,
  }),
);

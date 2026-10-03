import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const mode = process.argv[2];
assert.ok(["baseline", "initial", "current"].includes(mode));
let compiled;
if (mode === "baseline") {
  const b = await readFile(
    path.join(repo, "apps/cli/packages/core/test/turn-control-baseline-20261003.json"),
  );
  assert.equal(sha(b), "c9a7caf599ac40c22bc20e50f8b67fc6af97ae72ff9aae5e5485a3addd530bbd");
  const row = JSON.parse(b).files["tool/executor/turn-control"];
  assert.equal(sha(row.compiled), row.compiledSha256);
  compiled = row.compiled;
} else if (mode === "initial") {
  compiled = await readFile(
    path.join(repo, "docs/evidence/turn-control-checks-20261003/initial-compile/compiled.txt"),
  );
  assert.equal(sha(compiled), "e9953af06b1522096184dcf4f4e1142b9838af8dcba968e9859f514cb9f578b3");
} else {
  const b = await readFile(
    path.join(repo, "docs/evidence/knorvia-turn-control-current-20261003.json"),
  );
  assert.equal(sha(b), "CURRENT_PIN");
  const row = Object.values(JSON.parse(b).files)[0];
  for (const e of Object.values(row))
    assert.equal(sha(await readFile(path.join(repo, e.path))), e.sha256);
  compiled = await readFile(path.join(repo, row.compiled.path));
}
const context = vm.createContext({}),
  limit = {};
const constants = {
  CoreErrorType: { PermissionDenied: "PermissionDenied" },
  CREATE_WORKFLOW_TOOL_NAME: "CreateWorkflow",
  AMEND_WORKFLOW_TOOL_NAME: "AmendWorkflow",
  EXIT_PLAN_MODE_TOOL_NAME: "ExitPlanMode",
  isAutomationCreateLimitError: (e) => e === limit,
};
const dep = new vm.SyntheticModule(
  Object.keys(constants),
  function () {
    for (const [k, v] of Object.entries(constants)) this.setExport(k, v);
  },
  { context },
);
const module = new vm.SourceTextModule(compiled.toString(), { context });
await module.link((s) => {
  assert.equal(s, "@knorvia/contracts");
  return dep;
});
await module.evaluate();
const api = module.namespace;
// This appended defensive JS-boundary observation exceeds the boolean type contract.
// It preserves existing truthiness without claiming a defect in ordinary typed callers.
const failed = { success: undefined },
  succeeded = { success: 1 };
const observations = [
  api.withAutomationCreateLimitTurnStop(failed, { error: limit, toolName: "CronCreate" })
    .turnControl?.reason,
  api.withPlanExitDeniedTurnStop(failed, { mode: "plan", toolName: "ExitPlanMode" }).turnControl
    ?.reason,
  api.withWorkflowRefineDeniedFollowUp(
    {
      ...failed,
      error: {
        type: "PermissionDenied",
        reasonSource: "workflow_refine_feedback",
        message: " Owned refinement ",
      },
    },
    { toolName: "CreateWorkflow" },
  ).followUpUserInput?.input,
  api.withTerminalToolTurnStop(succeeded, { entry: { metadata: { stopTurnOnSuccess: true } } })
    .turnControl?.reason,
];
console.log(JSON.stringify({ mode, observations, ordinaryTypedCallerDefectClaim: false }));
assert.deepEqual(observations, [
  "automation_create_limit",
  "plan_exit_denied",
  "Owned refinement",
  "subagent_terminal",
]);
console.log(JSON.stringify({ mode, groups: 1, comparisons: 4 }));

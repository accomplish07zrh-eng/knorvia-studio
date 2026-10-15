// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-workflow-01 contract tests: model-facing script notes/copy and the workflow-run
// introspection helpers. Copy is part of the contract: these strings are what the model reads to
// decide its next action (behavior.md B-nt-* / B-in-*).
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatWorkflowDiagnosticLines,
  workflowAmendedScriptSentence,
  workflowLaunchedScriptSentence,
  workflowSavedDraftNote,
  workflowScriptFileNote,
} from "../../../../apps/cli/packages/core/src/tool/handlers/workflow-script-notes.js";
import {
  WORKFLOW_RUN_INTROSPECTION_STEERING,
  escapeWorkflowRunText,
  formatRelativeAge,
  formatWorkflowRunCount,
  formatWorkflowRunDuration,
  formatWorkflowRunInstant,
  formatWorkflowRunTimestamp,
  workflowIntrospectionUnavailableFailure,
  workflowRunAttribute,
  workflowRunNotFoundFailure,
} from "../../../../apps/cli/packages/core/src/tool/handlers/workflow-run-introspection.js";

test("B-nt-1 诊断行：无文件给正文行号，有文件给文件行号（正文行 + 偏移）", () => {
  const diagnostics = [
    { code: 1, line: 2, column: 5, message: "first problem" },
    { code: 2, line: 3, column: 1, message: "second problem" },
  ];
  assert.deepEqual(formatWorkflowDiagnosticLines(diagnostics, undefined), [
    "L2:C5 first problem",
    "L3:C1 second problem",
  ]);
  assert.deepEqual(
    formatWorkflowDiagnosticLines(diagnostics, {
      kind: "draft",
      described: "drafts/a.dwf.ts",
      lineOffset: 9,
    }),
    ["drafts/a.dwf.ts:L11:C5 first problem", "drafts/a.dwf.ts:L12:C1 second problem"],
  );
  assert.deepEqual(
    formatWorkflowDiagnosticLines([], { kind: "path", described: "x", lineOffset: 0 }),
    [],
  );
});

test("B-nt-2 编不过的 NOTE 按来源分三句，动词各说各的事实", () => {
  assert.equal(
    workflowScriptFileNote({ kind: "draft", described: "d/a.dwf.ts", lineOffset: 0 }),
    'NOTE: The workflow was NOT executed. The script is saved at d/a.dwf.ts. Edit that file in place and resubmit with `path: "d/a.dwf.ts"` — do not paste the script inline again.',
  );
  assert.equal(
    workflowScriptFileNote({ kind: "path", described: "d/b.dwf.ts", lineOffset: 0 }),
    'NOTE: The workflow was NOT executed. The script file is d/b.dwf.ts. Edit that file in place and resubmit with `path: "d/b.dwf.ts"` — do not paste the script inline again.',
  );
  assert.equal(
    workflowSavedDraftNote({
      savedName: "pr-review",
      savedPath: "w/pr-review.dwf.ts",
      draft: "d/copy.dwf.ts",
    }),
    "NOTE: The workflow was NOT executed. A working copy of the saved workflow 'pr-review' (w/pr-review.dwf.ts) was written to d/copy.dwf.ts. Edit that copy in place and resubmit with `path: \"d/copy.dwf.ts\"` (pass its `args` again); to change the saved definition itself, use SaveWorkflow.",
  );
});

test("B-nt-3 启动句与修订句：草稿/文件两种身份，后续动作指向 AmendWorkflow", () => {
  assert.equal(
    workflowLaunchedScriptSentence({ kind: "draft", described: "d/a.dwf.ts", lineOffset: 0 }),
    " The script is saved at d/a.dwf.ts; to revise it later, edit that file and pass `path` to AmendWorkflow.",
  );
  assert.equal(
    workflowLaunchedScriptSentence({ kind: "path", described: "d/b.dwf.ts", lineOffset: 3 }),
    " The script file is d/b.dwf.ts; to revise it later, edit that file and pass `path` to AmendWorkflow.",
  );
  assert.equal(
    workflowAmendedScriptSentence({ kind: "draft", described: "d/c.dwf.ts", lineOffset: 0 }),
    " The revision's script is at d/c.dwf.ts; edit it there for a further revision.",
  );
});

test("B-in-1 两个结构化失败形状固定：能力缺口 errorCode 1，不存在 errorCode 2", () => {
  assert.deepEqual(workflowIntrospectionUnavailableFailure(), {
    result: false,
    errorCode: 1,
    message:
      "workflow_introspection_unavailable: this session cannot read workflow runs — workflow execution is not available here, so no run history is reachable. This is a capability gap, not an empty project.",
  });
  assert.deepEqual(workflowRunNotFoundFailure("run-9"), {
    result: false,
    errorCode: 2,
    message:
      "run_not_found: no workflow run with ID run-9 exists for this project. Use ListWorkflowRuns to see the runs that do.",
  });
});

test("B-in-2 内省引导文案劝阻轮询并给出三个正当用途", () => {
  const lines = WORKFLOW_RUN_INTROSPECTION_STEERING.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /Do NOT poll this tool while waiting/u);
  assert.match(lines[0]!, /settle on their own/u);
  assert.match(lines[1]!, /\(a\) the user asks how a workflow is going/u);
  assert.match(lines[1]!, /\(b\) you want to review this project's earlier runs/u);
  assert.match(lines[1]!, /\(c\) a completion notification was truncated/u);
});

test("B-in-3 时间戳：有限值给 ISO，非有限值原样字符串", () => {
  assert.equal(formatWorkflowRunTimestamp(0), "1970-01-01T00:00:00.000Z");
  assert.equal(formatWorkflowRunTimestamp(1_765_000_000_000), "2025-12-06T05:46:40.000Z");
  assert.equal(formatWorkflowRunTimestamp(Number.NaN), "NaN");
  assert.equal(formatWorkflowRunTimestamp(Number.POSITIVE_INFINITY), "Infinity");
  // 超出 Date 范围的有限值：toISOString 抛错时退回字符串。
  assert.equal(formatWorkflowRunTimestamp(8.64e15 + 1), String(8.64e15 + 1));
});

test("B-in-4 时长分四档进位，相对年龄与瞬时是它的组合", () => {
  assert.equal(formatWorkflowRunDuration(-5), "0s");
  assert.equal(formatWorkflowRunDuration(500), "0s");
  assert.equal(formatWorkflowRunDuration(59_000), "59s");
  assert.equal(formatWorkflowRunDuration(65_000), "1m 05s");
  assert.equal(formatWorkflowRunDuration(3_599_000), "59m 59s");
  assert.equal(formatWorkflowRunDuration(3_600_000), "1h 00m");
  assert.equal(formatWorkflowRunDuration(5_400_000), "1h 30m");
  assert.equal(formatWorkflowRunDuration(86_400_000), "1d 0h");
  assert.equal(formatWorkflowRunDuration(90_000_000), "1d 1h");

  assert.equal(formatRelativeAge(10_000, 7_000), "3s ago");
  assert.equal(formatRelativeAge(10_000, undefined), undefined);
  assert.equal(formatRelativeAge(Number.NaN, 5), undefined);
  assert.equal(formatWorkflowRunInstant(10_000, 7_000), "1970-01-01T00:00:07.000Z (3s ago)");
  assert.equal(formatWorkflowRunInstant(10_000, Number.NaN), "NaN");
});

test("B-in-5 计数千分位、属性行空白折叠加 XML 转义", () => {
  assert.equal(formatWorkflowRunCount(1_234_567), "1,234,567");
  assert.equal(formatWorkflowRunCount(0), "0");
  assert.equal(formatWorkflowRunCount(-5), "-5");
  assert.equal(formatWorkflowRunCount(1234.56), "1,234");
  assert.equal(formatWorkflowRunCount(Number.NaN), "NaN");

  assert.equal(workflowRunAttribute("status", "a  b \n c"), 'status="a b c"');
  assert.equal(workflowRunAttribute("count", 42), 'count="42"');
  assert.equal(workflowRunAttribute("flag", true), 'flag="true"');
  assert.equal(
    workflowRunAttribute("name", `<a & 'b' "c">`),
    'name="&lt;a &amp; &apos;b&apos; &quot;c&quot;&gt;"',
  );
  assert.equal(escapeWorkflowRunText("<&>"), "&lt;&amp;&gt;");
});

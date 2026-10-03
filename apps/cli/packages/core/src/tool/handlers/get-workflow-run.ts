// ============================================================
// GetWorkflowRun Tool Handler
// ============================================================
// 单 workflow run 的自适应详情：running → 进度摘要 + log 尾巴；终态 → 产物 / 失败。
//
// handler 只做四件端口做不了的事：
//   1. **产物序列化**。端口交出的是脚本返回值的**原值**；面向模型的文本投影在 core 有唯一
//      实现（`serializeWorkflowArtifact`，完成通知与 TaskOutput 共用它）。在端口侧再做一次
//      就会出现「同一个 run 的产物在通知里和在本工具里长得不一样」。
//   2. **未知 runId 的归一**。端口回 `undefined`，模型要的是一个结构化失败。
//   3. **读一次时钟**。`generatedAt` 在这里取一次，模型面所有「多久以前」都对它算——
//      格式器因此是纯函数，一次输出里的两个年龄也永远可比。
//   4. **拼摘要**。`summary` 由结构化字段确定性拼出（get-workflow-run-summary.ts），
//      没有模型参与。
//
// 刻意**不做** wait/block 语义：等待是 TaskOutput 的活，这里是即时快照。

import {
  GET_WORKFLOW_RUN_TOOL_NAME,
  GetWorkflowRunInputJsonSchema,
  GetWorkflowRunInputSchema,
  GetWorkflowRunOutputJsonSchema,
  GetWorkflowRunOutputSchema,
  type GetWorkflowRunInput,
  type GetWorkflowRunOutput,
} from "@knorvia/contracts";
import { serializeWorkflowArtifact } from "../executor/workflow-artifact.js";
// ⚠ 两个 artifact：上面那个序列化的是脚本的**顶层返回值**（进 `<result>`），下面这个描述的是
// 脚本经 `artifact.*` **发布给用户看的产出**（进 `<artifacts>`）。同一个词两个义，本文件两者都出现。
import { WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES } from "../executor/workflow-published-artifacts.js";
import type { ToolEntry, ToolHandler } from "../types.js";
import { formatGetWorkflowRunModelContent } from "./get-workflow-run-format.js";
import {
  toGetWorkflowRunHealth,
  toGetWorkflowRunPhases,
  toGetWorkflowRunSubagents,
} from "./get-workflow-run-roster-output.js";
import { buildWorkflowRunSummary } from "./get-workflow-run-summary.js";
import { projectGetWorkflowRunSnapshotFields } from "./get-workflow-run-snapshot-fields.js";
import {
  applyWorkflowRunOutputFields,
  projectWorkflowRunArtifact,
  projectWorkflowRunError,
  projectWorkflowRunQuestion,
} from "./get-workflow-run-output-fields.js";
import {
  WORKFLOW_RUN_INTROSPECTION_STEERING,
  workflowIntrospectionUnavailableFailure,
  workflowRunNotFoundFailure,
} from "./workflow-run-introspection.js";

const GET_WORKFLOW_RUN_TIMEOUT_MS = 10_000;
/** 照 TaskOutput：产物就是可能大到需要 artifact 的那类载荷。 */
const GET_WORKFLOW_RUN_RESULT_BUDGET_BYTES = 400_000;
const GET_WORKFLOW_RUN_PERSIST_THRESHOLD_CHARS = 100_000;

const GET_WORKFLOW_RUN_DESCRIPTION = [
  "Returns the current state of one dynamic-workflow run: progress, token usage and the tail of its log() narration while it runs; the final result once it completed; the structured failure if it errored or was stopped.",
  "",
  WORKFLOW_RUN_INTROSPECTION_STEERING,
  "",
  "- Takes run_id — from CreateWorkflow's or AmendWorkflow's result, from a completion notification, or from ListWorkflowRuns.",
  "- This is an instant snapshot and never waits. To block until a run THIS session started finishes, use TaskOutput instead: that is the waiting tool. GetWorkflowRun is the right tool when you must not wait, or when the run belongs to another session (TaskOutput cannot see those).",
  "- The `artifacts` section lists what the run published for the user — files, documents and live dashboards that are ALREADY shown to them as cards. Refer to one by its title; do not paste its contents back. The one marked `primary` is the deliverable: point the user to it first.",
  "- Three terminal states: `completed`; `errored` (the script itself failed — not resumable, amend it); `stopped` with a stop reason — `user` (cancelled on purpose: resume only when the user asks), `model` (your own TaskStop), `provider` (a provider-side error such as an expired sign-in, a model missing from the plan or a quota cap — the `<error>` block names the cause and the fix; resolve it with the user, then resume), `interrupted` (the process that owned the run exited — continuing it is usually what the user wants), `superseded` (an AmendWorkflow replaced it; `<superseded_by>` names the successor — read that run instead, never resume this one).",
  "- A stopped run (other than a superseded one) can be continued with ResumeWorkflowRun — no rebuild needed, same run ID, same script.",
  "- ANY run — completed, stopped, errored, or still running — can instead be revised with AmendWorkflow: pass its run ID and the corrected script, and the finished work is imported as cache. When the script itself errored, that is the move — fix the script and keep the work that already succeeded, rather than rewriting from scratch.",
].join("\n");

const getWorkflowRunHandler: ToolHandler = async (input, context) => {
  const parsed = GetWorkflowRunInputSchema.parse(input) as GetWorkflowRunInput;

  const port = context.dynamicWorkflowRunPort;
  if (port === undefined || typeof port.getRunDetail !== "function") {
    return workflowIntrospectionUnavailableFailure();
  }

  const detail = await port.getRunDetail(parsed.run_id);
  // 空对象会让模型以为这个 run 存在但没内容；未知 runId 是一等失败。
  if (detail === undefined) return workflowRunNotFoundFailure(parsed.run_id);

  // `undefined` 产物 → 整字段缺席（与完成通知同规）。`null` 是合法产物，序列化成 "null"。
  const result = serializeWorkflowArtifact(detail.result);
  // 一次调用一把尺：所有「多久以前」都对这一个读数算，两个年龄因此永远可比。
  const generatedAt = Date.now();
  const roster = toGetWorkflowRunSubagents(detail.subagents);
  const phases = toGetWorkflowRunPhases(detail.phases);

  const snapshot = projectGetWorkflowRunSnapshotFields(
    detail,
    generatedAt,
    () => context.workingDirectory,
  );
  const base = applyWorkflowRunOutputFields<Omit<GetWorkflowRunOutput, "summary">>(snapshot, [
    // 情势截面（阶段 / 花名册 / 健康）：把上面那些计数变成一份「这个 run 在哪、谁在干什么、
    // 它还在动吗」的报告。逐字段搬见 get-workflow-run-roster-output.ts。
    ["phases", () => phases, "defined"],
    ["subagents", () => roster.subagents],
    ["subagentsTruncated", () => roster.truncated, "truthy", () => true],
    ["health", () => toGetWorkflowRunHealth(detail.health)],
    ["result", () => result, "defined"],
    ["error", () => detail.error, "defined", () => projectWorkflowRunError(detail)],
    // 零条时整字段缺席（端口本身就不发空数组，这里再确认一次而不是 `?? []`）：一个空的
    // pending 区读起来像「问过、已答完」，而缺席读起来才是「没人在等」。
    [
      "pendingQuestions",
      () => detail.pendingQuestions,
      "nonempty",
      () => detail.pendingQuestions!.map((pending) => projectWorkflowRunQuestion(pending)),
    ],
    // 用户面产物。零件时整字段缺席；上界 32 与
    // `ARTIFACT_CAPS.maxArtifactsPerRun` 同值——端口本身也不会给出更多，这里只是把界写死在
    // 模型面上。`bytes` 在端口上只挂在版本项里，取最新版那一条（清单描述的就是最新版）。
    [
      "artifacts",
      () => detail.artifacts,
      "nonempty",
      () =>
        detail
          .artifacts!.slice(0, WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES)
          .map((artifact) => projectWorkflowRunArtifact(artifact)),
    ],
  ]);

  // 摘要最后拼：它读的就是上面这些字段，所以先有事实，再有那一句话。
  return { ...base, summary: buildWorkflowRunSummary(base) } satisfies GetWorkflowRunOutput;
};

export const getWorkflowRunToolEntry: ToolEntry = {
  capability: "Read one dynamic-workflow run's progress, final result, or failure",
  maxModelChars: GET_WORKFLOW_RUN_PERSIST_THRESHOLD_CHARS,
  metadata: {
    name: GET_WORKFLOW_RUN_TOOL_NAME,
    description: GET_WORKFLOW_RUN_DESCRIPTION,
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: GET_WORKFLOW_RUN_TIMEOUT_MS,
    maxOutputBytes: GET_WORKFLOW_RUN_RESULT_BUDGET_BYTES,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: getWorkflowRunHandler,
  inputSchema: GetWorkflowRunInputJsonSchema,
  outputSchema: GetWorkflowRunOutputJsonSchema,
  runtimeInputSchema: GetWorkflowRunInputSchema,
  runtimeOutputSchema: GetWorkflowRunOutputSchema,
  formatModelContent: formatGetWorkflowRunModelContent,
  permission: {
    permission: "getWorkflowRun",
    reason: "GetWorkflowRun reads one run's record from the project's run journal",
    riskLevel: "low",
    sideEffectScope: "none",
    needsApproval: false,
    // run_id 进入模式匹配面（照 TaskOutput 的 task_id），好让项目规则能约束到具体 run。
    patternSources: ["toolName", "input"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: GET_WORKFLOW_RUN_RESULT_BUDGET_BYTES,
    maxModelBytes: GET_WORKFLOW_RUN_RESULT_BUDGET_BYTES,
    strategy: "artifact",
    preview: {
      maxBytes: GET_WORKFLOW_RUN_RESULT_BUDGET_BYTES,
      direction: "head",
    },
    artifact: {
      enabled: true,
      retention: "session",
    },
  },
  resultArtifactContentType: "text/plain",
  timeout: {
    kind: "timed",
    defaultMs: GET_WORKFLOW_RUN_TIMEOUT_MS,
    maxMs: GET_WORKFLOW_RUN_TIMEOUT_MS,
    allowCallOverride: false,
  },
  cancellation: {
    supported: false,
    cleanup: "none",
    userVisibleMessage:
      "GetWorkflowRun reads the run journal synchronously and cannot be cancelled",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};

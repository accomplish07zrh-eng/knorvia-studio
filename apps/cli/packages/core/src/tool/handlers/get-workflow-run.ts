// SPDX-License-Identifier: Apache-2.0
// 单 run 即时快照入口：不等待、不阻塞——running 给进度与日志尾，终态给产物或失败。四件只有
// 门面能做的事：产物序列化归一、未知 runId 结构化失败、一次读数（全部年龄同源）、摘要最后拼。
// 等待语义属于 TaskOutput；这里刻意不碰（B-gw）。

import {
  GET_WORKFLOW_RUN_TOOL_NAME,
  GetWorkflowRunInputJsonSchema,
  GetWorkflowRunInputSchema,
  GetWorkflowRunOutputJsonSchema,
  GetWorkflowRunOutputSchema,
  type DynamicWorkflowRunDetail,
  type GetWorkflowRunInput,
  type GetWorkflowRunOutput,
} from "@knorvia/contracts";
import { serializeWorkflowArtifact } from "../executor/workflow-artifact.js";
// ⚠ artifact 一词两义：上面序列化脚本顶层返回值（`<result>`）；下面常量数的是脚本发布给用户看的
// 产出清单（`<artifacts>`），两者都出现在本工具输出里。
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

const GET_WORKFLOW_RUN_TIMEOUT_MS = 10_000; // 同步读，10 秒封顶
// 结果体积大到必须走 artifact 通道——上限照 TaskOutput 的产物档。
const GET_WORKFLOW_RUN_RESULT_BUDGET_BYTES = 400_000; // 结果预算（内联/模型/预览同值）
const GET_WORKFLOW_RUN_PERSIST_THRESHOLD_CHARS = 100_000; // 超此长度走持久化

const DESCRIPTION_INTRO =
  "Returns the current state of one dynamic-workflow run: progress, token usage and the tail of its log() narration while it runs; the final result once it completed; the structured failure if it errored or was stopped.";

const DESCRIPTION_BULLETS = [
  "- Takes run_id — from CreateWorkflow's or AmendWorkflow's result, from a completion notification, or from ListWorkflowRuns.", // 入参来源
  "- This is an instant snapshot and never waits. To block until a run THIS session started finishes, use TaskOutput instead: that is the waiting tool. GetWorkflowRun is the right tool when you must not wait, or when the run belongs to another session (TaskOutput cannot see those).", // 与 TaskOutput 的分工
  "- The `artifacts` section lists what the run published for the user — files, documents and live dashboards that are ALREADY shown to them as cards. Refer to one by its title; do not paste its contents back. The one marked `primary` is the deliverable: point the user to it first.", // 产物区使用法
  "- Three terminal states: `completed`; `errored` (the script itself failed — not resumable, amend it); `stopped` with a stop reason — `user` (cancelled on purpose: resume only when the user asks), `model` (your own TaskStop), `provider` (a provider-side error such as an expired sign-in, a model missing from the plan or a quota cap — the `<error>` block names the cause and the fix; resolve it with the user, then resume), `interrupted` (the process that owned the run exited — continuing it is usually what the user wants), `superseded` (an AmendWorkflow replaced it; `<superseded_by>` names the successor — read that run instead, never resume this one).", // 终态与停因
  "- A stopped run (other than a superseded one) can be continued with ResumeWorkflowRun — no rebuild needed, same run ID, same script.", // 可恢复集
  "- ANY run — completed, stopped, errored, or still running — can instead be revised with AmendWorkflow: pass its run ID and the corrected script, and the finished work is imported as cache. When the script itself errored, that is the move — fix the script and keep the work that already succeeded, rather than rewriting from scratch.", // 修订通道
];

function composeDescription(): string {
  return [DESCRIPTION_INTRO, "", WORKFLOW_RUN_INTROSPECTION_STEERING, "", ...DESCRIPTION_BULLETS].join(
    "\n",
  );
}

const GET_WORKFLOW_RUN_DESCRIPTION = composeDescription();

type SnapshotFields = Omit<GetWorkflowRunOutput, "summary">;

/** 情势截面字段表：缺席语义（defined/truthy/nonempty）由各表项第三元声明。 */
function projectBase(
  detail: DynamicWorkflowRunDetail,
  generatedAt: number,
  workingDirectory: () => string | undefined,
): SnapshotFields {
  const roster = toGetWorkflowRunSubagents(detail.subagents); // 花名册投影
  const phases = toGetWorkflowRunPhases(detail.phases); // 阶段投影
  const snapshot = projectGetWorkflowRunSnapshotFields(detail, generatedAt, workingDirectory);
  const pending = detail.pendingQuestions ?? [];
  const artifacts = detail.artifacts ?? [];
  return applyWorkflowRunOutputFields<SnapshotFields>(snapshot, [
    ["phases", () => phases, "defined"], // 无阶段不造字段
    ["subagents", () => roster.subagents], // 花名册恒在（可空数组）
    ["subagentsTruncated", () => roster.truncated, "truthy", () => true], // 截断才写 true
    ["health", () => toGetWorkflowRunHealth(detail.health)], // 健康投影
    ["result", () => serializeWorkflowArtifact(detail.result), "defined"], // 三态产物
    ["error", () => detail.error, "defined", () => projectWorkflowRunError(detail)], // 失败投影
    [
      "pendingQuestions", // 零条时整字段缺席
      () => pending,
      "nonempty", // 非空才出
      () => pending.map((question) => projectWorkflowRunQuestion(question)),
    ],
    [
      "artifacts", // 零件时缺席；上界 32 = ARTIFACT_CAPS.maxArtifactsPerRun
      () => artifacts,
      "nonempty", // 非空才出
      () =>
        artifacts
          .slice(0, WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES)
          .map((artifact) => projectWorkflowRunArtifact(artifact)),
    ],
  ]);
}

const getWorkflowRunHandler: ToolHandler = async (call, scope) => {
  const parsed = GetWorkflowRunInputSchema.parse(call) as GetWorkflowRunInput;

  const port = scope.dynamicWorkflowRunPort;
  if (port === undefined || typeof port.getRunDetail !== "function") {
    return workflowIntrospectionUnavailableFailure(); // 能力缺口
  }

  const detail = await port.getRunDetail(parsed.run_id);
  // 空对象会让模型以为 run 存在但没内容；未知 runId 是一等失败。
  if (detail === undefined) return workflowRunNotFoundFailure(parsed.run_id);

  const generatedAt = Date.now(); // 一次读数：所有年龄同源可比
  const base = projectBase(detail, generatedAt, () => scope.workingDirectory);
  return { ...base, summary: buildWorkflowRunSummary(base) } satisfies GetWorkflowRunOutput; // 摘要最后拼
};

function toolMetadata() {
  return {
    name: GET_WORKFLOW_RUN_TOOL_NAME, // 工具名（契约面）
    description: GET_WORKFLOW_RUN_DESCRIPTION, // 引导文案（协议面）
    readOnly: true, // 只读
    destructive: false, // 无破坏
    concurrentSafe: true, // 并发安全
    timeoutMs: GET_WORKFLOW_RUN_TIMEOUT_MS, // 10s
    maxOutputBytes: GET_WORKFLOW_RUN_RESULT_BUDGET_BYTES, // 400k
    sideEffectScope: "none" as const,
    riskLevel: "low" as const,
    needsApproval: false, // 免确认
  };
}

function toolPermission(): ToolEntry["permission"] {
  return {
    permission: "getWorkflowRun" as const,
    reason: "GetWorkflowRun reads one run's record from the project's run journal", // 理由（协议面）
    riskLevel: "low" as const,
    sideEffectScope: "none" as const,
    needsApproval: false, // 免确认
    // run_id 进模式匹配面（照 TaskOutput 的 task_id），项目规则可约束到具体 run。
    patternSources: ["toolName", "input"] as ToolEntry["permission"]["patternSources"],
    alwaysAllowPatternSources: ["toolName"] as ToolEntry["permission"]["alwaysAllowPatternSources"],
    denyPriority: "beforeAsk" as const,
  };
}

function toolBudget() {
  return {
    maxInlineBytes: GET_WORKFLOW_RUN_RESULT_BUDGET_BYTES, // 400k 内联上限
    maxModelBytes: GET_WORKFLOW_RUN_RESULT_BUDGET_BYTES, // 400k 模型面上限
    strategy: "artifact" as const, // 超限转 artifact
    preview: {
      maxBytes: GET_WORKFLOW_RUN_RESULT_BUDGET_BYTES, // 预览同预算
      direction: "head" as const, // 预览取头
    },
    artifact: {
      enabled: true, // 超限落 artifact
      retention: "session" as const, // 会话期保留
    },
  };
}

export const getWorkflowRunToolEntry: ToolEntry = {
  capability: "Read one dynamic-workflow run's progress, final result, or failure", // 能力一句话
  maxModelChars: GET_WORKFLOW_RUN_PERSIST_THRESHOLD_CHARS, // 100k 持久化阈值
  metadata: toolMetadata(),
  handler: getWorkflowRunHandler,
  inputSchema: GetWorkflowRunInputJsonSchema, // 契约 schema 四件
  outputSchema: GetWorkflowRunOutputJsonSchema,
  runtimeInputSchema: GetWorkflowRunInputSchema,
  runtimeOutputSchema: GetWorkflowRunOutputSchema,
  formatModelContent: formatGetWorkflowRunModelContent,
  permission: toolPermission(),
  resultBudget: toolBudget(),
  resultArtifactContentType: "text/plain",
  timeout: {
    kind: "timed" as const,
    defaultMs: GET_WORKFLOW_RUN_TIMEOUT_MS,
    maxMs: GET_WORKFLOW_RUN_TIMEOUT_MS,
    allowCallOverride: false, // 调用方不得放宽
  },
  cancellation: {
    supported: false,
    cleanup: "none" as const,
    userVisibleMessage:
      "GetWorkflowRun reads the run journal synchronously and cannot be cancelled",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary" as const,
    recordOutput: "summary" as const,
  },
};

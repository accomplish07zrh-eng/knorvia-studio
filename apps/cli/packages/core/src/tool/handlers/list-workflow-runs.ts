// SPDX-License-Identifier: Apache-2.0
// ListWorkflowRuns：按项目（= 会话工作目录）枚举 run 历史（含跨会话）。门面只三件事——
// 取端口操作、钉 cwd、投影契约形状；模型面走单行属性式（高基数实体，50 行还是 50 行）。
// 空列表必须说成一句话：空容器会被读成「工具没答上来」。

import {
  LIST_WORKFLOW_RUNS_TOOL_NAME,
  ListWorkflowRunsInputJsonSchema,
  ListWorkflowRunsInputSchema,
  ListWorkflowRunsOutputJsonSchema,
  ListWorkflowRunsOutputSchema,
  type ModelMessageContent,
} from "@knorvia/contracts";
import type { ToolEntry } from "../types.js";
import {
  WORKFLOW_RUN_INTROSPECTION_STEERING,
  formatWorkflowRunTimestamp,
  workflowIntrospectionUnavailableFailure,
  workflowRunAttribute,
} from "./workflow-run-introspection.js";

import { createListWorkflowRunsOperation } from "./list-workflow-runs-operation.js";

const LIST_WORKFLOW_RUNS_TIMEOUT_MS = 10_000; // 同步读账本，10 秒封顶
/** 列表刻意轻（单行查询可答）：24k 足够 50 行还留余量。 */
const LIST_WORKFLOW_RUNS_MODEL_BYTES = 24_000; // 24k 模型面预算

const DESCRIPTION_INTRO =
  "Lists this project's dynamic-workflow runs (the session's working directory is the project key), most recently updated first. Includes runs started by other sessions — the run journal is per-project, not per-session.";

const DESCRIPTION_BULLETS = [
  "- Each row gives the run ID, its label, lifecycle status, whether this session started it, tokens spent, and timestamps.", // 行字段
  '- `possibly_interrupted="true"` means this session cannot confirm the run is still alive: it may be a leftover from a process that exited, or a sibling session\'s run still in flight. It is an annotation, not a verdict — do not report it as a failure.', // 不可知标注
  "- Pass a run ID to GetWorkflowRun for progress detail, the log tail, the final result, or the failure.", // 转详情
  "- Three terminal states: `completed`; `errored` (the script itself failed); `stopped` with `stop_reason` — `user` (cancelled on purpose: resume only when the user asks), `model` (your own TaskStop), `provider` (a provider-side error stopped it: read GetWorkflowRun for the cause, resolve it with the user, then resume), `interrupted` (the owning process exited: continuing it is usually what the user wants), `superseded` (an AmendWorkflow replaced it; `superseded_by` names the live successor — never resume a superseded run).", // 终态与停因
  "- Any stopped run other than a superseded one can be continued with ResumeWorkflowRun — no rebuild needed, same run ID, same script. An errored run cannot.", // 可恢复集
  "- ANY run here — completed, stopped, errored, or still running — can instead be revised with AmendWorkflow: pass its run ID and the corrected script; the new run imports the old one's finished work as a warm cache (and stops it first if it is still running). A run whose script errored is the case to reach for it — fix the script instead of rewriting the workflow from scratch. `resumed_from` on a row names the run it was amended from.", // 修订通道
];

function composeDescription(): string {
  return [
    DESCRIPTION_INTRO,
    "",
    WORKFLOW_RUN_INTROSPECTION_STEERING,
    "",
    ...DESCRIPTION_BULLETS,
  ].join("\n");
}

const LIST_WORKFLOW_RUNS_DESCRIPTION = composeDescription();

const listWorkflowRunsHandler = createListWorkflowRunsOperation(
  // 端口缺席时的定型失败（能力缺口）
  workflowIntrospectionUnavailableFailure,
);

/** 容器头属性：count 恒在，截断才带 truncated。 */
function containerHeader(runs: unknown[], truncated: boolean | undefined): string {
  return [
    workflowRunAttribute("count", runs.length), // 条数
    ...(truncated ? [workflowRunAttribute("truncated", true)] : []), // 截断才写
  ].join(" ");
}

/**
 * 模型面：一个 XML-ish 容器 + 一 run 一行。不照 TaskOutput 拆独立元素——那是单对象详情的形状，
 * 50 行 × 8 元素会把一次列表读成几百行；属性式单行保留标签惯例且信息密度不变。
 */
function formatListWorkflowRunsModelContent(output: unknown): ModelMessageContent {
  const parsed = ListWorkflowRunsOutputSchema.safeParse(output); // 契约形状校验
  if (!parsed.success) return "ListWorkflowRuns returned an invalid result."; // 定型兜底

  const { runs, truncated } = parsed.data;
  const header = containerHeader(runs, truncated);

  if (runs.length === 0) {
    // 「这个项目没跑过 workflow」必须说成一句话。
    return `<workflow_runs ${header}>\nNo workflow runs recorded for this project.\n</workflow_runs>`; // 空清单句
  }

  const rows = runs.map((run) => rowAttributes(run).join(" ")); // 一 run 一行
  return [`<workflow_runs ${header}>`, ...rows, "</workflow_runs>"].join("\n"); // 容器 + 行
}

type RowShape = {
  runId: string;
  status: string;
  stopReason?: string;
  resumedFrom?: string;
  supersededBy?: string;
  label: string;
  labelSource: string;
  ownedByThisSession: boolean;
  possiblyInterrupted?: boolean;
  spentTokens: number;
  createdAt: number;
  updatedAt: number;
};

/** 一行 run：属性序固定；缺席的可选属性不发明。 */
function rowAttributes(run: RowShape): string[] {
  return [
    "<run", // 行起始
    workflowRunAttribute("id", run.runId), // run 身份
    workflowRunAttribute("status", run.status), // 生命周期
    ...(run.stopReason === undefined ? [] : [workflowRunAttribute("stop_reason", run.stopReason)]), // 停因
    ...(run.resumedFrom === undefined
      ? []
      : [workflowRunAttribute("resumed_from", run.resumedFrom)]), // 续自
    ...(run.supersededBy === undefined
      ? []
      : [workflowRunAttribute("superseded_by", run.supersededBy)]), // 继任者
    workflowRunAttribute("label", run.label), // 展示名
    workflowRunAttribute("label_source", run.labelSource), // 名字来源
    workflowRunAttribute("owned_by_this_session", run.ownedByThisSession), // 归属
    ...(run.possiblyInterrupted ? [workflowRunAttribute("possibly_interrupted", true)] : []), // 不可知标注
    workflowRunAttribute("spent_tokens", run.spentTokens), // 已耗 token
    workflowRunAttribute("created_at", formatWorkflowRunTimestamp(run.createdAt)), // 起始
    workflowRunAttribute("updated_at", formatWorkflowRunTimestamp(run.updatedAt)), // 更新
    "/>", // 行闭合
  ];
}

function toolMetadata() {
  return {
    name: LIST_WORKFLOW_RUNS_TOOL_NAME, // 工具名（契约面）
    description: LIST_WORKFLOW_RUNS_DESCRIPTION, // 引导文案（协议面）
    readOnly: true, // 只读
    destructive: false, // 无破坏
    concurrentSafe: true, // 并发安全
    timeoutMs: LIST_WORKFLOW_RUNS_TIMEOUT_MS, // 10s
    maxOutputBytes: LIST_WORKFLOW_RUNS_MODEL_BYTES, // 24k
    sideEffectScope: "none" as const,
    riskLevel: "low" as const,
    needsApproval: false, // 免确认
  };
}

function toolPermission(): ToolEntry["permission"] {
  return {
    permission: "listWorkflowRuns" as const,
    reason: "ListWorkflowRuns reads the run journal for the current project", // 理由（协议面）
    riskLevel: "low" as const,
    sideEffectScope: "none" as const,
    needsApproval: false,
    // 输入无路径主体（cwd 来自会话上下文）：模式只按工具名匹配。
    patternSources: ["toolName"] as ToolEntry["permission"]["patternSources"],
    alwaysAllowPatternSources: ["toolName"] as ToolEntry["permission"]["alwaysAllowPatternSources"],
    denyPriority: "beforeAsk" as const,
    // 刻意不继承 CreateWorkflow 的 alwaysAsk——那道门的理由是「执行整块代码」。
  };
}

function toolBudget() {
  return {
    maxInlineBytes: LIST_WORKFLOW_RUNS_MODEL_BYTES, // 24k 内联上限
    maxModelBytes: LIST_WORKFLOW_RUNS_MODEL_BYTES, // 24k 模型面上限
    strategy: "truncate" as const, // 超限截断
    preview: {
      maxBytes: LIST_WORKFLOW_RUNS_MODEL_BYTES, // 预览同预算
      direction: "head" as const, // 最近更新在前，截尾丢最旧
    },
  };
}

export const listWorkflowRunsToolEntry: ToolEntry = {
  capability: "List this project's dynamic-workflow runs, including runs from other sessions",
  metadata: toolMetadata(),
  handler: listWorkflowRunsHandler,
  inputSchema: ListWorkflowRunsInputJsonSchema,
  outputSchema: ListWorkflowRunsOutputJsonSchema,
  runtimeInputSchema: ListWorkflowRunsInputSchema,
  runtimeOutputSchema: ListWorkflowRunsOutputSchema,
  formatModelContent: formatListWorkflowRunsModelContent,
  permission: toolPermission(),
  resultBudget: toolBudget(),
  timeout: {
    kind: "timed" as const,
    defaultMs: LIST_WORKFLOW_RUNS_TIMEOUT_MS, // 10s
    maxMs: LIST_WORKFLOW_RUNS_TIMEOUT_MS, // 10s 封顶
    allowCallOverride: false, // 调用方不得放宽
  },
  cancellation: {
    supported: false, // 不可取消
    cleanup: "none" as const,
    userVisibleMessage:
      "ListWorkflowRuns reads the run journal synchronously and cannot be cancelled", // 取消语义文案
  },
  trace: {
    required: true, // 必带 trace
    propagateToAdapters: false,
    recordInput: "summary" as const, // 输入只留摘要
    recordOutput: "summary" as const, // 输出只留摘要
  },
};

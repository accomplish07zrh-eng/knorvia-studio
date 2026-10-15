// SPDX-License-Identifier: Apache-2.0
// ResumeWorkflowRun：恢复一个 stopped 的 run（可恢复集 = stopped 除 superseded）。门（可恢复集判定）、
// 注册表替换、scriptHash 重验全在端口服务端；门面只取端口、透传 run_id、投影契约形状。
// 恢复输出 backgrounded 形状与 CreateWorkflow 同一条自动追踪（backgroundTaskId ≡ runId）。

import {
  RESUME_WORKFLOW_RUN_TOOL_NAME,
  ResumeWorkflowRunInputJsonSchema,
  ResumeWorkflowRunInputSchema,
  ResumeWorkflowRunOutputJsonSchema,
  ResumeWorkflowRunOutputSchema,
  type ModelMessageContent,
  type ResumeWorkflowRunInput,
  type ResumeWorkflowRunOutput,
} from "@knorvia/contracts";
import type { ToolEntry, ToolExecutionContext, ToolHandler, ToolHandlerFailure } from "../types.js";
import { workflowRunNotFoundFailure } from "./workflow-run-introspection.js";

const RESUME_WORKFLOW_RUN_TIMEOUT_MS = 15_000; // 含端口侧编译重验，15 秒档
// 输出只有一段引导文案：24k 预算绰绰有余。
const RESUME_WORKFLOW_RUN_MODEL_BYTES = 24_000; // 24k 模型面预算

/**
 * 本地失败码表。数值本身不进模型（executor 把 errorCode 投影成 `code: "N"`），判别键唯一权威是
 * message 前缀。数值空间归属：`not_found` 复用内省表（1/2）同键同码；本表 11–17 与内省表互相
 * 独立、禁止跨表比对——判别靠 message 前缀，数值只是日志位。
 */
const RESUME_WORKFLOW_RUN_ERROR_CODE = {
  RESUME_UNAVAILABLE: 11, // 端口/方法缺席
  NOT_RESUMABLE: 12, // 不在可恢复集
  ALREADY_RUNNING: 13, // 本实例在飞
  SCRIPT_MISSING: 14, // 无存稿
  SCRIPT_MISMATCH: 15, // 存稿被篡改
  SUPERSEDED: 16, // 已被继任者取代
  COMPILE_FAILED: 17, // 存稿不再可编译
} as const;

const DESCRIPTION_INTRO =
  "Resumes a dynamic-workflow run whose status is `stopped` — the user cancelled it, you stopped it with TaskStop, a provider-side error stopped it (expired sign-in, model not in the plan, quota cap), or the process that owned it exited (`interrupted`). The run continues under the same run ID: finished steps are replayed from the journal without spending tokens, unfinished steps are dispatched again. The one stopped run that is NOT resumable is a `superseded` one: an AmendWorkflow replaced it, and its successor is the live run.";

const DESCRIPTION_BULLETS = [
  "- Takes run_id — from CreateWorkflow's or AmendWorkflow's result, from a completion notification, or from GetWorkflowRun / ListWorkflowRuns.", // 入参来源
  "- The resumed run is backgrounded: you will be notified with the final output when it completes. Do not wait for it or poll it with TaskOutput; continue with other work unless the user asked you to wait.", // 后台化语义
  "- An `errored` run (the script itself failed) is NOT resumable — replaying it would fail the same way. Fix the script and submit it with AmendWorkflow instead. A completed run is not resumable either; a `superseded` run is refused with the successor's ID.", // 不可恢复集
  "- Stop reason `user` means the user stopped it on purpose: resume it only when the user asks you to; never resume a run the user just cancelled on your own initiative. Reason `model` is your own TaskStop. Reason `provider` means a provider-side error stopped it: resolve the cause with the user first (the stop notification names it), then resume. Reason `interrupted` (the process died) is different: continuing it is usually what the user wants.", // 停因处置
];

function composeDescription(): string {
  return [DESCRIPTION_INTRO, "", ...DESCRIPTION_BULLETS].join("\n");
}

const RESUME_WORKFLOW_RUN_DESCRIPTION = composeDescription();

/** 结构化失败构造器：result:false + 码 + message 三件套。 */
function failure(code: number, message: string): ToolHandlerFailure {
  return { result: false, errorCode: code, message };
}

/**
 * 「本会话没有 resume 能力」。端口缺席（journal 不可用）与方法缺席（stub 不带 resume）回同一
 * 失败：对模型这是同一件事（照 listRuns/getRunDetail 的 typeof 探测先例）。绝不静默降级。
 */
function workflowResumeUnavailableFailure(): ToolHandlerFailure {
  return failure(
    RESUME_WORKFLOW_RUN_ERROR_CODE.RESUME_UNAVAILABLE,
    "workflow_resume_unavailable: this session cannot resume workflow runs — workflow execution is not available here. This is a capability gap, not a status problem.",
  );
}

/** compile_failed 的失败可附端口诊断细节（其余分支 detail 无用）。 */
function withDetail(base: string, detail?: string): string {
  return detail === undefined ? base : `${base}\n${detail}`;
}

/** 端口的 reason → 各配可操作文案的结构化失败（判别键在 message 前缀）。 */
function resumeFailureFor(reason: string, runId: string, detail?: string): ToolHandlerFailure {
  if (reason === "compile_failed") {
    return failure(
      RESUME_WORKFLOW_RUN_ERROR_CODE.COMPILE_FAILED,
      withDetail(
        `workflow_run_compile_failed: the stored script of run ${runId} no longer compiles against the current workflow facade, so it cannot be replayed as-is. Rewrite it for the current facade and submit it with AmendWorkflow, which keeps the finished work of this run.`,
        detail,
      ),
    );
  }
  if (reason === "not_resumable") {
    return failure(
      RESUME_WORKFLOW_RUN_ERROR_CODE.NOT_RESUMABLE,
      "workflow_run_not_resumable: this run is not in the resumable set — only a `stopped` run can be resumed (any stop reason except `superseded`). An `errored` run needs a corrected script submitted with AmendWorkflow; a completed run has nothing to resume. Check the status with GetWorkflowRun.",
    );
  }
  if (reason === "superseded") {
    return failure(
      RESUME_WORKFLOW_RUN_ERROR_CODE.SUPERSEDED,
      `workflow_run_superseded: run ${runId} was stopped by an AmendWorkflow and superseded; its unfinished work belongs to the successor run (see GetWorkflowRun's <superseded_by>). Read or amend the successor instead of resuming this run.`,
    );
  }
  if (reason === "already_running") {
    // 门作用域是本 run service 实例的在飞注册表；跨会话并发 resume 同一 journal run 不拦
    // （既有开放语义，文案只描述本实例语义）。
    return failure(
      RESUME_WORKFLOW_RUN_ERROR_CODE.ALREADY_RUNNING,
      "workflow_run_already_running: this run is already in flight in this session's workflow runtime. Wait for its completion notification instead of resuming it again.",
    );
  }
  if (reason === "script_missing") {
    return failure(
      RESUME_WORKFLOW_RUN_ERROR_CODE.SCRIPT_MISSING,
      "workflow_run_script_missing: this run's journal record has no stored script text (it predates script persistence), so there is nothing to re-run. Start a fresh run with CreateWorkflow instead.",
    );
  }
  if (reason === "script_mismatch") {
    return failure(
      RESUME_WORKFLOW_RUN_ERROR_CODE.SCRIPT_MISMATCH,
      `workflow_run_script_mismatch: the stored script hash for run ${runId} no longer matches the stored script text — the journal record was modified by an outside force. Start a fresh run with CreateWorkflow instead.`,
    );
  }
  // 端口契约外的 reason：仍回结构化失败（throw 是接线故障的通道），判别键用保留前缀。
  return failure(
    RESUME_WORKFLOW_RUN_ERROR_CODE.NOT_RESUMABLE,
    `workflow_run_not_resumable: the workflow runtime refused to resume run ${runId} (reason: ${reason}).`, // 原词透传
  );
}

const resumeWorkflowRunHandler: ToolHandler = async (call, scope: ToolExecutionContext) => {
  const parsed = ResumeWorkflowRunInputSchema.parse(call) as ResumeWorkflowRunInput; // 入参校验

  const port = scope.dynamicWorkflowRunPort;
  const resume = port && typeof port.resume === "function" ? port.resume.bind(port) : undefined;
  if (!resume) return workflowResumeUnavailableFailure(); // 能力缺口（端口/方法缺席同形）

  const result = await resume(parsed.run_id); // 恰好一次端口调用
  if (!result.ok) {
    // not_found 复用内省工具的 run_not_found 键（同键同码同 message）。
    const notFound = result.reason === "not_found";
    return notFound
      ? workflowRunNotFoundFailure(parsed.run_id)
      : resumeFailureFor(result.reason, parsed.run_id, result.message); // 本地码表分支
  }

  return {
    ok: true, // 成功标志
    runId: result.runId, // 恢复的 run 身份
    // 引导文案照 CreateWorkflow 的 backgrounded 形态：给 id、说明仍在跑、结果以通知回来、
    // 显式劝阻轮询（缺这句模型会立刻用 TaskOutput 把异步 run 变成同步等待）。
    response: `The workflow run ${result.runId} has been resumed and is running in the background. It is still running — you will be notified with the final output when it completes. Do not wait for it or poll it with TaskOutput; continue with other work unless the user asked you to wait.`,
    status: "backgrounded" as const,
    // backgroundTaskId ≡ runId（与 CreateWorkflow 同一恒等式）：取消/查询/通知共用这一个键。
    backgroundTaskId: result.runId, // 与 runId 同值（恒等式）
  } satisfies ResumeWorkflowRunOutput; // 契约形状
};

function formatResumeWorkflowRunModelContent(raw: unknown): ModelMessageContent {
  const parsed = ResumeWorkflowRunOutputSchema.safeParse(raw); // 契约形状校验
  if (!parsed.success) return "ResumeWorkflowRun returned an invalid result."; // 定型兜底
  return parsed.data.response; // 成功面只回引导文案
}

function toolMetadata() {
  // 声明面：恢复是执行动作（readOnly false），但钉死在已批准脚本上故免确认
  const surface = {
    name: RESUME_WORKFLOW_RUN_TOOL_NAME, // 工具名（契约面）
    description: RESUME_WORKFLOW_RUN_DESCRIPTION, // 引导文案（协议面）
    readOnly: false, // 恢复 = 重启执行（与 CreateWorkflow 同档）
    destructive: false, // 无破坏
    concurrentSafe: true, // 并发安全
    timeoutMs: RESUME_WORKFLOW_RUN_TIMEOUT_MS, // 15s
    maxOutputBytes: RESUME_WORKFLOW_RUN_MODEL_BYTES, // 24k
    sideEffectScope: "none" as const,
    riskLevel: "low" as const,
    needsApproval: false, // 免确认：scriptHash 钉死在已批准脚本
  };
  return surface;
}

function toolPermission(): ToolEntry["permission"] {
  // 权限面：拦截面仍在 PreToolUse deny 与项目 deny 规则
  const surface = {
    permission: "resumeWorkflowRun" as const, // 权限名
    reason: "resumeWorkflowRun.runConfirmation: resuming continues executing a stopped workflow run", // 理由（协议面）
    riskLevel: "low" as const,
    sideEffectScope: "none" as const,
    needsApproval: false, // 与 UI 按钮同一风险档
    // run_id 进模式匹配面（照 TaskOutput 的 task_id）。
    patternSources: ["toolName", "input"] as ToolEntry["permission"]["patternSources"],
    alwaysAllowPatternSources: ["toolName"] as ToolEntry["permission"]["alwaysAllowPatternSources"],
    denyPriority: "beforeAsk" as const,
  };
  return surface;
}

function toolBudget() {
  // 预算面：一段引导文案，truncate 档
  const surface = {
    maxInlineBytes: RESUME_WORKFLOW_RUN_MODEL_BYTES, // 24k 内联上限
    maxModelBytes: RESUME_WORKFLOW_RUN_MODEL_BYTES, // 24k 模型面上限
    strategy: "truncate" as const, // 超限截断
    preview: {
      maxBytes: RESUME_WORKFLOW_RUN_MODEL_BYTES, // 预览同预算
      direction: "head" as const,
    },
  };
  return surface;
}

export const resumeWorkflowRunToolEntry: ToolEntry = {
  capability: "Resume a stopped dynamic-workflow run under the same run ID",
  metadata: toolMetadata(),
  handler: resumeWorkflowRunHandler,
  inputSchema: ResumeWorkflowRunInputJsonSchema,
  outputSchema: ResumeWorkflowRunOutputJsonSchema,
  runtimeInputSchema: ResumeWorkflowRunInputSchema,
  runtimeOutputSchema: ResumeWorkflowRunOutputSchema,
  formatModelContent: formatResumeWorkflowRunModelContent,
  permission: toolPermission(),
  resultBudget: toolBudget(),
  timeout: {
    kind: "timed" as const,
    defaultMs: RESUME_WORKFLOW_RUN_TIMEOUT_MS, // 15s
    maxMs: RESUME_WORKFLOW_RUN_TIMEOUT_MS, // 15s 封顶
    allowCallOverride: false, // 调用方不得放宽
  },
  cancellation: {
    supported: false, // 不可取消
    cleanup: "none" as const,
    userVisibleMessage: "ResumeWorkflowRun resumes the run synchronously and cannot be cancelled", // 取消语义文案
  },
  trace: {
    required: true, // 必带 trace
    propagateToAdapters: true, // 恢复动作向适配器传播
    recordInput: "summary" as const, // 输入只留摘要
    recordOutput: "summary" as const, // 输出只留摘要
  },
};

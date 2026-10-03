// ============================================================
// submit_result Tool Handler
// ============================================================
// 工作流 actor（子 AgentRuntime）用它提交本次 ask 的结构化终态结果。handler 把结果交给
// 注入的 WorkflowSubmitPort，阻塞等待引擎裁决：
//   - accept → 返回成功 output；executor 会在成功结果上挂 turnControl 终止本 turn。
//   - reject → 以 ToolHandlerFailure 形式返回违规列表；它成为一条 error tool_result，
//     不带 turnControl，循环继续，模型在同一会话内重试——这就是修复通道。
// 具体 per-ask schema 不进工具声明，而是随 ask 指令的 epilogue 下发（frozen-tool 缓存
// 不变式）；本 handler 只做通用转交，schema 校验由引擎在 port 侧完成。

import {
  SUBMIT_RESULT_TOOL_NAME,
  SubmitResultInputJsonSchema,
  SubmitResultInputSchema,
  SubmitResultOutputJsonSchema,
  SubmitResultOutputSchema,
  typedSubmitResultInputSchema,
  type JsonSchema,
} from "@knorvia/contracts";
import type { ToolEntry } from "../types.js";
import { createSubmissionHandler } from "./collaboration-invocation.js";
import { submitResultModelContent } from "./collaboration-result.js";

const MAX_SUBMIT_RESULT_MODEL_BYTES = 16_000;

// reject 的违规列表以此 errorCode 归一化，落到 error tool_result 的 code 字段。
const SUBMIT_RESULT_REJECTED_ERROR_CODE = 1;

const submitResultHandler = createSubmissionHandler(SUBMIT_RESULT_REJECTED_ERROR_CODE);

/**
 * submit_result 的工具条目。不带 schema = 通用声明（`result` 任意 JSON，per-ask schema 走 ask 尾注）；
 * 带 schema = dwf mono 子代理的 typed 声明（`result` 就是该 actor 唯一的 ask 结果 schema，对该 actor
 * 冻结、跨 ask 不变，因此不破坏缓存前缀），并标 `strict` 资格让 Anthropic adapter 原生约束它。
 * 两者只有 provider 可见的声明与描述不同：handler、权限、并发组、终止语义、预算逐字节相同——
 * 引擎侧校验对两者一致，typed 声明只是让 provider 也看见（并在支持时强制）这份形状。
 */
export function createSubmitResultToolEntry(resultSchema?: JsonSchema): ToolEntry {
  const typed = resultSchema !== undefined;
  return {
    capability: "Submit the structured terminal result for a workflow subagent's ask",
    metadata: {
      name: SUBMIT_RESULT_TOOL_NAME,
      description: typed
        ? "Submit the structured result for the current ask. The `result` argument must match this tool's schema."
        : "Submit the structured result for the current ask. The required JSON shape is described in the ask instructions.",
      readOnly: false,
      destructive: false,
      // 载荷性质：声明 concurrentSafe:false，调度器会把它放进独立的串行组。这样一个有效提交
      // （成功即请求终止 turn）执行时，晚于它调度的兄弟工具会收到既有的合成 ToolCancelled，
      // 早于它的先行完成——终止语义无需新增机制。
      concurrentSafe: false,
      // 终态工具：一次有效提交（引擎 accept）就是成功，且必须结束 actor 的 turn。用声明式
      // metadata 表达该内在能力，executor 的通用 withTerminalToolTurnStop 据此在成功结果上挂
      // turnControl，无需在执行点按工具名硬编码，也无需 handler 侧新增 stop 信号通道。
      stopTurnOnSuccess: true,
      maxOutputBytes: MAX_SUBMIT_RESULT_MODEL_BYTES,
      sideEffectScope: "session",
      riskLevel: "low",
      needsApproval: false,
    },
    handler: submitResultHandler,
    formatModelContent: submitResultModelContent,
    inputSchema: typed ? typedSubmitResultInputSchema(resultSchema) : SubmitResultInputJsonSchema,
    ...(typed ? { strict: true } : {}),
    outputSchema: SubmitResultOutputJsonSchema,
    // 运行时 zod 校验两者同一份（result 任意 JSON）：per-ask 形状由引擎在端口侧校验并给出可修复的违规。
    runtimeInputSchema: SubmitResultInputSchema,
    runtimeOutputSchema: SubmitResultOutputSchema,
    permission: {
      permission: "workflow.submitResult",
      reason: "submit_result delivers the subagent's terminal result to the workflow engine",
      riskLevel: "low",
      sideEffectScope: "session",
      needsApproval: false,
      patternSources: ["toolName"],
      alwaysAllowPatternSources: ["toolName"],
      denyPriority: "beforeAsk",
    },
    resultBudget: {
      maxInlineBytes: MAX_SUBMIT_RESULT_MODEL_BYTES,
      maxModelBytes: MAX_SUBMIT_RESULT_MODEL_BYTES,
      strategy: "truncate",
      preview: {
        maxBytes: MAX_SUBMIT_RESULT_MODEL_BYTES,
        direction: "head",
      },
    },
    // 引擎裁决可能耗时任意长；用 kind:"none" 不设墙钟超时，取消由中止该 tool call（abort）处理。
    timeout: {
      kind: "none",
    },
    cancellation: {
      supported: true,
      cleanup: "none",
      userVisibleMessage: "submit_result was cancelled before the engine returned a verdict",
    },
    trace: {
      required: true,
      propagateToAdapters: true,
      recordInput: "summary",
      recordOutput: "summary",
    },
  };
}

/** 通用声明的条目（内建工具表里的那一份）。 */
export const submitResultToolEntry: ToolEntry = createSubmitResultToolEntry();

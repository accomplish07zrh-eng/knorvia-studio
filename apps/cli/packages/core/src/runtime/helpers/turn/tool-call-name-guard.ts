// SPDX-License-Identifier: Apache-2.0
// 模型工具调用名校验（B32）。
// 名字去空白后非空 → 归一后返回；模型侧调用若**未由供应方执行**且带非空 id，则空名也原样
// 放行（交给后续运行时再判定）；其余拒绝。批量归一保持原顺序，空数组/缺省输入返回 undefined。
// 拒绝时先打 warn 再抛 ModelError（可恢复、不可重试），消息固定含「tool name is empty」，
// context 即日志字段（event=model.invalid_tool_call、模型、来源、调用 id 与下标）。
import { CoreErrorType, createCoreError, traceContextToLogContext } from "../../deps.js";
import type { Logger, Model, ModelToolCall, ToolCall, TraceContext } from "../../deps.js";

export interface ModelToolCallValidationContext {
  logger?: /* 可缺席：缺席即静默拒绝 */ Logger;
  model: /* 模型身份：进日志与错误 context */ Pick<Model, "providerId" | "modelId">;
  source: /* 调用来源标签 */ string;
  traceContext: /* 追踪上下文 */ TraceContext;
}

interface ToolCallNameContext extends ModelToolCallValidationContext {
  providerExecuted?: /* 是否已由供应方执行 */ boolean;
  toolCallId?: /* 调用 id（可缺席） */ string;
  toolCallIndex?: /* 批量归一时的下标 */ number;
}

// 拒绝正文与日志（逐字冻结）：测试按「tool name is empty」匹配。
const INVALID_TOOL_CALL_MESSAGE = "Model returned an invalid tool call: tool name is empty.";
const INVALID_TOOL_CALL_LOG = "Model returned invalid tool call";
const INVALID_TOOL_CALL_EVENT = "model.invalid_tool_call";

// 空名分流：非空（去空白后）归一返回；空名仅在「未由供应方执行 + 有非空 id」时原样放行。
function admittedToolName(rawName: unknown, frame: ToolCallNameContext): string {
  const normalized = typeof rawName === "string" ? rawName.trim() : "";
  if (normalized.length > 0) {
    return normalized;
  }
  const deferredToRuntime =
    typeof rawName === "string" &&
    frame.providerExecuted !== true &&
    typeof frame.toolCallId === "string" &&
    frame.toolCallId.trim().length > 0;
  return deferredToRuntime ? (rawName as string) : rejectEmptyName(frame);
}

// 拒绝路径：先 warn 后抛（顺序是契约），日志字段与错误 context 同一份。
function rejectEmptyName(frame: ToolCallNameContext): never {
  const logFields = {
    ...traceContextToLogContext(frame.traceContext),
    event: INVALID_TOOL_CALL_EVENT,
    module: "core.runtime", // 模块归属是观测契约字段
    model: `${frame.model.providerId}/${frame.model.modelId}`,
    modelId: frame.model.modelId,
    providerId: frame.model.providerId,
    source: frame.source,
    status: "failed" as const, // 拒绝态固定 failed
    toolCallId: frame.toolCallId,
    toolCallIndex: frame.toolCallIndex,
  };
  frame.logger?.warn(INVALID_TOOL_CALL_LOG, logFields);
  throw createCoreError(CoreErrorType.ModelError, INVALID_TOOL_CALL_MESSAGE, {
    context: logFields,
    recoverable: true, // 可恢复：换名后能继续
    retryable: false, // 不可自动重试
  });
}

export const normalizeModelToolCallsForRuntime = (
  calls: readonly ModelToolCall[] | undefined,
  frame: ModelToolCallValidationContext,
): ModelToolCall[] | undefined => {
  if (!calls || calls.length === 0) {
    return undefined; // 空输入不产出数组
  }
  return calls.map((call, ordinal) => ({
    ...call,
    name: admittedToolName(call.name, {
      ...frame,
      providerExecuted: call.providerExecuted,
      toolCallId: call.id,
      toolCallIndex: ordinal,
    }),
  }));
};

export const requireRuntimeToolCallName = (
  toolCall: Pick<ModelToolCall | ToolCall, "id" | "name">, // 只用 id/name 两个字段
  frame: ModelToolCallValidationContext,
): string => {
  const rawName = toolCall.name;
  const callFrame = { ...frame, toolCallId: toolCall.id };
  const normalized = typeof rawName === "string" ? rawName.trim() : "";
  return normalized.length > 0 ? normalized : rejectEmptyName(callFrame);
};

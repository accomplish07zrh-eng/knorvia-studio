// SPDX-License-Identifier: Apache-2.0
// 模型请求组装：媒体三段投影（附件路径物化 → 输入格式能力 → 媒体预算）后组装出
// 「messages/tools/abortSignal」三键请求（输出预算仅在显式给定时附加）。投影未改动消息时
// 保持原对象引用；随后组装 invocationContext（会话类型实时解析、modelCall 归因、状态 sink、
// 请求头刷新钩子）。
import { beginLocalTurnPreparation } from "@knorvia/contracts";
import { traceContextToLogContext } from "../../deps.js";
import {
  logMediaBudgetProjection,
  logMediaCapabilityProjection,
  logModelRequestMediaSummary,
  projectMessagesForInputFormat,
  projectMessagesForMediaBudget,
  projectMessagesWithMediaAttachmentPaths,
} from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { RunModelTextRequestOptions, RuntimeModelTextResult } from "../../types.js";
import { createRefreshRuntimeHeadersBeforeModelAttempt } from "../model-runtime-headers.js";
import { resolveModelRequestSessionTypeFromTaskType } from "../model-request-session-type.js";
import { tokenLimitLogFields } from "./token-budget.js";

/** 能力投影日志文案（逐字常量）。 */
const MEDIA_LOG_TEXT = {
  capability: "Model request media capability projection",
  capabilityEvent: "model.request.media_capability_projection",
  projectionEvent: "model.request.media_projection",
  projectionMessage: "Model request media budget projection",
} as const;

/** 组装完成的请求面（键序即契约：messages、tools、abortSignal，预算随后）。 */
export interface AssembledModelRequest {
  /** 投影后的消息表。 */
  messages: unknown;
  /** 声明的工具表。 */
  tools: unknown;
  /** 取消信号。 */
  abortSignal: unknown;
  /** 仅显式给定输出预算时存在。 */
  options?: { maxOutputTokens?: number };
}

/** 组装请求（键序即契约）。 */
export const assembleModelRequest = (
  projectedMessages: unknown,
  input: RunModelTextRequestOptions,
): AssembledModelRequest => {
  const request = {} as AssembledModelRequest;
  request.messages = projectedMessages;
  request.tools = input.tools;
  request.abortSignal = input.abortSignal;
  if (input.maxOutputTokens !== undefined) {
    request.options = { maxOutputTokens: input.maxOutputTokens };
  }
  return request;
};

/** 三段投影 + 请求组装 + 调用上下文（B1 的完整装配面）。 */
export interface RequestAssembly {
  /** 投影后的请求。 */
  request: AssembledModelRequest;
  /** 调用上下文（含状态 sink 与请求头刷新钩子）。 */
  invocationContext: unknown;
  /** 归一后的模型选择。 */
  modelSelection: { modelId: string; providerId: string };
  /** 组装收尾（流式分支首个事件 await 前调用）。 */
  completeAssembly: () => void;
  /** 用量快照视图（供返回值挂载）。 */
  contextUsageBreakdown: unknown[];
}

/** 走完投影与装配：投影未改动消息时 options 保持原对象。 */
export async function assembleRequestPipeline(
  runtime: AgentRuntimeInternal,
  input: RunModelTextRequestOptions,
): Promise<RequestAssembly> {
  const completeAssembly = beginLocalTurnPreparation(input.traceContext, "request_assembly");
  const model = input.model;
  const modelSelection = { providerId: model.providerId, modelId: model.modelId };
  const pathMessages = await projectMessagesWithMediaAttachmentPaths(
    input.messages,
    runtime.artifactStore,
  );
  const capabilityProjection = projectMessagesForInputFormat(
    pathMessages,
    model.properties.inputFormat,
  );
  logMediaCapabilityProjection(runtime.logger, input.traceContext, capabilityProjection, {
    event: MEDIA_LOG_TEXT.capabilityEvent,
    message: MEDIA_LOG_TEXT.capability,
    model: `${model.providerId}/${model.modelId}`,
  });
  const mediaProjection = projectMessagesForMediaBudget(capabilityProjection.messages, {
    latestRealUserMessageIndex: input.latestRealUserMessageIndex,
  });
  logMediaBudgetProjection(runtime.logger, input.traceContext, mediaProjection, {
    event: MEDIA_LOG_TEXT.projectionEvent,
    message: MEDIA_LOG_TEXT.projectionMessage,
  });
  const projectedInput =
    mediaProjection.messages === input.messages
      ? input
      : { ...input, messages: mediaProjection.messages };
  logModelRequestMediaSummary(runtime.logger, projectedInput.traceContext, {
    incomingMessages: input.messages,
    mediaProjection,
    providerMessages: projectedInput.messages,
  });
  // 状态端口可能重入改变 trace；后续读取保持实时。
  const invocationContext = {
    metadata: traceContextToLogContext(projectedInput.traceContext),
    modelRequestSessionType: resolveModelRequestSessionTypeFromTaskType(runtime.config.taskType),
    modelCall: {
      actorKind: runtime.agentTelemetry.actorKind,
      operation: "agent_step" as const,
      operationId: projectedInput.traceContext.spanId,
      ...(projectedInput.streamRecovery
        ? {
            callCause: "recovery" as const,
            attributes: { streamRecoveryNumber: projectedInput.streamRecovery.retryNumber },
          }
        : {}),
    },
    statusSink: runtime.createModelStatusSink(projectedInput.traceContext, projectedInput.events, {
      ...(projectedInput.onModelNetworkStatus
        ? { onStatus: projectedInput.onModelNetworkStatus }
        : {}),
      ...(projectedInput.streamRecovery ? { streamRecovery: projectedInput.streamRecovery } : {}),
    }),
    traceContext: projectedInput.traceContext,
    refreshRuntimeHeadersBeforeAttempt: createRefreshRuntimeHeadersBeforeModelAttempt(runtime, {
      abortSignal: projectedInput.abortSignal,
      model,
      traceContext: projectedInput.traceContext,
    }),
    streamIdleTimeoutRetryNumber: projectedInput.streamRecovery?.retryNumber,
    streamRecovery: projectedInput.streamRecovery,
  };
  const request = assembleModelRequest(mediaProjection.messages, projectedInput);
  runtime.logger?.debug(
    "Model request token limits",
    tokenLimitLogFields({
      contextWindow: model.properties.contextWindow,
      maxOutputTokens: projectedInput.maxOutputTokens,
      modelContextBudgetStrategy: runtime.config.modelContextBudgetStrategy,
      traceContext: projectedInput.traceContext,
    }),
  );
  const contextUsageSnapshot = runtime.buildContextUsageSnapshot(projectedInput);
  const contextUsageBreakdown =
    runtime.buildContextUsageBreakdownFromSnapshot(contextUsageSnapshot);
  runtime.logContextUsageSnapshot(projectedInput, contextUsageSnapshot);
  return { request, invocationContext, modelSelection, completeAssembly, contextUsageBreakdown };
}

/** 非流式收尾：工具调用归一 + 用量分解条件附加（键序：原结果 → 用量分解 → toolCalls）。 */
export function finalizeNonStreamingResult(
  assembly: RequestAssembly,
  raw: { finishReason?: string; providerMetadata?: unknown; text?: string; usage?: unknown },
  normalizedToolCalls: unknown,
): RuntimeModelTextResult {
  const base = { ...raw } as Record<string, unknown>;
  if (assembly.contextUsageBreakdown.length > 0) {
    base.contextUsageBreakdown = assembly.contextUsageBreakdown;
  }
  base.toolCalls = normalizedToolCalls;
  return base as unknown as RuntimeModelTextResult;
}

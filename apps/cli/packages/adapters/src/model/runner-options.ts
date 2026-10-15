// SPDX-License-Identifier: Apache-2.0
// SDK 请求选项装配：把逻辑请求投影成 generateText/streamText 入参——消息/工具走投影层、
// 选项映射由 fetch 包装负责、header 三段合并（静态 → OpenCode 会话头 → 归因头）。
// maxRetries 恒为 0：SDK 内置重试关闭，全部物理重试由适配器管理。

import { jsonSchema, Output } from "ai";
import type { EnvRecord } from "./model-execution.js";
import type {
  AiSdkGenerateTextOptions,
  AiSdkModelTextRequest,
  AiSdkStreamTextOptions,
  ResolvedAiSdkModel,
} from "./runner-runtime.js";
import type { ModelStatusContext } from "./runner-status.js";
import { createModelRequestAttributionHeaders } from "./runner-status.js";
import { mergeModelRequestHeaders } from "./model-request-headers.js";
import { toAiSdkMessages } from "./transform.js";
import { toAiSdkTools } from "./tool-transform.js";
import { isOpenCodeGoBaseUrl } from "./opencode-session.js";

function dropMissing<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

interface AssemblyCall {
  anthropicMetadataUserId?: string; // Anthropic 元数据 user id（B35）
  env?: EnvRecord; // 环境变量表（预留）
  includeModelIO: boolean; // 调试记录开关（预留）
  request: AiSdkModelTextRequest; // 逻辑请求
  resolved: ResolvedAiSdkModel; // 解析后的模型与头
  statusContext: ModelStatusContext; // 归因上下文
}

export function createGenerateTextOptions(call: AssemblyCall): AiSdkGenerateTextOptions {
  const providerOptions = { ...call.resolved.providerOptions, ...call.request.providerOptions };
  const openCodeSessionHeaders =
    isOpenCodeGoBaseUrl(call.resolved.baseURL) && call.statusContext.sessionId !== undefined
      ? { "x-opencode-session": String(call.statusContext.sessionId) }
      : undefined;
  if (call.anthropicMetadataUserId) {
    providerOptions.anthropic = {
      ...(providerOptions.anthropic as Record<string, unknown> | undefined),
      metadata: { userId: call.anthropicMetadataUserId },
    };
  }
  const messageProjection = toAiSdkMessages(call.request.messages, {
    providerKind: call.resolved.providerKind,
    providerOptions,
    inputFormat: call.resolved.properties.inputFormat,
  });
  const toolProjection = toAiSdkTools(call.request.tools, {
    providerKind: call.resolved.providerKind,
    modelId: call.resolved.modelId,
    requiresMfjsToolSchema: call.resolved.properties.requiresMfjsToolSchema,
    supportsNativeWebSearch: call.resolved.properties.supportsNativeWebSearch,
  });
  const projection = {
    model: call.resolved.model, // 绑定的 SDK 模型
    messages: messageProjection,
    tools: toolProjection,
  };
  const sampling = {
    toolChoice: call.request.toolChoice, // 工具选择策略
    temperature: call.request.temperature, // 采样温度
    maxOutputTokens: call.request.maxOutputTokens, // 输出上限
    topP: call.request.topP, // 核采样
    topK: call.request.topK, // top-k 采样
    presencePenalty: call.request.presencePenalty, // 在场惩罚
    frequencyPenalty: call.request.frequencyPenalty, // 频率惩罚
    stopSequences: call.request.stopSequences, // 停止序列
    seed: call.request.seed, // 采样种子
  };
  const wiring = {
    output: call.request.responseJsonSchema
      ? Output.object({ schema: jsonSchema(call.request.responseJsonSchema) })
      : undefined,
    providerOptions, // provider 侧选项（含 reasoningLevel）
    abortSignal: call.request.abortSignal, // 取消信号
    headers: mergeModelRequestHeaders(
      call.resolved.headers,
      openCodeSessionHeaders,
      createModelRequestAttributionHeaders(call.statusContext),
    ),
    maxRetries: 0, // SDK 内置重试关闭（协议面）
  };
  return dropMissing({ ...projection, ...sampling, ...wiring }) as AiSdkGenerateTextOptions;
}

export function createStreamTextOptions(call: AssemblyCall): AiSdkStreamTextOptions {
  return createGenerateTextOptions(call) as AiSdkStreamTextOptions;
}

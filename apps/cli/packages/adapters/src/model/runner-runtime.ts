// SPDX-License-Identifier: Apache-2.0
// 运行时端口与请求扩展：AI SDK generateText/streamText 的选项/结果类型别名、解析后模型形状、
// 可注入的运行时端口（默认直通 AI SDK），以及逻辑请求的 attempt 级扩展字段。

import { generateText as aiGenerateText, streamText as aiStreamText } from "ai";
import type {
  Logger,
  ModelProperties,
  ModelRequestAuth,
  ModelStatusSink,
  ModelTextRequest,
  TraceContext,
} from "@knorvia/contracts";
import type { KnorviaProviderAccountAccess } from "@knorvia/shared";
import type { AiSdkResolvedModel } from "./model-execution.js";
import type { EnvRecord } from "./model-execution.js";
import type { ResolvedAiSdkModelRetryOptions } from "./retry-policy.js";

export type AiSdkGenerateTextOptions = Parameters<typeof aiGenerateText>[0]; // generateText 入参
export type AiSdkGenerateTextResult = Awaited<ReturnType<typeof aiGenerateText>>; // generateText 结果
export type AiSdkStreamTextOptions = Parameters<typeof aiStreamText>[0]; // streamText 入参
export type AiSdkStreamTextResult = ReturnType<typeof aiStreamText>; // streamText 返回（含 fullStream）

export type ResolvedAiSdkModel = AiSdkResolvedModel & {
  properties: ModelProperties; // 模型能力表
  accountAccess?: KnorviaProviderAccountAccess; // zhipu-account 专属访问信息
};

export interface AiSdkModelRuntime {
  generateText(options: AiSdkGenerateTextOptions): Promise<AiSdkGenerateTextResult>;
  streamText(options: AiSdkStreamTextOptions): AiSdkStreamTextResult;
}

export interface RunStreamTextInput {
  debugDir?: string; // 调试/rollout 目录
  env: EnvRecord; // 环境变量表
  logger?: Logger; // 诊断日志口
  request: AiSdkModelTextRequest; // 逻辑请求
  resolveModel: () => ResolvedAiSdkModel; // 重解析入口
  resolved: ResolvedAiSdkModel; // 初始解析结果
  retry: ResolvedAiSdkModelRetryOptions; // 退避参数
  runtime: AiSdkModelRuntime; // 注入的运行时端口
  statusSink?: ModelStatusSink; // 适配器级状态接收端
  streamIdleTimeoutMs: number; // 流空闲超时额度
  modelIoFullRetentionEnabled: boolean; // 调试记录全量保留开关
}

export interface AiSdkModelTextRequest extends ModelTextRequest {
  abortSignal?: AbortSignal; // 取消信号
  traceContext?: TraceContext; // 归因上下文
  refreshRuntimeHeadersBeforeAttempt?: (input: {
    accountAccess?: KnorviaProviderAccountAccess;
    attempt: number;
    reason?: "model-request";
    abortSignal?: AbortSignal;
    providerId: string;
    modelId: string;
    traceContext?: TraceContext;
  }) => Promise<{ headersApplied: boolean; requestAuth?: ModelRequestAuth }>; // attempt 级鉴权刷新
  streamIdleTimeoutRetryNumber?: number; // 空闲超时的重试递增号
  preserveProviderStreamBoundaries?: boolean; // compact 边界保真模式
}

const passThrough = {
  generateText: aiGenerateText,
  streamText: aiStreamText,
} satisfies AiSdkModelRuntime;

export const defaultRuntime: AiSdkModelRuntime = passThrough;

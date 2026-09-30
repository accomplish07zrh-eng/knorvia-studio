// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
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
export type AiSdkGenerateTextOptions = Parameters<typeof aiGenerateText>[0];
export type AiSdkGenerateTextResult = Awaited<ReturnType<typeof aiGenerateText>>;
export type AiSdkStreamTextOptions = Parameters<typeof aiStreamText>[0];
export type AiSdkStreamTextResult = ReturnType<typeof aiStreamText>;
export type ResolvedAiSdkModel = AiSdkResolvedModel & {
  properties: ModelProperties;
  accountAccess?: KnorviaProviderAccountAccess;
};
export interface AiSdkModelRuntime {
  generateText(options: AiSdkGenerateTextOptions): Promise<AiSdkGenerateTextResult>;
  streamText(options: AiSdkStreamTextOptions): AiSdkStreamTextResult;
}
export interface RunStreamTextInput {
  debugDir?: string;
  env: EnvRecord;
  logger?: Logger;
  request: AiSdkModelTextRequest;
  resolveModel: () => ResolvedAiSdkModel;
  resolved: ResolvedAiSdkModel;
  retry: ResolvedAiSdkModelRetryOptions;
  runtime: AiSdkModelRuntime;
  statusSink?: ModelStatusSink;
  streamIdleTimeoutMs: number;
  modelIoFullRetentionEnabled: boolean;
}
export interface AiSdkModelTextRequest extends ModelTextRequest {
  abortSignal?: AbortSignal;
  traceContext?: TraceContext;
  refreshRuntimeHeadersBeforeAttempt?: (input: {
    accountAccess?: KnorviaProviderAccountAccess;
    attempt: number;
    reason?: "model-request";
    abortSignal?: AbortSignal;
    providerId: string;
    modelId: string;
    traceContext?: TraceContext;
  }) => Promise<{ headersApplied: boolean; requestAuth?: ModelRequestAuth }>;
  streamIdleTimeoutRetryNumber?: number;
  preserveProviderStreamBoundaries?: boolean;
}
export const defaultRuntime: AiSdkModelRuntime = {
  generateText: aiGenerateText,
  streamText: aiStreamText,
};

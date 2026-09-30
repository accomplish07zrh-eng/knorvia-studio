// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import {
  getCurrentModelInvocationContext,
  type Logger,
  type Model,
  type ModelOptions,
  type ModelRequestDependencies,
  type ModelStatusSink,
  type ModelRequestAuth,
} from "@knorvia/contracts";
import type { RegistryModelConfig, RegistryProviderConfig } from "@knorvia/provider";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";
import { join } from "node:path";
import {
  AiSdkModelExecution,
  type AiSdkNetworkConfig,
  type AiSdkModelExecutionConfig,
  type EnvRecord,
} from "./model-execution.js";
import { resolveAiSdkModelRetryOptions, type AiSdkModelRetryOptions } from "./retry-policy.js";
import {
  defaultRuntime,
  type AiSdkModelRuntime,
  type AiSdkModelTextRequest,
  type ResolvedAiSdkModel,
} from "./runner-runtime.js";
import { createModel } from "./model.js";
import { runGenerateText } from "./runner-generate.js";
import { runStreamText } from "./runner-stream.js";
import { normalizeReasoningHistory } from "./reasoning-history-normalization.js";
import { AiSdkModelAdapterError } from "./errors.js";
export type { AiSdkModelRetryOptions } from "./retry-policy.js";
export type {
  AiSdkGenerateTextOptions,
  AiSdkGenerateTextResult,
  AiSdkModelRuntime,
  AiSdkModelTextRequest,
  AiSdkStreamTextOptions,
  AiSdkStreamTextResult,
} from "./runner-runtime.js";
export { normalizeUsage, toModelStreamEvent } from "./runner-normalization.js";
export interface AiSdkModelAdapterOptions {
  defaultHeaders?: AiSdkModelExecutionConfig["defaultHeaders"];
  network?: AiSdkNetworkConfig;
  runtime?: AiSdkModelRuntime;
  env?: EnvRecord;
  debugDir?: string;
  logger?: Logger;
  retry?: AiSdkModelRetryOptions;
  statusSink?: ModelStatusSink;
  streamIdleTimeoutMs?: number;
  modelIoFullRetentionEnabled?: boolean;
}
export interface CreateAiSdkModelOptions {
  providerId: string;
  modelId: string;
  providerConfig: RegistryProviderConfig;
  modelConfig: RegistryModelConfig;
  displayName?: string;
  options?: ModelOptions;
  requestDependencies?: ModelRequestDependencies;
}

export class AiSdkModelAdapter {
  private readonly env: EnvRecord;
  private readonly debugDir?: string;
  private readonly logger?: Logger;
  private readonly retry;
  private readonly runtime;
  private readonly execution;
  private statusSink?: ModelStatusSink;
  private readonly streamIdleTimeoutMs: number;
  private fullRetention: boolean;
  constructor(options: AiSdkModelAdapterOptions) {
    this.env = options.env ?? {};
    this.debugDir =
      options.debugDir ??
      join(
        resolveKnorviaDataRoot(this.env),
        "cli",
        this.env.KNORVIA_RUNTIME_ENV === "development" ? "debug" : "rollout",
      );
    this.logger = options.logger;
    this.retry = resolveAiSdkModelRetryOptions(options.retry, this.env);
    this.runtime = options.runtime ?? defaultRuntime;
    this.statusSink = options.statusSink;
    this.streamIdleTimeoutMs = options.streamIdleTimeoutMs ?? 90_000;
    this.fullRetention = options.modelIoFullRetentionEnabled ?? false;
    this.execution = new AiSdkModelExecution(
      { defaultHeaders: options.defaultHeaders, env: this.env, network: options.network },
      { logger: options.logger },
    );
  }
  setModelIoFullRetentionEnabled(enabled: boolean): void {
    this.fullRetention = enabled;
  }
  addStatusSink(sink: ModelStatusSink): void {
    const first = this.statusSink;
    if (!first) {
      this.statusSink = sink;
      return;
    }
    this.statusSink = {
      publish: (event) =>
        Promise.allSettled([first.publish(event), sink.publish(event)]).then(() => undefined),
    };
  }
  createModel(options: CreateAiSdkModelOptions): Model {
    const modelConfig = options.modelConfig as unknown as Record<string, unknown>;
    const properties =
      modelConfig.properties as CreateAiSdkModelOptions["modelConfig"]["properties"];
    const optionSpecs =
      modelConfig.optionSpecs as CreateAiSdkModelOptions["modelConfig"]["optionSpecs"];
    const bound = this.execution.bindModel({
      providerId: options.providerId,
      modelId: options.modelId,
      providerConfig: options.providerConfig,
      supportsJsonSchemaOutput: properties.supportsJsonSchemaOutput,
      optionSpecs,
    });
    const providerRecord = options.providerConfig as unknown as Record<string, unknown>;
    const accessRecord = providerRecord.access as Record<string, unknown> | undefined;
    const accountAccess =
      accessRecord?.type === "zhipu-account"
        ? (accessRecord as ResolvedAiSdkModel["accountAccess"])
        : undefined;
    const project = (resolved: ReturnType<typeof bound.resolveRequest>): ResolvedAiSdkModel => ({
      ...resolved,
      properties,
      accountAccess,
    });
    const makeRequest = (
      request: AiSdkModelTextRequest,
    ): {
      request: AiSdkModelTextRequest;
      resolveModel: () => ResolvedAiSdkModel;
      resolved: ResolvedAiSdkModel;
    } => {
      const invocation = getCurrentModelInvocationContext();
      const next: AiSdkModelTextRequest = {
        ...request,
        metadata: { ...invocation?.metadata, ...request.metadata },
        messages: normalizeReasoningHistory(request.messages, {
          providerId: options.providerId as never,
          modelId: options.modelId as never,
        }),
        statusSink: request.statusSink ?? invocation?.statusSink,
        traceContext: request.traceContext ?? invocation?.traceContext,
        modelCall: request.modelCall ?? invocation?.modelCall,
        modelRequestSessionType:
          request.modelRequestSessionType ?? invocation?.modelRequestSessionType,
        modelRetryBudget: request.modelRetryBudget ?? invocation?.modelRetryBudget,
        modelRequestAdmission: request.modelRequestAdmission ?? invocation?.modelRequestAdmission,
        streamIdleTimeoutRetryNumber:
          request.streamIdleTimeoutRetryNumber ?? invocation?.streamIdleTimeoutRetryNumber,
        preserveProviderStreamBoundaries:
          request.preserveProviderStreamBoundaries ?? invocation?.preserveProviderStreamBoundaries,
      };
      const externalRefresh =
        request.refreshRuntimeHeadersBeforeAttempt ??
        invocation?.refreshRuntimeHeadersBeforeAttempt;
      const authSource = options.requestDependencies?.requestAuth;
      if (accountAccess && (externalRefresh || authSource))
        next.refreshRuntimeHeadersBeforeAttempt = async (input) => {
          if (externalRefresh) return externalRefresh(input);
          const requestAuth = await authSource?.source?.resolve(input);
          if (!requestAuth)
            throw new AiSdkModelAdapterError(
              "model_request_auth_missing",
              "Model request authentication is missing",
              { context: { reason: "auth_failed", retryable: false, source: "runtime" } },
            );
          return { headersApplied: true, requestAuth };
        };
      const initial = project(
        bound.resolveRequest({
          options: {
            reasoningLevel:
              (request.providerOptions?.reasoningLevel as string) ??
              optionSpecs.reasoningLevel.values[0],
            maxOutputTokens: request.maxOutputTokens ?? optionSpecs.maxOutputTokens.max,
          },
        }),
      );
      const resolveModel = () =>
        project(
          bound.resolveRequest({
            options: {
              reasoningLevel:
                (request.providerOptions?.reasoningLevel as string) ??
                optionSpecs.reasoningLevel.values[0],
              maxOutputTokens: request.maxOutputTokens ?? optionSpecs.maxOutputTokens.max,
            },
            requestAuth: (next as AiSdkModelTextRequest & { __requestAuth?: ModelRequestAuth })
              .__requestAuth,
          }),
        );
      return { request: next, resolveModel, resolved: initial };
    };
    return createModel({
      providerId: options.providerId as never,
      modelId: options.modelId as never,
      displayName: options.displayName,
      properties,
      optionSpecs,
      options: options.options,
      executor: {
        generateText: async (request) => {
          const prepared = makeRequest({
            ...request,
            maxOutputTokens: request.options.maxOutputTokens,
            providerOptions: { reasoningLevel: request.options.reasoningLevel },
          });
          return runGenerateText({
            ...prepared,
            debugDir: this.debugDir,
            env: this.env,
            logger: this.logger,
            retry: this.retry,
            runtime: this.runtime,
            statusSink: this.statusSink,
            modelIoFullRetentionEnabled: this.fullRetention,
          });
        },
        streamText: (request) => {
          const prepared = makeRequest({
            ...request,
            maxOutputTokens: request.options.maxOutputTokens,
            providerOptions: { reasoningLevel: request.options.reasoningLevel },
          });
          return runStreamText({
            ...prepared,
            debugDir: this.debugDir,
            env: this.env,
            logger: this.logger,
            retry: this.retry,
            runtime: this.runtime,
            statusSink: this.statusSink,
            streamIdleTimeoutMs:
              this.streamIdleTimeoutMs +
              (prepared.request.streamIdleTimeoutRetryNumber ?? 0) * 30_000,
            modelIoFullRetentionEnabled: this.fullRetention,
          });
        },
      },
    });
  }
}

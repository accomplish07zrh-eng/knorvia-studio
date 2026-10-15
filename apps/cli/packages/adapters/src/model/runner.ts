// SPDX-License-Identifier: Apache-2.0
// 模型适配器装配：把 provider/模型配置绑成 Model 对象，请求期合并调用上下文、按需刷新鉴权、
// 归一 reasoning 历史后交 runner 执行。调试目录、全量保留开关与状态接收端在实例级持有。
// 鉴权缺失文案与 debugDir/额度默认值是兼容面（B47/B48 锁定），逐字保持。

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
  type AiSdkResolvedModel,
  type EnvRecord,
} from "./model-execution.js";
import { resolveAiSdkModelRetryOptions, type AiSdkModelRetryOptions } from "./retry-policy.js";
import {
  defaultRuntime,
  type AiSdkModelRuntime,
  type AiSdkModelTextRequest,
  type ResolvedAiSdkModel,
} from "./runner-runtime.js";
import { createModel, type ModelExecutionRequest } from "./model.js";
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
  defaultHeaders?: AiSdkModelExecutionConfig["defaultHeaders"]; // 附加默认头
  network?: AiSdkNetworkConfig; // 代理/证书配置
  runtime?: AiSdkModelRuntime; // 注入运行时端口（默认 AI SDK）
  env?: EnvRecord; // 环境变量表（数据根与调试开关依据）
  debugDir?: string; // 调试/rollout 目录（缺省按数据根推导）
  logger?: Logger; // 诊断日志口
  retry?: AiSdkModelRetryOptions; // 重试参数（可被 env 覆盖）
  statusSink?: ModelStatusSink; // 适配器级状态接收端
  streamIdleTimeoutMs?: number; // 流空闲超时基础额度
  modelIoFullRetentionEnabled?: boolean; // 调试记录全量保留
}

export interface CreateAiSdkModelOptions {
  providerId: string; // provider 身份
  modelId: string; // 模型身份
  providerConfig: RegistryProviderConfig; // provider 注册配置
  modelConfig: RegistryModelConfig; // 模型注册配置（能力与选项规格）
  displayName?: string; // 展示名
  options?: ModelOptions; // 初始绑定选项
  requestDependencies?: ModelRequestDependencies; // 请求期依赖（鉴权来源）
}

function defaultDebugDir(env: EnvRecord): string {
  const dataRoot = resolveKnorviaDataRoot(env);
  const subdir = env.KNORVIA_RUNTIME_ENV === "development" ? "debug" : "rollout";
  return join(dataRoot, "cli", subdir);
}

function composeSinks(first: ModelStatusSink, second: ModelStatusSink): ModelStatusSink {
  // 组合接收端只转发普通 publish（历史兼容限制：不转发 publishFailure 等扩展口）
  const forward = (event: Parameters<ModelStatusSink["publish"]>[0]) =>
    Promise.allSettled([first.publish(event), second.publish(event)]).then(() => undefined);
  return { publish: forward };
}

function pickAccountAccess(providerConfig: RegistryProviderConfig) {
  const providerRecord = providerConfig as unknown as Record<string, unknown>;
  const accessRecord = providerRecord.access as Record<string, unknown> | undefined;
  const zhipuShaped = accessRecord?.type === "zhipu-account";
  return zhipuShaped ? (accessRecord as ResolvedAiSdkModel["accountAccess"]) : undefined;
}

function bindProvider(
  execution: AiSdkModelExecution,
  assembly: CreateAiSdkModelOptions,
  properties: RegistryModelConfig["properties"],
  optionSpecs: RegistryModelConfig["optionSpecs"],
) {
  const bound = execution.bindModel({
    providerId: assembly.providerId, // 身份：provider
    modelId: assembly.modelId, // 身份：模型
    providerConfig: assembly.providerConfig, // provider 注册配置
    supportsJsonSchemaOutput: properties.supportsJsonSchemaOutput, // 结构化输出能力
    optionSpecs, // 选项映射规格
  });
  return { bound, accountAccess: pickAccountAccess(assembly.providerConfig) };
}

// 逻辑请求缺省时从调用上下文回填的字段（null/undefined 都回落，等价 ?? 语义）
const INVOCATION_FALLBACKS = [
  "statusSink",
  "traceContext",
  "modelCall",
  "modelRequestSessionType",
  "modelRetryBudget",
  "modelRequestAdmission",
  "streamIdleTimeoutRetryNumber",
  "preserveProviderStreamBoundaries",
] as const;

function mergeInvocation(
  call: AiSdkModelTextRequest,
  messages: AiSdkModelTextRequest["messages"],
): AiSdkModelTextRequest {
  const ambient = getCurrentModelInvocationContext();
  const next: AiSdkModelTextRequest = {
    ...call,
    metadata: { ...ambient?.metadata, ...call.metadata }, // 请求值覆盖上下文值
    messages, // 已归一的 reasoning 历史
  };
  const bag = next as unknown as Record<string, unknown>;
  const source = ambient as unknown as Record<string, unknown> | undefined;
  for (const key of INVOCATION_FALLBACKS) {
    if (bag[key] == null && source) bag[key] = source[key];
  }
  return next;
}

function wireAuthRefresh(
  next: AiSdkModelTextRequest,
  dependencies: ModelRequestDependencies | undefined,
  accountAccess: ResolvedAiSdkModel["accountAccess"],
): void {
  const ambient = getCurrentModelInvocationContext();
  const externalRefresh =
    next.refreshRuntimeHeadersBeforeAttempt ?? ambient?.refreshRuntimeHeadersBeforeAttempt;
  const authSource = dependencies?.requestAuth;
  if (!accountAccess || (!externalRefresh && !authSource)) return;
  next.refreshRuntimeHeadersBeforeAttempt = async (input) => {
    if (externalRefresh) return externalRefresh(input); // 外部刷新优先
    const requestAuth = await authSource?.source?.resolve(input);
    if (!requestAuth) {
      throw new AiSdkModelAdapterError(
        "model_request_auth_missing", // 错误码（协议面）
        "Model request authentication is missing", // 对外可见文案
        { context: { reason: "auth_failed", retryable: false, source: "runtime" } },
      );
    }
    return { headersApplied: true, requestAuth }; // 刷新成功即刻带鉴权重解析
  };
}

function bindOptions(
  call: AiSdkModelTextRequest,
  optionSpecs: RegistryModelConfig["optionSpecs"],
): Required<ModelOptions> {
  return {
    reasoningLevel:
      (call.providerOptions?.reasoningLevel as string) ?? optionSpecs.reasoningLevel.values[0],
    maxOutputTokens: call.maxOutputTokens ?? optionSpecs.maxOutputTokens.max,
  };
}

function assembleCall(request: ModelExecutionRequest): AiSdkModelTextRequest {
  return {
    ...request,
    maxOutputTokens: request.options.maxOutputTokens, // 选项映射回请求
    providerOptions: { reasoningLevel: request.options.reasoningLevel }, // reasoning 档位
  };
}

interface RunnerHooks {
  debugDir?: string; // 调试/rollout 目录
  env: EnvRecord; // 环境变量表
  logger?: Logger; // 诊断日志口
  retry: ReturnType<typeof resolveAiSdkModelRetryOptions>; // 重试参数
  runtime: AiSdkModelRuntime; // 运行时端口
  statusSink?: ModelStatusSink; // 适配器级接收端
  fullRetention: boolean; // 全量保留开关
}

function commonHooks(hooks: RunnerHooks) {
  return {
    debugDir: hooks.debugDir,
    env: hooks.env,
    logger: hooks.logger,
    retry: hooks.retry,
    runtime: hooks.runtime,
    statusSink: hooks.statusSink,
    modelIoFullRetentionEnabled: hooks.fullRetention,
  };
}

export class AiSdkModelAdapter {
  private readonly env: EnvRecord; // 环境变量表
  private readonly debugDir?: string; // 调试/rollout 目录
  private readonly logger?: Logger; // 诊断日志口
  private readonly retry; // 解析后的重试参数
  private readonly runtime; // 运行时端口
  private readonly execution; // provider 绑定与请求解析
  private statusSink?: ModelStatusSink; // 适配器级接收端（可追加）
  private readonly streamIdleTimeoutMs: number; // 空闲超时基础额度
  private fullRetention: boolean; // 全量保留开关（可切换）

  constructor(settings: AiSdkModelAdapterOptions) {
    this.env = settings.env ?? {}; // 缺省空环境（数据根回落到家目录）
    this.debugDir = settings.debugDir ?? defaultDebugDir(this.env); // 显式目录优先
    this.logger = settings.logger; // 诊断口（可缺省）
    this.retry = resolveAiSdkModelRetryOptions(settings.retry, this.env); // options 优先于 env
    this.runtime = settings.runtime ?? defaultRuntime; // 注入端口或 AI SDK 直通
    this.statusSink = settings.statusSink; // 初始接收端（addStatusSink 可叠加）
    this.streamIdleTimeoutMs = settings.streamIdleTimeoutMs ?? 90_000; // 基础额度 90 秒
    this.fullRetention = settings.modelIoFullRetentionEnabled ?? false; // 默认不做全量保留
    const executionConfig = {
      defaultHeaders: settings.defaultHeaders,
      env: this.env,
      network: settings.network,
    };
    this.execution = new AiSdkModelExecution(executionConfig, { logger: settings.logger });
  }

  setModelIoFullRetentionEnabled(flag: boolean): void {
    this.fullRetention = flag; // 运行期可切换
  }

  addStatusSink(target: ModelStatusSink): void {
    const first = this.statusSink;
    if (first) {
      this.statusSink = composeSinks(first, target);
      return;
    }
    this.statusSink = target;
  }

  createModel(assembly: CreateAiSdkModelOptions): Model {
    const modelConfig = assembly.modelConfig as unknown as Record<string, unknown>;
    const properties = modelConfig.properties as RegistryModelConfig["properties"]; // 能力表
    const optionSpecs = modelConfig.optionSpecs as RegistryModelConfig["optionSpecs"]; // 选项规格
    const { bound, accountAccess } = bindProvider(
      this.execution,
      assembly,
      properties,
      optionSpecs,
    );
    const project = (resolved: AiSdkResolvedModel): ResolvedAiSdkModel => ({
      ...resolved,
      properties, // 能力表随解析结果下发
      accountAccess, // zhipu-account 访问信息
    });
    const makeRequest = (
      call: AiSdkModelTextRequest,
    ): {
      request: AiSdkModelTextRequest;
      resolveModel: () => ResolvedAiSdkModel;
      resolved: ResolvedAiSdkModel;
    } => {
      const messages = normalizeReasoningHistory(call.messages, {
        providerId: assembly.providerId as never,
        modelId: assembly.modelId as never,
      });
      const next = mergeInvocation(call, messages);
      wireAuthRefresh(next, assembly.requestDependencies, accountAccess);
      const initial = project(bound.resolveRequest({ options: bindOptions(call, optionSpecs) }));
      const resolveModel = () =>
        project(
          bound.resolveRequest({
            options: bindOptions(call, optionSpecs),
            requestAuth: (next as AiSdkModelTextRequest & { __requestAuth?: ModelRequestAuth })
              .__requestAuth, // 刷新钩子写回的鉴权
          }),
        );
      return { request: next, resolveModel, resolved: initial }; // 惰性重解析随行
    };
    const hooks: RunnerHooks = {
      debugDir: this.debugDir,
      env: this.env,
      logger: this.logger,
      retry: this.retry,
      runtime: this.runtime,
      statusSink: this.statusSink,
      fullRetention: this.fullRetention,
    };
    return createModel({
      providerId: assembly.providerId as never,
      modelId: assembly.modelId as never,
      displayName: assembly.displayName,
      properties,
      optionSpecs,
      options: assembly.options,
      executor: {
        generateText: async (request) =>
          runGenerateText({ ...makeRequest(assembleCall(request)), ...commonHooks(hooks) }),
        streamText: (request) => {
          const prepared = makeRequest(assembleCall(request));
          const idleAllowance =
            this.streamIdleTimeoutMs +
            (prepared.request.streamIdleTimeoutRetryNumber ?? 0) * 30_000;
          return runStreamText({
            ...prepared,
            ...commonHooks(hooks),
            streamIdleTimeoutMs: idleAllowance,
          });
        },
      },
    });
  }
}

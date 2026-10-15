// SPDX-License-Identifier: Apache-2.0
// 生成式请求执行门面：attempt 状态机（准入 → 刷新鉴权 → 解析 → 发起 → 归一 → 记录/排期）。
// 事件与失败处置住在 support/（attempt-events 事件工厂、failure-disposition 决策内核）。
// B51 全序列断言与错误阶段语义逐字保持。

import type { Logger, ModelStatusSink, ModelTextResult } from "@knorvia/contracts";
import type { EnvRecord } from "./model-execution.js";
import { detectProviderBusinessFinishError } from "./provider-finish-business-error.js";
import type { ResolvedAiSdkModelRetryOptions } from "./retry-policy.js";
import type {
  AiSdkGenerateTextOptions,
  AiSdkGenerateTextResult,
  AiSdkModelTextRequest,
  AiSdkModelRuntime,
  ResolvedAiSdkModel,
} from "./runner-runtime.js";
import { createGenerateTextOptions } from "./runner-options.js";
import {
  normalizeReasoning,
  normalizeSources,
  normalizeToolCalls,
  normalizeToolResults,
  normalizeUsage,
} from "./runner-normalization.js";
import { classifyModelFailure } from "./failure-classifier.js";
import { admitAttempt } from "./request-admission.js";
import {
  createAttemptStatusContext,
  createStatusContext,
  publishModelStatus,
  admissionWaitPublishers,
} from "./runner-status.js";
import { sleep, toAdapterError } from "./runner-retry.js";
import { retryBudgetMaxAttempts } from "./retry-budget.js";
import {
  recordGenerateTextDebug,
  shouldRecordModelIO,
  isDevelopmentModelIOEnv,
} from "./runner-debug.js";
import { isZeroOutputModelCompletion } from "./runner-diagnostics.js";
import { canRetryEmptyCompletion, scheduleEmptyCompletionRetry } from "./empty-completion-retry.js";
import { resolveAnthropicRequestMetadataUserId } from "./anthropic-request-metadata.js";
import {
  completedEvent,
  emptyCompletionFailedEvent,
  failedEvent,
  retryScheduledEvent,
  startedEvent,
} from "./support/attempt-events.js";
import { decideFailureDisposition } from "./support/failure-disposition.js";

const ABORT_LISTENER_OPTIONS = { once: true };

async function abortable<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return task;
  if (signal.aborted) throw signal.reason; // 已取消立即按原因抛出
  const abandoned = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), ABORT_LISTENER_OPTIONS);
  });
  return Promise.race([task, abandoned]);
}

const STRUCTURED_MISSING = "Structured model output is missing";
const STRUCTURED_UNSERIALIZABLE = "Structured model output cannot be serialized";
const EMPTY_COMPLETION_ERROR = "Provider returned an empty completion";

interface NormalizedOutcome {
  normalized: ModelTextResult;
  toolCalls: ModelTextResult["toolCalls"];
  usage: ReturnType<typeof normalizeUsage>;
}

function normalizeOutcome(
  result: AiSdkGenerateTextResult,
  request: AiSdkModelTextRequest,
  resolved: ResolvedAiSdkModel,
  logger?: Logger,
): NormalizedOutcome {
  const flagged = detectProviderBusinessFinishError({
    providerId: resolved.providerId, // 身份：provider
    providerKind: resolved.providerKind, // SDK 种类
    source: result, // 原始结果（finishReason/finish）
  });
  if (flagged) throw flagged; // finishReason 标记的业务失败优先抛出
  const toolCalls = normalizeToolCalls(result, logger);
  const usage = normalizeUsage(result.usage); // 归一用量
  let text = result.text; // 文本（结构化时替换）
  if (request.responseJsonSchema) {
    if (result.output === undefined) throw new Error(STRUCTURED_MISSING);
    try {
      // 结构化输出序列化（失败原样保留 cause）
      text = JSON.stringify(result.output); // 结构化输出序列化为文本
    } catch (error) {
      // 序列化失败保留 cause
      throw new Error(STRUCTURED_UNSERIALIZABLE, { cause: error }); // 序列化失败原样保留 cause
    }
  }
  const normalized: ModelTextResult = {
    // 契约层结果（B30 结构锁定）
    text, // 文本（结构化时为序列化 output）
    finishReason: result.finishReason, // 结束原因
    usage, // 归一用量
    reasoning: normalizeReasoning(result.reasoning), // 推理块（空集合→undefined）
    toolCalls, // 归一工具调用
    toolResults: normalizeToolResults(result, toolCalls), // 归一工具结果
    sources: normalizeSources(result), // 出处（空集合→undefined）
    providerMetadata: result.providerMetadata, // provider 侧元数据
  };
  return { normalized, toolCalls, usage };
}

function zeroOutputSignals(
  normalized: ModelTextResult,
  usage: NormalizedOutcome["usage"],
): Parameters<typeof isZeroOutputModelCompletion>[0] {
  return {
    finishReason: normalized.finishReason, // 结束原因
    reasoningLength: normalized.reasoning?.reduce((sum, block) => sum + block.text.length, 0) ?? 0,
    textLength: normalized.text.length, // 文本长度
    toolCallCount: normalized.toolCalls?.length ?? 0, // 工具调用个数
    usage, // 用量
  };
}

interface RunState {
  physicalAttempt: number; // 已用物理序号
  retryBudgetAttempt: number; // 预算计数（offpeak 排期不加）
  emptyRetryCount: number; // 空输出重试计数
}

interface AttemptHarness {
  debugDir?: string; // 调试/rollout 目录
  env: EnvRecord; // 环境变量表
  logger?: Logger; // 诊断日志口
  request: AiSdkModelTextRequest; // 逻辑请求
  resolveModel: () => ResolvedAiSdkModel; // 惰性重解析（刷新后取新头）
  resolved: ResolvedAiSdkModel; // 绑定期解析结果
  retry: ResolvedAiSdkModelRetryOptions; // 重试参数
  runtime: AiSdkModelRuntime; // 运行时端口
  statusSink?: ModelStatusSink; // 适配器级接收端
  modelIoFullRetentionEnabled: boolean; // 全量保留开关
  maxAttempts: number; // 尝试上限（对外换算）
  context: ReturnType<typeof createStatusContext>; // 请求级状态上下文
  state: RunState; // 跨 attempt 计数
}

async function logAttemptDebug(
  harness: AttemptHarness,
  attempt: number,
  startedAt: number,
  resolved: ResolvedAiSdkModel,
  options: AiSdkGenerateTextOptions | undefined,
  result: AiSdkGenerateTextResult | undefined,
  normalizedToolCalls: ModelTextResult["toolCalls"],
  error?: unknown,
): Promise<void> {
  await recordGenerateTextDebug({
    // 诊断留档（环境门内）
    // 每次 attempt 一条 JSONL（B54 形状）
    attempt, // 物理序号
    debugDir: harness.debugDir,
    error, // 本次错误（可缺省）
    isDev: isDevelopmentModelIOEnv(harness.env),
    modelIoFullRetentionEnabled: harness.modelIoFullRetentionEnabled,
    normalizedToolCalls,
    options: options as AiSdkGenerateTextOptions,
    recordModelIO: shouldRecordModelIO(harness.env),
    request: harness.request,
    requestId: createAttemptStatusContext(harness.context, attempt).requestId,
    resolved, // 解析结果（身份来源）
    result, // SDK 结果（可缺省）
    startedAt, // 起始时刻
  });
}

function sinks(harness: AttemptHarness, admissionTicket?: ModelStatusSink) {
  return {
    admissionTicket,
    logger: harness.logger,
    requestStatusSink: harness.request.statusSink,
    statusSink: harness.statusSink,
  };
}

async function acquireAdmission(
  harness: AttemptHarness,
  attempt: number,
  attemptContext: ReturnType<typeof createAttemptStatusContext>,
  wait: { onQueued: () => Promise<void>; onAdmitted: (queuedMs: number) => Promise<void> },
) {
  try {
    return await admitAttempt({
      admission: harness.request.modelRequestAdmission,
      model: harness.resolved,
      signal: harness.request.abortSignal,
      ...wait, // 排队/准入通知
    });
  } catch (error) {
    // 准入失败：分类后按 connect 阶段包装
    throw toAdapterError(
      error,
      classifyModelFailure(error, harness.request.abortSignal),
      attemptContext,
      attempt,
      { errorPhase: "connect" }, // 准入失败按 connect 阶段
    );
  }
}

// 单次 attempt：成功返回归一结果；空输出/排期重试返回 undefined（主循环继续）；失败抛出
async function runOneAttempt(
  harness: AttemptHarness,
  attempt: number,
): Promise<ModelTextResult | undefined> {
  const attemptContext = createAttemptStatusContext(harness.context, attempt);
  const wait = admissionWaitPublishers(attemptContext, attempt, {
    // 排队/准入通知口
    logger: harness.logger,
    requestStatusSink: harness.request.statusSink,
    statusSink: harness.statusSink,
  }); // 排队/准入事件发布口
  const admission = await acquireAdmission(harness, attempt, attemptContext, wait);
  const startedAt = Date.now(); // 起始时刻（诊断用）
  let startedPublished = false; // 是否已对外发 started
  let result; // SDK 结果
  let resolved = harness.resolved;
  let options: ReturnType<typeof createGenerateTextOptions> | undefined; // SDK 选项（诊断留档用）
  try {
    // 执行主体：刷新 → 解析 → 发起 → 归一
    const refresh = harness.request.refreshRuntimeHeadersBeforeAttempt;
    if (refresh) {
      const refreshed = await refresh({
        accountAccess: harness.resolved.accountAccess, // zhipu-account 访问信息
        attempt, // 物理序号
        reason: "model-request", // 刷新原因（协议面）
        abortSignal: harness.request.abortSignal, // 取消信号
        providerId: harness.resolved.providerId, // 身份：provider
        modelId: harness.resolved.modelId, // 身份：模型
        traceContext: harness.request.traceContext, // 追踪上下文
      });
      Object.assign(harness.request, { __requestAuth: refreshed.requestAuth });
    }
    resolved = harness.resolveModel();
    const anthropicMetadataUserId = await resolveAnthropicRequestMetadataUserId({
      env: harness.env,
      providerKind: resolved.providerKind,
      sessionId: attemptContext.sessionId,
    }); // anthropic user 关联解析
    options = createGenerateTextOptions({
      anthropicMetadataUserId, // anthropic user 关联
      includeModelIO: shouldRecordModelIO(harness.env), // 诊断留档开关
      request: harness.request,
      resolved, // 解析结果（选项映射依据）
      statusContext: attemptContext, // 状态上下文（attempt 级） // 状态上下文（attempt 级）
      env: harness.env,
    });
    await publishModelStatus(
      // 对外可见起点
      startedEvent(attemptContext, attempt, resolved.headers),
      sinks(harness, admission.ticket),
    );
    startedPublished = true; // 之后的失败按已可见序列处理
    result = await abortable(harness.runtime.generateText(options), harness.request.abortSignal);
    const outcome = normalizeOutcome(result, harness.request, resolved, harness.logger);
    const { normalized, toolCalls, usage } = outcome;
    const zeroAndRetryable =
      isZeroOutputModelCompletion(zeroOutputSignals(normalized, usage)) &&
      canRetryEmptyCompletion({
        abortSignal: harness.request.abortSignal,
        attempt: harness.state.retryBudgetAttempt,
        maxAttempts: harness.maxAttempts,
        retryCount: harness.state.emptyRetryCount,
      }); // 空输出重试的预算与次数限制
    if (zeroAndRetryable) {
      await logAttemptDebug(
        harness,
        attempt,
        startedAt,
        resolved,
        options,
        result,
        toolCalls,
        new Error(EMPTY_COMPLETION_ERROR), // 空输出诊断标记
      );
      await publishModelStatus(
        emptyCompletionFailedEvent(attemptContext, attempt, startedAt),
        sinks(harness, admission.ticket),
      );
      admission.release();
      await scheduleEmptyCompletionRetry({
        abortSignal: harness.request.abortSignal,
        attempt,
        completedAt: Date.now(),
        errorPhase: "response",
        logger: harness.logger,
        requestHeaders: resolved.headers ?? {},
        requestStatusSink: harness.request.statusSink,
        responseHeaders: {},
        retry: harness.retry,
        retryBudgetAttempt: harness.state.retryBudgetAttempt,
        startedAt,
        statusContext: attemptContext, // 状态上下文（attempt 级） // 状态上下文（attempt 级）
        statusSink: harness.statusSink,
      });
      harness.state.emptyRetryCount += 1;
      harness.state.retryBudgetAttempt += 1;
      return undefined;
    }
    await publishModelStatus(
      // 成功完成序列
      completedEvent(attemptContext, attempt, startedAt, normalized.finishReason, usage),
      sinks(harness, admission.ticket),
    );
    admission.release();
    await logAttemptDebug(harness, attempt, startedAt, resolved, options, result, toolCalls); // 成功记录
    return normalized;
  } catch (error) {
    const disposition = decideFailureDisposition({
      error,
      startedPublished,
      request: harness.request,
      resolved,
      retry: harness.retry,
      retryBudgetAttempt: harness.state.retryBudgetAttempt,
      maxAttempts: harness.maxAttempts,
    });
    if (disposition.kind === "propagate") throw disposition.error;
    if (options) {
      await logAttemptDebug(harness, attempt, startedAt, resolved, options, result, [], error);
    }
    const { failure, plannedRetry } = disposition as {
      failure: ReturnType<typeof classifyModelFailure>;
      plannedRetry: boolean;
    };
    await publishModelStatus(
      failedEvent(attemptContext, attempt, startedAt, {
        reason: failure.reason,
        retryable: plannedRetry,
        message: failure.message,
        statusCode: failure.statusCode,
        code: failure.code,
        retryAfterMs: failure.retryAfterMs,
      }),
      { ...sinks(harness, admission.ticket), failureError: error },
    );
    if (disposition.kind === "rethrow") {
      const thrown = disposition.rewriteMessage
        ? new Error(disposition.rewriteMessage, { cause: error })
        : error;
      throw toAdapterError(thrown, failure, attemptContext, attempt, {
        errorPhase: "response", // 执行失败按 response 阶段
      });
    }
    admission.release();
    await publishModelStatus(
      retryScheduledEvent(
        attemptContext,
        attempt,
        disposition.delayMs,
        disposition.retryReason,
        failure.message,
      ),
      sinks(harness),
    );
    await sleep(disposition.delayMs, harness.request.abortSignal);
    if (disposition.chargeBudget) harness.state.retryBudgetAttempt += 1;
    return undefined;
  } finally {
    admission.release();
  }
}

interface GenerateRunInput {
  debugDir?: string; // 调试/rollout 目录
  env: EnvRecord; // 环境变量表
  logger?: Logger; // 诊断日志口
  request: AiSdkModelTextRequest; // 逻辑请求
  resolveModel: () => ResolvedAiSdkModel; // 惰性重解析
  resolved: ResolvedAiSdkModel; // 绑定期解析结果
  retry: ResolvedAiSdkModelRetryOptions; // 重试参数
  runtime: AiSdkModelRuntime; // 运行时端口
  statusSink?: ModelStatusSink; // 适配器级接收端
  modelIoFullRetentionEnabled: boolean; // 全量保留开关
}

export async function runGenerateText(input: GenerateRunInput): Promise<ModelTextResult> {
  const maxAttempts = input.retry.maxAttempts;
  const context = createStatusContext({
    maxAttempts: retryBudgetMaxAttempts(input.request.modelRetryBudget, maxAttempts),
    request: input.request,
    resolved: input.resolved,
    transport: "http",
  });
  const state: RunState = { physicalAttempt: 0, retryBudgetAttempt: 1, emptyRetryCount: 0 };
  const harness: AttemptHarness = { ...input, maxAttempts, context, state };
  for (;;) {
    const attempt = ++state.physicalAttempt;
    const outcome = await runOneAttempt(harness, attempt);
    if (outcome) return outcome;
  }
}

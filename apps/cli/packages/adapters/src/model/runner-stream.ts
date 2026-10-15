// SPDX-License-Identifier: Apache-2.0
// 流式请求执行门面：attempt 状态机（准入 → 刷新 → 发起 → 逐 chunk 组装/缓存前奏 → 归一 → 记录/排期）。
// 事件字面量与失败处置住在 support/（attempt-events、failure-disposition）；chunk 归一拆 StreamAssembly
// 内核（返回待发事件数组，循环按序 yield 保持时序）。B52 全序列断言与边界语义逐字保持。

import type { ModelStreamEvent } from "@knorvia/contracts";
import type { AiSdkModelRuntime, RunStreamTextInput } from "./runner-runtime.js";
import { createStreamTextOptions } from "./runner-options.js";
import { toModelStreamEvent } from "./runner-normalization.js";
import { StreamingToolCallAssembler } from "./streaming-tool-call-assembler.js";
import { isRetrySafePreludeStreamEvent } from "./stream-retry-boundary.js";
import {
  createLinkedAbortController,
  readNextWithStreamIdleTimeout,
} from "./stream-idle-timeout.js";
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
  recordStreamTextDebug,
  shouldRecordModelIO,
  isDevelopmentModelIOEnv,
} from "./runner-debug.js";
import { canRetryEmptyCompletion, scheduleEmptyCompletionRetry } from "./empty-completion-retry.js";
import { isZeroOutputModelCompletion } from "./runner-diagnostics.js";
import { detectProviderBusinessFinishError } from "./provider-finish-business-error.js";
import { resolveAnthropicRequestMetadataUserId } from "./anthropic-request-metadata.js";
import {
  retryScheduledEvent,
  startedEvent,
  streamCompletedEvent,
  streamEmptyFailedEvent,
  streamFailedEvent,
  streamStalledEvent,
} from "./support/attempt-events.js";
import { decideFailureDisposition } from "./support/failure-disposition.js";

const EMPTY_COMPLETION_ERROR = "Provider returned an empty completion";
const INFERRED_BOUNDARY = "inferred_content_block_stop";

interface StreamAssembly {
  prelude: ModelStreamEvent[]; // 未对外可见前的安全前奏（可整体重放）
  visible: boolean; // 是否已有对外可见输出
  committed: boolean; // 是否已提交（compact 边界语义）
  replayBoundary: boolean; // 是否已回放边界
  textLength: number; // 文本累计
  reasoningLength: number; // 推理累计
  firstContentAt: number | undefined; // 首个可见内容时刻
}

function takePrelude(assembly: StreamAssembly): ModelStreamEvent[] {
  return assembly.prelude.splice(0);
}

function ingestNormalized(
  assembly: StreamAssembly,
  normalized: ModelStreamEvent,
  preserveBoundaries: boolean,
): ModelStreamEvent[] {
  const safe = isRetrySafePreludeStreamEvent(normalized);
  if (safe && !assembly.visible && !assembly.replayBoundary) {
    assembly.prelude.push(normalized); // 前奏缓存（不发）
    return [];
  }
  const emitted = takePrelude(assembly);
  const chunkKind = normalized.type;
  if (chunkKind === "text_delta" && normalized.text) {
    // 文本增量计长
    assembly.textLength += normalized.text.length;
    assembly.visible = true;
  } else if (chunkKind === "reasoning_delta" && normalized.text) {
    // 推理增量计长
    assembly.reasoningLength += normalized.text.length;
    assembly.visible = true;
  } else if (chunkKind === "tool_call") {
    // 工具调用即可见
    assembly.visible = true;
    if (preserveBoundaries && !assembly.committed) {
      assembly.committed = true;
      emitted.push({ type: "compact_stream_boundary", boundary: INFERRED_BOUNDARY }); // 推断边界
    }
  }
  if (assembly.visible) assembly.firstContentAt ??= Date.now();
  emitted.push(normalized);
  return emitted;
}

function ingestRawBoundary(
  assembly: StreamAssembly,
  rawValue: Record<string, unknown> | undefined,
): ModelStreamEvent[] {
  const emitted: ModelStreamEvent[] = [];
  if (rawValue?.type === "ping") return emitted; // ping 不触发边界语义
  if (!assembly.replayBoundary) {
    assembly.replayBoundary = true;
    emitted.push(...takePrelude(assembly)); // 前奏在此回放
  }
  const boundary = rawValue && isRetrySafePreludeStreamEvent.toCompactStreamBoundary(rawValue);
  if (boundary) emitted.push(boundary); // provider 边界帧
  if (rawValue?.type === "content_block_stop") assembly.committed = true;
  return emitted;
}

type StreamOutput = AsyncGenerator<ModelStreamEvent>;

export async function* runStreamText(input: RunStreamTextInput): StreamOutput {
  // 流式主入口（B52 全序列）：attempt 内边收边发，前奏缓存保证可整体重放（B52）
  const maxAttempts = input.retry.maxAttempts; // 尝试上限
  const statusInput: Parameters<typeof createStatusContext>[0] = {
    maxAttempts: retryBudgetMaxAttempts(input.request.modelRetryBudget, maxAttempts), // 预算换算
    request: input.request, // 逻辑请求
    resolved: input.resolved, // 绑定期解析结果
    transport: "sse", // 流式传输形态
  };
  const context = createStatusContext(statusInput);
  let physicalAttempt = 0; // 物理序号
  let retryBudgetAttempt = 1; // 预算计数
  let emptyRetryCount = 0; // 空输出重试计数
  while (true) {
    const attempt = ++physicalAttempt; // 物理序号自增
    const attemptContext = createAttemptStatusContext(context, attempt); // attempt 级上下文
    const waitTargets = {
      logger: input.logger, // 诊断日志口
      requestStatusSink: input.request.statusSink, // 请求级接收端
      statusSink: input.statusSink, // 适配器级接收端
    };
    const wait = admissionWaitPublishers(attemptContext, attempt, waitTargets); // 排队/准入通知口
    const admitInput = {
      // 准入（失败按 connect 阶段，由调用方包装）
      admission: input.request.modelRequestAdmission, // 准入闸
      model: input.resolved, // 绑定期解析结果
      signal: input.request.abortSignal, // 取消信号
      ...wait, // 排队/准入通知
    };
    const admission = await admitAttempt(admitInput);
    const linked = createLinkedAbortController(input.request.abortSignal); // attempt 级取消链
    const startedAt = Date.now(); // 起始时刻（诊断用）
    let startedPublished = false; // 是否已对外发 started
    let attemptHandled = false; // 本次是否已收尾（决定放弃流关闭）
    let iterator: AsyncIterator<unknown> | undefined; // 流迭代器（清理用）
    let result: ReturnType<AiSdkModelRuntime["streamText"]> | undefined; // SDK 流句柄
    let resolved = input.resolved; // 当前解析结果
    let options: ReturnType<typeof createStreamTextOptions> | undefined; // SDK 选项
    let errorChunkObserved = false; // 是否见过 error chunk（重试许可判定）
    let finishEvent: Extract<ModelStreamEvent, { type: "finish" }> | undefined; // 终局事件（缓存）
    const assembly: StreamAssembly = {
      prelude: [],
      visible: false,
      committed: false,
      replayBoundary: false,
      textLength: 0,
      reasoningLength: 0,
      firstContentAt: undefined,
    };
    const assembler = new StreamingToolCallAssembler({ logger: input.logger }); // 工具调用组装器
    const targets = {
      // 事件投递目标（票据 + 三级接收端）
      admissionTicket: admission.ticket, // 票据接收端
      logger: input.logger, // 诊断日志口
      requestStatusSink: input.request.statusSink, // 请求级接收端
      statusSink: input.statusSink, // 适配器级接收端
    } as const;
    const writeDebug = (error?: unknown): Promise<void> => {
      // 每次 attempt 一条 JSONL（B54 形状；无选项即未发起，不记）
      if (!options) return Promise.resolve();
      return recordStreamTextDebug({
        // 诊断留档（环境门内）
        attempt, // 物理序号
        debugDir: input.debugDir, // 调试/rollout 目录
        error, // 本次错误（可缺省）
        isDev: isDevelopmentModelIOEnv(input.env), // 开发环境标记
        modelIoFullRetentionEnabled: input.modelIoFullRetentionEnabled, // 全量保留开关
        normalizedToolCalls: assembler.snapshotNormalizedToolCalls(), // 归一后的工具调用
        options, // SDK 选项（wire 副本来源）
        recordModelIO: shouldRecordModelIO(input.env), // 环境门
        request: input.request, // 逻辑请求（canonical 来源）
        requestId: attemptContext.requestId, // 物理请求 id
        resolved, // 解析结果（身份来源）
        result, // SDK 流结果（可缺省）
        startedAt, // 起始时刻
      });
    };
    try {
      const refresh = input.request.refreshRuntimeHeadersBeforeAttempt;
      if (refresh) {
        const refreshed = await refresh({
          accountAccess: input.resolved.accountAccess, // zhipu-account 访问信息
          attempt, // 物理序号
          reason: "model-request", // 刷新原因（协议面）
          abortSignal: linked.signal, // 链接信号（attempt 级取消）
          providerId: input.resolved.providerId, // 身份：provider
          modelId: input.resolved.modelId, // 身份：模型
          traceContext: input.request.traceContext, // 追踪上下文
        });
        Object.assign(input.request, { __requestAuth: refreshed.requestAuth }); // 写回鉴权
      }
      resolved = input.resolveModel(); // 刷新后重解析
      const anthropicSpec = {
        // anthropic user 关联解析入参
        env: input.env, // 环境变量表
        providerKind: resolved.providerKind, // SDK 种类
        sessionId: attemptContext.sessionId, // 会话 id
      };
      const anthropicMetadataUserId = await resolveAnthropicRequestMetadataUserId(anthropicSpec);
      const optionSpec = {
        anthropicMetadataUserId, // anthropic user 关联
        includeModelIO: shouldRecordModelIO(input.env), // 诊断留档开关
        request: { ...input.request, abortSignal: linked.signal }, // 带链接信号的请求
        resolved, // 解析结果
        statusContext: attemptContext, // attempt 级上下文
        env: input.env, // 环境变量表
      };
      options = createStreamTextOptions(optionSpec);
      await publishModelStatus(startedEvent(attemptContext, attempt, resolved.headers), targets);
      startedPublished = true; // 之后的失败按已可见序列处理
      result = input.runtime.streamText(options); // 发起流
      const activeIterator = result.fullStream[Symbol.asyncIterator](); // 流迭代器
      iterator = activeIterator; // 清理用句柄
      while (true) {
        const readOptions: Parameters<typeof readNextWithStreamIdleTimeout>[1] = {
          abortController: linked.controller, // 超时时中止
          timeoutMs: input.streamIdleTimeoutMs, // 空闲超时额度
          onTimeout: async (error) =>
            publishModelStatus(
              streamStalledEvent(
                attemptContext,
                attempt, // 物理序号
                error.idleMs,
                error.timeoutMs,
                error.message,
              ),
              targets, // 投递目标
            ), // 停滞事件
        };
        const next = await readNextWithStreamIdleTimeout(activeIterator, readOptions);
        if (next.done) break; // 流结束
        const raw = next.value as Record<string, unknown>; // 原始 chunk（raw 帧判定用）
        const isRawFrame = input.request.preserveProviderStreamBoundaries && raw.type === "raw";
        if (isRawFrame) {
          const rawValue = raw.rawValue as Record<string, unknown> | undefined; // provider 帧
          for (const boundary of ingestRawBoundary(assembly, rawValue)) yield boundary;
          continue; // raw 帧走边界语义
        }
        const event = toModelStreamEvent(next.value as never); // 归一 chunk
        if (!event) continue; // 未知 chunk 丢弃
        if (event.type === "error") {
          errorChunkObserved = true; // 记录 error chunk（重试许可判定）
          throw event.error; // provider error chunk 直接抛出
        }
        const isFinishFrame = event.type === "finish";
        if (isFinishFrame) {
          const detectFinish = detectProviderBusinessFinishError.detectProviderStreamFinishError;
          const business = detectFinish(resolved, raw, event); // finish 业务失败检查
          if (business) throw business; // finish 标记的业务失败
          finishEvent = event; // 缓存终局事件
          continue; // finish 不进组装器
        }
        for (const normalized of assembler.handle(event)) {
          // 组装器归一后逐个分发
          const emitted = ingestNormalized(
            assembly,
            normalized,
            input.request.preserveProviderStreamBoundaries === true,
          );
          for (const outgoing of emitted) yield outgoing;
        }
      }
      const flushedCalls = assembler.flush(); // 组装器收尾（补发未闭合调用）
      const zeroCompletion = isZeroOutputModelCompletion({
        // 空输出判定入参
        finishReason: finishEvent?.finishReason, // 结束原因（可缺省）
        reasoningLength: assembly.reasoningLength,
        textLength: assembly.textLength,
        toolCallCount: assembler.snapshotNormalizedToolCalls().length, // 工具调用个数
        usage: finishEvent?.usage, // 用量（可缺省）
      });
      const zeroRetry =
        // 非 compact 模式下的空输出重试：预算与次数受限
        !input.request.preserveProviderStreamBoundaries && // 非 compact 模式
        zeroCompletion && // 空输出
        canRetryEmptyCompletion({
          abortSignal: input.request.abortSignal, // 取消信号
          attempt: retryBudgetAttempt, // 预算计数
          maxAttempts, // 尝试上限
          retryCount: emptyRetryCount, // 已用空重试
        }); // 空输出重试的预算与次数限制
      if (zeroRetry) {
        await publishModelStatus(
          streamEmptyFailedEvent(attemptContext, attempt, startedAt),
          targets,
        );
        admission.release();
        await writeDebug(new Error(EMPTY_COMPLETION_ERROR));
        await scheduleEmptyCompletionRetry({
          abortSignal: input.request.abortSignal,
          attempt,
          completedAt: Date.now(), // 完成时刻
          errorPhase: "stream", // 失败阶段
          logger: input.logger, // 诊断日志口
          requestHeaders: input.resolved.headers ?? {},
          requestStatusSink: input.request.statusSink, // 请求级接收端
          responseHeaders: {},
          retry: input.retry,
          retryBudgetAttempt,
          startedAt,
          statusContext: attemptContext,
          statusSink: input.statusSink, // 适配器级接收端
          streamOutputCommitted: false, // 未对外提交
        });
        emptyRetryCount += 1;
        retryBudgetAttempt += 1;
        continue; // 空输出重试：进入下一 attempt
      }
      for (const pending of takePrelude(assembly)) yield pending; // 前奏回放
      for (const event of flushedCalls) {
        assembly.visible = true;
        yield event; // 组装器收尾事件
      }
      if (finishEvent) yield finishEvent; // 终局事件最后发
      if (!input.request.preserveProviderStreamBoundaries) assembly.committed ||= assembly.visible;
      await publishModelStatus(
        streamCompletedEvent(
          attemptContext,
          attempt,
          startedAt,
          finishEvent,
          assembly.firstContentAt,
          assembly.committed,
        ),
        targets,
      );
      attemptHandled = true;
      admission.release();
      await writeDebug();
      return;
    } catch (error) {
      attemptHandled = true;
      const cleanup = () =>
        iterator
          ? isRetrySafePreludeStreamEvent.cleanupStreamAttempt(
              iterator,
              result?.consumeStream.bind(result),
              input.logger,
            )
          : Promise.resolve(); // 未发起：不记档
      const compactRetryAllowed =
        !input.request.preserveProviderStreamBoundaries ||
        isRetrySafePreludeStreamEvent.compactBodyFailureAllowsRetry(error, errorChunkObserved);
      const disposition = decideFailureDisposition({
        error,
        startedPublished,
        request: input.request,
        resolved,
        retry: input.retry,
        retryBudgetAttempt,
        maxAttempts,
        retryGate: !assembly.visible && !assembly.replayBoundary && compactRetryAllowed,
      });
      if (disposition.kind === "propagate") throw disposition.error;
      await cleanup(); // 失败流清理（1 秒上限）
      const { failure, plannedRetry } = disposition as {
        failure: ReturnType<typeof classifyModelFailure>;
        plannedRetry: boolean;
      };
      await publishModelStatus(
        streamFailedEvent(
          attemptContext,
          attempt,
          startedAt,
          {
            reason: failure.reason,
            retryable: plannedRetry,
            message: failure.message,
            statusCode: failure.statusCode,
            code: failure.code,
          },
          assembly.replayBoundary,
        ),
        { ...targets, failureError: error },
      );
      admission.release();
      if (failure.reason !== "cancelled") await writeDebug(error); // 取消不留档
      if (disposition.kind === "rethrow") {
        const thrown = disposition.rewriteMessage
          ? new Error(disposition.rewriteMessage, { cause: error })
          : error;
        throw toAdapterError(thrown, failure, attemptContext, attempt, {
          errorPhase: "stream", // 流式失败阶段
          streamOutputCommitted: assembly.committed,
        });
      }
      await publishModelStatus(
        retryScheduledEvent(
          attemptContext,
          attempt,
          disposition.delayMs,
          disposition.retryReason,
          failure.message,
        ),
        {
          logger: input.logger, // 诊断日志口
          requestStatusSink: input.request.statusSink, // 请求级接收端
          statusSink: input.statusSink, // 适配器级接收端
        },
      );
      await sleep(disposition.delayMs, input.request.abortSignal);
      if (disposition.chargeBudget) retryBudgetAttempt += 1;
    } finally {
      if (input.request.preserveProviderStreamBoundaries && startedPublished && !attemptHandled)
        await isRetrySafePreludeStreamEvent.closeAbandonedCompactStream({
          ...targets,
          abortController: linked.controller,
          attempt,
          committed: assembly.committed,
          consumeStream: result?.consumeStream.bind(result),
          context: attemptContext,
          iterator,
        }); // 消费者提前关闭：中止并补发失败
      linked.controller.abort();
      linked.cleanup();
      admission.release(); // 幂等释放
    }
  }
}

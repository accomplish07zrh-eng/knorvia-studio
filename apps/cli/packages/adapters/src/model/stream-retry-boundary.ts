// SPDX-License-Identifier: Apache-2.0
// 流重试边界：判定「未对外可见可整体重放」的前奏事件；compact 边界映射（provider 帧 → 边界事件）、
// 体失败后的重试许可、失败流的 1 秒上限清理与被放弃流的关闭。日志文案与边界枚举逐字保持。

import type { Logger, ModelStatusSink, ModelStreamEvent } from "@knorvia/contracts";
import {
  getApiCallResponseBody,
  getErrorCode,
  getResponseHeaders,
  getStatusCode,
} from "./failure-inspection.js";
import { isModelStreamIdleTimeoutError } from "./stream-idle-timeout.js";
import { publishModelStatus, type ModelStatusContext } from "./runner-status.js";

const SAFE_TYPES = new Set(
  "start text_start text_end reasoning_start reasoning_end tool_input_start tool_input_delta tool_input_end".split(
    " ",
  ),
);

function checkPrelude(event: ModelStreamEvent): boolean {
  if (SAFE_TYPES.has(event.type)) return true;
  const emptyDelta = event.type === "text_delta" || event.type === "reasoning_delta";
  return emptyDelta ? event.text.length === 0 : false;
}

function boundaryEvent(body: Record<string, unknown>): ModelStreamEvent {
  return body as ModelStreamEvent;
}

function toCompactStreamBoundary(frame: Record<string, unknown>): ModelStreamEvent | undefined {
  const index = typeof frame.index === "number" ? frame.index : null;
  if (frame.type === "message_start") {
    return boundaryEvent({
      type: "compact_stream_boundary", // 边界事件（协议面）
      boundary: "provider_response_start", // provider 响应起点
    });
  }
  if (frame.type === "content_block_start") {
    const block = frame.content_block as Record<string, unknown> | undefined;
    return boundaryEvent({
      type: "compact_stream_boundary", // 边界事件（协议面）
      boundary: "provider_content_block_start", // 内容块开始
      blockType: typeof block?.type === "string" ? block.type : null, // 块类型（可空）
      index, // 块序号（可空）
    });
  }
  if (frame.type === "content_block_delta") {
    const delta = frame.delta as Record<string, unknown> | undefined;
    return boundaryEvent({
      type: "compact_stream_boundary", // 边界事件（协议面）
      boundary: "provider_content_block_delta", // 内容块增量
      deltaType: typeof delta?.type === "string" ? delta.type : null, // 增量类型（可空）
      index, // 块序号（可空）
    });
  }
  if (frame.type === "content_block_stop") {
    return boundaryEvent({
      type: "compact_stream_boundary", // 边界事件（协议面）
      boundary: "provider_content_block_stop", // 内容块结束
      index, // 块序号（可空）
    });
  }
  if (frame.type === "message_delta") {
    const delta = frame.delta as Record<string, unknown> | undefined;
    const present = delta?.stop_reason !== null && delta?.stop_reason !== undefined;
    return boundaryEvent({
      type: "compact_stream_boundary", // 边界事件（协议面）
      boundary: "provider_stop_reason", // 结束原因到达
      present, // 是否给出 stop_reason
    });
  }
  return undefined;
}

function compactBodyFailureAllowsRetry(origin: unknown, errorChunkObserved: boolean): boolean {
  const mediaType = getResponseHeaders(origin)?.["content-type"]?.toLowerCase() ?? "";
  const carriesBody =
    errorChunkObserved ||
    mediaType.includes("text/event-stream") ||
    getApiCallResponseBody(origin) !== undefined;
  if (!carriesBody) return true;
  if (isModelStreamIdleTimeoutError(origin)) return true;
  const token = (getErrorCode(origin) ?? "").toUpperCase();
  const brokenPipe = ["ECONNRESET", "EPIPE", "CONNECTIONCLOSED"].includes(token);
  return getStatusCode(origin) === undefined && brokenPipe;
}

type CleanupJob = Promise<unknown>;

async function cleanupStreamAttempt(
  streamIterator: AsyncIterator<unknown>,
  consume?: () => PromiseLike<unknown>,
  logger?: Logger,
): Promise<void> {
  const tasks: CleanupJob[] = [];
  const returnStep = streamIterator.return?.bind(streamIterator);
  if (returnStep) tasks.push(Promise.resolve().then(() => returnStep())); // 迭代器收尾
  if (consume) tasks.push(Promise.resolve().then(() => consume())); // SDK 流消费收尾
  if (tasks.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const verdict = Promise.allSettled(tasks).then((results) => {
    for (const result of results) {
      const failed = result.status === "rejected";
      if (failed) {
        logger?.warn("Model stream cleanup failed", { error: String(result.reason) }); // 收尾失败仅告警
      }
    }
    return "settled" as const;
  });
  const outcome = await Promise.race([
    verdict,
    new Promise<"timeout">((done) => {
      timer = setTimeout(() => done("timeout"), 1000); // 1 秒上限
    }),
  ]);
  const timedOut = outcome === "timeout";
  if (timer !== undefined) clearTimeout(timer);
  if (timedOut) logger?.warn("Model stream cleanup exceeded 1000ms"); // 超时放弃等待
}

interface AbandonedCloseInput {
  abortController: AbortController; // 中止控制器（以 AbortError 中止）
  admissionTicket?: ModelStatusSink; // 票据接收端
  attempt: number; // 物理序号
  committed: boolean; // 是否已对外提交
  consumeStream?: () => PromiseLike<unknown>; // SDK 流清理口
  context: ModelStatusContext; // 归因上下文
  iterator?: AsyncIterator<unknown>; // 流迭代器
  logger?: Logger; // 诊断日志口
  requestStatusSink?: ModelStatusSink; // 请求级接收端
  statusSink?: ModelStatusSink; // 适配器级接收端
}

async function closeAbandonedCompactStream(call: AbandonedCloseInput): Promise<void> {
  const closed = new DOMException("Model stream consumer closed", "AbortError");
  call.abortController.abort(closed);
  if (call.iterator) await cleanupStreamAttempt(call.iterator, call.consumeStream, call.logger);
  const event = {
    ...call.context,
    type: "model_request_failed", // 失败事件（协议面）
    timestamp: new Date().toISOString(), // 发布时刻
    attempt: call.attempt, // 物理序号
    reason: "cancelled", // 消费者关闭归因
    retryable: false, // 不可重试
    message: closed.message, // DOMException 文案
    errorCode: "model_request_cancelled", // 错误码（协议面）
    streamOutputCommitted: call.committed, // 提交标志透传
  } as never;
  await publishModelStatus(event, { ...call, failureError: closed });
}

export const isRetrySafePreludeStreamEvent = Object.assign(checkPrelude, {
  toCompactStreamBoundary,
  compactBodyFailureAllowsRetry,
  cleanupStreamAttempt,
  closeAbandonedCompactStream,
});

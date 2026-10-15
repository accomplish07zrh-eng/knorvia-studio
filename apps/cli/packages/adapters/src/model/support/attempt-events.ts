// SPDX-License-Identifier: Apache-2.0
// attempt 事件工厂：started/completed/failed/retry-scheduled/空输出失败五类状态事件的字面量构造。
// 事件名、字段名与文案是协议面（B51/B52 全序列断言锁定），逐字保持。

import type { ModelNetworkStatusEvent } from "@knorvia/contracts";
import type { ModelStatusContext } from "./status-contract.js";

type PublishSinkOptions = {
  logger?: unknown;
  requestStatusSink?: unknown;
  statusSink?: unknown;
};

export function startedEvent(
  context: ModelStatusContext,
  attempt: number,
  requestHeaders: Record<string, string> | undefined,
): ModelNetworkStatusEvent {
  return {
    ...context,
    type: "model_request_started", // 开始事件（协议面）
    timestamp: new Date().toISOString(), // 发布时刻
    attempt, // 物理序号
    requestHeaders, // 发起时请求头（已脱敏于发布层）
  } as never;
}

export function completedEvent(
  context: ModelStatusContext,
  attempt: number,
  startedAt: number,
  finishReason: string,
  usage: unknown,
): ModelNetworkStatusEvent {
  return {
    ...context,
    type: "model_request_completed", // 完成事件（协议面）
    timestamp: new Date().toISOString(), // 发布时刻
    attempt, // 物理序号
    durationMs: Date.now() - startedAt, // 本次耗时
    finishReason, // 结束原因
    usage, // 用量
  } as never;
}

export function failedEvent(
  context: ModelStatusContext,
  attempt: number,
  startedAt: number,
  failure: {
    reason: string; // 失败归因
    retryable: boolean; // 是否计划重试
    message: string; // 人类可读消息
    statusCode?: number; // HTTP 状态
    code: string; // 对外错误码
    retryAfterMs?: number; // Retry-After 换算
  },
): ModelNetworkStatusEvent {
  return {
    ...context,
    type: "model_request_failed", // 失败事件（协议面）
    timestamp: new Date().toISOString(), // 发布时刻
    attempt, // 物理序号
    durationMs: Date.now() - startedAt, // 本次耗时
    reason: failure.reason, // 失败归因
    retryable: failure.retryable, // 是否计划重试
    message: failure.message, // 人类可读消息
    statusCode: failure.statusCode, // HTTP 状态（可缺省）
    errorCode: failure.code, // 对外错误码
    retryAfterMs: failure.retryAfterMs, // Retry-After 换算（可缺省）
    errorPhase: "response", // 失败阶段
  } as never;
}

export function emptyCompletionFailedEvent(
  context: ModelStatusContext,
  attempt: number,
  startedAt: number,
): ModelNetworkStatusEvent {
  return {
    ...context,
    type: "model_request_failed", // 失败事件（协议面）
    timestamp: new Date().toISOString(), // 发布时刻
    attempt, // 物理序号
    durationMs: Date.now() - startedAt, // 本次耗时
    reason: "stale_connection", // 空输出按陈旧连接归因
    retryable: true, // 空输出可重试
    message: "Provider returned an empty completion", // 对外可见文案
    errorCode: "model_request_failed", // 对外错误码
    errorPhase: "response", // 失败阶段
  } as never;
}

export function retryScheduledEvent(
  context: ModelStatusContext,
  attempt: number,
  delayMs: number,
  reason: string,
  message: string,
): ModelNetworkStatusEvent {
  return {
    ...context,
    type: "model_retry_scheduled", // 重试排期事件（协议面）
    timestamp: new Date().toISOString(), // 发布时刻
    attempt, // 物理序号
    delayMs, // 排期延迟
    nextAttempt: attempt + 1, // 下一物理序号
    reason, // 重试原因
    message, // 人类可读消息
  } as never;
}

// ---------- 流式专属事件（B52 序列） ----------

export function streamStalledEvent(
  context: ModelStatusContext,
  attempt: number,
  idleMs: number,
  timeoutMs: number,
  message: string,
): ModelNetworkStatusEvent {
  return {
    ...context,
    type: "model_stream_stalled", // 流停滞事件（协议面）
    timestamp: new Date().toISOString(), // 发布时刻
    attempt, // 物理序号
    idleMs, // 实际空闲时长
    timeoutMs, // 超时额度
    message, // 人类可读消息
  } as never;
}

export function streamEmptyFailedEvent(
  context: ModelStatusContext,
  attempt: number,
  startedAt: number,
): ModelNetworkStatusEvent {
  return {
    ...context,
    type: "model_request_failed", // 失败事件（协议面）
    timestamp: new Date().toISOString(), // 发布时刻
    attempt, // 物理序号
    durationMs: Date.now() - startedAt, // 本次耗时
    reason: "stale_connection", // 空输出按陈旧连接归因
    retryable: true, // 空输出可重试
    message: "Provider returned an empty completion", // 对外可见文案
    errorCode: "model_request_failed", // 对外错误码
    errorPhase: "stream", // 失败阶段
    streamOutputCommitted: false, // 未对外提交
  } as never;
}

export function streamFailedEvent(
  context: ModelStatusContext,
  attempt: number,
  startedAt: number,
  failure: {
    reason: string; // 失败归因
    retryable: boolean; // 是否计划重试
    message: string; // 人类可读消息
    statusCode?: number; // HTTP 状态
    code: string; // 对外错误码
  },
  replayBoundary: boolean, // 是否已回放边界（对外可见）
): ModelNetworkStatusEvent {
  return {
    ...context,
    type: "model_request_failed", // 失败事件（协议面）
    timestamp: new Date().toISOString(), // 发布时刻
    attempt, // 物理序号
    durationMs: Date.now() - startedAt, // 本次耗时
    reason: failure.reason, // 失败归因
    retryable: failure.retryable, // 是否计划重试
    message: failure.message, // 人类可读消息
    statusCode: failure.statusCode, // HTTP 状态（可缺省）
    errorCode: failure.code, // 对外错误码
    streamOutputCommitted: replayBoundary, // 提交标志（边界回放即已提交）
  } as never;
}

export function streamCompletedEvent(
  context: ModelStatusContext,
  attempt: number,
  startedAt: number,
  finishEvent: { finishReason: string; usage?: unknown } | undefined,
  firstContentAt: number | undefined,
  committed: boolean,
): ModelNetworkStatusEvent {
  return {
    ...context,
    type: "model_request_completed", // 完成事件（协议面）
    timestamp: new Date().toISOString(), // 发布时刻
    attempt, // 物理序号
    durationMs: Date.now() - startedAt, // 本次耗时
    // 修复对话底部 tok/s 恒为「—」、步数与缓存不随请求更新：流式路径此前不上报用量与首内容耗时，
    // 会话调试统计（session-debug）因此无法计算生成速度。与非流式路径（runner-generate）保持一致。
    ...(finishEvent ? { finishReason: finishEvent.finishReason, usage: finishEvent.usage } : {}),
    ...(firstContentAt !== undefined ? { timeToFirstContentMs: firstContentAt - startedAt } : {}),
    streamOutputCommitted: committed, // 提交标志
  } as never;
}

export type { PublishSinkOptions };

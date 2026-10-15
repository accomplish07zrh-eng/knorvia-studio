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

export type { PublishSinkOptions };

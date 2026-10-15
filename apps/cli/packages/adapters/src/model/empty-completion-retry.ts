// SPDX-License-Identifier: Apache-2.0
// 空补全重试：provider 返回零输出时最多补试一次，先发 model_retry_scheduled 再退避等待。
// 事件字段与文案是协议面，逐字保持。

import type { Logger, ModelStatusSink } from "@knorvia/contracts";
import type { ModelStatusContext } from "./runner-status.js";
import { publishModelStatus } from "./runner-status.js";
import type { ResolvedAiSdkModelRetryOptions } from "./retry-policy.js";
import { calculateRetryDelay, sleep } from "./runner-retry.js";

interface EmptyRetryProbe {
  abortSignal?: AbortSignal; // 已取消则不再补试
  attempt: number; // 当前物理序号
  maxAttempts: number; // 物理尝试上限
  retryCount: number; // 已用的空补全次数（上限 1）
}

interface EmptyRetryPlan {
  abortSignal?: AbortSignal; // 退避等待可被取消
  attempt: number; // 当前物理序号
  completedAt: number; // 零输出完成时刻
  errorPhase: "response" | "stream"; // 失败阶段（协议面）
  logger?: Logger; // 诊断日志口
  requestHeaders: Record<string, string>; // 本次请求头（脱敏后进事件）
  requestStatusSink?: ModelStatusSink; // 请求级状态接收端
  responseHeaders: Record<string, string>; // 本次响应头（脱敏后进事件）
  retry: ResolvedAiSdkModelRetryOptions; // 退避参数
  retryBudgetAttempt: number; // 预算内计数（决定退避档位）
  startedAt: number; // attempt 起始时刻
  statusContext: ModelStatusContext; // 归因上下文
  statusSink?: ModelStatusSink; // 适配器级状态接收端
  streamOutputCommitted?: boolean; // 流式是否已对外提交
}

export function canRetryEmptyCompletion(probe: EmptyRetryProbe): boolean {
  if (probe.abortSignal?.aborted) return false;
  if (probe.attempt >= probe.maxAttempts) return false;
  return probe.retryCount < 1;
}

export async function scheduleEmptyCompletionRetry(plan: EmptyRetryPlan): Promise<void> {
  const delayMs = calculateRetryDelay(plan.retry, plan.retryBudgetAttempt);
  const nextAttempt = plan.attempt + 1;
  const event = {
    ...plan.statusContext,
    type: "model_retry_scheduled", // 事件名（协议面）
    timestamp: new Date().toISOString(), // 发布时刻
    attempt: plan.attempt, // 当前物理序号
    delayMs, // 退避毫秒
    nextAttempt, // 下一物理序号
    reason: "stale_connection", // 空补全归因（协议面）
    message: "Provider returned an empty completion", // 对外可见文案
    requestHeaders: plan.requestHeaders, // 请求头快照
    responseHeaders: plan.responseHeaders, // 响应头快照
  } as never;
  await publishModelStatus(event, {
    logger: plan.logger,
    requestStatusSink: plan.requestStatusSink,
    statusSink: plan.statusSink,
  });
  await sleep(delayMs, plan.abortSignal);
}

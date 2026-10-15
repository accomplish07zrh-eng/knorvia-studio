// SPDX-License-Identifier: Apache-2.0
// 失败处置决策：分类结果 + off-peak 决策 + 重试预算 → 统一处置（原样抛 / 换文案抛 / 排期重试）。
// 决策顺序是 B51/B52 语义（auth 早抛 → 分类 → offpeak → 预算 → 排期），逐字保持。

import type { ClassifiedModelFailure } from "../failure-classifier.js";
import { classifyModelFailure, findProviderBusinessError } from "../failure-classifier.js";
import { retryAllowedByFailurePolicy } from "../workflow-model-failure-policy.js";
import { retryBudgetAllows } from "../retry-budget.js";
import { calculateRetryDelay } from "../runner-retry.js";
import { offPeakTicketExpiredMessage, resolveOffPeakFailureDecision } from "../offpeak-retry.js";
import type { ResolvedAiSdkModelRetryOptions } from "../retry-policy.js";
import { AiSdkModelAdapterError } from "../errors.js";

export type FailureDisposition =
  | {
      kind: "propagate"; // auth 缺失且未对外可见：原样抛出，不发事件不记录
      error: unknown; // 原始错误（保留 cause 链）
    }
  | {
      kind: "rethrow"; // 包装为 adapter 错误抛出
      error: unknown; // 原始错误（保留 cause 链）
      failure: ClassifiedModelFailure; // 分类结果
      plannedRetry: boolean; // 失败事件的 retryable（与实际抛出解耦）
      rewriteMessage?: string; // ticketExpired 时的替换文案
    }
  | {
      kind: "retry"; // 排期重试
      failure: ClassifiedModelFailure; // 分类结果
      plannedRetry: true;
      delayMs: number;
      retryReason: string;
      chargeBudget: boolean; // 非 offpeak 排期才计预算
    };

interface DispositionInput {
  error: unknown; // 原始错误（保留 cause 链）
  startedPublished: boolean; // 是否已对外发 started（决定 auth 例外）
  request: {
    abortSignal?: AbortSignal;
    modelRetryBudget?: unknown;
  };
  resolved: {
    accountAccess?: { mode?: string };
  };
  retry: ResolvedAiSdkModelRetryOptions; // 重试参数（延迟计算依据）
  retryBudgetAttempt: number; // 预算计数
  maxAttempts: number; // 尝试上限
}

export function decideFailureDisposition(input: DispositionInput): FailureDisposition {
  const { error } = input;
  // 鉴权缺失且尚未对外可见：原样抛出（B51 例外分支，不发事件不记录）
  if (
    !input.startedPublished &&
    error instanceof AiSdkModelAdapterError &&
    error.code === "model_request_auth_missing"
  ) {
    return { kind: "propagate", error };
  }
  const failure = classifyModelFailure(error, input.request.abortSignal); // 分类（B26 表）
  const providerCode = findProviderBusinessError(error)?.providerCode;
  const offPeak = resolveOffPeakFailureDecision({
    offPeak: input.resolved.accountAccess?.mode === "off-peak", // off-peak 模式才走排期决策
    failure,
    error,
  });
  const policyAllows = retryAllowedByFailurePolicy(
    failure,
    input.request.modelRetryBudget as never,
    providerCode === undefined ? undefined : `${providerCode}`,
  );
  const budgetAllows = retryBudgetAllows(
    input.request.modelRetryBudget as never,
    input.retryBudgetAttempt,
    input.maxAttempts,
  );
  const canRetry = offPeak?.kind === "queued" || (policyAllows && budgetAllows);
  if (offPeak?.kind === "ticketExpired") {
    // 票过期：换文案抛出（事件已发）
    return {
      // 包装为 adapter 错误抛出
      kind: "rethrow",
      error,
      failure: { ...failure, retryable: false },
      plannedRetry: canRetry, // 失败事件沿用计算值（B51 序列）
      rewriteMessage: offPeakTicketExpiredMessage(failure.message),
    };
  }
  if (!canRetry) return { kind: "rethrow", error, failure, plannedRetry: false };
  const queued = offPeak?.kind === "queued";
  return {
    // 排期重试（延迟与原因见字段）
    kind: "retry",
    failure,
    plannedRetry: true,
    delayMs: queued
      ? (offPeak as { delayMs: number }).delayMs
      : calculateRetryDelay(input.retry, input.retryBudgetAttempt, failure.retryAfterMs),
    retryReason: queued ? "offpeak_queued" : failure.retryReason,
    chargeBudget: !queued,
  };
}

export type { DispositionInput };

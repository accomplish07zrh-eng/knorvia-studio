// SPDX-License-Identifier: Apache-2.0
// 提供商业务错误的识别与转换（B29）。
// 识别：广度优先遍历（WeakSet 防环）找第一个「success === false 或码非 0」的记录，返回
// {message, providerCode?, responseBodySummary?}；码支持数字与字符串（数字取整、0 视为无错），
// 消息两端裁空白；摘要只保留标量与字符串数组字段。转换函数把疑似业务错误对象变成
// ModelError（不可重试）；不命中返回 undefined。识别不抛、幂等、纯计算。
import { CoreErrorType, createCoreError } from "../../deps.js";
import { isPlainRecord } from "../data.js";

export interface ProviderBusinessMetadataFailure {
  message: /* 归一后的业务消息 */ string;
  providerCode?: /* 归一后的业务码 */ string;
  responseBodySummary?: /* 标量 + 字符串数组摘要 */ Record<string, unknown>;
}

// 无消息时的固定兜底文案（逐字冻结）。
const FALLBACK_BUSINESS_MESSAGE = "Provider returned a business error.";

// 业务码归一：数字取整（非有限数丢弃），字符串裁空白（空串丢弃）。
const normalizeProviderCode = (raw: unknown): string | undefined => {
  if (typeof raw === "number" && Number.isFinite(raw)) return String(Math.trunc(raw));
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed ? trimmed : undefined;
};

// 业务消息归一：只认非空字符串，两端裁空白。
const normalizeProviderMessage = (raw: unknown): string | undefined => {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed ? trimmed : undefined;
};

// 业务码的取值顺序：顶层 code/providerCode/error_code → error 子记录同名字段 → context 子记录。
const readProviderCode = (payload: Record<string, unknown>): string | undefined => {
  const nestedError = isPlainRecord(payload.error) ? payload.error : undefined;
  const nestedContext = isPlainRecord(payload.context) ? payload.context : undefined;
  const candidates: unknown[] = [
    payload.code,
    payload.providerCode,
    payload.error_code,
    nestedError?.code,
    nestedError?.providerCode,
    nestedError?.error_code,
    nestedContext?.providerCode,
    nestedContext?.code,
  ];
  return candidates.map(normalizeProviderCode).find((code) => code !== undefined);
};

// 业务消息的取值顺序：顶层 msg/providerMessage/message → error 子记录 → context 子记录。
const readProviderMessage = (payload: Record<string, unknown>): string | undefined => {
  const nestedError = isPlainRecord(payload.error) ? payload.error : undefined;
  const nestedContext = isPlainRecord(payload.context) ? payload.context : undefined;
  const candidates: unknown[] = [
    payload.msg,
    payload.providerMessage,
    payload.message,
    nestedError?.msg,
    nestedError?.providerMessage,
    nestedError?.message,
    nestedContext?.providerMessage,
    nestedContext?.msg,
    nestedContext?.message,
  ];
  return candidates.map(normalizeProviderMessage).find((text) => text !== undefined);
};

// 非零码判定：可解析成数字的按 ≠0，解析不了的非空串视为非零。
const isNonzeroProviderCode = (code: string | undefined): boolean => {
  if (!code) return false;
  const parsed = Number(code);
  return !Number.isFinite(parsed) || parsed !== 0;
};

// 响应摘要：只收标量字段与纯字符串数组字段；一个都收不到就不给摘要。
const summarizeProviderResponse = (
  payload: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const digest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const scalar =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    const stringList = Array.isArray(value) && value.every((item) => typeof item === "string");
    if (value !== undefined && (scalar || stringList)) {
      digest[key] = value;
    }
  }
  return Object.keys(digest).length > 0 ? digest : undefined;
};

// 单条记录的失败判定：success === false 或码非 0 才算业务失败。
const classifyProviderBusinessRecord = (
  entry: Record<string, unknown>,
): ProviderBusinessMetadataFailure | undefined => {
  const resolvedCode = readProviderCode(entry);
  const resolvedMessage = readProviderMessage(entry);
  const flagged = entry.success === false || isNonzeroProviderCode(resolvedCode);
  if (!flagged) return undefined;
  return {
    message: resolvedMessage ?? FALLBACK_BUSINESS_MESSAGE,
    providerCode: resolvedCode,
    responseBodySummary: summarizeProviderResponse(entry),
  };
};

export function findProviderBusinessFailureInMetadata(
  providerMetadata: Record<string, unknown> | undefined,
): ProviderBusinessMetadataFailure | undefined {
  if (!providerMetadata) return undefined;
  const pending: unknown[] = [providerMetadata];
  const visited = new WeakSet<object>();
  while (pending.length > 0) {
    const node = pending.shift();
    if (!node || typeof node !== "object" || visited.has(node)) continue;
    visited.add(node);
    if (Array.isArray(node)) {
      pending.push(...node);
      continue;
    }
    const entry = node as Record<string, unknown>;
    const failure = classifyProviderBusinessRecord(entry);
    if (failure) return failure;
    for (const value of Object.values(entry)) {
      if (value && typeof value === "object") {
        pending.push(value);
      }
    }
  }
  return undefined;
}

export const createCoreErrorFromProviderBusinessLike = (
  error: unknown,
): ReturnType<typeof createCoreError> | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const shape = error as Record<string, unknown>;
  const marked = shape.isProviderBusinessError === true || shape.name === "ProviderBusinessError";
  let failure: ProviderBusinessMetadataFailure | undefined;
  if (marked) {
    failure = classifyProviderBusinessRecord(shape);
  } else {
    const nestedContext = isPlainRecord(shape.context) ? shape.context : undefined;
    if (nestedContext) {
      failure = classifyProviderBusinessRecord({
        ...nestedContext,
        msg: nestedContext.msg ?? nestedContext.providerMessage ?? shape.message,
        message: nestedContext.message ?? shape.message,
        code: nestedContext.providerCode ?? nestedContext.code,
      });
    }
    if (!failure) {
      failure = classifyProviderBusinessRecord(shape);
    }
  }
  if (!failure) return undefined;
  const context = {
    ...(failure.providerCode ? { providerCode: failure.providerCode } : {}),
    ...(failure.responseBodySummary ? { responseBodySummary: failure.responseBodySummary } : {}),
  };
  return createCoreError(CoreErrorType.ModelError, failure.message, {
    context,
    recoverable: true, // 业务失败不阻断恢复流程
    retryable: false, // 不可自动重试
  });
};

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { code, record, text } from "./text.js";

export const ErrorPayloadRole = { Primary: "primary", Wrapper: "wrapper" } as const;
export type ErrorPayloadRole = (typeof ErrorPayloadRole)[keyof typeof ErrorPayloadRole];
export interface Frame {
  data?: Record<string, unknown>;
  original?: string;
  message?: string;
  detail?: string;
  code?: string;
  contextCode?: string;
  retryable?: boolean;
  wrapper: boolean;
}
const CHAIN_LIMIT = 12;
const DETAIL_KEYS = ["detail", "errorDetails", "details"] as const;

function role(value: unknown): ErrorPayloadRole | undefined {
  return value === ErrorPayloadRole.Primary || value === ErrorPayloadRole.Wrapper
    ? value
    : undefined;
}

function capture(node: Record<string, unknown>): Frame {
  const data = record(node.context) ? node.context : undefined;
  const original = text(node.message, "original");
  const message = text(original, "summary");
  const payloadRole = role(node.errorPayloadRole) ?? role(data?.errorPayloadRole);
  const identifier = code(node.providerCode) ?? code(data?.providerCode) ?? code(node.code);
  const contextCode = code(data?.code);
  let detail: string | undefined;
  for (const key of DETAIL_KEYS) {
    detail = text(node[key], "summary");
    if (detail !== undefined) break;
  }
  const retryable = typeof node.retryable === "boolean" ? node.retryable : undefined;
  return {
    data,
    original,
    message,
    detail,
    code: identifier,
    contextCode,
    retryable,
    wrapper: payloadRole === ErrorPayloadRole.Wrapper,
  };
}

export function collect(error: unknown): Frame[] {
  const result: Frame[] = [];
  const visited = new Set<object>();
  let node = error;
  while (result.length < CHAIN_LIMIT && record(node) && !visited.has(node)) {
    visited.add(node);
    result.push(capture(node));
    // nullish 选择只走一个原因；选中非对象时结束，不能改读别的分支。
    node = node.cause ?? node.lastError ?? node.error;
  }
  return result;
}

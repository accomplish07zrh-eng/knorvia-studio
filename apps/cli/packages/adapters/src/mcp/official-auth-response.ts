// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT

import type { McpServerFailureKind } from "@knorvia/shared";

const DIAGNOSTIC_BYTE_LIMIT = 65_536;

export function numericHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function responseRequestId(response: Response): string | undefined {
  return response.headers.get("x-request-id")?.trim() || undefined;
}

async function diagnosticText(response: Response): Promise<string | undefined> {
  const declaredLength = numericHeader(response.headers.get("content-length"));
  if (declaredLength !== undefined && declaredLength > DIAGNOSTIC_BYTE_LIMIT) return undefined;
  const body = response.clone().body;
  if (!body) return undefined;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > DIAGNOSTIC_BYTE_LIMIT) {
        // 保留字节上限的既有语义：等待 clone 分支取消，不添加超时或原分支取消。
        await reader.cancel();
        return undefined;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function objectFields(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function classifyResponse(
  response: Response,
): Promise<McpServerFailureKind | undefined> {
  if (response.status === 429) return "rate_limited";
  if (response.status >= 500) return "server_internal_error";
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) return response.ok ? undefined : "connection_failed";
  const text = await diagnosticText(response);
  if (!text) return response.ok ? undefined : "connection_failed";
  try {
    const payload: unknown = JSON.parse(text);
    if (objectFields(payload)) {
      if (payload.code === 3001) return "server_not_found";
      if (payload.code === 1000) return "server_unavailable";
      if (payload.jsonrpc === "2.0" && payload.error !== undefined) {
        const error = payload.error;
        if (objectFields(error)) {
          if (error.code === 1006) return "not_authenticated";
          if (error.code === 3101) return "coding_plan_required";
        }
        return "protocol_error";
      }
    }
  } catch {
    // JSON 诊断失败采用 HTTP fallback；流读写与释放错误不在这个 catch 内。
  }
  return response.ok ? undefined : "connection_failed";
}

export async function discardResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // 丢弃是尽力清理，但未完成的取消仍须等待，不另设等待预算。
  }
}

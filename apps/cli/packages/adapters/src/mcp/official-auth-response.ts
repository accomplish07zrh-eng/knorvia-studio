// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT

import type { McpServerFailureKind } from "@knorvia/shared";

const DIAGNOSTIC_BYTE_LIMIT = 65_536;

// 官方服务响应诊断约定：
// 一、数值头解析：空串与非有限数一律返回 undefined，调用方按「未知」处理。
// 二、诊断正文只在 content-length 已知且不超上限时读取；未知长度也读，读完再判总量。
// 三、读超上限时取消 clone 分支并放弃诊断，不取消原分支、不加超时（保留既有语义）。
// 四、分类优先级：429 → 限流；≥500 → 服务端内部错误；非 JSON → 连接失败（除非已成功）。
// 五、JSON 诊断里的业务码映射为稳定 failure kind，未识别错误码归为 protocol_error。
// 六、丢弃响应用 cancel()，失败只记噪声不抛出，但必须等待取消完成。
export function numericHeader(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function responseRequestId(reply: Response): string | undefined {
  return reply.headers.get("x-request-id")?.trim() || undefined;
}

async function diagnosticText(reply: Response): Promise<string | undefined> {
  const contentLength = numericHeader(reply.headers.get("content-length"));
  if (contentLength !== undefined && contentLength > DIAGNOSTIC_BYTE_LIMIT) return undefined;
  const body = reply.clone().body;
  if (!body) return undefined;
  const cursor = body.getReader();
  const decoder = new TextDecoder();
  let consumed = 0;
  let bodyText = "";
  try {
    while (true) {
      const { done, value: raw } = await cursor.read();
      if (done) break;
      consumed += raw.byteLength;
      if (consumed > DIAGNOSTIC_BYTE_LIMIT) {
        // 保留字节上限的既有语义：等待 clone 分支取消，不添加超时或原分支取消。
        await cursor.cancel();
        return undefined;
      }
      bodyText += decoder.decode(raw, { stream: true });
    }
    return bodyText + decoder.decode();
  } finally {
    cursor.releaseLock();
  }
}

function objectFields(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw);
}

export async function classifyResponse(reply: Response): Promise<McpServerFailureKind | undefined> {
  if (reply.status === 429) return "rate_limited";
  if (reply.status >= 500) return "server_internal_error";
  const contentType = reply.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) return reply.ok ? undefined : "connection_failed";
  const bodyText = await diagnosticText(reply);
  if (!bodyText) return reply.ok ? undefined : "connection_failed";
  try {
    const document: unknown = JSON.parse(bodyText);
    if (objectFields(document)) {
      if (document.code === 3001) return "server_not_found";
      if (document.code === 1000) return "server_unavailable";
      if (document.jsonrpc === "2.0" && document.error !== undefined) {
        const error = document.error;
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
  return reply.ok ? undefined : "connection_failed";
}

export async function discardResponse(reply: Response): Promise<void> {
  try {
    await reply.body?.cancel();
  } catch {
    // 丢弃是尽力清理，但未完成的取消仍须等待，不另设等待预算。
  }
}

// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT
//
// 官方服务的响应诊断：从一次失败响应里推出稳定的 failure kind。
//
// 约定（逐条都别改，都是可观测行为）：
// 一、数值头解析：空串与非有限数一律 undefined，调用方按「未知」处理；
// 二、诊断正文只在 content-length 已知且不超上限时读；**未知长度也读**，读完再判总量；
// 三、读超上限时**只取消 clone 分支**并放弃诊断，不取消原分支、不加超时；
// 四、分类优先级固定：429 限流 → ≥500 服务端内部错误 → 非 JSON 连接失败（除非已成功）；
// 五、JSON 诊断里的业务码映射成稳定 kind，未识别的错误码归为 protocol_error；
// 六、丢弃响应用 cancel()，失败只当噪声吞掉，**但必须等待取消完成**。

import type { McpServerFailureKind } from "@knorvia/shared";

/** 诊断正文字节上限：超过就放弃读取，避免把大响应搬进内存。 */
const DIAGNOSTIC_BYTE_LIMIT = 65_536;

/** 顶层业务码 → failure kind（键是服务端契约里的数值码）。 */
const TOP_LEVEL_CODE_KINDS = new Map<number, McpServerFailureKind>([
  [3001, "server_not_found"],
  [1000, "server_unavailable"],
]);

/** JSON-RPC error.code → failure kind。 */
const RPC_ERROR_CODE_KINDS = new Map<number, McpServerFailureKind>([
  [1006, "not_authenticated"],
  [3101, "coding_plan_required"],
]);

/** JSON-RPC 版本标记。 */
const JSONRPC_VERSION = "2.0";

/** 请求 id 的响应头名。 */
const REQUEST_ID_HEADER = "x-request-id";

/** 把响应头里的数值解析成数字；空值与非有限数都算「未知」。 */
export function numericHeader(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** 取服务端返回的请求 id（去空白后为空也算没有）。 */
export function responseRequestId(reply: Response): string | undefined {
  const raw = reply.headers.get(REQUEST_ID_HEADER);
  return raw?.trim() || undefined;
}

/** 普通对象判定。 */
function objectFields(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw);
}

/**
 * 读完 clone 分支的正文，超过上限则取消并放弃。
 * 上限判定在**累计字节**上做，因此未知 content-length 的响应也会被拦住。
 */
async function diagnosticText(reply: Response): Promise<string | undefined> {
  const declaredLength = numericHeader(reply.headers.get("content-length"));
  if (declaredLength !== undefined && declaredLength > DIAGNOSTIC_BYTE_LIMIT) return undefined;

  const body = reply.clone().body;
  if (!body) return undefined;

  const cursor = body.getReader();
  const decoder = new TextDecoder();
  let consumed = 0;
  const chunks: string[] = [];
  try {
    for (;;) {
      const { done, value: raw } = await cursor.read();
      if (done) break;
      consumed += raw.byteLength;
      if (consumed > DIAGNOSTIC_BYTE_LIMIT) {
        // 保留字节上限的既有语义：等待 clone 分支取消，不加超时、不动原分支。
        await cursor.cancel();
        return undefined;
      }
      chunks.push(decoder.decode(raw, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    cursor.releaseLock();
  }
}

/** 已成功但无诊断信息时返回 undefined；未成功则归为连接失败。 */
function fallbackKind(reply: Response): McpServerFailureKind | undefined {
  return reply.ok ? undefined : "connection_failed";
}

/** 从 JSON 文档里取 failure kind；无法判定时返回 undefined。 */
function kindFromDocument(document: unknown): McpServerFailureKind | undefined {
  if (!objectFields(document)) return undefined;

  const topLevelCode = document.code;
  if (typeof topLevelCode === "number") {
    const mapped = TOP_LEVEL_CODE_KINDS.get(topLevelCode);
    if (mapped !== undefined) return mapped;
  }

  const isRpcError = document.jsonrpc === JSONRPC_VERSION && document.error !== undefined;
  if (!isRpcError) return undefined;

  const error = document.error;
  if (objectFields(error) && typeof error.code === "number") {
    const mapped = RPC_ERROR_CODE_KINDS.get(error.code);
    if (mapped !== undefined) return mapped;
  }
  return "protocol_error";
}

/** 按固定优先级给一次失败响应分类。 */
export async function classifyResponse(reply: Response): Promise<McpServerFailureKind | undefined> {
  if (reply.status === 429) return "rate_limited";
  if (reply.status >= 500) return "server_internal_error";

  const contentType = reply.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) return fallbackKind(reply);

  const bodyText = await diagnosticText(reply);
  if (!bodyText) return fallbackKind(reply);

  let document: unknown;
  try {
    document = JSON.parse(bodyText);
  } catch {
    // JSON 诊断解析失败采用 HTTP fallback；流读写与释放错误不在这个 catch 内。
    return fallbackKind(reply);
  }
  return kindFromDocument(document) ?? fallbackKind(reply);
}

/** 丢弃响应正文：尽力清理，但未完成的取消仍须等待，不另设等待预算。 */
export async function discardResponse(reply: Response): Promise<void> {
  try {
    await reply.body?.cancel();
  } catch {
    // 取消失败只当噪声，不向上抛。
  }
}

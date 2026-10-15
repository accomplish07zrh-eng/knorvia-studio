// SPDX-License-Identifier: Apache-2.0
// 模型错误与流式错误的归一（B28 的分类半边）。
// 三类判定：上下文超限（finishReason/rawFinishReason 命中固定标记集，或错误链字段/消息命中）、
// 媒体过大（标记集 + 「media/image/document + too large/exceed」消息组合）；错误链下钻最多
// 7 层并用 WeakSet 防环。另有两个「以抛出为正常返回」的构造函数：上下文超限 finish 错误
// （可恢复可重试、正文固定）与快速回填熔断错误（正文含阈值与连续次数）。
// 流式错误归一：先尝试转供应商业务错误，再退化为 Error（字符串原样、其它 JSON 序列化）。
// 标记匹配统一 trim().toLowerCase()，跨平台一致；判定函数全部不抛。
import { CoreErrorType, ModelErrorCode, createCoreError, isCoreError } from "../../deps.js";
import { isPlainRecord, stringProperty } from "../data.js";
import { createCoreErrorFromProviderBusinessLike } from "./provider-business-failure.js";

type CoreFailure = ReturnType<typeof createCoreError>;

// 上下文超限的固定标记（协议面，逐字冻结）：词表空格分隔存整串，运行时拆成集合。
const CONTEXT_OVERFLOW_MARKER_WORDS = [
  "context_exceeded context_length_exceeded context_window_exceeded",
  "model_context_exceeded prompt_too_long",
].join(" ");

// 媒体过大的固定标记（协议面，逐字冻结）。
const MEDIA_OVERFLOW_MARKER_WORDS = [
  "media_too_large media_payload_too_large",
  "image_too_large document_too_large",
].join(" ");

const CONTEXT_OVERFLOW_MARKERS = new Set<string>([
  CoreErrorType.ModelContextExceeded, // 核心错误类型本身也是标记
  ModelErrorCode.ModelContextExceeded, // 协议错误码同名标记
  ...CONTEXT_OVERFLOW_MARKER_WORDS.split(" "),
]);
const MEDIA_OVERFLOW_MARKERS = new Set<string>(MEDIA_OVERFLOW_MARKER_WORDS.split(" "));

// 上下文超限 finish 错误的正文（逐字冻结）。
const CONTEXT_WINDOW_MESSAGE = "Model request exceeded the provider context window.";

// 下钻时沿 cause/lastError/error 前进。
function nextLink(record: Record<string, unknown>): unknown {
  return record.cause ?? record.lastError ?? record.error;
}

function matchesMarkerSet(raw: string | undefined, markers: ReadonlySet<string>): boolean {
  return raw !== undefined && markers.has(raw.trim().toLowerCase());
}

const isContextMarker = (raw: string | undefined): boolean =>
  matchesMarkerSet(raw, CONTEXT_OVERFLOW_MARKERS);

const isMediaMarker = (raw: string | undefined): boolean =>
  matchesMarkerSet(raw, MEDIA_OVERFLOW_MARKERS);

// 上下文超限的消息组合：「context + exceed」或「context/prompt + too long」。
function isContextMessage(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return false;
  const mentionsExceed = normalized.includes("context") && normalized.includes("exceed");
  const mentionsTooLong =
    (normalized.includes("context") || normalized.includes("prompt")) &&
    normalized.includes("too long");
  return mentionsExceed || mentionsTooLong;
}

// 媒体过大的消息组合：主体词（media/image/document）× 尺寸词（too large/exceed）。
function isMediaMessage(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return false;
  const mentionsSubject =
    normalized.includes("media") || normalized.includes("image") || normalized.includes("document");
  const mentionsSize = normalized.includes("too large") || normalized.includes("exceed");
  return mentionsSubject && mentionsSize;
}

export const readRawFinishReason = (
  providerMetadata: /* 提供方元数据 */ Record<string, unknown> | undefined,
): string | undefined => {
  const candidate = providerMetadata?.rawFinishReason;
  return typeof candidate === "string" ? candidate : undefined;
};

export const isContextExceededFinishReason = (
  finishReason: /* 模型收尾原因 */ string | undefined,
  rawFinishReason: /* 提供方原始收尾原因 */ string | undefined,
): boolean => isContextMarker(finishReason) || isContextMarker(rawFinishReason);

// 上下文超限 finish 错误：正文固定、可恢复可重试，context 带双 finish 原因。
export const createModelContextExceededFinishError = (input: {
  finishReason: /* 模型收尾原因 */ string | undefined;
  rawFinishReason: /* 提供方原始收尾原因 */ string | undefined;
}): CoreFailure => {
  const context = {
    finishReason: input.finishReason,
    rawFinishReason: input.rawFinishReason,
  };
  return createCoreError(CoreErrorType.ModelContextExceeded, CONTEXT_WINDOW_MESSAGE, {
    context,
    recoverable: true,
    retryable: true,
  });
};

// 快速回填熔断错误：正文含「阈值 + 连续次数」，reason 固定 compact_rapid_refill_breaker。
export const createCompactRapidRefillError = (breaker: {
  consecutiveRapidRefills: /* 连续快速回填次数 */ number;
  maxConsecutiveRapidRefills: /* 连续次数上限 */ number;
  toolTurnThreshold: /* 工具轮次阈值 */ number;
  toolTurnsSinceCompact: /* 压缩后已过的工具轮次 */ number;
}): CoreFailure => {
  const context = {
    consecutiveRapidRefills: breaker.consecutiveRapidRefills,
    maxConsecutiveRapidRefills: breaker.maxConsecutiveRapidRefills,
    reason: "compact_rapid_refill_breaker",
    toolTurnsSinceCompact: breaker.toolTurnsSinceCompact,
    toolTurnThreshold: breaker.toolTurnThreshold,
  };
  return createCoreError(
    CoreErrorType.ModelContextExceeded,
    `Autocompact stopped because the context refilled within fewer than ${breaker.toolTurnThreshold} tool turns after compaction ${breaker.maxConsecutiveRapidRefills} times in a row. ` +
      `A file or tool output may be too large. Read it in smaller chunks, or start a new session.`,
    { context, recoverable: true, retryable: true },
  );
};

export const normalizeStreamError = (streamFailure: unknown): Error => {
  const businessError = createCoreErrorFromProviderBusinessLike(streamFailure);
  if (businessError) return businessError;
  if (streamFailure instanceof Error) return streamFailure;
  const serialized =
    typeof streamFailure === "string"
      ? streamFailure
      : (JSON.stringify(streamFailure) ?? "Model stream failed");
  return new Error(serialized);
};

// 上下文超限判定：核心错误类型命中，或链上任一节点的 type/code/reason/stopReason 标记、
// message 文本命中，context 子记录的 type/code/reason 也算；7 层内走完即放弃。
export const isModelContextExceededError = (error: unknown): boolean => {
  const visited = new WeakSet<object>();
  let node: unknown = error;
  for (let level = 0; level <= 6; level += 1) {
    if (node === null || typeof node !== "object" || visited.has(node)) return false;
    visited.add(node);
    if (isCoreError(node) && node.type === CoreErrorType.ModelContextExceeded) return true;
    const fields = node as Record<string, unknown>;
    const markerHit =
      isContextMarker(stringProperty(fields, "type")) ||
      isContextMarker(stringProperty(fields, "code")) ||
      isContextMarker(stringProperty(fields, "reason")) ||
      isContextMarker(stringProperty(fields, "stopReason"));
    if (markerHit || isContextMessage(stringProperty(fields, "message"))) return true;
    if (isPlainRecord(fields.context)) {
      const inner = fields.context;
      const innerHit =
        isContextMarker(stringProperty(inner, "type")) ||
        isContextMarker(stringProperty(inner, "code")) ||
        isContextMarker(stringProperty(inner, "reason"));
      if (innerHit) return true;
    }
    node = nextLink(fields);
  }
  return false;
};

// 媒体过大判定：链上任一节点的 type/code/reason 标记或 message 文本命中即成立。
export const isModelMediaTooLargeError = (error: unknown): boolean => {
  const visited = new WeakSet<object>();
  let node: unknown = error;
  for (let level = 0; level <= 6; level += 1) {
    if (node === null || typeof node !== "object" || visited.has(node)) return false;
    visited.add(node);
    const fields = node as Record<string, unknown>;
    const markerHit =
      isMediaMarker(stringProperty(fields, "type")) ||
      isMediaMarker(stringProperty(fields, "code")) ||
      isMediaMarker(stringProperty(fields, "reason"));
    if (markerHit || isMediaMessage(stringProperty(fields, "message"))) return true;
    if (isPlainRecord(fields.context)) {
      const inner = fields.context;
      const innerHit =
        isMediaMarker(stringProperty(inner, "type")) ||
        isMediaMarker(stringProperty(inner, "code")) ||
        isMediaMarker(stringProperty(inner, "reason"));
      if (innerHit) return true;
    }
    node = nextLink(fields);
  }
  return false;
};

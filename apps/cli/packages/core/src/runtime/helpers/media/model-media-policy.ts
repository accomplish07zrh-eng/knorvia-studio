// SPDX-License-Identifier: Apache-2.0
// 模型媒体策略投影（B8 输入能力 + B9 体积预算）与官方 CUA 光栅配对。
// 能力投影回答「这个模型收得起哪几类媒体」，预算投影回答「这一请求放得下多少媒体」；
// 两条链都是同步纯计算：不修改入参、未投影时返回入参原引用，异常只按契约抛两类。
// 官方 CUA 的光栅图与紧随其后的凭据文本是一对：图被省略时文本一并清空，光栅位换成
// 「不可见」提示，模型就不会对着已经不存在的坐标目标继续输出。
import { containsOfficialCuaImageRefCredentialText } from "@knorvia/cua/frame-contract";
import {
  CoreErrorType,
  MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE,
  createCoreError,
  createUnsupportedModelInputMediaText,
  getUnsupportedModelInputMediaKind,
  isProviderVisibleModelInputMediaBlock,
  isProviderVisiblePdfModelInputBlock,
  isProviderVisibleVideoModelInputBlock,
  modelMessageContentToText,
  traceContextToLogContext,
} from "../../deps.js";
import type {
  Logger,
  ModelInputFormat,
  ModelInputMessage,
  ModelMessageContent,
  ModelMessageContentBlock,
  TraceContext,
} from "../../deps.js";
import { findLatestRealUserMessageIndex } from "../conversation.js";

// 官方 CUA 光栅「不可见」提示：协议文案，逐字冻结，两端拼接只为行长。
const CUA_RASTER_UNAVAILABLE_TEXT =
  "This CUA raster is not visible in this request. " +
  "Do not send a coordinate target; capture a new raster first.";

// 预算缺省上限 40 MiB；体积一律按 UTF-8 字节数计量，与平台无关。
const DEFAULT_MEDIA_BUDGET_BYTES = 40 * 1024 * 1024;

// 被预算省略的媒体块替换文案后缀：协议文案，逐字冻结。
const MEDIA_OMISSION_NOTE =
  "\n[Media omitted from provider request to keep the request body under the configured media budget.]";

// 受保护消息自身超限时的用户提示：只能删附件/压缩后重试，文案逐字冻结。
const CURRENT_ATTACHMENTS_TOO_LARGE_MESSAGE =
  "Current attachments are too large to send. Remove or compress attachments and try again.";

// 预算上限非法（非有限数或为负）时的配置错误提示。
const INVALID_BUDGET_MESSAGE = "Invalid model request media budget";

// B8 能力投影结果：三类全支持时 messages 保持入参原引用。
export interface MediaCapabilityProjection {
  messages: ModelInputMessage[];
  retainedMediaCount: number;
  // 四类省略计数 + 省略总数：字段名与 debug 事件字段同名，观测面直接平铺。
  omittedImageCount: number;
  omittedPdfCount: number;
  omittedVideoCount: number;
  omittedMediaCount: number;
}

// B9 预算投影结果：不超限时 messages 保持入参原引用，计数是全量值。
export interface MediaBudgetProjection {
  messages: ModelInputMessage[];
  totalMediaBytes: number;
  projectedMediaBytes: number;
  retainedMediaCount: number;
  omittedMediaCount: number;
}

interface BudgetProjectionSettings {
  // 显式指定受保护消息下标；非整数或越界时回退到「最近真实用户消息」探测。
  latestRealUserMessageIndex?: number;
  // 预算上限（UTF-8 字节数）；缺省 40 MiB，非有限数或为负是配置错误。
  maxMediaBytes?: number;
  // false 关闭「最新真实用户消息」保护：全部媒体一起参与预算竞争。
  preserveLatestUserMedia?: boolean;
}

// 组合投影结果：能力投影在前、预算投影在后，messages 是预算投影的输出引用。
interface ModelMediaPolicyResult {
  capabilityProjection: MediaCapabilityProjection;
  mediaBudgetProjection: MediaBudgetProjection;
  messages: ModelInputMessage[];
}

// 一条媒体引用：所在消息/块下标 + 请求体积 + 是否落在受保护消息里。
interface MediaEntry {
  message: number;
  block: number;
  bytes: number;
  guarded: boolean;
}

// 省略计数的四个归档桶：图片 / PDF / 视频 / 其他。
type OmissionBucket = "image" | "other" | "pdf" | "video";
type OmissionTally = Record<OmissionBucket, number>;

// 官方 CUA 配对：被省略的光栅图后面若紧跟凭据文本，该文本块下标进配对集合。
export function officialCuaImageRefIndexesForUnavailableMedia(
  content: readonly ModelMessageContentBlock[],
  unavailableMediaIndexes: ReadonlySet<number>,
): Set<number> {
  const pairedTextOrdinals = new Set<number>();
  for (const mediaOrdinal of unavailableMediaIndexes) {
    const raster = content[mediaOrdinal];
    const follower = content[mediaOrdinal + 1];
    const paired =
      raster?.type === "image" &&
      follower?.type === "text" &&
      containsOfficialCuaImageRefCredentialText(follower.text);
    if (paired) {
      pairedTextOrdinals.add(mediaOrdinal + 1);
    }
  }
  return pairedTextOrdinals;
}

// 光栅位替换块：固定文案，模型侧据此知道该重新截图而不是报坐标。
export function officialCuaRasterUnavailableBlock(): ModelMessageContentBlock {
  return { type: "text", text: CUA_RASTER_UNAVAILABLE_TEXT };
}

// 媒体请求体积：image/video 记 data URL 全量字节；file 只在「有 data URL 且无文本」时计入。
function requestBytes(piece: ModelMessageContentBlock): number {
  if (piece.type === "image" || piece.type === "video") {
    return Buffer.byteLength(piece.dataUrl, "utf8");
  }
  return piece.type === "file" && piece.dataUrl && !piece.text
    ? Buffer.byteLength(piece.dataUrl, "utf8")
    : 0;
}

// 块浅拷贝：source 再浅拷贝一层，保证入参块对象不被就地改写。
function cloneContentBlock(piece: ModelMessageContentBlock): ModelMessageContentBlock {
  if (piece.type === "image" || piece.type === "video" || piece.type === "file") {
    return { ...piece, source: piece.source ? { ...piece.source } : undefined };
  }
  return { ...piece };
}

// 消息浅拷贝：内容整体替换，toolCalls 与 cacheControl 各复制一层。
function cloneMessage(message: ModelInputMessage, content: ModelMessageContent): ModelInputMessage {
  return {
    ...message,
    content,
    toolCalls: message.toolCalls?.map((call) => ({ ...call })),
    cacheControl: message.cacheControl ? { ...message.cacheControl } : undefined,
  };
}

// 省略归档口径：image 块记图片，file 里的 provider-visible PDF 记 PDF，video 记视频，其余记其他。
function omissionBucketOf(piece: ModelMessageContentBlock): OmissionBucket {
  if (piece.type === "image") return "image";
  if (isProviderVisiblePdfModelInputBlock(piece)) return "pdf";
  if (isProviderVisibleVideoModelInputBlock(piece)) return "video";
  return "other";
}

// B8 输入能力投影：三类全支持时原样返回；否则把不被支持的媒体块替换成降级说明文本，
// 官方 CUA 的配对凭据文本走同一条替换链；发生替换的消息里未变块也走浅拷贝。
export function projectMessagesForInputFormat(
  history: ModelInputMessage[],
  format: ModelInputFormat,
): MediaCapabilityProjection {
  const tally: OmissionTally = { image: 0, other: 0, pdf: 0, video: 0 };
  let retainedMediaCount = 0;
  let replacedAny = false;

  const projected = history.map((message) => {
    const content = message.content;
    if (!Array.isArray(content)) {
      return message;
    }

    // 第一遍只算种类：每块「不支持的媒体种类」与 CUA 配对文本下标一次算清，后面不再判定。
    const unsupportedKinds = content.map((piece) =>
      getUnsupportedModelInputMediaKind(piece, format),
    );
    const unavailableOrdinals = new Set<number>();
    unsupportedKinds.forEach((kind, ordinal) => {
      if (kind !== undefined) unavailableOrdinals.add(ordinal);
    });
    const pairedTextOrdinals = officialCuaImageRefIndexesForUnavailableMedia(
      content,
      unavailableOrdinals,
    );

    let replacedInMessage = false;
    const projectedContent = content.map((piece, ordinal): ModelMessageContentBlock => {
      if (pairedTextOrdinals.has(ordinal)) {
        replacedInMessage = true;
        return { type: "text", text: "" };
      }
      const kind = unsupportedKinds[ordinal];
      if (kind === undefined) {
        if (isProviderVisibleModelInputMediaBlock(piece)) retainedMediaCount += 1;
        return cloneContentBlock(piece);
      }
      replacedInMessage = true;
      tally[omissionBucketOf(piece)] += 1;
      const degraded = {
        type: "text" as const,
        text: createUnsupportedModelInputMediaText(piece, kind),
      };
      return pairedTextOrdinals.has(ordinal + 1) ? officialCuaRasterUnavailableBlock() : degraded;
    });

    if (!replacedInMessage) {
      return message;
    }
    replacedAny = true;
    return cloneMessage(message, projectedContent);
  });

  return {
    messages: replacedAny ? projected : history,
    omittedImageCount: tally.image,
    omittedMediaCount: tally.image + tally.other + tally.pdf + tally.video,
    omittedPdfCount: tally.pdf,
    omittedVideoCount: tally.video,
    retainedMediaCount,
  };
}

// 能力投影 debug：只在有省略时打一条，字段与投影计数一一对应。
export function logMediaCapabilityProjection(
  logger: Logger | undefined,
  trace: TraceContext,
  outcome: MediaCapabilityProjection,
  settings: { event: string; message: string; model: string },
): void {
  if (outcome.omittedMediaCount === 0) {
    return;
  }
  logger?.debug(settings.message, {
    ...traceContextToLogContext(trace),
    status: "completed",
    module: "core.runtime", // 模块归属是观测契约字段
    event: settings.event,
    model: settings.model,
    omittedMediaCount: outcome.omittedMediaCount,
    omittedImageCount: outcome.omittedImageCount,
    omittedPdfCount: outcome.omittedPdfCount,
    omittedVideoCount: outcome.omittedVideoCount,
    retainedMediaCount: outcome.retainedMediaCount,
  });
}

// 受保护消息下标解析：显式给值且落在 [-1, 消息数) 内就用显式值，否则探测最近真实用户消息；
// preserveLatestUserMedia === false 时整体关闭保护（-1 表示没有受保护消息）。
function resolveGuardedMessageIndex(
  history: ModelInputMessage[],
  settings: BudgetProjectionSettings,
): number {
  if (settings.preserveLatestUserMedia === false) {
    return -1;
  }
  const supplied = settings.latestRealUserMessageIndex;
  if (
    supplied !== undefined &&
    Number.isInteger(supplied) &&
    supplied >= -1 &&
    supplied < history.length
  ) {
    return supplied;
  }
  return findLatestRealUserMessageIndex(history);
}

// 预算下的内容投影：被省略的媒体块换成「[Attached …] + 省略说明」，官方 CUA 配对同步处理。
function projectContentWithinBudget(
  content: ModelMessageContent,
  messageOrdinal: number,
  keptByMessage: ReadonlyMap<number, ReadonlySet<number>>,
): ModelMessageContent {
  if (!Array.isArray(content)) {
    return content;
  }
  const kept = keptByMessage.get(messageOrdinal);
  const omittedOrdinals = new Set<number>();
  content.forEach((piece, blockOrdinal) => {
    const counted = requestBytes(piece) !== 0 && !kept?.has(blockOrdinal);
    if (counted) omittedOrdinals.add(blockOrdinal);
  });
  const pairedTextOrdinals = officialCuaImageRefIndexesForUnavailableMedia(
    content,
    omittedOrdinals,
  );

  return content.map((piece, blockOrdinal): ModelMessageContentBlock => {
    if (pairedTextOrdinals.has(blockOrdinal)) {
      return { type: "text", text: "" };
    }
    if (requestBytes(piece) === 0 || kept?.has(blockOrdinal)) {
      return cloneContentBlock(piece);
    }
    if (pairedTextOrdinals.has(blockOrdinal + 1)) {
      return officialCuaRasterUnavailableBlock();
    }
    // 降级文本 = 原块的文字摘要（没有就用固定占位）+ 省略说明后缀。
    const summary = modelMessageContentToText([piece]) || "[Attached media]";
    return { type: "text", text: summary + MEDIA_OMISSION_NOTE };
  });
}

// B9 体积预算投影：总量不超上限时原样返回；超限时先保受保护消息的媒体，再按
// 「越新越优先」（消息下标大者优先、同消息内块下标大者优先）填剩余预算，被丢弃的
// 媒体块换成「[Attached …] + 省略说明」文本。入参数组与消息对象都不被改写。
export function projectMessagesForMediaBudget(
  history: ModelInputMessage[],
  settings: BudgetProjectionSettings = {},
): MediaBudgetProjection {
  const limit = settings.maxMediaBytes ?? DEFAULT_MEDIA_BUDGET_BYTES;
  if (!Number.isFinite(limit) || limit < 0) {
    throw createCoreError(CoreErrorType.ConfigurationError, INVALID_BUDGET_MESSAGE, {
      context: { maxMediaBytes: limit },
      recoverable: true,
    });
  }

  const guardedOrdinal = resolveGuardedMessageIndex(history, settings);
  const entries: MediaEntry[] = [];
  let overallBytes = 0;
  history.forEach((message, messageOrdinal) => {
    const content = message.content;
    if (!Array.isArray(content)) return;
    content.forEach((piece, blockOrdinal) => {
      const bytes = requestBytes(piece);
      if (bytes === 0) return;
      entries.push({
        message: messageOrdinal,
        block: blockOrdinal,
        bytes,
        guarded: messageOrdinal === guardedOrdinal,
      });
      overallBytes += bytes;
    });
  });

  if (overallBytes <= limit) {
    return {
      messages: history,
      omittedMediaCount: 0,
      projectedMediaBytes: overallBytes,
      retainedMediaCount: entries.length,
      totalMediaBytes: overallBytes,
    };
  }

  // 受保护消息自身放不下：这不是可投影的情况，抛固定错误码让用户删附件/压缩。
  const guardedBytes = entries.reduce((sum, entry) => (entry.guarded ? sum + entry.bytes : sum), 0);
  if (guardedBytes > limit) {
    const failure = createCoreError(
      CoreErrorType.InvalidInput,
      CURRENT_ATTACHMENTS_TOO_LARGE_MESSAGE,
      {
        context: {
          code: MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE,
          maxMediaBytes: limit,
          protectedMediaBytes: guardedBytes,
          totalMediaBytes: overallBytes,
        },
        recoverable: true,
      },
    );
    failure.code = MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE;
    throw failure;
  }

  // 保留集按消息分桶。entries 按（消息下标, 块下标）升序收集，倒序遍历即「越新越优先」。
  const keptByMessage = new Map<number, Set<number>>();
  let retainedMediaCount = 0;
  const keep = (entry: MediaEntry) => {
    const blocks = keptByMessage.get(entry.message) ?? new Set<number>();
    blocks.add(entry.block);
    keptByMessage.set(entry.message, blocks);
    retainedMediaCount += 1;
  };
  entries.forEach((entry) => {
    if (entry.guarded) keep(entry);
  });
  let remainingBytes = limit - guardedBytes;
  for (const entry of [...entries].reverse()) {
    if (entry.guarded) continue;
    if (entry.bytes <= remainingBytes) {
      keep(entry);
      remainingBytes -= entry.bytes;
    }
  }

  let projectedMediaBytes = 0;
  entries.forEach((entry) => {
    if (keptByMessage.get(entry.message)?.has(entry.block)) projectedMediaBytes += entry.bytes;
  });

  const projectedMessages = history.map((message, messageOrdinal) =>
    cloneMessage(
      message,
      projectContentWithinBudget(message.content, messageOrdinal, keptByMessage),
    ),
  );

  return {
    messages: projectedMessages,
    omittedMediaCount: entries.length - retainedMediaCount,
    projectedMediaBytes,
    retainedMediaCount,
    totalMediaBytes: overallBytes,
  };
}

// B9 预算 debug：只在有省略时打一条，字节数与计数一起平铺。
export function logMediaBudgetProjection(
  logger: Logger | undefined,
  trace: TraceContext,
  outcome: MediaBudgetProjection,
  settings: { event: string; message: string },
): void {
  if (outcome.omittedMediaCount === 0) {
    return;
  }
  logger?.debug(settings.message, {
    ...traceContextToLogContext(trace),
    event: settings.event,
    module: "core.runtime", // 模块归属是观测契约字段
    status: "completed",
    omittedMediaCount: outcome.omittedMediaCount,
    projectedMediaBytes: outcome.projectedMediaBytes,
    retainedMediaCount: outcome.retainedMediaCount,
    totalMediaBytes: outcome.totalMediaBytes,
  });
}

// 组合投影（B8 + B9）：能力投影先执行，预算投影吃能力投影的输出。
export function projectMessagesForModelMediaPolicy(
  history: ModelInputMessage[],
  format: ModelInputFormat,
  settings: {
    // 显式指定受保护消息下标，透传给预算投影。
    latestRealUserMessageIndex?: number;
  } = {},
): ModelMediaPolicyResult {
  const formatOutcome = projectMessagesForInputFormat(history, format);
  const budgetOutcome = projectMessagesForMediaBudget(formatOutcome.messages, {
    latestRealUserMessageIndex: settings.latestRealUserMessageIndex,
  });
  return {
    capabilityProjection: formatOutcome,
    mediaBudgetProjection: budgetOutcome,
    messages: budgetOutcome.messages,
  };
}

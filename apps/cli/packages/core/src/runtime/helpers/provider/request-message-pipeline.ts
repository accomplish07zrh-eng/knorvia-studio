// SPDX-License-Identifier: Apache-2.0
// 提供方请求消息总管线（B34）。
// 管线顺序固定：输入呈现投影 → 附件上浮重排 → 中途系统提醒投影 → legacy 提醒归位 → 渲染成
// 消息 → （关闭的）相邻用户合并 → 缓存控制。输出：投影后的消息数组、与消息一一对应的来源
// 条目、诊断计数（被上浮的附件条数、最近真实用户消息下标、被剥除的运行时元数据条数、缓存
// 控制落点）。附件来源不是已知系统提醒来源时抛错（点名来源），其余不抛；同步纯计算、单遍
// 线性扫描；重排按从尾到头扫描再反转（上浮只在同一段落内生效）。输出消息为克隆，不改写入参；
// 来源映射在单次调用内的登记表，不跨调用共享。
import type { ModelMessageContent, ModelMessageContentBlock } from "@knorvia/contracts";
import type { Model } from "../../deps.js";
import type { AgentRuntimeConfig } from "../../types.js";
import {
  cloneModelInputMessage,
  cloneModelMessageContent,
  isKnownSystemReminderSource,
  isRuntimeAttachmentEntry,
  type ModelInputMessage,
  type RuntimeAttachmentEntry,
  type RuntimeMessageEntry,
  type RuntimeMessageMessageEntry,
} from "../../../agent/message-history.js";
import {
  getSystemReminderDescriptor,
  isMidConversationSystemSource,
  wrapSystemReminderForSource,
  type SystemReminderSource,
} from "../../../system-reminder/source.js";
import {
  ProviderEntryOrigins,
  isPresentedInput,
  projectIncomingMessageEntries,
} from "./input-presentation-projection.js";
import {
  projectMidConversationSystemEntries,
  moveLegacySystemRemindersAfterToolResultRun,
  isToolResultUserMessage,
  type ProjectedRuntimeMessageEntry,
} from "./mid-conversation-system.js";

export interface ProviderRequestMessageProjectionResult {
  messages: /* 投影后的提供方消息 */ ModelInputMessage[];
  sourceEntries: /* 与消息一一对应的来源条目 */ Array<RuntimeMessageEntry | undefined>;
  diagnostics: {
    bubbledAttachmentEntryCount: /* 被上浮的附件条数 */ number;
    latestRealUserMessageIndex?: /* 最近真实用户消息下标 */ number;
    strippedRuntimeMetaCount: /* 带运行时元数据的条目数 */ number;
    cacheControlIndex?: /* 缓存控制落点 */ number;
  };
}

type ProjectionDiagnostics = ProviderRequestMessageProjectionResult["diagnostics"];

// 既定协议策略：相邻用户消息保持分离（合并开关常关）。
const ADJACENT_USER_MERGE_ENABLED = false; // 协议策略开关，缺省关闭

// 不参与上浮的提醒通道：连续性、工具结果、真实用户。
const NON_BUBBLING_CHANNELS = ["history_continuity", "tool_result", "real_user"];

// 收口的角色边界（附件与工具结果用户消息另行判定）。
const BOUNDARY_ROLES = new Set<string>(["system", "assistant", "tool"]);

// 可上浮的提醒描述条件：元提醒、provider 可见，且不属三个排除通道。
function descriptorAllowsBubbling(reminderSource: SystemReminderSource): boolean {
  const facts = getSystemReminderDescriptor(reminderSource);
  const blockedChannel = NON_BUBBLING_CHANNELS.includes(facts.channel);
  return (
    !blockedChannel && Boolean(facts.isMeta) && facts.providerVisibility === "provider_visible"
  );
}

function bubbleFromAttachment(item: RuntimeAttachmentEntry): boolean {
  const reminderSource = item.metadata.source;
  if (!isKnownSystemReminderSource(reminderSource) || reminderSource === "goal_state_change") {
    return false;
  }
  return descriptorAllowsBubbling(reminderSource);
}

// legacy 合成用户输入直接放行；真实用户、工具结果、中途系统提醒不上浮。
function bubbleFromUserMessage(item: RuntimeMessageMessageEntry): boolean {
  if (item.message.role !== "user" || isToolResultUserMessage(item.message)) return false;
  const marker = item.metadata?.source;
  if (!marker || marker === "real_user") return false;
  if (marker === "legacy_synthetic") return true;
  if (!isKnownSystemReminderSource(marker) || isMidConversationSystemSource(marker)) return false;
  return descriptorAllowsBubbling(marker);
}

// 可上浮判定：呈现输入一律不上浮，其余按附件/用户消息分流。
function canBubble(item: RuntimeMessageEntry): boolean {
  if (isPresentedInput(item)) return false;
  return isRuntimeAttachmentEntry(item) ? bubbleFromAttachment(item) : bubbleFromUserMessage(item);
}

// 段落边界：system/assistant/tool/工具结果用户消息与呈现输入都收口；附件本身不是边界。
function isAttachmentBoundary(item: RuntimeMessageEntry): boolean {
  if (isPresentedInput(item)) return true;
  if (isRuntimeAttachmentEntry(item)) return false;
  return BOUNDARY_ROLES.has(item.message.role) || isToolResultUserMessage(item.message);
}

// 上浮重排的输出形状：重排后的条目 + 被上浮条数。
interface ReorderedEntries {
  entries: /* 重排后的条目 */ RuntimeMessageEntry[];
  bubbledAttachmentEntryCount: /* 被上浮条数 */ number;
}

// 上浮重排：从尾到头扫描，可上浮条目暂存，遇边界就按序落位（只在同一段落内生效）。
function reorderAttachments(entries: readonly RuntimeMessageEntry[]): ReorderedEntries {
  const collectedReversed: RuntimeMessageEntry[] = [];
  let buffered: RuntimeMessageEntry[] = [];
  let bubbledCount = 0;
  const releaseBuffer = (): void => {
    for (const item of buffered) collectedReversed.push(item);
    bubbledCount += buffered.length;
    buffered = [];
  };
  for (const item of [...entries].reverse()) {
    if (canBubble(item)) {
      buffered.push(item);
      continue;
    }
    if (isAttachmentBoundary(item) && buffered.length > 0) releaseBuffer();
    collectedReversed.push(item);
  }
  releaseBuffer();
  collectedReversed.reverse();
  return { entries: collectedReversed, bubbledAttachmentEntryCount: bubbledCount };
}

// 附件渲染：按来源包成系统提醒用户消息；未知来源显式抛错（点名来源）。
function renderAttachmentEntry(item: RuntimeAttachmentEntry): ModelInputMessage {
  const reminderSource = item.metadata.source;
  if (!isKnownSystemReminderSource(reminderSource)) {
    throw new Error(`Attachment source ${reminderSource} is not a system reminder source`);
  }
  return {
    role: "user", // 附件一律渲染成用户消息
    content: wrapSystemReminderForSource(reminderSource, item.content),
    ...(item.cacheControl ? { cacheControl: { ...item.cacheControl } } : {}),
  };
}

// 渲染：普通条目克隆消息；附件条目包系统提醒。
function renderEntry(item: ProjectedRuntimeMessageEntry): ModelInputMessage {
  return isRuntimeAttachmentEntry(item)
    ? renderAttachmentEntry(item)
    : cloneModelInputMessage(item.message);
}

// 休眠合并策略的块化助手：字符串正文包成单文本块，块内容走克隆。
function dormantMergeBlocks(raw: ModelMessageContent): ModelMessageContentBlock[] {
  if (typeof raw === "string") return [{ type: "text", text: raw }];
  return cloneModelMessageContent(raw) as ModelMessageContentBlock[];
}

// 合并后的消息序列与「渲染下标 → 合并后下标」映射。
interface RetainedUserBoundaries {
  messages: ModelInputMessage[];
  messageIndices: number[];
}

// 休眠的相邻用户合并（策略开关关闭时不走这里；保留既有合并协作边）。
function mergeAdjacentUserMessages(rendered: readonly ModelInputMessage[]): RetainedUserBoundaries {
  const merged: ModelInputMessage[] = [];
  const indexMap: number[] = [];
  for (const wireMessage of rendered) {
    const prior = merged[merged.length - 1];
    const bothPlainUsers =
      prior &&
      prior.role === "user" &&
      wireMessage.role === "user" &&
      !isToolResultUserMessage(prior) &&
      !isToolResultUserMessage(wireMessage);
    if (!bothPlainUsers) {
      merged.push(wireMessage);
      indexMap.push(merged.length - 1);
      continue;
    }
    const leadingBlocks = dormantMergeBlocks(prior!.content);
    const trailingBlocks = dormantMergeBlocks(wireMessage.content);
    const lastBlock = leadingBlocks[leadingBlocks.length - 1];
    const firstBlock = trailingBlocks[0];
    if (lastBlock?.type === "text" && firstBlock?.type === "text") {
      lastBlock.text += "\n";
    }
    const effectiveCache = wireMessage.cacheControl ?? prior!.cacheControl;
    merged[merged.length - 1] = {
      role: "user", // 合并结果仍是用户消息
      content: [...leadingBlocks, ...trailingBlocks],
      ...(effectiveCache ? { cacheControl: { ...effectiveCache } } : {}),
    };
    indexMap.push(merged.length - 1);
  }
  return { messages: merged, messageIndices: indexMap };
}

// 相邻用户边界保留（合并策略关闭时逐条直通，下标一一对应）。
function retainUserBoundaries(rendered: ModelInputMessage[]): RetainedUserBoundaries {
  if (ADJACENT_USER_MERGE_ENABLED) {
    return mergeAdjacentUserMessages(rendered);
  }
  return {
    messages: [...rendered],
    messageIndices: rendered.map((_message, index) => index),
  };
}

// 先剥掉非 system 消息上的旧缓存落点。
function stripStaleCacheControl(wire: ModelInputMessage[]): void {
  for (let index = 0; index < wire.length; index++) {
    const message = wire[index]!;
    if (message.role !== "system" && message.cacheControl) {
      const { cacheControl: _cacheControl, ...rest } = message;
      wire[index] = rest;
    }
  }
}

// 缓存控制：剥旧落点后从尾部选第一个非 system 消息施加 ephemeral；skipCacheWrite 跳过一次。
function applyRequestCacheControl(
  wire: ModelInputMessage[],
  skipCacheWrite: boolean,
): number | undefined {
  stripStaleCacheControl(wire);
  let skip = skipCacheWrite;
  let cursor = wire.length - 1;
  while (cursor >= 0) {
    const message = wire[cursor]!;
    if (message.role !== "system") {
      if (!skip) {
        wire[cursor] = { ...message, cacheControl: { type: "ephemeral" } };
        return cursor;
      }
      skip = false;
    }
    cursor -= 1;
  }
  return undefined;
}

export function buildProviderRequestMessages(request: {
  entries: readonly RuntimeMessageEntry[];
  applyCacheControl?: boolean;
  skipCacheWrite?: boolean;
  useMidConversationSystem?: boolean;
}): ProviderRequestMessageProjectionResult {
  const midSystemEnabled = request.useMidConversationSystem !== false;
  const ledger = new ProviderEntryOrigins();
  const presented = projectIncomingMessageEntries(request.entries, ledger);
  const arranged = reorderAttachments(presented);
  const reminderLayer = midSystemEnabled
    ? projectMidConversationSystemEntries(arranged.entries, ledger).entries
    : arranged.entries;
  const ordered = moveLegacySystemRemindersAfterToolResultRun(reminderLayer);
  const latestRealUserMessageIndex = ordered.findLastIndex((item) => ledger.hasRealUser(item));
  const rendered = ordered.map(renderEntry);
  const { messages, messageIndices } = retainUserBoundaries(rendered);
  const sources: Array<RuntimeMessageEntry | undefined> = [];
  messageIndices.forEach((messageIndex, originalIndex) => {
    const item = ordered[originalIndex];
    if (sources[messageIndex] === undefined && item) {
      sources[messageIndex] = ledger.representative(item);
    }
  });
  const cacheControlIndex =
    request.applyCacheControl === true
      ? applyRequestCacheControl(messages, request.skipCacheWrite === true)
      : undefined;
  const diagnostics: ProjectionDiagnostics = {
    bubbledAttachmentEntryCount: arranged.bubbledAttachmentEntryCount,
    ...(latestRealUserMessageIndex >= 0 || request.entries.some(isPresentedInput)
      ? { latestRealUserMessageIndex }
      : {}),
    strippedRuntimeMetaCount: request.entries.filter((item) => item.metadata).length,
    ...(cacheControlIndex !== undefined ? { cacheControlIndex } : {}),
  };
  return { messages, sourceEntries: sources, diagnostics };
}

// 运行时包装入口：midConversationSystem.mode === "force" 或模型声明支持 → 开启中途系统提醒。
export function buildRuntimeProviderRequestMessages(
  host: {
    readonly config: Pick<AgentRuntimeConfig, "midConversationSystem">;
  },
  request: {
    entries: readonly RuntimeMessageEntry[];
    applyCacheControl?: boolean;
    model: Model;
  },
): ProviderRequestMessageProjectionResult {
  const forcedByConfig = host.config.midConversationSystem?.mode === "force";
  const midSystemEnabled = forcedByConfig || request.model.properties.supportsMidConversationSystem;
  return buildProviderRequestMessages({
    ...request,
    useMidConversationSystem: midSystemEnabled,
  });
}

// SPDX-License-Identifier: Apache-2.0
// 中途系统提醒投影与 legacy 归位（B36）。
// 连续的中途系统提醒先挂起，在「工具结果或用户消息」之后合并成一条 system 消息（正文用空行
// 拼接并保存降级正文）；上一个投影已经是系统消息时直接追加正文；不满足落位条件时降级为包好
// 提醒的 legacy_synthetic 用户条目（校验遍逐条复核）。随后把紧跟工具结果的 legacy 提醒挪到
// **该段工具结果之后**，保持段内顺序。工具结果用户消息的判定 = user 且带 toolCallId/toolName。
// 同步单遍扫描 + 一遍校验，不抛异常、不修改入参；来源登记表同 B35（调用内）。
import {
  isKnownSystemReminderSource,
  isRuntimeAttachmentEntry,
  type ModelInputMessage,
  type RuntimeMessageEntry,
  type RuntimeMessageMessageEntry,
} from "../../../agent/message-history.js";
import {
  isMidConversationSystemSource,
  sanitizeSystemReminderBody,
  wrapSystemReminder,
} from "../../../system-reminder/source.js";
import { isPresentedInput, type ProviderEntryOrigins } from "./input-presentation-projection.js";

// 合并投影的私有标记：保存降级正文（落位失败时用它包回 legacy 提醒）。
interface MidSystemProjection {
  fallbackBody: string;
}

interface ProjectedMidSystemMessageEntry extends RuntimeMessageMessageEntry {
  midSystemProjection: MidSystemProjection;
}

export type ProjectedRuntimeMessageEntry = RuntimeMessageEntry | ProjectedMidSystemMessageEntry;

interface MidSystemProjectionResult {
  entries: ProjectedRuntimeMessageEntry[];
}

// 挂起的一条提醒：原始条目 + 正文。
interface BufferedReminder {
  item: RuntimeMessageEntry;
  text: string;
}

// 合并点判定：上一个投影条目是「工具结果或用户消息」才能落 system。
function isMergeAnchor(candidate: ProjectedRuntimeMessageEntry | undefined): boolean {
  if (!candidate || isRuntimeAttachmentEntry(candidate)) return false;
  return candidate.message.role === "tool" || candidate.message.role === "user";
}

// 挂起组并入上一条合并投影：正文追加、降级正文追加、来源链并入。
function extendPreviousProjection(
  prior: ProjectedMidSystemMessageEntry,
  items: readonly BufferedReminder[],
  body: string,
  ledger: ProviderEntryOrigins,
): void {
  ledger.set(prior, [prior, ...items.map((item) => item.item)]);
  prior.message = {
    ...prior.message,
    content: `${prior.message.content}\n\n${body}`,
  };
  prior.midSystemProjection.fallbackBody = `${prior.midSystemProjection.fallbackBody}\n\n${body}`;
}

// 锚点在位：新建 system 合并条目（带降级正文）。
function createMergedSystemEntry(
  items: readonly BufferedReminder[],
  body: string,
  ledger: ProviderEntryOrigins,
): ProjectedMidSystemMessageEntry {
  const merged: ProjectedMidSystemMessageEntry = {
    message: { role: "system", content: body },
    midSystemProjection: { fallbackBody: body },
  };
  ledger.set(
    merged,
    items.map((item) => item.item),
  );
  return merged;
}

// 落位失败的降级：包好提醒的 legacy_synthetic 用户条目。
function downgradeToLegacy(
  merged: ProjectedMidSystemMessageEntry,
  ledger: ProviderEntryOrigins,
): RuntimeMessageMessageEntry {
  const fallback: RuntimeMessageMessageEntry = {
    message: {
      role: "user",
      content: wrapSystemReminder(
        sanitizeSystemReminderBody(merged.midSystemProjection.fallbackBody),
      ),
    },
    metadata: { source: "legacy_synthetic" }, // 降级条目的来源标记
  };
  ledger.set(fallback, [merged]);
  return fallback;
}

export function projectMidConversationSystemEntries(
  timeline: readonly RuntimeMessageEntry[],
  ledger: ProviderEntryOrigins,
): MidSystemProjectionResult {
  const assembled: ProjectedRuntimeMessageEntry[] = [];
  const buffered: BufferedReminder[] = [];

  const drainBuffer = (): void => {
    if (buffered.length === 0) return;
    const items = buffered.splice(0);
    const body = items.map((item) => item.text).join("\n\n");
    const prior = assembled[assembled.length - 1];
    if (prior && "midSystemProjection" in prior && prior.midSystemProjection) {
      extendPreviousProjection(prior, items, body, ledger);
      return;
    }
    if (isMergeAnchor(prior)) {
      assembled.push(createMergedSystemEntry(items, body, ledger));
      return;
    }
    // 没有锚点：保持附件形态回填（校验遍再决定要不要降级）。
    for (const item of items) assembled.push(item.item);
  };

  for (const item of timeline) {
    const bufferHasPresentedInput = buffered.some((slot) => isPresentedInput(slot.item));
    const nextIsUser = !isRuntimeAttachmentEntry(item) && item.message.role === "user";
    const interruptedByInput =
      buffered.length > 0 && (isPresentedInput(item) || (bufferHasPresentedInput && nextIsUser));
    if (interruptedByInput) {
      drainBuffer();
    }

    let text: string | undefined;
    if (isRuntimeAttachmentEntry(item)) {
      const reminderSource = item.metadata.source;
      if (
        isKnownSystemReminderSource(reminderSource) &&
        isMidConversationSystemSource(reminderSource)
      ) {
        text = item.content;
      }
    }
    if (text !== undefined) {
      buffered.push({ item, text });
      continue;
    }

    const blocksMerge =
      buffered.length > 0 &&
      !isRuntimeAttachmentEntry(item) &&
      (item.message.role === "assistant" || item.message.role === "system");
    if (blocksMerge) {
      drainBuffer();
    }
    assembled.push(item);
  }
  drainBuffer();

  // 校验遍：合并条目不在「锚点之后」就降级成 legacy_synthetic 用户条目。
  const finalized: ProjectedRuntimeMessageEntry[] = [];
  for (const [index, item] of assembled.entries()) {
    const isMerged = "midSystemProjection" in item && item.midSystemProjection;
    if (!isMerged) {
      finalized.push(item);
      continue;
    }
    const follower = assembled[index + 1];
    const followerIsFollowUp =
      !follower ||
      ("midSystemProjection" in follower && follower.midSystemProjection) ||
      (!isRuntimeAttachmentEntry(follower) && follower.message.role === "assistant");
    const wellPlaced = isMergeAnchor(finalized[finalized.length - 1]) && followerIsFollowUp;
    finalized.push(
      wellPlaced ? item : downgradeToLegacy(item as ProjectedMidSystemMessageEntry, ledger),
    );
  }

  return { entries: finalized };
}

// legacy 提醒的判定：附件条目，或标 legacy_synthetic 的用户条目。
function isLegacyReminder(item: ProjectedRuntimeMessageEntry): boolean {
  return (
    isRuntimeAttachmentEntry(item) ||
    (item.message.role === "user" && item.metadata?.source === "legacy_synthetic")
  );
}

export function moveLegacySystemRemindersAfterToolResultRun(
  timeline: readonly ProjectedRuntimeMessageEntry[],
): ProjectedRuntimeMessageEntry[] {
  const output: ProjectedRuntimeMessageEntry[] = [];
  const deferred: ProjectedRuntimeMessageEntry[] = [];
  const flushDeferred = (): void => {
    while (deferred.length > 0) {
      output.push(deferred.shift()!);
    }
  };

  for (const item of timeline) {
    const last = output[output.length - 1];
    const inToolRun =
      last !== undefined &&
      !isRuntimeAttachmentEntry(last) &&
      (last.message.role === "tool" || isToolResultUserMessage(last.message));
    if (isLegacyReminder(item) && (deferred.length > 0 || inToolRun)) {
      deferred.push(item);
      continue;
    }
    const keepsRunOpen =
      deferred.length > 0 &&
      !isRuntimeAttachmentEntry(item) &&
      (item.message.role === "tool" || isToolResultUserMessage(item.message));
    if (keepsRunOpen) {
      output.push(item);
      continue;
    }
    flushDeferred();
    output.push(item);
  }
  flushDeferred();
  return output;
}

export function isToolResultUserMessage(message: ModelInputMessage): boolean {
  return message.role === "user" && Boolean(message.toolCallId || message.toolName);
}

import type { ModelMessageContent, ModelMessageContentBlock } from "@knorvia/contracts";
import {
  cloneModelInputMessage,
  cloneModelMessageContent,
  isKnownSystemReminderSource,
  isRuntimeAttachmentEntry,
  type ModelInputMessage,
  type RuntimeMessageEntry,
} from "../../agent/message-history.js";
import {
  getSystemReminderDescriptor,
  isMidConversationSystemSource,
  wrapSystemReminderForSource,
  type SystemReminderSource,
} from "../../system-reminder/source.js";
import {
  ProviderEntryOrigins,
  isPresentedInput,
  projectIncomingMessageEntries,
} from "./provider-entry-origins.js";
import {
  projectMidConversationSystemEntries,
  moveLegacySystemRemindersAfterToolResultRun,
  isToolResultUserMessage,
  type ProjectedRuntimeMessageEntry,
} from "./provider-mid-conversation-system.js";

export interface ProviderRequestMessageProjectionResult {
  messages: ModelInputMessage[];
  sourceEntries: Array<RuntimeMessageEntry | undefined>;
  diagnostics: {
    bubbledAttachmentEntryCount: number;
    latestRealUserMessageIndex?: number;
    strippedRuntimeMetaCount: number;
    cacheControlIndex?: number;
  };
}

// Fixed provider protocol policy: neighboring user messages remain separate.
const ADJACENT_USER_MERGE_ENABLED = false;

function descriptorAllowsBubbling(source: SystemReminderSource): boolean {
  const descriptor = getSystemReminderDescriptor(source);
  return (
    descriptor.channel !== "history_continuity" &&
    Boolean(descriptor.isMeta) &&
    descriptor.providerVisibility === "provider_visible" &&
    descriptor.channel !== "tool_result" &&
    descriptor.channel !== "real_user"
  );
}

function canBubble(entry: RuntimeMessageEntry): boolean {
  if (isPresentedInput(entry)) return false;
  if (isRuntimeAttachmentEntry(entry)) {
    const source = entry.metadata.source;
    if (!isKnownSystemReminderSource(source) || source === "goal_state_change") return false;
    return descriptorAllowsBubbling(source);
  }
  if (entry.message.role !== "user" || isToolResultUserMessage(entry.message)) return false;
  const source = entry.metadata?.source;
  if (!source || source === "real_user") return false;
  if (source === "legacy_synthetic") return true;
  if (!isKnownSystemReminderSource(source) || isMidConversationSystemSource(source)) return false;
  return descriptorAllowsBubbling(source);
}

function isAttachmentBoundary(entry: RuntimeMessageEntry): boolean {
  if (isPresentedInput(entry)) return true;
  if (isRuntimeAttachmentEntry(entry)) return false;
  return (
    entry.message.role === "system" ||
    entry.message.role === "assistant" ||
    entry.message.role === "tool" ||
    isToolResultUserMessage(entry.message)
  );
}

function reorderAttachments(entries: readonly RuntimeMessageEntry[]): {
  entries: RuntimeMessageEntry[];
  bubbledAttachmentEntryCount: number;
} {
  const reversed: RuntimeMessageEntry[] = [];
  const pending: RuntimeMessageEntry[] = [];
  let bubbledAttachmentEntryCount = 0;
  const flush = (): void => {
    for (const entry of pending) reversed.push(entry);
    bubbledAttachmentEntryCount += pending.length;
    pending.length = 0;
  };
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    if (canBubble(entry)) {
      pending.push(entry);
      continue;
    }
    if (isAttachmentBoundary(entry) && pending.length > 0) flush();
    reversed.push(entry);
  }
  if (pending.length > 0) flush();
  reversed.reverse();
  return { entries: reversed, bubbledAttachmentEntryCount };
}

function renderEntry(entry: ProjectedRuntimeMessageEntry): ModelInputMessage {
  if (!isRuntimeAttachmentEntry(entry)) return cloneModelInputMessage(entry.message);
  const source = entry.metadata.source;
  if (!isKnownSystemReminderSource(source)) {
    throw new Error(`Attachment source ${source} is not a system reminder source`);
  }
  return {
    role: "user",
    content: wrapSystemReminderForSource(source, entry.content),
    ...(entry.cacheControl ? { cacheControl: { ...entry.cacheControl } } : {}),
  };
}

function dormantMergeBlocks(content: ModelMessageContent): ModelMessageContentBlock[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return cloneModelMessageContent(content) as ModelMessageContentBlock[];
}

function retainUserBoundaries(rendered: ModelInputMessage[]): {
  messages: ModelInputMessage[];
  messageIndices: number[];
} {
  if (!ADJACENT_USER_MERGE_ENABLED) {
    return {
      messages: [...rendered],
      messageIndices: rendered.map((_message, index) => index),
    };
  }
  // Dormant content-merge policy retains the existing clone collaborator edge.
  const messages: ModelInputMessage[] = [];
  const messageIndices: number[] = [];
  rendered.forEach((message) => {
    const previous = messages[messages.length - 1];
    if (
      !previous ||
      previous.role !== "user" ||
      message.role !== "user" ||
      isToolResultUserMessage(previous) ||
      isToolResultUserMessage(message)
    ) {
      messages.push(message);
      messageIndices.push(messages.length - 1);
      return;
    }
    const before = dormantMergeBlocks(previous.content);
    const after = dormantMergeBlocks(message.content);
    const tail = before[before.length - 1];
    const head = after[0];
    if (tail?.type === "text" && head?.type === "text") {
      tail.text += "\n";
    }
    const cacheControl = message.cacheControl ?? previous.cacheControl;
    messages[messages.length - 1] = {
      role: "user",
      content: [...before, ...after],
      ...(cacheControl ? { cacheControl: { ...cacheControl } } : {}),
    };
    messageIndices.push(messages.length - 1);
  });
  return { messages, messageIndices };
}

function applyRequestCacheControl(
  messages: ModelInputMessage[],
  skipCacheWrite: boolean,
): number | undefined {
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    if (message.role !== "system" && message.cacheControl) {
      const { cacheControl: _cacheControl, ...remaining } = message;
      messages[index] = remaining;
    }
  }
  let skip = skipCacheWrite;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role === "system") continue;
    if (skip) {
      skip = false;
      continue;
    }
    messages[index] = { ...message, cacheControl: { type: "ephemeral" } };
    return index;
  }
  return undefined;
}

export function buildProviderRequestMessages(input: {
  entries: readonly RuntimeMessageEntry[];
  applyCacheControl?: boolean;
  skipCacheWrite?: boolean;
  useMidConversationSystem?: boolean;
}): ProviderRequestMessageProjectionResult {
  const useMidConversationSystem = input.useMidConversationSystem !== false;
  const origins = new ProviderEntryOrigins();
  const incoming = projectIncomingMessageEntries(input.entries, origins);
  const reordered = reorderAttachments(incoming);
  const midSystemEntries = useMidConversationSystem
    ? projectMidConversationSystemEntries(reordered.entries, origins).entries
    : reordered.entries;
  const entries = moveLegacySystemRemindersAfterToolResultRun(midSystemEntries);
  const latestRealUserMessageIndex = entries.findLastIndex((entry) => origins.hasRealUser(entry));
  const rendered = entries.map(renderEntry);
  const { messages, messageIndices } = retainUserBoundaries(rendered);
  const sourceEntries: Array<RuntimeMessageEntry | undefined> = [];
  messageIndices.forEach((messageIndex, originalIndex) => {
    const entry = entries[originalIndex];
    if (sourceEntries[messageIndex] === undefined && entry) {
      sourceEntries[messageIndex] = origins.representative(entry);
    }
  });
  const cacheControlIndex =
    input.applyCacheControl === true
      ? applyRequestCacheControl(messages, input.skipCacheWrite === true)
      : undefined;
  const diagnostics: ProviderRequestMessageProjectionResult["diagnostics"] = {
    bubbledAttachmentEntryCount: reordered.bubbledAttachmentEntryCount,
    ...(latestRealUserMessageIndex >= 0 || input.entries.some(isPresentedInput)
      ? { latestRealUserMessageIndex }
      : {}),
    strippedRuntimeMetaCount: input.entries.filter((entry) => entry.metadata).length,
    ...(cacheControlIndex !== undefined ? { cacheControlIndex } : {}),
  };
  return { messages, sourceEntries, diagnostics };
}

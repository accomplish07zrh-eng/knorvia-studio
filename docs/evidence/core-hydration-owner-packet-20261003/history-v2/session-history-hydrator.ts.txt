import { runtimeInputMetadata } from "./runtime-input-presentation.js";
import { modelMessageContentToText, selectActiveConversationBranch } from "@knorvia/contracts";
import type {
  FilePart,
  MessagePart,
  MessageWithParts,
  ModelMessageContent,
  ModelMessageContentBlock,
  ModelReasoningContentBlock,
  MessageId,
  ToolArtifactStorePort,
  ToolPart,
} from "@knorvia/contracts";
import {
  getSystemReminderDescriptor,
  wrapSystemReminderForSource,
  type SystemReminderSource,
} from "../system-reminder/source.js";
import {
  buildPromptAttachmentReminderBodies,
  type PromptAttachmentReminderInput,
} from "../system-reminder/prompt-attachment.js";
import { persistedTokenUsageBaseline } from "./message-history-usage.js";
import {
  isKnownSystemReminderSource,
  legacySyntheticRuntimeMetadata,
  realUserRuntimeMetadata,
  systemReminderAttachmentEntry,
  systemReminderRuntimeMetadata,
  todoReminderRuntimeMetadata,
  type MessageHistory,
  type RuntimeMessageEntry,
  type RuntimeMessageMetadata,
  type RuntimeMessageSource,
  type ToolCallInput,
} from "./message-history.js";
import { compactActiveSessionMessages, isActiveCompactionBoundaryPart } from "./compact-session.js";
import { filePartToContentBlock, projectPersistedToolMediaContent } from "./file-part-hydration.js";
import { selectToolPartsForHistory } from "./tool-part-order.js";

export interface SessionHistoryHydrationResult {
  appliedMessageCount: number;
  interruptedToolCount: number;
  messageCount: number;
  partCount: number;
}

type Text = Extract<MessagePart, { type: "text" }>;
type HydrationInput = Parameters<typeof hydrateMessageHistoryFromSession>[0];

function lastBoundary(messages: MessageWithParts[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]!.parts.some(isActiveCompactionBoundaryPart)) return index;
  }
  return -1;
}

export function activeSessionMessages(messages: MessageWithParts[], options: {
  branchCutAfterMessageId?: MessageId;
  includeCompactPreservedSegment?: boolean;
  rewindCreatedMessageId?: MessageId;
  rewindKeptMessageIds?: readonly MessageId[];
  rewindTargetMessageId?: MessageId;
} = {}): MessageWithParts[] {
  if (options.branchCutAfterMessageId) {
    const branch = selectActiveConversationBranch(messages, options);
    const boundary = lastBoundary(branch);
    return boundary < 0 ? branch : compactActiveSessionMessages(
      branch, boundary, options.includeCompactPreservedSegment !== false,
    );
  }
  const boundary = lastBoundary(messages);
  const projected = boundary < 0 ? messages : compactActiveSessionMessages(
    messages, boundary, options.includeCompactPreservedSegment !== false,
  );
  if (options.rewindKeptMessageIds && boundary >= 0) {
    const kept = options.rewindKeptMessageIds;
    if (!messages.slice(boundary).some(message => kept.includes(message.info.id))) return projected;
  }
  return selectActiveConversationBranch(projected, options);
}

function nestedMetadata(part: Text): RuntimeMessageMetadata | undefined {
  const value = part.metadata?.runtimeMessage;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const runtime = value as Record<string, unknown>;
  const presentation = runtimeInputMetadata(runtime.inputPresentation);
  if (presentation) return presentation;
  const source = runtime.source as RuntimeMessageSource | undefined;
  if (source === "real_user") return realUserRuntimeMetadata();
  if (source === "legacy_synthetic") return legacySyntheticRuntimeMetadata();
  if (source === "todo_reminder") return todoReminderRuntimeMetadata();
  return isKnownSystemReminderSource(source) ? systemReminderRuntimeMetadata(source) : undefined;
}

function syntheticMetadata(part: Text): RuntimeMessageMetadata {
  const source = part.metadata?.source;
  if (source === "background_task" || source === "subagent_message") {
    return legacySyntheticRuntimeMetadata();
  }
  const nested = nestedMetadata(part);
  if (nested) return nested;
  if (source === "subagent") return systemReminderRuntimeMetadata("queued_system_notification");
  if (source === "todo_reminder") return todoReminderRuntimeMetadata();
  if (source === "goal-continuation") return systemReminderRuntimeMetadata("target_continuation");
  if (source === "rewind" || source === "fork") return systemReminderRuntimeMetadata("rewind_notice");
  return isKnownSystemReminderSource(source)
    ? systemReminderRuntimeMetadata(source) : legacySyntheticRuntimeMetadata();
}

function rawReminderSource(part: MessagePart): SystemReminderSource | undefined {
  if (part.type !== "text" || !part.synthetic || !part.text.trim()
    || part.text.trimStart().startsWith("<system-reminder")) return undefined;
  const source = syntheticMetadata(part).source;
  if (!isKnownSystemReminderSource(source)) return undefined;
  const descriptor = getSystemReminderDescriptor(source);
  return descriptor.isMeta && descriptor.providerVisibility === "provider_visible"
    && descriptor.channel !== "real_user" && descriptor.channel !== "tool_result"
    ? source : undefined;
}

function providerText(part: Text): string {
  if (!part.synthetic || part.text.trimStart().startsWith("<system-reminder")) return part.text;
  const source = nestedMetadata(part)?.source;
  if (source === "task_status" && part.metadata?.source !== "background_task") {
    return wrapSystemReminderForSource("task_status", part.text);
  }
  if (source === "queued_system_notification" || part.metadata?.source === "subagent") {
    return wrapSystemReminderForSource("queued_system_notification", part.text);
  }
  return part.text;
}

function promptAttachment(part: FilePart, block: ModelMessageContentBlock):
  PromptAttachmentReminderInput | undefined {
  if (block.type !== "text" || !part.mime.startsWith("text/")) return undefined;
  if (!part.source) {
    return { content: block.text, kind: "inline_text", label: part.filename, preview: part.metadata?.preview };
  }
  const metadata = part.metadata;
  if (metadata?.storageKind !== "inline"
    || (metadata.recoverability !== "provider_ready" && metadata.recoverability !== "preview_only")
    || metadata.preview?.text !== block.text) return undefined;
  return {
    content: block.text,
    kind: "file",
    label: part.source.text.value ?? part.filename,
    preview: metadata.preview,
  };
}

function userMetadata(parts: MessagePart[]): RuntimeMessageMetadata {
  if (parts.some(part => part.type === "file" || part.type === "agent"
    || (part.type === "text" && !part.ignored && !part.synthetic))) return realUserRuntimeMetadata();
  const synthetic = parts.find((part): part is Text => part.type === "text" && !part.ignored && !!part.synthetic);
  return synthetic ? syntheticMetadata(synthetic) : realUserRuntimeMetadata();
}

async function appendUser(input: HydrationInput, message: MessageWithParts, parts: MessagePart[]): Promise<boolean> {
  const info = message.info;
  if (info.role === "user" && info.source === "shared_context"
    && info.metadata !== null && typeof info.metadata === "object") {
    const status = info.metadata.sharedContextStatus;
    if (status !== undefined && status !== "attached") return false;
  }
  const visible = parts.filter(part => part.type !== "text" || !part.ignored);
  if (visible.length === 1) {
    const only = visible[0]!;
    const source = rawReminderSource(only);
    if (source && only.type === "text") {
      input.history.addAttachment(source, only.text);
      return true;
    }
  }
  const attachments: ModelMessageContentBlock[] = [];
  const prompts: ModelMessageContentBlock[] = [];
  const media: ModelMessageContentBlock[] = [];
  const reminders: RuntimeMessageEntry[] = [];
  const promptEntries: RuntimeMessageEntry[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      if (part.ignored) continue;
      const source = rawReminderSource(part);
      if (source) reminders.push(systemReminderAttachmentEntry(source, part.text));
      else prompts.push({ type: "text", text: providerText(part) });
    } else if (part.type === "file") {
      const block = await filePartToContentBlock(part, input.artifactStore);
      const reminder = promptAttachment(part, block);
      if (reminder) {
        promptEntries.push(systemReminderAttachmentEntry(
          "prompt_attachment", buildPromptAttachmentReminderBodies(reminder).join("\n"),
        ));
      } else if (block.type === "image" || block.type === "video") media.push(block);
      else attachments.push(block);
    } else if (part.type === "agent") {
      prompts.push({ type: "text", text: `[Selected agent: ${part.name}]` });
    }
  }
  const ordered = [...attachments, ...prompts, ...media];
  const content: ModelMessageContent = attachments.length || media.length
    ? ordered.map(block => ({ ...block }))
    : prompts.filter((block): block is Extract<ModelMessageContentBlock, { type: "text" }> => block.type === "text")
      .map(block => block.text).filter(Boolean).join("\n\n");
  const meaningful = !!modelMessageContentToText(content).trim();
  const metadata = userMetadata(parts);
  const restoreEnvelope = meaningful || (metadata.source === "real_user" && promptEntries.length > 0);
  const entries: RuntimeMessageEntry[] = restoreEnvelope
    ? [{ message: { role: "user", content }, metadata }, ...reminders, ...promptEntries]
    : [...reminders, ...promptEntries];
  if (!entries.length) return false;
  const presentation = runtimeInputMetadata(info.metadata?.inputPresentation);
  input.history.addEntries(presentation ? entries.map(entry => entry.kind === "attachment"
    ? entry : { ...entry, metadata: presentation }) : entries);
  return true;
}

function providerToolName(part: ToolPart): string {
  const name = part.metadata?.providerToolName;
  return typeof name === "string" ? name : part.tool;
}

export async function hydrateMessageHistoryFromSession(input: {
  artifactStore?: ToolArtifactStorePort;
  branchCutAfterMessageId?: MessageId;
  history: MessageHistory;
  messages: MessageWithParts[];
  rewindCreatedMessageId?: MessageId;
  rewindKeptMessageIds?: readonly MessageId[];
  rewindTargetMessageId?: MessageId;
}): Promise<SessionHistoryHydrationResult> {
  const messages = activeSessionMessages(input.messages, {
    branchCutAfterMessageId: input.branchCutAfterMessageId,
    rewindCreatedMessageId: input.rewindCreatedMessageId,
    rewindKeptMessageIds: input.rewindKeptMessageIds,
    rewindTargetMessageId: input.rewindTargetMessageId,
  });
  const counts = { appliedMessageCount: 0, interruptedToolCount: 0, partCount: 0 };
  for (const message of messages) {
    const byId = new Map<MessagePart["id"], MessagePart>();
    for (const part of message.parts) byId.set(part.id, part);
    const parts = [...byId.values()];
    counts.partCount += parts.length;
    const info = message.info;
    if (info.role === "user") {
      if (await appendUser(input, message, parts)) counts.appliedMessageCount++;
      continue;
    }
    const text = parts.filter((part): part is Text => part.type === "text" && !part.ignored)
      .map(part => part.text).join("\n\n");
    const reasoning: ModelReasoningContentBlock[] = parts
      .filter(part => part.type === "reasoning")
      .map(part => ({ type: "reasoning", text: part.text, providerOptions: part.metadata ? { ...part.metadata } : undefined }));
    const tools = selectToolPartsForHistory(parts.filter((part): part is ToolPart => part.type === "tool"));
    if (!text.trim() && !reasoning.length && !tools.length && !persistedTokenUsageBaseline(info.tokens)) continue;
    const calls: ToolCallInput[] = tools.map(part => ({
      id: part.callID,
      input: part.state.input,
      name: providerToolName(part),
    }));
    const model = info.modelId && info.providerId ? { modelId: info.modelId, providerId: info.providerId } : undefined;
    input.history.addAssistant(text, calls, reasoning, model, info.tokens);
    counts.appliedMessageCount++;
    for (const part of tools) {
      const name = providerToolName(part);
      if (part.state.status === "completed") {
        const blocks = part.state.attachments
          ? await Promise.all(part.state.attachments.map(attachment => filePartToContentBlock(attachment, input.artifactStore)))
          : [];
        const projection = blocks.length
          ? projectPersistedToolMediaContent(part.state.metadata?.modelContentLayout, blocks) : undefined;
        input.history.addToolResult(part.callID, name, projection ?? part.state.output, true);
      } else if (part.state.status === "error") {
        const persisted = part.state.metadata?.modelContent;
        input.history.addToolResult(part.callID, name,
          typeof persisted === "string" ? persisted : part.state.error, false);
      } else {
        counts.interruptedToolCount++;
        input.history.addToolResult(part.callID, name,
          "[Tool execution was interrupted before resume]", false);
      }
    }
  }
  return {
    appliedMessageCount: counts.appliedMessageCount,
    interruptedToolCount: counts.interruptedToolCount,
    messageCount: messages.length,
    partCount: counts.partCount,
  };
}

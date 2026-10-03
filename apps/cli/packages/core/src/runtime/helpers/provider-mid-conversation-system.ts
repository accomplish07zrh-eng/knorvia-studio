import {
  isKnownSystemReminderSource,
  isRuntimeAttachmentEntry,
  type ModelInputMessage,
  type RuntimeMessageEntry,
  type RuntimeMessageMessageEntry,
} from "../../agent/message-history.js";
import {
  isMidConversationSystemSource,
  sanitizeSystemReminderBody,
  wrapSystemReminder,
} from "../../system-reminder/source.js";
import { isPresentedInput, type ProviderEntryOrigins } from "./provider-entry-origins.js";

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

export function projectMidConversationSystemEntries(
  entries: readonly RuntimeMessageEntry[],
  origins: ProviderEntryOrigins,
): MidSystemProjectionResult {
  const projected: ProjectedRuntimeMessageEntry[] = [];
  const pending: { entry: RuntimeMessageEntry; text: string }[] = [];

  const flushPending = (): void => {
    if (pending.length === 0) return;

    const items = pending.splice(0);
    const body = items.map((item) => item.text).join("\n\n");
    const previous = projected[projected.length - 1];

    if (previous && "midSystemProjection" in previous && previous.midSystemProjection) {
      origins.set(previous, [previous, ...items.map((item) => item.entry)]);
      previous.message = {
        ...previous.message,
        content: `${previous.message.content}\n\n${body}`,
      };
      previous.midSystemProjection.fallbackBody = `${previous.midSystemProjection.fallbackBody}\n\n${body}`;
      return;
    }

    if (previous && !isRuntimeAttachmentEntry(previous)) {
      const message = previous.message;
      if (message.role === "tool" || message.role === "user") {
        const entry: ProjectedMidSystemMessageEntry = {
          message: { role: "system", content: body },
          midSystemProjection: { fallbackBody: body },
        };
        origins.set(
          entry,
          items.map((item) => item.entry),
        );
        projected.push(entry);
        return;
      }
    }

    for (const item of items) projected.push(item.entry);
  };

  for (const entry of entries) {
    const pendingHasPresentedInput = pending.some((item) => isPresentedInput(item.entry));
    const nextIsUser = !isRuntimeAttachmentEntry(entry) && entry.message.role === "user";

    if (
      pending.length > 0 &&
      (isPresentedInput(entry) || (pendingHasPresentedInput && nextIsUser))
    ) {
      flushPending();
    }

    let text: string | undefined;
    if (isRuntimeAttachmentEntry(entry)) {
      const source = entry.metadata.source;
      if (isKnownSystemReminderSource(source) && isMidConversationSystemSource(source)) {
        text = entry.content;
      }
    }

    if (text !== undefined) {
      pending.push({ entry, text });
      continue;
    }

    if (
      pending.length > 0 &&
      !isRuntimeAttachmentEntry(entry) &&
      (entry.message.role === "assistant" || entry.message.role === "system")
    ) {
      flushPending();
    }
    projected.push(entry);
  }
  flushPending();

  const validated: ProjectedRuntimeMessageEntry[] = [];
  for (let index = 0; index < projected.length; index += 1) {
    const entry = projected[index];
    if (!entry || !("midSystemProjection" in entry) || !entry.midSystemProjection) {
      validated.push(entry);
      continue;
    }

    const previous = validated[validated.length - 1];
    const next = projected[index + 1];
    let previousIsAnchor = false;
    if (previous && !isRuntimeAttachmentEntry(previous)) {
      const message = previous.message;
      previousIsAnchor = message.role === "tool" || message.role === "user";
    }
    if (
      previousIsAnchor &&
      (!next ||
        ("midSystemProjection" in next && next.midSystemProjection) ||
        (!isRuntimeAttachmentEntry(next) && next.message.role === "assistant"))
    ) {
      validated.push(entry);
      continue;
    }

    const fallback: RuntimeMessageMessageEntry = {
      message: {
        role: "user",
        content: wrapSystemReminder(
          sanitizeSystemReminderBody(entry.midSystemProjection.fallbackBody),
        ),
      },
      metadata: { source: "legacy_synthetic" },
    };
    origins.set(fallback, [entry]);
    validated.push(fallback);
  }

  return { entries: validated };
}

export function moveLegacySystemRemindersAfterToolResultRun(
  entries: readonly ProjectedRuntimeMessageEntry[],
): ProjectedRuntimeMessageEntry[] {
  const moved: ProjectedRuntimeMessageEntry[] = [];
  const pending: ProjectedRuntimeMessageEntry[] = [];

  for (const entry of entries) {
    const legacyReminder =
      isRuntimeAttachmentEntry(entry) ||
      (entry.message.role === "user" && entry.metadata?.source === "legacy_synthetic");
    const previous = moved[moved.length - 1];
    if (
      legacyReminder &&
      (pending.length > 0 ||
        (previous &&
          !isRuntimeAttachmentEntry(previous) &&
          (previous.message.role === "tool" || isToolResultUserMessage(previous.message))))
    ) {
      pending.push(entry);
      continue;
    }

    if (pending.length > 0) {
      if (
        entry &&
        !isRuntimeAttachmentEntry(entry) &&
        (entry.message.role === "tool" || isToolResultUserMessage(entry.message))
      ) {
        moved.push(entry);
        continue;
      }
      for (const reminder of pending) moved.push(reminder);
      pending.length = 0;
    }
    moved.push(entry);
  }

  for (const reminder of pending) moved.push(reminder);
  return moved;
}

export function isToolResultUserMessage(message: ModelInputMessage): boolean {
  return message.role === "user" && Boolean(message.toolCallId || message.toolName);
}

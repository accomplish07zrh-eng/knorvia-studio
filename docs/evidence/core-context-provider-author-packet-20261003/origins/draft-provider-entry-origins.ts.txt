import { parseRuntimeInputPresentation } from "@knorvia/contracts";
import {
  isRuntimeAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../agent/message-history.js";
import {
  formatIncomingMessage,
  isMidTurnInputPresentation,
} from "../../system-reminder/incoming-message.js";
import { wrapSystemReminderForSource } from "../../system-reminder/source.js";

function isRealUser(entry: RuntimeMessageEntry): boolean {
  return (
    !isRuntimeAttachmentEntry(entry) &&
    entry.queryScope !== "output_token_continuation" &&
    entry.message.role === "user" &&
    !entry.message.toolCallId &&
    !entry.message.toolName &&
    (!entry.metadata || entry.metadata.source === "real_user")
  );
}

export class ProviderEntryOrigins {
  private readonly origins = new WeakMap<
    RuntimeMessageEntry,
    readonly RuntimeMessageEntry[]
  >();

  get(entry: RuntimeMessageEntry): readonly RuntimeMessageEntry[] {
    return this.origins.get(entry) ?? [entry];
  }

  set(entry: RuntimeMessageEntry, inputs: readonly RuntimeMessageEntry[]): void {
    this.origins.set(entry, inputs.flatMap((input) => this.get(input)));
  }

  hasRealUser(entry: RuntimeMessageEntry): boolean {
    return this.get(entry).some(isRealUser);
  }

  representative(entry: RuntimeMessageEntry): RuntimeMessageEntry | undefined {
    const inputs = this.get(entry);
    return (
      inputs.findLast(isRealUser) ??
      inputs.findLast((input) => !isRuntimeAttachmentEntry(input))
    );
  }
}

export function isPresentedInput(entry: RuntimeMessageEntry): boolean {
  return (
    parseRuntimeInputPresentation(entry.metadata?.inputPresentation) !== undefined
  );
}

export function projectIncomingMessageEntries(
  entries: readonly RuntimeMessageEntry[],
  origins: ProviderEntryOrigins,
): RuntimeMessageEntry[] {
  return entries.map((entry) => {
    if (isRuntimeAttachmentEntry(entry) || entry.message.role !== "user") {
      return entry;
    }

    const presentation = parseRuntimeInputPresentation(
      entry.metadata?.inputPresentation,
    );
    if (!presentation) {
      return entry;
    }

    const content = entry.message.content;
    if (
      typeof content !== "string" &&
      content.some((block) => block.type !== "text")
    ) {
      return entry;
    }

    const body =
      typeof content === "string"
        ? content
        : content.map((block) => (block.type === "text" ? block.text : "")).join("\n");
    const formatted = formatIncomingMessage(body, presentation);
    const projectedContent =
      presentation === "task_notification"
        ? wrapSystemReminderForSource("incoming_message", formatted)
        : formatted;
    const projected: RuntimeMessageEntry = isMidTurnInputPresentation(presentation)
      ? {
          kind: "attachment",
          content: projectedContent,
          metadata: {
            source: "incoming_message",
            inputPresentation: presentation,
          },
        }
      : {
          ...entry,
          message: { ...entry.message, content: projectedContent },
        };

    origins.set(projected, [entry]);
    return projected;
  });
}

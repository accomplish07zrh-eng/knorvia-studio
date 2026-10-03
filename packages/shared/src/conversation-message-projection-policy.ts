export type ConversationMessageProjectionPolicy =
  | "realUserInput"
  | "visibleAssistant"
  | "providerContextOnly"
  | "timelineOnly"
  | "hiddenSynthetic";

export interface ConversationProjectionMessageSemantics {
  kind?: string;
  origin?: string;
  providerVisibility?: string;
  source?: string;
  transcriptVisibility?: string;
  uiVisibility?: string;
}

export interface ConversationProjectionPart {
  ignored?: boolean;
  metadata?: unknown;
  summaryMessageId?: string;
  synthetic?: boolean;
  text?: string;
  timelineType?: string;
  type?: string;
}

export interface ConversationProjectionMessage {
  info: {
    metadata?: unknown;
    role?: string;
    semantics?: ConversationProjectionMessageSemantics;
    source?: string;
    summary?: unknown;
    synthetic?: boolean;
    visibility?: string;
  };
  parts?: readonly ConversationProjectionPart[];
}

const providerSyntheticSources = new Set<string>([
  "agent_control_message",
  "background_task",
  "goal-continuation",
  "goal_completion_verification",
  "goal_state_change",
  "plugin_reference",
  "queued_system_notification",
  "resume_goal_state",
  "resume_referenced_session_context",
  "rewind",
  "selection_side_chat",
  "subagent",
  "subagent_message",
  "target_continuation",
  "task_notification",
  "task_status",
  "todo_reminder",
]);

const modelOnlyTurnTriggerSources = new Set<string>([
  "background_task",
  "task_notification",
  "subagent",
  "subagent_message",
  "goal-continuation",
  "target_continuation",
]);

function metadataRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function messageSource(message: ConversationProjectionMessage): string | undefined {
  return (
    message.info.source ??
    stringValue(metadataRecord(message.info.metadata)?.source) ??
    message.info.semantics?.source ??
    (message.parts ?? [])
      .map((part) => stringValue(metadataRecord(part.metadata)?.source))
      .find((source) => Boolean(source))
  );
}

function hasModelOnlyPart(parts: readonly ConversationProjectionPart[]): boolean {
  return parts.some((part) => {
    const metadata = metadataRecord(part.metadata);
    return (
      metadata?.visibility === "model-only" || stringValue(metadata?.source) === "goal-continuation"
    );
  });
}

function hasTimelineProjection(message: ConversationProjectionMessage): boolean {
  if (
    message.info.semantics?.kind === "timeline_event" ||
    message.info.source === "fork" ||
    metadataRecord(message.info.metadata)?.source === "fork"
  ) {
    return true;
  }

  return (message.parts ?? []).some((part) => {
    const metadata = metadataRecord(part.metadata);
    return (
      part.type === "timeline" ||
      metadataRecord(metadata?.forkContext)?.kind === "session_fork" ||
      (part.type === "compaction" &&
        (typeof metadata?.timelineStatus === "string" || typeof part.summaryMessageId === "string"))
    );
  });
}

function messageText(message: ConversationProjectionMessage): string {
  return (message.parts ?? [])
    .filter((part) => part.type === "text" && part.ignored !== true)
    .map((part) => part.text ?? "")
    .join("");
}

function hasLegacyReminderContext(message: ConversationProjectionMessage): boolean {
  const text = messageText(message).trimStart();
  return (
    text.startsWith('<system-reminder source="goal-continuation">') ||
    (text.startsWith("<system-reminder>") &&
      (text.includes("Continue working toward the active session goal.") ||
        text.includes("Current session goal state"))) ||
    text.includes("Conversation rewind applied.") ||
    text.includes("Workspace rewind applied.")
  );
}

function hasLegacyNotification(message: ConversationProjectionMessage): boolean {
  const text = messageText(message).trimStart();
  return text.startsWith("<task-notification>") || text.startsWith("<subagent-notification>");
}

export function getConversationMessageProjectionPolicy(
  message: ConversationProjectionMessage,
): ConversationMessageProjectionPolicy {
  const info = message.info;
  const parts = message.parts ?? [];
  const semantics = info.semantics;

  if (semantics?.kind === "compact_summary" || info.summary !== undefined) {
    return "providerContextOnly";
  }

  if (semantics) {
    if (semantics.kind === "timeline_event") {
      return "timelineOnly";
    }
    if (
      semantics.origin === "real_user" &&
      info.synthetic !== true &&
      info.visibility !== "model-only"
    ) {
      return "realUserInput";
    }
    if (
      info.role === "assistant" &&
      semantics.kind === "assistant_response" &&
      semantics.uiVisibility === "visible" &&
      semantics.transcriptVisibility === "visible"
    ) {
      return "visibleAssistant";
    }
    if (semantics.providerVisibility === "visible") {
      return "providerContextOnly";
    }
    if (semantics.kind === "fork_notice") {
      return "timelineOnly";
    }
    if (
      semantics.origin === "agent_runtime" ||
      semantics.uiVisibility === "hidden" ||
      semantics.transcriptVisibility === "hidden"
    ) {
      return "hiddenSynthetic";
    }
  }

  if (info.visibility === "model-only" || hasModelOnlyPart(parts)) {
    return "providerContextOnly";
  }
  if (hasTimelineProjection(message)) {
    return "timelineOnly";
  }

  const source = messageSource(message);
  if (source === "fork") {
    return "timelineOnly";
  }
  if (source !== undefined && providerSyntheticSources.has(source)) {
    return "providerContextOnly";
  }
  if (hasLegacyReminderContext(message)) {
    return "providerContextOnly";
  }

  const synthetic = info.synthetic === true || parts.some((part) => part.synthetic === true);
  if (synthetic && hasLegacyNotification(message)) {
    return "providerContextOnly";
  }
  if (synthetic) {
    return "hiddenSynthetic";
  }

  return info.role === "assistant" ? "visibleAssistant" : "realUserInput";
}

export function isConversationRealUserTurnStarter(message: ConversationProjectionMessage): boolean {
  return (
    message.info.role === "user" &&
    getConversationMessageProjectionPolicy(message) === "realUserInput"
  );
}

export function getConversationModelOnlyTurnTriggerSource(
  message: ConversationProjectionMessage,
): string | null {
  if (
    message.info.role !== "user" ||
    getConversationMessageProjectionPolicy(message) !== "providerContextOnly"
  ) {
    return null;
  }

  const source = messageSource(message);
  if (source !== undefined && modelOnlyTurnTriggerSources.has(source)) {
    return source;
  }
  return hasLegacyNotification(message) ? "background_task" : null;
}

export function isConversationProviderContextOnlyMessage(
  message: ConversationProjectionMessage,
): boolean {
  return getConversationMessageProjectionPolicy(message) === "providerContextOnly";
}

export function isConversationTimelineOnlyMessage(message: ConversationProjectionMessage): boolean {
  return getConversationMessageProjectionPolicy(message) === "timelineOnly";
}

export function isConversationHiddenSyntheticMessage(
  message: ConversationProjectionMessage,
): boolean {
  return getConversationMessageProjectionPolicy(message) === "hiddenSynthetic";
}

// SPDX-License-Identifier: Apache-2.0
// Decision order is contractual: semantics, then visibility, then timeline, then source, then legacy text.

const POLICIES = [
  "realUserInput",
  "visibleAssistant",
  "providerContextOnly",
  "timelineOnly",
  "hiddenSynthetic",
] as const;

export type ConversationMessageProjectionPolicy = (typeof POLICIES)[number];

const REAL_USER = POLICIES[0];
const VISIBLE_ASSISTANT = POLICIES[1];
const PROVIDER_CONTEXT = POLICIES[2];
const TIMELINE = POLICIES[3];
const HIDDEN = POLICIES[4];

type SemanticsFields = {
  kind: string;
  origin: string;
  providerVisibility: string;
  source: string;
  transcriptVisibility: string;
  uiVisibility: string;
};

export type ConversationProjectionMessageSemantics = Partial<SemanticsFields>;

type PartFields = {
  ignored: boolean;
  metadata: unknown;
  summaryMessageId: string;
  synthetic: boolean;
  text: string;
  timelineType: string;
  type: string;
};

export type ConversationProjectionPart = Partial<PartFields>;

type InfoFields = {
  metadata: unknown;
  role: string;
  semantics: ConversationProjectionMessageSemantics;
  source: string;
  summary: unknown;
  synthetic: boolean;
  visibility: string;
};

type ProjectionParts = readonly ConversationProjectionPart[];

export type ConversationProjectionMessage = {
  info: Partial<InfoFields>;
  parts?: ProjectionParts;
};

type Policy = ConversationMessageProjectionPolicy;

// Membership only; the packed order is the frozen source list.
const PROVIDER_SYNTHETIC_SOURCES = new Set(
  "agent_control_message background_task goal-continuation goal_completion_verification goal_state_change plugin_reference queued_system_notification resume_goal_state resume_referenced_session_context rewind selection_side_chat subagent subagent_message target_continuation task_notification task_status todo_reminder".split(
    " ",
  ),
);

const TURN_TRIGGER_SOURCES = new Set(
  "background_task task_notification subagent subagent_message goal-continuation target_continuation".split(
    " ",
  ),
);

const GOAL_CONTINUATION_REMINDER = '<system-reminder source="goal-continuation">';
const GENERIC_REMINDER = "<system-reminder>";
const CONTINUE_GOAL = "Continue working toward the active session goal.";
const GOAL_STATE = "Current session goal state";
const CONVERSATION_REWIND = "Conversation rewind applied.";
const WORKSPACE_REWIND = "Workspace rewind applied.";
const TASK_NOTIFICATION = "<task-notification>";
const SUBAGENT_NOTIFICATION = "<subagent-notification>";
const NO_TRIGGER = null;

interface ProjectionView {
  message: ConversationProjectionMessage;
  info: ConversationProjectionMessage["info"];
  parts: readonly ConversationProjectionPart[];
  semantics: ConversationProjectionMessageSemantics | undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  return record;
}

function nonemptyString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return;
  return value;
}

// Empty string on info.source / semantics.source blocks later fallbacks. Only nullish values skip.
function readMessageSource(message: ConversationProjectionMessage): string | undefined {
  if (message.info.source !== undefined && message.info.source !== null) return message.info.source;
  const metadataSource = nonemptyString(asRecord(message.info.metadata)?.source);
  if (metadataSource !== undefined) return metadataSource;
  const semanticSource = message.info.semantics?.source;
  if (semanticSource !== undefined && semanticSource !== null) return semanticSource;
  for (const part of message.parts ?? []) {
    const partSource = nonemptyString(asRecord(part.metadata)?.source);
    if (partSource !== undefined) return partSource;
  }
  return undefined;
}

function visibleText(message: ConversationProjectionMessage): string {
  let combined = "";
  for (const part of message.parts ?? []) {
    if (part.type !== "text" || part.ignored === true) continue;
    combined += part.text ?? "";
  }
  return combined.trimStart();
}

function legacyReminder(text: string): boolean {
  if (text.startsWith(GOAL_CONTINUATION_REMINDER)) return true;
  const generic =
    text.startsWith(GENERIC_REMINDER) && (text.includes(CONTINUE_GOAL) || text.includes(GOAL_STATE));
  if (generic) return true;
  return text.includes(CONVERSATION_REWIND) || text.includes(WORKSPACE_REWIND);
}

function legacyNotification(text: string): boolean {
  return text.startsWith(TASK_NOTIFICATION) || text.startsWith(SUBAGENT_NOTIFICATION);
}

function modelOnlyCarrier(parts: readonly ConversationProjectionPart[]): boolean {
  for (const part of parts) {
    const metadata = asRecord(part.metadata);
    if (metadata === undefined) continue;
    if (metadata.visibility === "model-only") return true;
    if (nonemptyString(metadata.source) === "goal-continuation") return true;
  }
  return false;
}

function projectsTimeline(message: ConversationProjectionMessage): boolean {
  const header = message.info;
  if (header.semantics?.kind === "timeline_event" || header.source === "fork") return true;
  if (asRecord(header.metadata)?.source === "fork") return true;
  for (const part of message.parts ?? []) {
    if (part.type === "timeline") return true;
    const metadata = asRecord(part.metadata);
    if (asRecord(metadata?.forkContext)?.kind === "session_fork") return true;
    if (part.type !== "compaction") continue;
    if (typeof metadata?.timelineStatus === "string") return true;
    if (typeof part.summaryMessageId === "string") return true;
  }
  return false;
}

function markedSynthetic(
  info: ConversationProjectionMessage["info"],
  parts: readonly ConversationProjectionPart[],
): boolean {
  if (info.synthetic === true) return true;
  return parts.some((part) => part.synthetic === true);
}

function isRealUser(view: ProjectionView): boolean {
  if (view.semantics?.origin !== "real_user") return false;
  if (view.info.synthetic === true) return false;
  return view.info.visibility !== "model-only";
}

function isVisibleAssistant(view: ProjectionView): boolean {
  const semantics = view.semantics;
  if (view.info.role !== "assistant") return false;
  if (semantics?.kind !== "assistant_response") return false;
  if (semantics.uiVisibility !== "visible") return false;
  return semantics.transcriptVisibility === "visible";
}

function isHiddenRuntime(semantics: ConversationProjectionMessageSemantics): boolean {
  if (semantics.origin === "agent_runtime") return true;
  if (semantics.uiVisibility === "hidden") return true;
  return semantics.transcriptVisibility === "hidden";
}

function semanticVerdict(view: ProjectionView): Policy | undefined {
  const semantics = view.semantics;
  if (semantics === undefined) return;
  if (semantics.kind === "timeline_event") return TIMELINE;
  if (isRealUser(view)) return REAL_USER;
  if (isVisibleAssistant(view)) return VISIBLE_ASSISTANT;
  if (semantics.providerVisibility === "visible") return PROVIDER_CONTEXT;
  if (semantics.kind === "fork_notice") return TIMELINE;
  if (isHiddenRuntime(semantics)) return HIDDEN;
  return;
}

function viewOf(message: ConversationProjectionMessage): ProjectionView {
  return {
    message,
    info: message.info,
    parts: message.parts ?? [],
    semantics: message.info.semantics,
  };
}

const POLICY_STEPS: ReadonlyArray<(view: ProjectionView) => Policy | undefined> = [
  (view) =>
    view.semantics?.kind === "compact_summary" || view.info.summary !== undefined
      ? PROVIDER_CONTEXT
      : undefined,
  (view) => semanticVerdict(view),
  (view) =>
    view.info.visibility === "model-only" || modelOnlyCarrier(view.parts) ? PROVIDER_CONTEXT : undefined,
  (view) => (projectsTimeline(view.message) ? TIMELINE : undefined),
  (view) => {
    const source = readMessageSource(view.message);
    if (source === "fork") return TIMELINE;
    if (source !== undefined && PROVIDER_SYNTHETIC_SOURCES.has(source)) return PROVIDER_CONTEXT;
    return;
  },
  (view) => (legacyReminder(visibleText(view.message)) ? PROVIDER_CONTEXT : undefined),
  (view) => {
    if (!markedSynthetic(view.info, view.parts)) return;
    if (legacyNotification(visibleText(view.message))) return PROVIDER_CONTEXT;
    return HIDDEN;
  },
];

export function getConversationMessageProjectionPolicy(message: ConversationProjectionMessage) {
  const view = viewOf(message);
  for (const step of POLICY_STEPS) {
    const verdict = step(view);
    if (verdict !== undefined) return verdict;
  }
  return view.info.role === "assistant" ? VISIBLE_ASSISTANT : REAL_USER;
}

function hasPolicy(message: ConversationProjectionMessage, policy: Policy): boolean {
  return getConversationMessageProjectionPolicy(message) === policy;
}

export function isConversationRealUserTurnStarter(message: ConversationProjectionMessage): boolean {
  return message.info.role === "user" && hasPolicy(message, REAL_USER);
}

export function getConversationModelOnlyTurnTriggerSource(message: ConversationProjectionMessage) {
  const eligible = message.info.role === "user" && hasPolicy(message, PROVIDER_CONTEXT);
  if (!eligible) return NO_TRIGGER;
  const source = readMessageSource(message);
  if (source !== undefined && TURN_TRIGGER_SOURCES.has(source)) return source;
  if (legacyNotification(visibleText(message))) return "background_task";
  return NO_TRIGGER;
}

export function isConversationProviderContextOnlyMessage(
  message: ConversationProjectionMessage,
): boolean {
  return hasPolicy(message, PROVIDER_CONTEXT);
}

export function isConversationTimelineOnlyMessage(message: ConversationProjectionMessage): boolean {
  return hasPolicy(message, TIMELINE);
}

export function isConversationHiddenSyntheticMessage(
  message: ConversationProjectionMessage,
): boolean {
  return hasPolicy(message, HIDDEN);
}

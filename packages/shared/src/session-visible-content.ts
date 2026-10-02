import type { KnorviaSessionGoal } from "./protocol/index.js";
import { getConversationMessageProjectionPolicy } from "./conversation-message-projection-policy.js";
import {
  type KnorviaMessageWithParts,
  textFromKnorviaMessageParts,
} from "./protocol-legacy-types.js";

export interface KnorviaGoalIterationCountTimelineItem {
  goalIteration?: number;
  status: "started" | "completed" | "failed_closed" | "cancelled";
  verification?: { passed?: boolean | null } | null;
}

export function isKnorviaGoalContinuationReminderText(text: string): boolean {
  const content = text.trimStart();
  return (
    content.startsWith('<system-reminder source="goal-continuation">') ||
    (content.startsWith("<system-reminder>") &&
      content.includes("Continue working toward the active session goal."))
  );
}

export function isKnorviaGoalContinuationReminderMessage(
  message: KnorviaMessageWithParts,
): boolean {
  if (message.info.role !== "user") return false;
  return (
    message.info.source === "goal-continuation" ||
    String(message.info.metadata?.["source"] ?? "") === "goal-continuation" ||
    isKnorviaGoalContinuationReminderText(textFromKnorviaMessageParts(message.parts))
  );
}

export function isKnorviaGoalStateReminderText(text: string): boolean {
  const content = text.trimStart();
  return content.startsWith("<system-reminder>") && content.includes("Current session goal state");
}

export function isKnorviaGoalModelOnlyReminderMessage(message: KnorviaMessageWithParts): boolean {
  return (
    message.info.role === "user" &&
    (isKnorviaGoalContinuationReminderMessage(message) ||
      isKnorviaGoalStateReminderText(textFromKnorviaMessageParts(message.parts)))
  );
}

export function isKnorviaModelOnlySyntheticUserMessage(message: KnorviaMessageWithParts): boolean {
  if (
    message.info.role === "user" &&
    (String(message.info.source ?? "") === "subagent_message" ||
      String(message.info.metadata?.["source"] ?? "") === "subagent_message" ||
      message.parts.some(
        (part) =>
          part.type === "text" && String(part.metadata?.["source"] ?? "") === "subagent_message",
      ))
  ) {
    return true;
  }
  const policy = getConversationMessageProjectionPolicy(message);
  return policy === "providerContextOnly" || policy === "hiddenSynthetic";
}

export function isKnorviaCompactSummaryMessage(message: KnorviaMessageWithParts): boolean {
  return (
    message.info.role === "user" &&
    message.parts.some(
      (part) => part.type === "compaction" && typeof part.metadata?.["timelineStatus"] !== "string",
    )
  );
}

export function getKnorviaUserVisibleMessages(
  messages: readonly KnorviaMessageWithParts[],
  _options: { target?: KnorviaSessionGoal | null } = {},
): KnorviaMessageWithParts[] {
  const visible: KnorviaMessageWithParts[] = [];
  for (const message of messages) {
    if (
      isKnorviaModelOnlySyntheticUserMessage(message) ||
      isKnorviaCompactSummaryMessage(message)
    ) {
      continue;
    }
    visible.push(message);
  }
  return visible;
}

export function getKnorviaGoalIterationByAssistantMessageId(
  messages: readonly KnorviaMessageWithParts[],
  options: { maxGoalIteration?: number; target?: KnorviaSessionGoal | null } = {},
): Map<string, number> {
  const iterations = new Map<string, number>();
  const target = options.target ?? null;
  if (!target) return iterations;

  const ordered = [...messages].sort((left, right) => {
    const timeDifference = left.info.time.created - right.info.time.created;
    if (timeDifference !== 0) return timeDifference;
    return left.info.messageId.localeCompare(right.info.messageId);
  });
  const inactiveAt = target.status === "active" ? null : target.updatedAt;
  let current = 0;
  let pending = false;

  for (const message of ordered) {
    if (message.info.role === "user") {
      if (isKnorviaGoalContinuationReminderMessage(message)) {
        current += 1;
        pending = false;
        continue;
      }
      if (
        getConversationMessageProjectionPolicy(message) === "realUserInput" &&
        message.info.time.created >= target.createdAt - 30_000
      ) {
        pending = true;
      }
      continue;
    }
    if (message.info.role !== "assistant") continue;
    if (inactiveAt !== null && message.info.time.created > inactiveAt) continue;

    if (pending) {
      current += 1;
      pending = false;
    }
    if (current === 0 && message.info.time.created >= target.createdAt) {
      current = 1;
    }
    if (current > 0) {
      iterations.set(
        message.info.messageId,
        options.maxGoalIteration && options.maxGoalIteration > 0
          ? Math.min(current, options.maxGoalIteration)
          : current,
      );
    }
  }
  return iterations;
}

export function getKnorviaGoalActiveIterationCount(input: {
  targetStatus?: string | null;
  timeline?: readonly KnorviaGoalIterationCountTimelineItem[] | null;
}): number {
  if (!input.targetStatus) return 0;
  const timeline = input.timeline ?? [];
  if (timeline.length === 0) return 1;
  const latest = timeline[timeline.length - 1];
  if (!latest) return 1;
  const latestIteration = latest.goalIteration ?? timeline.length;
  if (latest.status === "started") return latestIteration;
  if (
    (latest.status === "completed" && latest.verification?.passed === true) ||
    input.targetStatus === "complete"
  ) {
    return latestIteration;
  }
  if (input.targetStatus !== "active") return latestIteration;
  return latestIteration + 1;
}

export function resolveKnorviaVisibleSessionTitle(input: {
  title?: string;
  messages: readonly KnorviaMessageWithParts[];
  target?: KnorviaSessionGoal | null;
  fallback?: string;
}): string {
  const title = input.title?.trim() ?? "";
  if (
    title &&
    !isKnorviaGoalContinuationReminderText(title) &&
    !isKnorviaGoalStateReminderText(title)
  ) {
    return title;
  }

  const firstUser = input.messages.find(
    (message) =>
      message.info.role === "user" &&
      getConversationMessageProjectionPolicy(message) === "realUserInput" &&
      !isKnorviaGoalModelOnlyReminderMessage(message),
  );
  const userText = textFromKnorviaMessageParts(firstUser?.parts ?? []).trim();
  if (userText) return userText.slice(0, 80);
  const objective = input.target?.objective.trim() ?? "";
  if (objective) return objective.slice(0, 80);
  return input.fallback ?? "New session";
}

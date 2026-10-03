import { EventReducer, SessionEventType, type GoalCompletionVerificationOutput, type MessageWithParts, type SessionEvent, type SessionGoal, type SessionInfo, type SessionProjection } from "@knorvia/contracts";
import { normalizedHistoryText, sessionRecord, sessionString } from "./session-projection-primitives.js";

export type GoalBoundary = SessionProjection["targetCompletionVerificationTimeline"][number];

export function compareGoalBoundaries(left: GoalBoundary, right: GoalBoundary): number {
  const first = left.goalIteration ?? 0;
  const second = right.goalIteration ?? 0;
  if (first !== second && first > 0 && second > 0) return first - second;
  const time = (left.startedAt ?? left.updatedAt).getTime() - (right.startedAt ?? right.updatedAt).getTime();
  return time !== 0 ? time : left.verificationId.localeCompare(right.verificationId);
}

export function goalBoundaries(projection: SessionProjection, target?: SessionGoal | null): GoalBoundary[] {
  const id = target?.targetID;
  return (projection.targetCompletionVerificationTimeline ?? [])
    .filter((boundary) => !id || boundary.targetId === id).sort(compareGoalBoundaries);
}

export function compareSessionMessages(left: MessageWithParts, right: MessageWithParts): number {
  const elapsed = left.info.time.created - right.info.time.created;
  return elapsed !== 0 ? elapsed : String(left.info.id).localeCompare(String(right.info.id));
}

function summaryKey(summary: GoalCompletionVerificationOutput): string {
  return [
    summary.passed ? "1" : "0",
    normalizedHistoryText(summary.reason),
    normalizedHistoryText(summary.nextAction ?? ""),
  ].join(String.fromCharCode(0));
}

export function restoreGoalVerifications(
  projection: SessionProjection,
  events: readonly SessionEvent[],
  target?: SessionGoal | null,
): SessionProjection {
  if (events.length === 0) return projection;
  let restored: SessionProjection = {
    ...projection,
    targetCompletionVerifications: projection.targetCompletionVerifications ?? [],
    targetCompletionVerificationTimeline: projection.targetCompletionVerificationTimeline ?? [],
  };
  const targetId = target?.targetID ?? projection.target?.targetID;
  const reducer = new EventReducer();
  const replay = Array.from(events)
    .filter((event) => event.type === SessionEventType.TargetCompletionVerification)
    .filter((event) => {
      const id = sessionString(sessionRecord(event.payload).targetId);
      return !targetId || !id || id === targetId;
    })
    .sort((left, right) => {
      const elapsed = left.timestamp.getTime() - right.timestamp.getTime();
      return elapsed !== 0 ? elapsed : left.sequenceNumber - right.sequenceNumber;
    });
  for (const event of replay) restored = reducer.apply(restored, event);
  const timeline = goalBoundaries(restored, target);
  const summaries = new Map<string, GoalCompletionVerificationOutput>();
  const append = (summary: GoalCompletionVerificationOutput) => {
    const key = summaryKey(summary);
    if (!summaries.has(key)) summaries.set(key, summary);
  };
  Array.from(restored.targetCompletionVerifications).forEach(append);
  timeline.map((boundary) => boundary.verification)
    .filter((summary): summary is GoalCompletionVerificationOutput => summary !== undefined)
    .forEach(append);
  return {
    ...restored,
    targetCompletionVerificationTimeline: timeline,
    targetCompletionVerifications: Array.from(summaries.values()),
  };
}

export function goalTitleFallback(projection: SessionProjection, session: SessionInfo | null | undefined, messages: readonly MessageWithParts[]): SessionProjection {
  const goal = projection.target;
  if (!goal || goal.summaryTitle || !session?.title) return projection;
  const users = messages.filter((message) => message.info.role === "user").sort(compareSessionMessages);
  const first = users[0];
  const TITLE_WINDOW_MS = 5_000;
  if (!first || Math.abs(first.info.time.created - goal.time.created) > TITLE_WINDOW_MS) return projection;
  const text = first.parts.map((part) => part.type === "text" && typeof part.text === "string" ? part.text : "").join("\n");
  if (normalizedHistoryText(text) !== normalizedHistoryText(goal.objective)) return projection;
  const output = { ...projection };
  output.target = { ...goal, summaryTitle: session.title };
  return output;
}

/** 只由 verifier 边界折叠决定归属；人工消息/TodoWrite 本身不推进轮次。 */
export function goalIterationAt(time: number, target: SessionGoal | null | undefined, timeline: readonly GoalBoundary[]): number | undefined {
  if (!target || time < target.time.created) return undefined;
  let iteration = 1;
  for (const boundary of timeline) {
    const selected = boundary.goalIteration ?? iteration;
    const through = boundary.updatedAt.getTime();
    if (time <= through) return selected;
    if (boundary.status === "started") iteration = selected;
    else if (boundary.status === "completed" && boundary.verification?.passed === true) return undefined;
    else iteration = selected + 1;
  }
  return iteration;
}

export function goalIterationStart(iteration: number, target: SessionGoal | null | undefined, timeline: readonly GoalBoundary[], fallback: number): number {
  if (!target || iteration <= 1) return target?.time.created ?? fallback;
  const ended = Array.from(timeline)
    .filter((boundary) => (boundary.goalIteration ?? 0) === iteration - 1)
    .filter((boundary) => boundary.status !== "started")
    .sort(compareGoalBoundaries);
  return ended.at(-1)?.updatedAt.getTime() ?? fallback;
}

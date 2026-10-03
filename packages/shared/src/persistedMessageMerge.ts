import type { KnorviaPersistedMessage, KnorviaPersistedMessagePart } from "./task-types-core.js";

function combine(
  first: KnorviaPersistedMessage,
  next: KnorviaPersistedMessage,
): KnorviaPersistedMessage {
  const beforeTools = first.tools ?? [];
  const afterTools = next.tools ?? [];
  const tools =
    beforeTools.length + afterTools.length > 0 ? [...beforeTools, ...afterTools] : undefined;
  const offset = beforeTools.length;
  const beforeParts = first.parts ?? [];
  const afterParts = (next.parts ?? []).map(
    (part): KnorviaPersistedMessagePart =>
      part.type === "tool-call" ? { type: "tool-call", toolIndex: part.toolIndex + offset } : part,
  );
  const parts =
    beforeParts.length + afterParts.length > 0 ? [...beforeParts, ...afterParts] : undefined;
  const content = first.content + next.content;
  const thought =
    first.thought === undefined && next.thought === undefined
      ? undefined
      : (first.thought ?? "") + (next.thought ?? "");
  const durationMs =
    first.durationMs === undefined || next.durationMs === undefined
      ? undefined
      : Math.max(next.timestamp + next.durationMs - first.timestamp, 0);
  const characterCount =
    first.characterCount === undefined && next.characterCount === undefined
      ? undefined
      : content.length;
  const ids = Array.from(
    new Set(
      [
        first.id,
        ...(first.mergedMessageIds ?? []),
        next.id,
        ...(next.mergedMessageIds ?? []),
      ].filter(Boolean),
    ),
  ) as string[];
  return {
    ...first,
    content,
    timestamp: first.timestamp,
    model: next.model ?? first.model,
    durationMs,
    characterCount,
    interrupted: next.interrupted ?? first.interrupted,
    feedback: next.feedback ?? first.feedback,
    mergedMessageIds: ids.length > 0 ? ids : undefined,
    goalIteration: next.goalIteration ?? first.goalIteration,
    attachments: next.attachments ?? first.attachments,
    tools,
    thought,
    parts,
    checkpointState: next.checkpointState ?? first.checkpointState,
    checkpointReason: next.checkpointReason ?? first.checkpointReason,
    checkpointUpdatedAt: next.checkpointUpdatedAt ?? first.checkpointUpdatedAt,
    bodyRefs: next.bodyRefs ?? first.bodyRefs,
    toolSlice: next.toolSlice ?? first.toolSlice,
  };
}

export function coalesceConsecutiveKnorviaAssistants(
  messages: readonly KnorviaPersistedMessage[],
): KnorviaPersistedMessage[] {
  const output: KnorviaPersistedMessage[] = [];
  for (const current of messages) {
    const previous = output.at(-1);
    if (
      current.role === "assistant" &&
      previous?.role === "assistant" &&
      !previous.syntheticTimeline &&
      !current.syntheticTimeline &&
      previous.goalIteration === current.goalIteration
    ) {
      output[output.length - 1] = combine(previous, current);
    } else output.push(current);
  }
  let turn = -1;
  return output.map((message) => {
    if (message.role === "user") turn++;
    const effective = turn < 0 ? 0 : turn;
    return message.turnIndex === effective ? message : { ...message, turnIndex: effective };
  });
}

// SPDX-License-Identifier: Apache-2.0
// Content and thought chunks fuse so a streaming UI does not treat each token as the latest part.

export type KnorviaAssistantMessagePart =
  | { type: "content"; content: string }
  | { type: "thought"; content: string }
  | { type: "tool-call"; toolId: string };

type TextCarrier = Extract<KnorviaAssistantMessagePart, { content: string }>;

const TEXT_CARRIER_TYPES = new Set<KnorviaAssistantMessagePart["type"]>(["content", "thought"]);

function textCarrier(part: KnorviaAssistantMessagePart): part is TextCarrier {
  return TEXT_CARRIER_TYPES.has(part.type);
}

export function appendAssistantMessagePart(
  parts: readonly KnorviaAssistantMessagePart[] | undefined,
  nextPart: KnorviaAssistantMessagePart,
): KnorviaAssistantMessagePart[] {
  const sequence = parts === undefined ? [] : Array.from(parts);
  const tail = sequence.at(-1);
  if (
    tail !== undefined &&
    textCarrier(tail) &&
    textCarrier(nextPart) &&
    tail.type === nextPart.type
  ) {
    sequence[sequence.length - 1] = { ...tail, content: tail.content + nextPart.content };
    return sequence;
  }
  sequence.push(nextPart);
  return sequence;
}

export function getLatestAssistantContentPart(
  parts: readonly KnorviaAssistantMessagePart[],
): Extract<KnorviaAssistantMessagePart, { type: "content" }> | null {
  for (let cursor = parts.length - 1; cursor >= 0; cursor -= 1) {
    const part = parts[cursor];
    if (part !== undefined && part.type === "content") return part;
  }
  return null;
}

export function getLatestAssistantContentText(
  parts: readonly KnorviaAssistantMessagePart[],
): string {
  const latest = getLatestAssistantContentPart(parts);
  return latest === null ? "" : latest.content;
}

// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { ModelInputMessage } from "@knorvia/contracts";

export function normalizeOpenAiCompatibleSystemMessages(
  messages: readonly ModelInputMessage[],
): ModelInputMessage[] {
  let end = 0;
  const parts: string[] = [];
  while (end < messages.length && messages[end].role === "system") {
    const content = messages[end].content;
    parts.push(
      typeof content === "string"
        ? content
        : content
            .map((p) => (p.type === "text" ? p.text : ""))
            .filter(Boolean)
            .join("\n"),
    );
    end += 1;
  }
  if (end < 2) return [...messages];
  return [{ ...messages[0], content: parts.join("\n\n") }, ...messages.slice(end)];
}

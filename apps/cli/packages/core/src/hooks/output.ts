// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export { processHookOutput } from "./output-projection.js";
export { mergeHookRunResult } from "./output-reduction.js";

export function matchesHookMatcher(
  value: string | undefined,
  expression: string | undefined,
): boolean {
  if (!expression || expression === "*") return true;
  if (!value) return false;
  const literalAlternatives = Array.from(expression).every((character) => {
    const code = character.charCodeAt(0);
    return (
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      character === "_" ||
      character === "|"
    );
  });
  if (literalAlternatives) return new Set(expression.split("|")).has(value);
  try {
    return new RegExp(expression).test(value);
  } catch {
    return false;
  }
}

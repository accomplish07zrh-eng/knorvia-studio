// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { collect, type ErrorPayloadRole } from "./payload/frames.js";
import { FALLBACK, project, select } from "./payload/selection.js";
import { text } from "./payload/text.js";
export { ErrorPayloadRole } from "./payload/frames.js";

export function withErrorPayloadRole(
  context: Record<string, unknown> | undefined,
  role: ErrorPayloadRole,
): Record<string, unknown> {
  return { ...context, errorPayloadRole: role };
}

export function selectExecutionErrorMessage(error: unknown, fallbackMessage = FALLBACK): string {
  return (
    select(collect(error)).primary?.original ?? text(fallbackMessage, "original") ?? fallbackMessage
  );
}

export function projectExecutionErrorPayload(error: unknown, fallbackMessage = FALLBACK) {
  return project(collect(error), fallbackMessage);
}

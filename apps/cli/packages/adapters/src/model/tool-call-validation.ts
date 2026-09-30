// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import { AiSdkModelAdapterError } from "./errors.js";
export function normalizeModelToolName(value: unknown, context: Record<string, unknown>): string {
  if (typeof value === "string" && value.trim()) return value;
  const toolCallId = context.toolCallId ?? context.id;
  if (
    value === "" &&
    typeof toolCallId === "string" &&
    toolCallId.length > 0 &&
    context.providerExecuted !== true
  )
    return "";
  throw new AiSdkModelAdapterError(
    "invalid_model_response",
    "Model returned an invalid tool name",
    {
      context: { ...context, retryable: false, source: "provider", reason: "invalid_request" },
    },
  );
}

// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { EnvRecord } from "./model-execution.js";
import type { ModelStatusContext } from "./runner-status.js";
import { ensureCliDeviceMid } from "../device/cli-device-mid.js";

export async function resolveAnthropicRequestMetadataUserId(input: {
  env: EnvRecord;
  providerKind: string | undefined;
  sessionId?: ModelStatusContext["sessionId"];
}): Promise<string | undefined> {
  if (input.providerKind !== "anthropic") return undefined;
  const deviceId = await ensureCliDeviceMid({ env: input.env });
  if (!deviceId) return undefined;
  const sessionId = String(input.sessionId ?? "");
  return JSON.stringify({ device_id: deviceId, account_uuid: "", session_id: sessionId });
}

export function redactAnthropicRequestMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAnthropicRequestMetadata);
  if (typeof value !== "object" || value === null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = /^(user_?id)$/i.test(key) ? "[REDACTED]" : redactAnthropicRequestMetadata(entry);
  }
  return output;
}

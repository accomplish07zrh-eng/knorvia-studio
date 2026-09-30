// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
const SENSITIVE = /^(authorization|proxy-authorization|x-api-key|api-key|cookie|set-cookie)$/i;
export function sanitizeModelNetworkHeaders(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) return {};
  const output: Record<string, string> = {};
  for (const [name, entry] of Object.entries(value)) {
    if (typeof entry !== "string") continue;
    output[name] = SENSITIVE.test(name) ? "[REDACTED]" : entry;
  }
  return output;
}

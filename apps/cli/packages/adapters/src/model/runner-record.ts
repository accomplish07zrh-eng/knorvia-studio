// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
export function stringProperty(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}
export function numberProperty(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
export function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

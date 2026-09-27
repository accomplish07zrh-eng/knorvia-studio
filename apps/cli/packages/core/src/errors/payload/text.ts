// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
type Form = "original" | "trimmed" | "summary" | "tag";
const SUMMARY_LIMIT = 500;
const TAG_LIMIT = 160;
const ELLIPSIS = "...";

export function text(value: unknown, form: Form = "trimmed"): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (form === "original") return value;
  if (form === "tag") return trimmed.slice(0, TAG_LIMIT);
  if (form === "trimmed") return trimmed;
  const compact = trimmed.replace(/\s+/g, " ");
  return compact.length > SUMMARY_LIMIT
    ? compact.slice(0, SUMMARY_LIMIT - ELLIPSIS.length) + ELLIPSIS
    : compact;
}

export function code(value: unknown): string | undefined {
  const label = text(value);
  if (label !== undefined) return label;
  return typeof value === "number" && Number.isFinite(value) && value !== 0
    ? String(value)
    : undefined;
}

export function scalar(value: unknown): string | undefined {
  if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)))
    return String(value);
  return text(value);
}

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

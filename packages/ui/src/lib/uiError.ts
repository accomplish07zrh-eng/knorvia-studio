// SPDX-License-Identifier: Apache-2.0
// Modified for Knorvia Studio: B1 contract-based projection, 2026-09-30.
// Prior source was reviewed; independent authorship/license review remains pending.
import type { KnorviaError, TraceId } from "@knorvia/shared";
import { errorAttributionSchema, type ErrorAttribution } from "@knorvia/shared/protocol-v4";

export interface KnorviaUiError extends KnorviaError {
  attribution?: ErrorAttribution;
  detail?: string;
  underlyingErrorMessage?: string;
  underlyingErrorDetail?: string;
}

interface NormalizeKnorviaUiErrorOptions {
  fallbackCode?: string;
  fallbackMessage?: string;
  traceId?: TraceId;
  taskId?: string;
}

type ErrorRecord = Record<string, unknown>;
type FieldPath = readonly string[];

const wrappers = new Set([
  "Internal error",
  "Turn execution failed",
  "Compact failed",
  "Rewind failed",
  "Knorvia Studio session failed",
]);

const envelopes: readonly FieldPath[] = [
  [],
  ["data"],
  ["data", "error"],
  ["data", "knorvia", "error"],
];

function envelopePaths(field: string): FieldPath[] {
  return envelopes.map((envelope) => [...envelope, field]);
}

// 字段规则保持协议优先级；details/reason 只参与文案，不参与业务码 detail 提取。
const messagePaths: readonly FieldPath[] = [
  ["message"],
  ["detail"],
  ["data", "message"],
  ["data", "detail"],
  ["data", "details"],
  ["data", "reason"],
  ["data", "error", "message"],
  ["data", "error", "detail"],
  ["data", "error", "details"],
  ["data", "knorvia", "error", "message"],
  ["data", "knorvia", "error", "detail"],
  ["data", "knorvia", "error", "details"],
];
const codePaths: readonly FieldPath[] = [
  ["code"],
  ["providerCode"],
  ["data", "code"],
  ["data", "error", "code"],
  ["data", "knorvia", "error", "code"],
  ["data", "knorvia", "error", "context", "providerCode"],
  ["data", "error", "context", "providerCode"],
  ["context", "providerCode"],
];
const fieldPaths = {
  detail: envelopePaths("detail"),
  underlyingErrorMessage: envelopePaths("underlyingErrorMessage"),
  underlyingErrorDetail: envelopePaths("underlyingErrorDetail"),
  traceId: envelopePaths("traceId"),
  taskId: envelopePaths("taskId"),
  attribution: envelopePaths("attribution"),
};

function record(value: unknown): ErrorRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ErrorRecord)
    : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function jsonRecord(value: string): ErrorRecord | undefined {
  const input = value.trim();
  if (input[0] !== "{" && input[0] !== "[") return undefined;
  try {
    return record(JSON.parse(input));
  } catch {
    return undefined;
  }
}

function valueAt(input: ErrorRecord | undefined, path: FieldPath): unknown {
  let cursor: unknown = input;
  for (const key of path) {
    const parent = record(cursor);
    if (!parent) return undefined;
    cursor = parent[key];
  }
  return cursor;
}

function textsAt(input: ErrorRecord, paths: readonly FieldPath[]): string[] {
  const values = new Set<string>();
  for (const path of paths) {
    const value = text(valueAt(input, path));
    if (value !== undefined) values.add(value);
  }
  return [...values];
}

function candidatesFor(input: unknown): string[] {
  const values = new Set<string>();
  const append = (value: unknown) => {
    const normalized = text(value);
    if (normalized !== undefined) values.add(normalized);
  };

  if (input instanceof Error) append(input.message);
  if (typeof input === "string") {
    const parsed = jsonRecord(input);
    const candidates = parsed ? textsAt(parsed, messagePaths) : [];
    if (candidates.length) return candidates;
    append(input);
    return [...values];
  }

  const source = record(input);
  if (!source) {
    append(String(input));
    return [...values];
  }
  // 先采集一层字段，再展开每个候选；顶层 JSON 字符串不走这次展开。
  for (const candidate of textsAt(source, messagePaths)) {
    values.add(candidate);
    const nested = jsonRecord(candidate);
    if (nested) for (const value of textsAt(nested, messagePaths)) values.add(value);
  }
  return [...values];
}

function firstText(
  source: ErrorRecord | undefined,
  paths: readonly FieldPath[],
): string | undefined {
  if (!source) return undefined;
  for (const path of paths) {
    const candidate = text(valueAt(source, path));
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function attributionFor(source: ErrorRecord | undefined): ErrorAttribution | undefined {
  if (!source) return undefined;
  for (const path of fieldPaths.attribution) {
    const result = errorAttributionSchema.safeParse(valueAt(source, path));
    if (result.success) return result.data;
  }
  return undefined;
}

export function normalizeKnorviaUiError(
  error: unknown,
  options: NormalizeKnorviaUiErrorOptions = {},
): KnorviaUiError {
  const candidates = candidatesFor(error);
  const message =
    candidates.find((candidate) => !wrappers.has(candidate)) ??
    candidates[0] ??
    options.fallbackMessage ??
    "Internal error";
  const detail = candidates.find((candidate) => candidate !== message && !wrappers.has(candidate));
  const source = typeof error === "string" ? jsonRecord(error) : record(error);
  const code = firstText(source, codePaths);
  const providerDetail = firstText(source, fieldPaths.detail);
  const underlyingErrorMessage = firstText(source, fieldPaths.underlyingErrorMessage);
  const underlyingErrorDetail = firstText(source, fieldPaths.underlyingErrorDetail);
  // 第一份 detail 中的业务码优先于包装层 code，保证 quota 横幅仍能识别。
  const providerCode = providerDetail?.match(/provider_code=([0-9]+)/)?.[1];
  const traceId = firstText(source, fieldPaths.traceId) as TraceId | undefined;
  const taskId = firstText(source, fieldPaths.taskId);
  const attribution = attributionFor(source);

  return {
    code: providerCode ?? code ?? options.fallbackCode ?? "UNKNOWN",
    message,
    detail,
    ...(underlyingErrorMessage ? { underlyingErrorMessage } : {}),
    ...(underlyingErrorDetail ? { underlyingErrorDetail } : {}),
    traceId: options.traceId ?? traceId,
    taskId: options.taskId ?? taskId,
    ...(attribution ? { attribution } : {}),
  };
}

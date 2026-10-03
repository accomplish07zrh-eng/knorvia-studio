import { CoreErrorType, createCoreError } from "../deps.js";
import { isPlainRecord } from "./data.js";

interface ProviderBusinessMetadataFailure {
  message: string;
  providerCode?: string;
  responseBodySummary?: Record<string, unknown>;
}

function normalizeProviderCode(value: unknown): string | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(Math.trunc(value)) : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

function normalizeProviderMessage(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readProviderCode(record: Record<string, unknown>): string | undefined {
  const errorRecord = isPlainRecord(record.error) ? record.error : undefined;
  const contextRecord = isPlainRecord(record.context) ? record.context : undefined;

  return (
    normalizeProviderCode(record.code) ??
    normalizeProviderCode(record.providerCode) ??
    normalizeProviderCode(record.error_code) ??
    normalizeProviderCode(errorRecord?.code) ??
    normalizeProviderCode(errorRecord?.providerCode) ??
    normalizeProviderCode(errorRecord?.error_code) ??
    normalizeProviderCode(contextRecord?.providerCode) ??
    normalizeProviderCode(contextRecord?.code)
  );
}

function readProviderMessage(record: Record<string, unknown>): string | undefined {
  const errorRecord = isPlainRecord(record.error) ? record.error : undefined;
  const contextRecord = isPlainRecord(record.context) ? record.context : undefined;

  return (
    normalizeProviderMessage(record.msg) ??
    normalizeProviderMessage(record.providerMessage) ??
    normalizeProviderMessage(record.message) ??
    normalizeProviderMessage(errorRecord?.msg) ??
    normalizeProviderMessage(errorRecord?.providerMessage) ??
    normalizeProviderMessage(errorRecord?.message) ??
    normalizeProviderMessage(contextRecord?.providerMessage) ??
    normalizeProviderMessage(contextRecord?.msg) ??
    normalizeProviderMessage(contextRecord?.message)
  );
}

function isNonzeroProviderCode(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue !== 0 : true;
}

function summarizeProviderResponse(
  record: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const summary: Record<string, unknown> = {};
  const entries = Object.entries(record);
  for (const [key, value] of entries) {
    if (value === undefined) {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      summary[key] = value;
    } else if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "string")
    ) {
      summary[key] = value;
    }
  }
  return Object.keys(summary).length > 0 ? summary : undefined;
}

function classifyProviderBusinessRecord(
  record: Record<string, unknown>,
): ProviderBusinessMetadataFailure | undefined {
  const providerCode = readProviderCode(record);
  const message = readProviderMessage(record);
  if (record.success === false || isNonzeroProviderCode(providerCode)) {
    return {
      message: message ?? "Provider returned a business error.",
      providerCode,
      responseBodySummary: summarizeProviderResponse(record),
    };
  }
  return undefined;
}

export function findProviderBusinessFailureInMetadata(
  providerMetadata: Record<string, unknown> | undefined,
): ProviderBusinessMetadataFailure | undefined {
  if (!providerMetadata) {
    return undefined;
  }
  const queue: unknown[] = [providerMetadata];
  const seen = new WeakSet<object>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }
    const record = current as Record<string, unknown>;
    const failure = classifyProviderBusinessRecord(record);
    if (failure) {
      return failure;
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }
  return undefined;
}

export function createCoreErrorFromProviderBusinessLike(
  error: unknown,
): ReturnType<typeof createCoreError> | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  let failure: ProviderBusinessMetadataFailure | undefined;
  if (
    record.isProviderBusinessError === true ||
    record.name === "ProviderBusinessError"
  ) {
    failure = classifyProviderBusinessRecord(record);
  } else {
    const contextRecord = isPlainRecord(record.context)
      ? record.context
      : undefined;
    if (contextRecord) {
      failure = classifyProviderBusinessRecord({
        ...contextRecord,
        msg: contextRecord.msg ?? contextRecord.providerMessage ?? record.message,
        message: contextRecord.message ?? record.message,
        code: contextRecord.providerCode ?? contextRecord.code,
      });
    }
    if (!failure) {
      failure = classifyProviderBusinessRecord(record);
    }
  }
  if (!failure) {
    return undefined;
  }
  return createCoreError(CoreErrorType.ModelError, failure.message, {
    context: {
      ...(failure.providerCode ? { providerCode: failure.providerCode } : {}),
      ...(failure.responseBodySummary
        ? { responseBodySummary: failure.responseBodySummary }
        : {}),
    },
    recoverable: true,
    retryable: false,
  });
}

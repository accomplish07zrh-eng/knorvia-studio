export const KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE = "KNORVIA_FILE_LOCK_TIMEOUT" as const;

export interface NormalizedUnknownError {
  message: string;
  code?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeCode(value: unknown): string | undefined {
  switch (typeof value) {
    case "string":
    case "number":
    case "bigint":
      return String(value);
    default:
      return undefined;
  }
}

export function stringifyUnknownValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "undefined":
      return "undefined";
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) {
      return serialized;
    }
  } catch {
    // 循环引用等情况会使 JSON 序列化抛错，此时再使用字符串转换。
  }
  return String(value);
}

export function normalizeUnknownError(error: unknown): NormalizedUnknownError {
  let candidate = error;
  if (isRecord(error) && "error" in error) {
    const nested = error.error;
    if (isRecord(nested) && ("message" in nested || "code" in nested)) {
      candidate = nested;
    }
  }

  if (candidate instanceof Error) {
    // Error.message 为空时，依次使用名称和对象字符串，避免输出空消息。
    return {
      message: candidate.message || candidate.name || String(candidate),
      code: normalizeCode((candidate as Error & { code?: unknown }).code),
    };
  }

  if (isRecord(candidate)) {
    const code = "code" in candidate ? normalizeCode(candidate.code) : undefined;
    let message =
      "message" in candidate
        ? stringifyUnknownValue(candidate.message)
        : stringifyUnknownValue(candidate);
    if (message === "undefined" || message.length === 0) {
      message = stringifyUnknownValue(candidate);
    }
    return { message, code };
  }

  return { message: stringifyUnknownValue(candidate) };
}

export function isKnorviaFileLockTimeoutError(error: unknown): boolean {
  return normalizeUnknownError(error).code === KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE;
}

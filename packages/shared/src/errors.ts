// SPDX-License-Identifier: Apache-2.0
// 未知错误归一化：把抛进来的任意值折算成 { message, code? }，供日志与判别共用（B3）。

/** 文件锁等待超时的错误码文本；与旧实现字面一致（known-differences §4）。 */
const FILE_LOCK_TIMEOUT_CODE_TEXT = "KNORVIA_FILE_LOCK_TIMEOUT";

export const KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE = FILE_LOCK_TIMEOUT_CODE_TEXT;

/** 归一化结果：可读消息文本，外加来源给出时的错误码文本。 */
export type NormalizedUnknownError = {
  message: string;
  code?: string;
};

/** 只有这几种 typeof 会折算成有意义的 code 文本，其余一律缺席。 */
const CODE_BEARING_TYPES = new Set(["string", "number", "bigint"]);

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function normalizeCode(raw: unknown): string | undefined {
  return CODE_BEARING_TYPES.has(typeof raw) ? String(raw) : undefined;
}

export function stringifyUnknownValue(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }
  // 标量统一走 String()：null→"null"、undefined→"undefined"，与逐分支返回逐字一致。
  if (
    input === null ||
    input === undefined ||
    typeof input === "number" ||
    typeof input === "boolean" ||
    typeof input === "bigint"
  ) {
    return String(input);
  }

  try {
    const serialized = JSON.stringify(input);
    if (serialized !== undefined) {
      return serialized;
    }
  } catch {
    // 循环引用等情形序列化会抛错，落到下面的字符串转换兜底。
  }
  return String(input);
}

/** { error: … } 包装只在内层带 message/code 时解开，避免吞掉外层信息。 */
function unwrapNestedCandidate(thrown: unknown): unknown {
  if (!isRecord(thrown) || !("error" in thrown)) {
    return thrown;
  }
  const inner = thrown.error;
  const innerUsable = isRecord(inner) && ("message" in inner || "code" in inner);
  return innerUsable ? inner : thrown;
}

function describeErrorInstance(instance: Error): NormalizedUnknownError {
  // message 为空时依次退到 name 与对象字符串，避免输出空消息；|| 惰性求值与旧实现一致。
  const message = instance.message || instance.name || String(instance);
  const code = normalizeCode((instance as Error & { code?: unknown }).code);
  const normalized: NormalizedUnknownError = { message, code };
  return normalized;
}

function describePlainRecord(record: Record<string, unknown>): NormalizedUnknownError {
  const code = "code" in record ? normalizeCode(record.code) : undefined;
  const preferredText =
    "message" in record ? stringifyUnknownValue(record.message) : stringifyUnknownValue(record);
  const message =
    preferredText === "undefined" || preferredText.length === 0
      ? stringifyUnknownValue(record)
      : preferredText;
  const normalized: NormalizedUnknownError = { message, code };
  return normalized;
}

export function normalizeUnknownError(thrown: unknown): NormalizedUnknownError {
  const picked = unwrapNestedCandidate(thrown);
  if (picked instanceof Error) {
    return describeErrorInstance(picked);
  }
  if (isRecord(picked)) {
    return describePlainRecord(picked);
  }
  return { message: stringifyUnknownValue(picked) };
}

export function isKnorviaFileLockTimeoutError(thrown: unknown): boolean {
  const normalized = normalizeUnknownError(thrown);
  return normalized.code === KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE;
}

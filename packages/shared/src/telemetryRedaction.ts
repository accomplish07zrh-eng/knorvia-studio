// SPDX-License-Identifier: Apache-2.0
// 遥测文本/URL/模型标识的脱敏与收敛管线（B19–B21）。
// 管线的阶段顺序与正则逐字是行为的一部分（含已知的非幂等重跑特征，见 known-differences §5）；
// 阶段表本身是纯数据，住在 telemetryRedaction-data.ts，这里只做调度与归一。
import { decodeCustomModelValue } from "./custom-model-value.js";
import { migrateLegacyModelProviderId } from "./legacy-model-provider-identity.js";
import { isBuiltinModelProviderId } from "./model-provider-types.js";
import { OFFICIAL_GLM_MODEL_IDS } from "./official-glm-model-id.js";
import {
  CONTROL_CHARS_PATTERN,
  HOST_LIKE_PATTERN,
  LEGACY_BUILTIN_MODEL_IDS,
  LOCAL_PATH_PATTERNS,
  NON_HTTP_URL_PREFIXES,
  PROVIDER_SCOPE_TABLE,
  REDACTION_LIMITS,
  SEGMENT_SENSITIVE_PATTERNS,
  TEXT_REDACTION_STAGES,
  WHITESPACE_RUN_PATTERN,
} from "./telemetryRedaction-data.js";

export const TELEMETRY_TEXT_MAX_LENGTH: number = REDACTION_LIMITS.textMax;

export interface RedactTelemetryTextOptions {
  /** 输出截断长度；缺省用 TELEMETRY_TEXT_MAX_LENGTH。 */
  maxLength?: number;
}

/** 供应商档位取值来自数据表，类型面直接由表推导。 */
export type TelemetryProviderScope =
  (typeof PROVIDER_SCOPE_TABLE)[keyof typeof PROVIDER_SCOPE_TABLE];

/** 可为空的三态文本入参（undefined / null 都按空串处理）。 */
type NullableText = string | undefined | null;

/** 收敛后的供应商标识 + 档位。 */
export interface TelemetryProviderIdentity {
  providerId: string;
  providerScope: TelemetryProviderScope;
}

type RedactionStage = (typeof TEXT_REDACTION_STAGES)[number];

/** 安全模型 ID 集合：官方 ID 小写化 + 历史内置 ID（两者都在数据文件里）。 */
const SAFE_MODEL_ID_SET: ReadonlySet<string> = new Set([
  ...OFFICIAL_GLM_MODEL_IDS.map((officialId) => officialId.toLowerCase()),
  ...LEGACY_BUILTIN_MODEL_IDS,
]);

export const TELEMETRY_SAFE_BUILTIN_MODEL_IDS = SAFE_MODEL_ID_SET;

/** 单阶段施加：`url` 段交给 URL 归一，其余按表里的固定替换文本直替。 */
function applyStage(input: string, stage: RedactionStage): string {
  if (stage.kind === "url") {
    return input.replace(stage.pattern, (hit) => redactTelemetryUrl(hit));
  }
  return input.replace(stage.pattern, stage.replacement);
}

export const redactTelemetryText = (
  rawText: NullableText,
  redactionOptions: RedactTelemetryTextOptions = {},
): string => {
  if (typeof rawText !== "string" || rawText.length === 0) return "";

  const limit = redactionOptions.maxLength ?? TELEMETRY_TEXT_MAX_LENGTH;
  const window = rawText.slice(0, REDACTION_LIMITS.scanLimit);
  const staged = TEXT_REDACTION_STAGES.reduce(applyStage, window);
  const flattened = staged.replace(CONTROL_CHARS_PATTERN, " ").replace(WHITESPACE_RUN_PATTERN, " ");
  return flattened.trim().slice(0, limit);
};

/** 单段归一：敏感形态整体收敛，其余按上限截断。 */
function normalizeRouteSegment(segment: string): string {
  if (segment.length === 0) return segment;
  const sensitive =
    segment.includes("@") || SEGMENT_SENSITIVE_PATTERNS.some((pattern) => pattern.test(segment));
  return sensitive ? "{segment}" : segment.slice(0, REDACTION_LIMITS.routeSegmentMax);
}

/** 非 HTTP 输入的分类：blob/data 归一成标签，本地路径归一成 local_file。 */
function classifyNonHttpInput(trimmed: string): string | null {
  for (const entry of NON_HTTP_URL_PREFIXES) {
    if (trimmed.toLowerCase().startsWith(entry.prefix)) return entry.label;
  }
  const looksLocal = LOCAL_PATH_PATTERNS.some((pattern) => pattern.test(trimmed));
  return looksLocal || trimmed.startsWith("/") ? "local_file" : null;
}

function tryParseUrl(candidate: string): URL | null {
  try {
    return new URL(candidate);
  } catch {
    return null; // 补不出合法 URL 时由调用方按 unknown 收敛
  }
}

export const redactTelemetryUrl = (rawInput: NullableText): string => {
  const trimmed = (typeof rawInput === "string" ? rawInput : "").trim();
  if (trimmed.length === 0) return "unknown";

  const bucket = classifyNonHttpInput(trimmed);
  if (bucket !== null) return bucket;

  const probe = trimmed.includes("://")
    ? trimmed
    : HOST_LIKE_PATTERN.test(trimmed)
      ? `https://${trimmed}`
      : null;
  if (probe === null) return "unknown";

  const parsedUrl = tryParseUrl(probe);
  if (parsedUrl === null) return "unknown";
  if (parsedUrl.protocol === "file:" || parsedUrl.host.length === 0) return "local_file";

  const route = parsedUrl.pathname.split("/").map(normalizeRouteSegment).join("/");
  return `${parsedUrl.protocol}//${parsedUrl.host}${route}`;
};

type ProviderClass = "builtin" | "custom";

function classifyProvider(providerId: string): ProviderClass {
  const migratedId = migrateLegacyModelProviderId(providerId);
  const legacyBuiltin = migratedId !== undefined && migratedId !== providerId;
  return isBuiltinModelProviderId(providerId) || legacyBuiltin ? "builtin" : "custom";
}

export const resolveTelemetryProviderScope = (
  providerInput: NullableText,
): TelemetryProviderIdentity => {
  const trimmed = providerInput?.trim() ?? "";
  if (trimmed.length === 0) {
    return { providerId: "", providerScope: PROVIDER_SCOPE_TABLE.unknown };
  }
  // 自定义供应商 ID 不外传，一律收敛成 custom。
  return classifyProvider(trimmed) === "builtin"
    ? { providerId: trimmed, providerScope: PROVIDER_SCOPE_TABLE.builtin }
    : { providerId: PROVIDER_SCOPE_TABLE.custom, providerScope: PROVIDER_SCOPE_TABLE.custom };
};

function bareModelName(rawModel: string): string {
  const decoded = decodeCustomModelValue(rawModel);
  if (decoded) return decoded.modelName ?? "";
  const separatorIndex = rawModel.indexOf("/");
  return separatorIndex > 0 ? rawModel.slice(separatorIndex + 1) : rawModel;
}

export const resolveTelemetryModelId = (
  scopeTier: TelemetryProviderScope,
  modelInput: NullableText,
): string => {
  const trimmed = modelInput?.trim() ?? "";
  switch (scopeTier) {
    case "unknown":
      return "";
    case "custom":
      return trimmed.length === 0 ? "" : "custom";
    default: {
      if (trimmed.length === 0) return "";
      const lowered = bareModelName(trimmed).toLowerCase();
      return TELEMETRY_SAFE_BUILTIN_MODEL_IDS.has(lowered) ? lowered : "custom";
    }
  }
};

export const sanitizeTelemetryModelValue = (input: NullableText): string => {
  const trimmed = input?.trim() ?? "";
  if (trimmed.length === 0) return "";

  const decoded = decodeCustomModelValue(trimmed);
  if (decoded) {
    const scope = resolveTelemetryProviderScope(decoded.providerId).providerScope;
    return resolveTelemetryModelId(scope, decoded.modelName);
  }

  const separatorIndex = trimmed.indexOf("/");
  if (separatorIndex <= 0) {
    // 裸模型名按内置档位判定（不经过供应商 ID 归一）。
    return resolveTelemetryModelId("builtin", trimmed);
  }
  return resolveTelemetryModelId(
    resolveTelemetryProviderScope(trimmed.slice(0, separatorIndex)).providerScope,
    trimmed.slice(separatorIndex + 1),
  );
};

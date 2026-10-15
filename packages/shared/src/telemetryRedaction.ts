// SPDX-License-Identifier: Apache-2.0
// 遥测文本/URL/模型标识的脱敏与收敛管线（B19–B21）。
// 管线的阶段顺序与正则逐字是行为的一部分（含已知的非幂等重跑特征，见 known-differences §5）。
import { decodeCustomModelValue } from "./custom-model-value.js";
import { migrateLegacyModelProviderId } from "./legacy-model-provider-identity.js";
import { isBuiltinModelProviderId } from "./model-provider-types.js";
import { OFFICIAL_GLM_MODEL_IDS } from "./official-glm-model-id.js";

const REDACTION_LIMITS = { textMax: 2048, scanLimit: 4096, routeSegmentMax: 128 } as const;

export const TELEMETRY_TEXT_MAX_LENGTH = REDACTION_LIMITS.textMax;

const LEGACY_BUILTIN_MODEL_IDS = "charglm-4 codegeex-4 emohaa".split(" ");

export type RedactTelemetryTextOptions = {
  maxLength?: /* 输出截断长度；缺省用 TELEMETRY_TEXT_MAX_LENGTH */ number;
};

const SAFE_MODEL_ID_SET = new Set<string>();
for (const officialId of OFFICIAL_GLM_MODEL_IDS) {
  SAFE_MODEL_ID_SET.add(officialId.toLowerCase());
}
for (const legacyId of LEGACY_BUILTIN_MODEL_IDS) {
  SAFE_MODEL_ID_SET.add(legacyId);
}
export const TELEMETRY_SAFE_BUILTIN_MODEL_IDS: ReadonlySet<string> = SAFE_MODEL_ID_SET;

const PROVIDER_SCOPE_TABLE = { builtin: "builtin", custom: "custom", unknown: "unknown" } as const;
export type TelemetryProviderScope =
  (typeof PROVIDER_SCOPE_TABLE)[keyof typeof PROVIDER_SCOPE_TABLE];

export type TelemetryProviderIdentity = {
  providerId: /* 收敛后的供应商标识 */ string;
  providerScope: /* 供应商档位 */ TelemetryProviderScope;
};

type RedactionStage = {
  pattern: /* 命中模式 */ RegExp;
  replacement: /* 替换文本或按命中重写 */ string | ((match: string) => string);
};

// 阶段顺序即旧行为：URL 整体脱敏 → 授权头 → 查询串密钥 → 键值对密钥 → Bearer/Basic →
// 各类令牌字面量 → 邮箱 → 本地路径。
const TEXT_REDACTION_STAGES: readonly RedactionStage[] = [
  { pattern: /\bhttps?:\/\/[^\s"'<>]+/giu, replacement: (match) => redactTelemetryUrl(match) },
  {
    pattern: /(\bauthorization\b["']?\s*[:=])\s*(?:(?:Bearer|Basic)\s+)?[^\s,"'};]+/giu,
    replacement: "$1 {redacted}",
  },
  {
    pattern:
      /([?&](?:api[_-]?key|token|access[_-]?token|authorization|password|passwd|secret|cookie|session)=)[^&\s]+/giu, // 查询串密钥段整体替换
    replacement: "$1{redacted}",
  },
  {
    pattern:
      /(["']?(?:api[_-]?key|token|access[_-]?token|password|passwd|secret|client[_-]?secret|cookie|set-cookie|session)["']?\s*[:=]\s*["']?)(?!\{redacted\})[^\s,"'};]+/giu, // 键值对密钥段整体替换
    replacement: "$1{redacted}",
  },
  {
    pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu,
    replacement: "$1 {redacted}",
  },
  { pattern: /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/giu, replacement: "{secret}" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/gu, replacement: "{secret}" },
  { pattern: /\bAKIA[A-Z0-9]{16}\b/gu, replacement: "{secret}" },
  { pattern: /\bAIza[A-Za-z0-9_-]{30,}\b/gu, replacement: "{secret}" },
  { pattern: /\b[^/@\s]+@[^/@\s]+\.[^/@\s]+\b/gu, replacement: "{email}" },
  { pattern: /\/(?:private\/)?(?:var\/folders|tmp)\/[^\s:;,)\]}]+/gu, replacement: "{path}" },
  {
    pattern: /\/(?:Users|home|root|workspace|workspaces|Volumes)\/[^/\s]+(?:\/[^\s:;,)\]}]+)*/gu,
    replacement: "{path}",
  },
  { pattern: /\b[A-Za-z]:\\[^\\\s]+(?:\\[^\s:;,)\]}]+)*/gu, replacement: "{path}" },
];

export function redactTelemetryText(
  rawText: string | undefined | null,
  redactionOptions: RedactTelemetryTextOptions = {},
): string {
  if (typeof rawText !== "string" || !rawText) return "";

  const maxLength = redactionOptions.maxLength ?? TELEMETRY_TEXT_MAX_LENGTH;
  let output = rawText.slice(0, REDACTION_LIMITS.scanLimit);
  for (const stage of TEXT_REDACTION_STAGES) {
    output =
      typeof stage.replacement === "function"
        ? output.replace(stage.pattern, stage.replacement)
        : output.replace(stage.pattern, stage.replacement);
  }
  const controlStripped = output.replace(/\p{Cc}+/gu, " ");
  const squashed = controlStripped.replace(/\s+/gu, " ");
  return squashed.trim().slice(0, maxLength);
}

const SEGMENT_SENSITIVE_PATTERNS: readonly RegExp[] = [
  /^[0-9]{7,}$/u,
  /^[0-9a-f]{16,}$/iu,
  /^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu,
];

function redactRouteSegment(pathSegment: string): string {
  if (!pathSegment) return pathSegment;

  const looksSensitive =
    pathSegment.includes("@") ||
    SEGMENT_SENSITIVE_PATTERNS.some((pattern) => pattern.test(pathSegment));
  if (looksSensitive) {
    return "{segment}"; // 敏感段整体收敛
  }

  return pathSegment.slice(0, REDACTION_LIMITS.routeSegmentMax);
}

const HOST_LIKE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#]|$)/iu;

export function redactTelemetryUrl(rawInput: string | undefined | null): string {
  const trimmed = typeof rawInput === "string" ? rawInput.trim() : "";
  if (!trimmed) return "unknown";
  if (/^blob:/iu.test(trimmed)) return "blob";
  if (/^data:/iu.test(trimmed)) return "data";
  if (/^file:/iu.test(trimmed) || /^[A-Za-z]:[\\/]/u.test(trimmed) || trimmed.startsWith("/")) {
    return "local_file";
  }

  let probeUrl = "";
  if (trimmed.includes("://")) {
    probeUrl = trimmed;
  } else if (HOST_LIKE_PATTERN.test(trimmed)) {
    probeUrl = `https://${trimmed}`;
  }
  if (!probeUrl) return "unknown";

  try {
    const parsedUrl = new URL(probeUrl);
    if (parsedUrl.protocol === "file:" || !parsedUrl.host) return "local_file";

    const route = parsedUrl.pathname.split("/").map(redactRouteSegment).join("/");
    return `${parsedUrl.protocol}//${parsedUrl.host}${route}`;
  } catch {
    return "unknown"; // 补不出合法 URL 时按 unknown 收敛
  }
}

function isLegacyBuiltin(candidateId: string): boolean {
  const migrationResult = migrateLegacyModelProviderId(candidateId);
  return migrationResult !== undefined && migrationResult !== candidateId;
}

export function resolveTelemetryProviderScope(
  providerInput: string | undefined | null,
): TelemetryProviderIdentity {
  const trimmed = providerInput?.trim();
  if (!trimmed) {
    return { providerId: "", providerScope: "unknown" };
  }

  const builtinHit = isBuiltinModelProviderId(trimmed) || isLegacyBuiltin(trimmed);
  if (builtinHit) {
    return { providerId: trimmed, providerScope: "builtin" };
  }
  // 自定义供应商 ID 不外传，一律收敛成 custom。
  return { providerId: "custom", providerScope: "custom" };
}

function extractBareModelId(rawModel: string): string {
  const decodedValue = decodeCustomModelValue(rawModel);
  if (decodedValue) {
    return decodedValue.modelName ?? "";
  }

  const slashIndex = rawModel.indexOf("/");
  return slashIndex > 0 ? rawModel.slice(slashIndex + 1) : rawModel;
}

export function resolveTelemetryModelId(
  scopeTier: TelemetryProviderScope,
  modelInput: string | undefined | null,
): string {
  const trimmed = modelInput?.trim();
  if (!trimmed || scopeTier === "unknown") {
    return "";
  }
  if (scopeTier === "custom") {
    return "custom";
  }

  const bareLowered = extractBareModelId(trimmed).toLowerCase();
  return TELEMETRY_SAFE_BUILTIN_MODEL_IDS.has(bareLowered) ? bareLowered : "custom";
}

export function sanitizeTelemetryModelValue(input: string | undefined | null): string {
  const trimmed = input?.trim();
  if (!trimmed) {
    return "";
  }

  const decodedValue = decodeCustomModelValue(trimmed);
  if (decodedValue) {
    return resolveTelemetryModelId(
      resolveTelemetryProviderScope(decodedValue.providerId).providerScope,
      decodedValue.modelName,
    );
  }

  const slashIndex = trimmed.indexOf("/");
  if (slashIndex > 0) {
    return resolveTelemetryModelId(
      resolveTelemetryProviderScope(trimmed.slice(0, slashIndex)).providerScope,
      trimmed.slice(slashIndex + 1),
    );
  }

  return resolveTelemetryModelId("builtin", trimmed);
}

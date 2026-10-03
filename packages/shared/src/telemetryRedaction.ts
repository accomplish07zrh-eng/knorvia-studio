import { decodeCustomModelValue } from "./custom-model-value.js";
import { migrateLegacyModelProviderId } from "./legacy-model-provider-identity.js";
import { isBuiltinModelProviderId } from "./model-provider-types.js";
import { OFFICIAL_GLM_MODEL_IDS } from "./official-glm-model-id.js";

export const TELEMETRY_TEXT_MAX_LENGTH = 2048;

const TELEMETRY_TEXT_SCAN_LIMIT = 4096;
const ROUTE_SEGMENT_MAX_LENGTH = 128;
const LEGACY_BUILTIN_MODEL_IDS = ["charglm-4", "codegeex-4", "emohaa"];

export interface RedactTelemetryTextOptions {
  maxLength?: number;
}

export const TELEMETRY_SAFE_BUILTIN_MODEL_IDS: ReadonlySet<string> = new Set([
  ...OFFICIAL_GLM_MODEL_IDS.map((id) => id.toLowerCase()),
  ...LEGACY_BUILTIN_MODEL_IDS,
]);

export type TelemetryProviderScope = "builtin" | "custom" | "unknown";

export interface TelemetryProviderIdentity {
  providerId: string;
  providerScope: TelemetryProviderScope;
}

export function redactTelemetryText(
  value: string | undefined | null,
  options: RedactTelemetryTextOptions = {},
): string {
  if (typeof value !== "string" || !value) return "";

  const maxLength = options.maxLength ?? TELEMETRY_TEXT_MAX_LENGTH;

  return value
    .slice(0, TELEMETRY_TEXT_SCAN_LIMIT)
    .replace(/\bhttps?:\/\/[^\s"'<>]+/giu, (match) => redactTelemetryUrl(match))
    .replace(
      /(\bauthorization\b["']?\s*[:=])\s*(?:(?:Bearer|Basic)\s+)?[^\s,"'};]+/giu,
      "$1 {redacted}",
    )
    .replace(
      /([?&](?:api[_-]?key|token|access[_-]?token|authorization|password|passwd|secret|cookie|session)=)[^&\s]+/giu,
      "$1{redacted}",
    )
    .replace(
      /(["']?(?:api[_-]?key|token|access[_-]?token|password|passwd|secret|client[_-]?secret|cookie|set-cookie|session)["']?\s*[:=]\s*["']?)(?!\{redacted\})[^\s,"'};]+/giu,
      "$1{redacted}",
    )
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu, "$1 {redacted}")
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/giu, "{secret}")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/gu, "{secret}")
    .replace(/\bAKIA[A-Z0-9]{16}\b/gu, "{secret}")
    .replace(/\bAIza[A-Za-z0-9_-]{30,}\b/gu, "{secret}")
    .replace(/\b[^/@\s]+@[^/@\s]+\.[^/@\s]+\b/gu, "{email}")
    .replace(/\/(?:private\/)?(?:var\/folders|tmp)\/[^\s:;,)\]}]+/gu, "{path}")
    .replace(
      /\/(?:Users|home|root|workspace|workspaces|Volumes)\/[^/\s]+(?:\/[^\s:;,)\]}]+)*/gu,
      "{path}",
    )
    .replace(/\b[A-Za-z]:\\[^\\\s]+(?:\\[^\s:;,)\]}]+)*/gu, "{path}")
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function redactRouteSegment(segment: string): string {
  if (!segment) return segment;

  if (
    segment.includes("@") ||
    /^[0-9]{7,}$/u.test(segment) ||
    /^[0-9a-f]{16,}$/iu.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(segment)
  ) {
    return "{segment}";
  }

  return segment.slice(0, ROUTE_SEGMENT_MAX_LENGTH);
}

export function redactTelemetryUrl(value: string | undefined | null): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "unknown";
  if (/^blob:/iu.test(raw)) return "blob";
  if (/^data:/iu.test(raw)) return "data";
  if (/^file:/iu.test(raw) || /^[A-Za-z]:[\\/]/u.test(raw) || raw.startsWith("/")) {
    return "local_file";
  }

  const candidate = raw.includes("://")
    ? raw
    : /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#]|$)/iu.test(raw)
      ? `https://${raw}`
      : "";

  if (!candidate) return "unknown";

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "file:" || !parsed.host) return "local_file";

    const route = parsed.pathname.split("/").map(redactRouteSegment).join("/");
    return `${parsed.protocol}//${parsed.host}${route}`;
  } catch {
    return "unknown";
  }
}

function isLegacyBuiltin(providerId: string): boolean {
  const migrated = migrateLegacyModelProviderId(providerId);
  return migrated !== undefined && migrated !== providerId;
}

export function resolveTelemetryProviderScope(
  providerId: string | undefined | null,
): TelemetryProviderIdentity {
  const normalized = providerId?.trim();
  if (!normalized) return { providerId: "", providerScope: "unknown" };

  if (isBuiltinModelProviderId(normalized) || isLegacyBuiltin(normalized)) {
    return { providerId: normalized, providerScope: "builtin" };
  }

  return { providerId: "custom", providerScope: "custom" };
}

function extractBareModelId(value: string): string {
  const decoded = decodeCustomModelValue(value);
  if (decoded) return decoded.modelName ?? "";

  const firstSlash = value.indexOf("/");
  return firstSlash > 0 ? value.slice(firstSlash + 1) : value;
}

export function resolveTelemetryModelId(
  providerScope: TelemetryProviderScope,
  modelId: string | undefined | null,
): string {
  const normalized = modelId?.trim();
  if (!normalized || providerScope === "unknown") return "";
  if (providerScope === "custom") return "custom";

  const bareModelId = extractBareModelId(normalized).toLowerCase();
  return TELEMETRY_SAFE_BUILTIN_MODEL_IDS.has(bareModelId) ? bareModelId : "custom";
}

export function sanitizeTelemetryModelValue(value: string | undefined | null): string {
  const normalized = value?.trim();
  if (!normalized) return "";

  const decoded = decodeCustomModelValue(normalized);
  if (decoded) {
    return resolveTelemetryModelId(
      resolveTelemetryProviderScope(decoded.providerId).providerScope,
      decoded.modelName,
    );
  }

  const firstSlash = normalized.indexOf("/");
  if (firstSlash > 0) {
    return resolveTelemetryModelId(
      resolveTelemetryProviderScope(normalized.slice(0, firstSlash)).providerScope,
      normalized.slice(firstSlash + 1),
    );
  }

  return resolveTelemetryModelId("builtin", normalized);
}

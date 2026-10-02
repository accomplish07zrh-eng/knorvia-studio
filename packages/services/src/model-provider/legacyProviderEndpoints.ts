import {
  mapModelProviderApiFormatToKind,
  resolveModelProviderApiFormat,
} from "./legacyProviderModels.js";
import type {
  ModelProviderConfig,
  ModelProviderEndpoints,
  ModelProviderKind,
} from "./legacyProviderTypes.js";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function collapseRepeatedBase(value: string): string {
  const normalized = trimTrailingSlashes(value.trim());
  if (!normalized) return "";
  const parsed = parseUrl(normalized);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return normalized;
  const marker = `${parsed.protocol}//${parsed.host}`;
  const secondStart = normalized.indexOf(marker, marker.length);
  if (secondStart < 0) return normalized;
  const first = trimTrailingSlashes(normalized.slice(0, secondStart));
  const second = trimTrailingSlashes(normalized.slice(secondStart));
  return first === second ? first : normalized;
}

export function normalizeModelProviderConfiguredBaseUrl(baseURL: string): string {
  return trimTrailingSlashes(collapseRepeatedBase(baseURL));
}

const endpointSuffixes: Record<ModelProviderKind, readonly string[]> = {
  anthropic: ["/v1/messages", "/messages"],
  openai: ["/responses"],
  "openai-compatible": ["/chat/completions"],
};

export function getDefaultModelProviderEndpointPathForKind(kind: ModelProviderKind): string {
  switch (kind) {
    case "anthropic":
      return "/v1/messages";
    case "openai":
      return "/responses";
    case "openai-compatible":
      return "/chat/completions";
  }
}

export function normalizeModelProviderBaseUrlForKind(
  baseURL: string,
  kind: ModelProviderKind,
): string {
  let normalized = normalizeModelProviderConfiguredBaseUrl(baseURL);
  for (const suffix of endpointSuffixes[kind]) {
    if (normalized.toLowerCase().endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }
  return trimTrailingSlashes(normalized);
}

function joinEndpoint(baseURL: string, path: string): string {
  const base = baseURL.trim();
  const endpointPath = path.trim();
  if (!endpointPath) return base;
  const parsedPath = parseUrl(endpointPath);
  if (parsedPath && (parsedPath.protocol === "http:" || parsedPath.protocol === "https:")) {
    return endpointPath;
  }
  if (!base) return endpointPath;
  const baseHasSlash = base.endsWith("/");
  const pathHasSlash = endpointPath.startsWith("/");
  if (baseHasSlash && pathHasSlash) return base.slice(0, -1) + endpointPath;
  if (!baseHasSlash && !pathHasSlash) return `${base}/${endpointPath}`;
  return base + endpointPath;
}

export function resolveModelProviderRuntimeBaseUrl(
  provider: Pick<ModelProviderConfig, "apiFormat" | "defaultKind" | "endpoints">,
  kind = mapModelProviderApiFormatToKind(resolveModelProviderApiFormat(provider)),
): string {
  const baseURL = provider.endpoints.baseURL?.trim() ?? "";
  const paths = provider.endpoints.paths ?? {};
  if (!provider.endpoints.baseURL?.trim() && !provider.endpoints.paths) return "";
  if (paths[kind] === undefined) return "";
  return normalizeModelProviderBaseUrlForKind(joinEndpoint(baseURL, paths[kind] ?? ""), kind);
}

export function buildLegacyProviderEndpoints(
  entries: Array<[ModelProviderKind, string]>,
): ModelProviderEndpoints {
  const normalized = entries
    .map(([kind, rawUrl]) => ({ kind, url: normalizeModelProviderBaseUrlForKind(rawUrl, kind) }))
    .filter(({ url }) => Boolean(url));
  if (normalized.length === 0) return {};
  const parsed = normalized.map((entry) => ({ ...entry, parsed: parseUrl(entry.url) }));
  const first = parsed[0].parsed;
  const canShareOrigin =
    first !== null && parsed.every((entry) => entry.parsed?.origin === first.origin);
  return {
    ...(canShareOrigin && first ? { baseURL: first.origin } : {}),
    paths: Object.fromEntries(
      parsed.map((entry) => [
        entry.kind,
        canShareOrigin && entry.parsed
          ? (entry.parsed.pathname === "/" ? "" : trimTrailingSlashes(entry.parsed.pathname)) +
            entry.parsed.search
          : entry.url,
      ]),
    ),
  };
}

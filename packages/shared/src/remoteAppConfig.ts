import type { Locale } from "./protocol.js";

interface RemoteAppConfigLike {
  feedback_url?: unknown;
  feedback_api_base?: unknown;
  feedback_use_external_form?: unknown;
  community_urls?: unknown;
  forceUpdate?: unknown;
}

type LocaleUrlMap = Partial<Record<Locale, string>>;

function isObjectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readConfig(value: unknown): RemoteAppConfigLike | undefined {
  return isObjectValue(value) ? value : undefined;
}

function admitUrl(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function getFeedbackUrlFromConfig(config: unknown): string | undefined {
  const admitted = readConfig(config);
  if (admitted === undefined) {
    return undefined;
  }
  return admitUrl(admitted.feedback_url);
}

export function getFeedbackApiBaseFromConfig(config: unknown): string | undefined {
  const admitted = readConfig(config);
  if (admitted === undefined) {
    return undefined;
  }
  return admitUrl(admitted.feedback_api_base);
}

export function getFeedbackUseExternalFormFromConfig(config: unknown): boolean {
  const admitted = readConfig(config);
  if (admitted === undefined) {
    return false;
  }
  const value = admitted.feedback_use_external_form;
  return value === true || value === "true";
}

export function getCommunityUrlsFromConfig(config: unknown): LocaleUrlMap {
  const admitted = readConfig(config);
  if (admitted === undefined) {
    return {};
  }
  const urls = admitted.community_urls;
  if (!isObjectValue(urls)) {
    return {};
  }
  return {
    "zh-CN": admitUrl(urls["zh-CN"]),
    "en-US": admitUrl(urls["en-US"]),
  };
}

export function getCommunityUrlFromConfig(config: unknown, locale: Locale): string | undefined {
  const urls = getCommunityUrlsFromConfig(config);
  return urls[locale];
}

export function getCommunityUrlFromConfigs(
  remoteConfig: unknown,
  localConfig: unknown,
  locale: Locale,
): string | undefined {
  const remoteUrls = getCommunityUrlsFromConfig(remoteConfig);
  const localUrls = getCommunityUrlsFromConfig(localConfig);
  return remoteUrls[locale] ?? localUrls[locale];
}

export function getForceUpdateMinimalVersionFromConfig(config: unknown): string | undefined {
  const admitted = readConfig(config);
  if (admitted === undefined) {
    return undefined;
  }
  const forceUpdate = admitted.forceUpdate;
  if (!isObjectValue(forceUpdate)) {
    return undefined;
  }
  const minimalVersion = forceUpdate.minimalVersion;
  if (typeof minimalVersion !== "string") {
    return undefined;
  }
  const trimmedVersion = minimalVersion.trim();
  return trimmedVersion.length > 0 ? trimmedVersion : undefined;
}

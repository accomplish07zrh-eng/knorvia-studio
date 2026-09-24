export const KNORVIA_SOURCE_HEADERS = {
  "User-Agent": "Knorvia-Studio/unknown",
  "X-Title": "Knorvia Studio@electron",
} as const;

export interface BuildKnorviaSourceHeadersFromContextOptions {
  appVersion?: string;
  arch?: string;
  clientLanguage?: string;
  clientTimezone?: string;
  deviceMid?: string;
  endpointOrigin?: string;
  osVersion?: string;
  platform?: string;
  releaseChannel?: string;
  sourceTitle?: string;
}

export function normalizeKnorviaSourceHeaderValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^[\x20-\x7e]+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function buildKnorviaSourceHeadersFromContext(
  options: BuildKnorviaSourceHeadersFromContextOptions = {},
): Record<string, string> {
  const appVersion = normalizeKnorviaSourceHeaderValue(options.appVersion);
  const arch = normalizeKnorviaSourceHeaderValue(options.arch);
  const clientLanguage = normalizeKnorviaSourceHeaderValue(options.clientLanguage) ?? "unknown";
  const clientTimezone = normalizeKnorviaSourceHeaderValue(options.clientTimezone) ?? "unknown";
  const osVersion = normalizeKnorviaSourceHeaderValue(options.osVersion);
  const platform = normalizeKnorviaSourceHeaderValue(options.platform);
  const releaseChannel = normalizeKnorviaSourceHeaderValue(options.releaseChannel);
  const sourceTitle = normalizeKnorviaSourceHeaderValue(options.sourceTitle) ?? "electron";

  return {
    ...KNORVIA_SOURCE_HEADERS,
    "User-Agent": `Knorvia-Studio/${appVersion ?? "unknown"}`,
    ...(appVersion ? { "X-Knorvia-App-Version": appVersion } : {}),
    "X-Title": `Knorvia Studio@${sourceTitle}`,
    ...(platform && arch ? { "X-Platform": `${platform}-${arch}` } : {}),
    ...(releaseChannel ? { "X-Release-Channel": releaseChannel } : {}),
    "X-Client-Language": clientLanguage,
    "X-Client-Timezone": clientTimezone,
    ...(platform ? { "X-Os-Category": normalizeOsCategory(platform) } : {}),
    ...(osVersion ? { "X-Os-Version": osVersion } : {}),
  };
}

function normalizeOsCategory(platform: string): string {
  switch (platform) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    default:
      return "linux";
  }
}

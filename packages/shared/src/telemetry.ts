export interface TelemetryRendererContext {
  clientTimezone: string;
  clientLanguage: string;
  screenResolution: string;
}

export interface TelemetryEventPayload {
  elementName: string;
  eventRegion: string;
  eventType: string;
  eventText?: string;
  eventExtraDetail: Record<string, string>;
  userId?: string;
  talkId?: string;
  messageId?: string;
}

export interface RendererTelemetryEventPayload extends TelemetryEventPayload {
  context: TelemetryRendererContext;
}

export interface ArmsCustomEventPayload {
  name: string;
  group: string;
  value?: number;
  properties?: Record<string, string | number | boolean | undefined>;
}

export interface FinalArmsCustomEventPayload {
  name: string;
  type: "custom";
  group: string;
  value: number;
  properties: Record<string, string>;
}

export interface FinalArmsCustomEventE2EEntry {
  sequence: number;
  recordedAt: number;
  payload: FinalArmsCustomEventPayload;
}

export interface ConfigureFinalArmsCustomEventE2ERequest {
  suppressedEventNames: string[];
}

export function resolveSafeTelemetryHostname(value: string | null | undefined): string {
  const candidate = value?.trim();
  if (!candidate) {
    return "";
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function sanitizeTelemetryErrorMessage(value: string | null | undefined): string {
  return value ? "[redacted]" : "";
}

function sanitizeTelemetryLoginHostname(value: string): string {
  const hostname = resolveSafeTelemetryHostname(value);
  if (hostname) {
    return hostname;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized && resolveSafeTelemetryHostname("https://" + normalized) === normalized) {
    return normalized;
  }
  return "";
}

export function sanitizeTelemetryEventDetail(
  elementName: string,
  detail: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(detail).map(([key, value]) => {
      if (key === "error_msg") {
        return [key, sanitizeTelemetryErrorMessage(value)];
      }
      if (elementName === "app_login_ck" && key === "login_url") {
        return [key, sanitizeTelemetryLoginHostname(value)];
      }
      return [key, value];
    }),
  );
}

interface TelemetryScreenLike {
  width: number;
  height: number;
}

interface TelemetryWindowLike {
  intlLocale?: string;
  timeZone?: string;
  screen: TelemetryScreenLike;
}

export function collectTelemetryRendererContext(
  options?: TelemetryWindowLike,
): TelemetryRendererContext {
  const resolved =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions() : undefined;
  const timeZone = options?.timeZone ?? resolved?.timeZone ?? "UTC";
  const clientLanguage = options?.intlLocale ?? resolved?.locale ?? "en-US";
  const runtimeScreen = (globalThis as { screen?: TelemetryScreenLike }).screen;
  const screen = options?.screen ?? runtimeScreen ?? { width: 0, height: 0 };

  return {
    clientTimezone: timeZone,
    clientLanguage,
    screenResolution: screen.width + "x" + screen.height,
  };
}

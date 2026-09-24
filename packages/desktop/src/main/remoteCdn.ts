import { type KnorviaEnv } from "@knorvia/shared";

declare const __KNORVIA_CDN_BASE_URL__: string | undefined;

export interface ResolveRemoteCdnOptions {
  env?: KnorviaEnv;
  locale?: string;
  timeZone?: string;
  overrideBaseUrl?: string;
  version?: string;
  now?: Date;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("CDN URL must use http or https");
  return value.replace(/\/+$/, "");
}

export function resolveRemoteCdnBaseUrls(options: ResolveRemoteCdnOptions = {}): string[] {
  const override = options.overrideBaseUrl?.trim();
  if (override) return [normalizeBaseUrl(override)];
  const baseUrl = process.env.KNORVIA_CDN_BASE_URL?.trim();
  return baseUrl ? [normalizeBaseUrl(baseUrl)] : [];
}

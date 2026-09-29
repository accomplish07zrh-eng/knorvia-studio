// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { join, resolve } from "node:path";
import type { MarketplaceSource } from "./catalog-types.js";
import { directoryExists, fileExists, isRecord } from "./helpers.js";
import { readZipPluginSourceSha256 } from "./zip-source.js";

function splitReference(value: string, allowAt: boolean): { base: string; ref?: string } {
  const separator = Math.max(value.lastIndexOf("#"), allowAt ? value.lastIndexOf("@") : -1);
  if (separator < 0) return { base: value };
  const ref = value.slice(separator + 1);
  return { base: value.slice(0, separator), ...(ref ? { ref } : {}) };
}

export async function parseMarketplaceSourceInput(input: string): Promise<MarketplaceSource> {
  const value = input.trim();
  if (!value) throw new Error("A plugin marketplace source is required");
  if (/^https?:\/\//iu.test(value)) {
    const { base, ref } = splitReference(value, false);
    const url = new URL(base);
    const github =
      (url.hostname === "github.com" || url.hostname === "www.github.com") &&
      /^\/[^/]+\/[^/]+/u.test(url.pathname);
    if (base.endsWith(".git") || base.includes("/_git/") || github) {
      return {
        source: "git",
        url: github && !base.endsWith(".git") ? `${base}.git` : base,
        ...(ref ? { ref } : {}),
      };
    }
    return { source: "url", url: base };
  }
  if (/^[^\s@]+@[^\s:]+:.+/u.test(value)) {
    const { base, ref } = splitReference(value, false);
    return { source: "git", url: base, ...(ref ? { ref } : {}) };
  }
  if (/^(?:\.\.?[\\/]|[/~]|[a-zA-Z]:[\\/])/u.test(value)) {
    const path = resolve(
      value.startsWith("~") ? join(process.env.HOME ?? "", value.slice(1)) : value,
    );
    if (directoryExists(path)) return { source: "directory", path };
    if (path.toLowerCase().endsWith(".json") && fileExists(path)) return { source: "file", path };
    throw new Error(
      "The local plugin marketplace source must be an existing directory or JSON file",
    );
  }
  if (value.includes("/") && !value.includes(":")) {
    const { base, ref } = splitReference(value, true);
    return { source: "github", repo: base, ...(ref ? { ref } : {}) };
  }
  throw new Error("Unsupported plugin marketplace source");
}

export function readPluginSourceSha(source: unknown): string | undefined {
  if (!isRecord(source)) return undefined;
  if (typeof source.sha === "string") return source.sha;
  return typeof source.commit === "string" ? source.commit : undefined;
}

export function readPluginSourceIdentityPin(source: unknown): string | undefined {
  return readZipPluginSourceSha256(source) || readPluginSourceSha(source);
}

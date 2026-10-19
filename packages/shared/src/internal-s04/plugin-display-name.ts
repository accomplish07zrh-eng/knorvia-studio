// SPDX-License-Identifier: Apache-2.0
/**
 * 插件展示名称推导与格式化实现。
 */

import type { KnorviaPluginStoreListing } from "../protocol/index.js";

const SPECIAL_ACRONYMS = new Map<string, string>([
  ["aws", "AWS"],
  ["mcp", "MCP"],
  ["knorvia", "Knorvia Studio"],
]);

export function resolveLocalizedText(
  locale: string,
  base: string | undefined,
  i18n: Record<string, string> | undefined,
): string | undefined {
  if (!i18n) {
    return base;
  }
  if (locale in i18n && i18n[locale]) {
    return i18n[locale];
  }

  const primaryLang = locale.split("-", 1)[0]?.toLowerCase();
  if (primaryLang) {
    for (const [dictKey, val] of Object.entries(i18n)) {
      if (dictKey.toLowerCase().split("-", 1)[0] === primaryLang && val) {
        return val;
      }
    }
  }

  return base;
}

export function formatCanonicalPluginName(name: string, locale: string): string {
  const parts = name.trim().split(/[-_]+/u);
  const words: string[] = [];
  for (const segment of parts) {
    if (!segment) {
      continue;
    }
    const mapped = SPECIAL_ACRONYMS.get(segment.toLowerCase());
    if (mapped) {
      words.push(mapped);
    } else {
      const initial = segment.charAt(0).toLocaleUpperCase(locale);
      const remaining = segment.slice(1);
      words.push(`${initial}${remaining}`);
    }
  }
  return words.join(" ");
}

export function resolvePluginDisplayName(
  plugin: { name: string; listing?: KnorviaPluginStoreListing },
  locale: string,
): string {
  const listingData = plugin.listing;
  const customTitle = resolveLocalizedText(
    locale,
    listingData?.displayName,
    listingData?.displayNameI18n,
  );
  return customTitle ?? formatCanonicalPluginName(plugin.name, locale);
}

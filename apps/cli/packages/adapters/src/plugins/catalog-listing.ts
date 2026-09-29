// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { PluginStoreListing } from "@knorvia/contracts";
import { isRecord } from "./helpers.js";

export function normalizeAuthorValue(value: unknown): { name?: string; url?: string } | undefined {
  const fields = typeof value === "string" ? { name: value } : isRecord(value) ? value : undefined;
  if (!fields) return undefined;
  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  const url = typeof fields.url === "string" ? fields.url.trim() : "";
  return name || url ? { ...(name ? { name } : {}), ...(url ? { url } : {}) } : undefined;
}

function localizedStrings(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function localizedPrompts(value: unknown): Record<string, string[]> | undefined {
  if (!isRecord(value)) return undefined;
  const result: [string, string[]][] = [];
  for (const [locale, list] of Object.entries(value)) {
    if (!Array.isArray(list)) continue;
    const strings = list.filter((item): item is string => typeof item === "string");
    if (strings.length) result.push([locale, strings]);
  }
  return result.length ? Object.fromEntries(result) : undefined;
}

export function parseEntryStoreListing(
  entry: Record<string, unknown>,
): PluginStoreListing | undefined {
  const listing: PluginStoreListing = {};
  for (const key of [
    "displayName",
    "icon",
    "category",
    "homepage",
    "privacyPolicy",
    "termsOfService",
    "heroImage",
  ] as const) {
    const value = entry[key];
    if (typeof value === "string" && value.trim()) listing[key] = value;
  }
  const displayNameI18n = localizedStrings(entry.displayName_i18n);
  const descriptionI18n = localizedStrings(entry.description_i18n);
  const examplePromptsI18n = localizedPrompts(entry.examplePrompts_i18n);
  if (displayNameI18n) listing.displayNameI18n = displayNameI18n;
  if (descriptionI18n) listing.descriptionI18n = descriptionI18n;
  if (examplePromptsI18n) listing.examplePromptsI18n = examplePromptsI18n;
  const author = normalizeAuthorValue(entry.author);
  if (author?.name) listing.author = author.name;
  if (author?.url) listing.authorUrl = author.url;
  if (Array.isArray(entry.examplePrompts)) {
    const prompts = entry.examplePrompts.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    if (prompts.length) listing.examplePrompts = prompts;
  }
  if (entry.requiresPaidPlan === true) listing.requiresPaidPlan = true;
  return Object.keys(listing).length ? listing : undefined;
}

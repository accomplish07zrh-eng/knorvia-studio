// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { PluginStoreListing } from "@knorvia/contracts";
import { isRecord } from "./helpers.js";

export function normalizeAuthorValue(
  value: unknown,
): /* 作者字段：字符串直接当名称，对象取 name/url 两键，任一非空才返回 */ | {
      name?: string;
      url?: string;
    }
  | undefined {
  const fields = typeof value === "string" ? { name: value } : isRecord(value) ? value : undefined;
  if (!fields) return undefined;
  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  const url = typeof fields.url === "string" ? fields.url.trim() : "";
  return name || url ? { ...(name ? { name } : {}), ...(url ? { url } : {}) } : undefined;
}

function localizedStrings(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) /* 多语言表必须是对象，其余形态直接缺席 */ return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function localizedPrompts(value: unknown): Record<string, string[]> | undefined {
  if (!isRecord(value)) /* 多语言示例提示词表同样只接受对象 */ return undefined;
  const result: [string, string[]][] = [];
  for (const [locale, list] of Object.entries(value)) {
    if (!Array.isArray(list)) /* 非数组的 locale 条目跳过 */ continue;
    const strings = list.filter((item): item is string => typeof item === "string");
    if (strings.length) result.push([locale, strings]);
  }
  return result.length ? Object.fromEntries(result) : undefined;
}

export function /* 从市场条目解析门店清单（字段名是契约，逐键白名单透传） */ parseEntryStoreListing(
  entry: Record<string, unknown>,
): PluginStoreListing | undefined {
  const listing: /* 白名单收集后的清单，空对象最终转 undefined */ PluginStoreListing = {};
  for (const key of [
    "displayName", // 首选语言显示名
    "icon", // 图标地址
    "category", // 分类
    "homepage", // 主页地址
    "privacyPolicy", // 隐私政策地址
    "termsOfService", // 服务条款地址
    "heroImage", // 头图地址
  ] as const) {
    const value = entry[key]; /* 白名单键：仅字符串且去空白后非空才透传 */
    if (typeof value === "string" && value.trim()) listing[key] = value;
  }
  const displayNameI18n = localizedStrings(entry.displayName_i18n);
  const descriptionI18n = localizedStrings(entry.description_i18n);
  const examplePromptsI18n = localizedPrompts(entry.examplePrompts_i18n);
  if (displayNameI18n) /* 多语言显示名存在才覆盖 */ listing.displayNameI18n = displayNameI18n;
  if (descriptionI18n) /* 多语言简介存在才覆盖 */ listing.descriptionI18n = descriptionI18n;
  if (examplePromptsI18n)
    /* 多语言示例提示词存在才覆盖 */ listing.examplePromptsI18n = examplePromptsI18n;
  const author = /* 独立归一化作者字段 */ normalizeAuthorValue(entry.author);
  if (author?.name) /* 作者名落到 author 键 */ listing.author = author.name;
  if (author?.url) /* 作者主页落到 authorUrl 键 */ listing.authorUrl = author.url;
  if (Array.isArray(entry.examplePrompts)) {
    const prompts = entry.examplePrompts.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    if (prompts.length) listing.examplePrompts = prompts;
  }
  if (entry.requiresPaidPlan === true)
    /* 付费计划标记仅在显式 true 时透传 */ listing.requiresPaidPlan = true;
  return Object.keys(listing).length ? listing : undefined;
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 市场条目 → 门店清单的投影。清单字段名是契约（界面直接读），本模块只做白名单透传与
// 形态归一。归一按「输入形态」分三组：纯文本、多语言表、作者对象；任何不合格输入都当作
// 缺席，不塞空值。没有可带出的字段时返回 undefined，而不是空对象。

import type { PluginStoreListing } from "@knorvia/contracts";
import { isRecord } from "./helpers.js";

/**
 * 纯文本白名单。用「清单键 → 是否纯文本」的映射一次写全，键就是契约名，
 * 不再逐条列成同形的字符串行；循环按映射的键顺序判定。
 */
const PLAIN_TEXT_KEYS = {
  displayName: true,
  icon: true,
  category: true,
  homepage: true,
  privacyPolicy: true,
  termsOfService: true,
  heroImage: true,
} as const satisfies Partial<Record<keyof PluginStoreListing, true>>;

/** 多语言表的两种值类型：单条文本，或提示词列表。 */
type LocalePayload = "text" | "prompts";

/** 多语言表来源键与目标清单键的对照。 */
const LOCALE_FIELDS: readonly [source: string, payload: LocalePayload, target: string][] = [
  ["displayName_i18n", "text", "displayNameI18n"],
  ["description_i18n", "text", "descriptionI18n"],
  ["examplePrompts_i18n", "prompts", "examplePromptsI18n"],
];

/** 去空白后的字符串；非字符串当作空串，后续统一按「有无内容」判断。 */
function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 单条多语言文本：只收字符串。 */
function localeText(raw: unknown): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

/** 单条多语言提示词：过滤非字符串元素，空列表视为缺席。 */
function localePrompts(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const usable = raw.filter((item): item is string => typeof item === "string");
  return usable.length > 0 ? usable : undefined;
}

/** 多语言表归一：逐 locale 收合格值，全部不合格时整表缺席。 */
function localeTable(
  value: unknown,
  payload: LocalePayload,
): Record<string, string> | Record<string, string[]> | undefined {
  if (!isRecord(value)) return undefined;
  const accepted: [string, string | string[]][] = [];
  for (const [locale, raw] of Object.entries(value)) {
    const picked = payload === "text" ? localeText(raw) : localePrompts(raw);
    if (picked !== undefined) accepted.push([locale, picked]);
  }
  return accepted.length > 0 ? (Object.fromEntries(accepted) as never) : undefined;
}

/** 作者字段：单字符串即名称，对象取 name/url；两者都空则整体缺席。 */
export function normalizeAuthorValue(value: unknown): { name?: string; url?: string } | undefined {
  const fields = typeof value === "string" ? { name: value } : isRecord(value) ? value : undefined;
  if (!fields) return undefined;
  const name = textOf(fields.name);
  const url = textOf(fields.url);
  if (!name && !url) return undefined;
  const normalized: { name?: string; url?: string } = {};
  if (name) normalized.name = name;
  if (url) normalized.url = url;
  return normalized;
}

/** 示例提示词：只保留去空白后仍有内容的字符串。 */
function examplePrompts(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const usable = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return usable.length > 0 ? usable : undefined;
}

/** 门店清单投影：市场条目进，清单出；没有可带出的字段时返回 undefined。 */
export function parseEntryStoreListing(
  entry: Record<string, unknown>,
): PluginStoreListing | undefined {
  const listing: PluginStoreListing = {};
  const writable = listing as Record<string, unknown>;

  // 第一组：纯文本字段。键来自白名单映射，判定条件是「字符串且去空白后非空」。
  const plainTextKeys = Object.keys(PLAIN_TEXT_KEYS) as (keyof typeof PLAIN_TEXT_KEYS)[];
  for (const field of plainTextKeys) {
    const raw = entry[field];
    if (typeof raw === "string" && raw.trim().length > 0) writable[field] = raw;
  }

  // 第二组：三张多语言表，各按自己的值类型归一后挂到对应清单键。
  for (const [sourceKey, payload, targetKey] of LOCALE_FIELDS) {
    const table = localeTable(entry[sourceKey], payload);
    if (table) writable[targetKey] = table;
  }

  // 第三组：作者拆成名称与主页两个键；示例提示词与付费标记各自独立判定。
  const author = normalizeAuthorValue(entry.author);
  if (author?.name) listing.author = author.name;
  if (author?.url) listing.authorUrl = author.url;
  const prompts = examplePrompts(entry.examplePrompts);
  if (prompts) listing.examplePrompts = prompts;
  if (entry.requiresPaidPlan === true) listing.requiresPaidPlan = true;

  return Object.keys(listing).length > 0 ? listing : undefined;
}

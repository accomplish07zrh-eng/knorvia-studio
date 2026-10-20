// SPDX-License-Identifier: Apache-2.0
import type { KnorviaPluginStoreListing } from "./protocol/index.js";

/*
 * 插件展示名的解析顺序：本地化 listing 文案 → canonical slug。
 * 不使用裸 manifest name 当展示名：市场里同名插件会互相串台。
 */

/** 有固定大小写的专有词；其余片段按首字母大写处理。 */
const FIXED_CASE_WORDS: Readonly<Record<string, string>> = {
  aws: "AWS",
  mcp: "MCP",
  knorvia: "Knorvia Studio",
};

/** slug 里既可能出现连字符也可能出现下划线，两种都当分隔符。 */
const SLUG_SEPARATOR = /[-_]+/u;

type LocaleTag = string;
type MaybeText = string | undefined;
type TextBundle = Record<string, string> | null | undefined;
type SlugText = string;

/** 语言标签的主力子标签：`zh-Hans-CN` → `zh`。 */
function primaryLanguageTag(tag: LocaleTag): string {
  return tag.split("-")[0] ?? "";
}

/**
 * 取本地化文案：先精确匹配完整 locale，再退到同语言（忽略地区与文字系统）。
 * 两级都不命中时返回调用方给的兜底值。
 */
export function resolveLocalizedText(
  locale: LocaleTag,
  base: MaybeText,
  i18n: TextBundle,
): MaybeText {
  if (i18n === null || i18n === undefined) return base;

  const exact = i18n[locale];
  if (exact !== undefined && exact !== "") return exact;

  const language = primaryLanguageTag(locale);
  if (language === "") return base;

  for (const [tag, text] of Object.entries(i18n)) {
    if (text !== "" && primaryLanguageTag(tag) === language) return text;
  }
  return base;
}

/** 单个 slug 片段 → 展示片段：专有词查表，其余首字母大写、保留剩余大小写。 */
function capitalizePart(part: string, locale: LocaleTag): string {
  const fixed = FIXED_CASE_WORDS[part.toLowerCase()];
  if (fixed !== undefined) return fixed;

  const head = part.slice(0, 1).toLocaleUpperCase(locale);
  return head + part.slice(1);
}

export function formatCanonicalPluginName(name: SlugText, locale: LocaleTag): SlugText {
  const parts = name.split(SLUG_SEPARATOR).filter((part) => part.length > 0);
  const rendered: string[] = [];
  for (const part of parts) rendered.push(capitalizePart(part, locale));
  return rendered.join(" ");
}

/** 展示名候选来源：插件 id 片段 + 可能存在的商店 listing。 */
interface PluginNameSource {
  name: SlugText;
  listing?: KnorviaPluginStoreListing;
}

/**
 * 用户可见插件名只信任与完整 Plugin ID 绑定的 listing；
 * 缺失时才回退到 canonical slug，避免同名 marketplace 插件互相覆盖。
 */
export function resolvePluginDisplayName(plugin: PluginNameSource, locale: LocaleTag): string {
  const fromListing = resolveLocalizedText(
    locale,
    plugin.listing?.displayName,
    plugin.listing?.displayNameI18n,
  );
  if (fromListing !== undefined && fromListing !== "") return fromListing;
  return formatCanonicalPluginName(plugin.name, locale);
}

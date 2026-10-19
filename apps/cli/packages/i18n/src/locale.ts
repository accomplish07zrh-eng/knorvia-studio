// SPDX-License-Identifier: Apache-2.0
import type { SupportedLocale, UiLocale } from "@knorvia/contracts";

export const DEFAULT_LOCALE: SupportedLocale = "en-US";
export const SUPPORTED_LOCALES = ["en-US", "zh-CN"] as const satisfies readonly SupportedLocale[];

export interface LocaleDetectionInput {
  env?: Record<string, string | undefined>;
  intlLocale?: string | null;
}

/**
 * 环境变量按“越显式越优先”排序。`LANGUAGE` 放在最后，因为它是列表型变量，
 * 通常由会话管理器批量写入，优先级低于单值的 `LC_ALL` / `LANG`。
 */
const ENV_ORDER = ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"] as const;
type EnvKey = (typeof ENV_ORDER)[number];

/** 只有列表型变量需要拆分；其余变量的整串就是一个候选。 */
const LIST_TYPE_KEYS: ReadonlySet<EnvKey> = new Set<EnvKey>(["LANGUAGE"]);

/** 语言族（ISO 639-1）到受支持目录的映射；地区变体共用同一套文案。 */
const FAMILY_TO_LOCALE: ReadonlyMap<string, SupportedLocale> = new Map([
  ["en", "en-US"],
  ["zh", "zh-CN"],
]);

/** `C`、`POSIX` 只是“没有偏好”的占位符，不能当作真实标签。 */
const PLACEHOLDER_TAGS: ReadonlySet<string> = new Set(["c", "posix"]);

const LIST_DELIMITER = ":";
const SUBTAG_DELIMITER = "-";
const LEGACY_SUBTAG_DELIMITER = "_";

export function isSupportedLocale(value: string | undefined): value is SupportedLocale {
  return SUPPORTED_LOCALES.some((locale) => locale === value);
}

export function isUiLocale(value: string | undefined): value is UiLocale {
  return isSupportedLocale(value) || value === "auto";
}

export function resolveLocale(
  requested: UiLocale | string | undefined,
  detected?: string | null,
): SupportedLocale {
  // 探测结果只在显式 "auto" 时参与，缺省请求按 en-US 处理。
  const source = requested === "auto" ? detected : requested;
  return (source ? lookupLocale(source) : undefined) ?? DEFAULT_LOCALE;
}

export function detectLocale(input: LocaleDetectionInput = {}): SupportedLocale | undefined {
  return collectTags(input).reduce<SupportedLocale | undefined>(
    (found, tag) => found ?? lookupLocale(tag),
    undefined,
  );
}

/**
 * 全部候选标签，按尝试顺序展开：环境变量的每个键（列表型变量再拆项），
 * 最后才是调用方注入的 Intl 探测值。
 */
function collectTags(input: LocaleDetectionInput): string[] {
  const tags: string[] = [];
  for (const key of ENV_ORDER) {
    const raw = input.env?.[key];
    if (raw === undefined || raw.length === 0) continue;
    const values = LIST_TYPE_KEYS.has(key)
      ? raw.split(LIST_DELIMITER).filter((item) => item.trim().length > 0)
      : [raw];
    tags.push(...values);
  }
  if (input.intlLocale) tags.push(input.intlLocale);
  return tags;
}

/** 标签 → 目录：先做整体规范化，再依次尝试精确键与语言族。 */
function lookupLocale(tag: string): SupportedLocale | undefined {
  const normalized = normalizeTag(tag);
  if (normalized === undefined) return undefined;
  return (
    SUPPORTED_LOCALES.find((locale) => locale === normalized) ??
    FAMILY_TO_LOCALE.get(primarySubtag(normalized))
  );
}

/** 小写主标签：`zh-Hant-TW` 取 `zh`。 */
function primarySubtag(tag: string): string {
  return tag.toLowerCase().split(SUBTAG_DELIMITER)[0] ?? "";
}

/**
 * 规范化：去空白、去掉 `.编码` 与 `@修饰` 后缀、把旧式下划线换成连字符。
 * 结果为空或为占位标签时视为不可识别。
 */
function normalizeTag(tag: string): string | undefined {
  const trimmed = tag.trim();
  const undecorated = trimmed.replace(/[.@][\s\S]*$/u, "");
  const normalized = undecorated.replaceAll(LEGACY_SUBTAG_DELIMITER, SUBTAG_DELIMITER).toLowerCase();
  const recognized =
    normalized.length > 0 && !PLACEHOLDER_TAGS.has(normalized) ? normalized : undefined;
  return recognized;
}

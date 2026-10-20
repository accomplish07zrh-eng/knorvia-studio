// SPDX-License-Identifier: Apache-2.0
// 语言探测与解析：候选来源排成固定优先级，逐条归类；归不出结果就交回默认目录。
import type { SupportedLocale, UiLocale } from "@knorvia/contracts";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type LocaleDetectionInput } from "./locale-contract.js";

export { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./locale-contract.js";
export type { LocaleDetectionInput } from "./locale-contract.js";

/** 环境快照的读取顺序：单个变量越靠前越显式，列表型的 `LANGUAGE` 最后再看。 */
const PROBE_KEYS = ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"] as const;

/** 语言族前缀 → 目录。地区、书写系统后缀不参与判断，整族共用一套文案。 */
const FAMILY_BY_PREFIX = new Map<string, SupportedLocale>([
  ["en", "en-US"],
  ["zh", "zh-CN"],
]);

/** `C` 与 `POSIX` 表示「没有偏好」，不是语言标签。 */
const EMPTY_PLACEHOLDERS = new Set(["c", "posix"]);

const LIST_SEPARATOR = ":";
const TAG_SEPARATOR = "-";
const LEGACY_SEPARATOR = "_";

export function isSupportedLocale(candidate: string | undefined): candidate is SupportedLocale {
  return SUPPORTED_LOCALES.some((known) => known === candidate);
}

export function isUiLocale(candidate: string | undefined): candidate is UiLocale {
  return candidate === "auto" || isSupportedLocale(candidate);
}

export function resolveLocale(
  requested?: UiLocale | string,
  detectedTag?: string | null,
): SupportedLocale {
  // 探测值只在调用方显式要求 auto 时才有可能被采用。
  const source = requested === "auto" ? detectedTag : requested;
  if (!source) return DEFAULT_LOCALE;
  return classifyTag(source) ?? DEFAULT_LOCALE;
}

export function detectLocale(input: LocaleDetectionInput = {}): SupportedLocale | undefined {
  for (const tag of probeTags(input)) {
    const found = classifyTag(tag);
    if (found) return found;
  }
  return undefined;
}

/** 按优先级收集候选：环境快照按键顺序展开，最后才轮到宿主 Intl 给的标签。 */
function probeTags(input: LocaleDetectionInput): string[] {
  const tags: string[] = [];
  for (const key of PROBE_KEYS) {
    const raw = input.env?.[key];
    if (!raw) continue;
    if (key !== "LANGUAGE") {
      tags.push(raw);
      continue;
    }
    const items = raw.split(LIST_SEPARATOR);
    for (const item of items) {
      if (item.trim().length > 0) tags.push(item);
    }
  }
  if (input.intlLocale) tags.push(input.intlLocale);
  return tags;
}

/** 单个候选 → 目录：先整串比对，再不区分地区地看语言族前缀。 */
function classifyTag(tag: string): SupportedLocale | undefined {
  const normalized = undecorate(tag);
  if (normalized === undefined) return undefined;
  for (const known of SUPPORTED_LOCALES) {
    if (known.toLowerCase() === normalized) return known;
  }
  const family = normalized.split(TAG_SEPARATOR)[0] ?? "";
  return FAMILY_BY_PREFIX.get(family);
}

/** 规范化：去空白、去掉 `.编码` 与 `@修饰` 后缀、旧式下划线换连字符并压成小写。 */
function undecorate(tag: string): string | undefined {
  const bare = (tag.trim().split(/[.@]/u)[0] ?? "").replaceAll(LEGACY_SEPARATOR, TAG_SEPARATOR);
  const normalized = bare.toLowerCase();
  if (normalized.length === 0) return undefined;
  return EMPTY_PLACEHOLDERS.has(normalized) ? undefined : normalized;
}

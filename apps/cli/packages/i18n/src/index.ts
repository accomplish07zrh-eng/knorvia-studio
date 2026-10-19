// SPDX-License-Identifier: Apache-2.0
// 包入口（桶 + 门面）：语言探测能力再导出，目录选择按 locale 查表。
// 目录对象在模块求值时创建一次，进程内保持同一引用，调用方可以安全比较身份。
import type { SupportedLocale, UiLocale } from "@knorvia/contracts";
import { DEFAULT_LOCALE, detectLocale, isSupportedLocale, isUiLocale, resolveLocale, SUPPORTED_LOCALES } from "./locale.js";
import { enUS } from "./locales/en-US.js";
import { zhCN } from "./locales/zh-CN.js";
import type { KnorviaCopy } from "./types.js";

export { DEFAULT_LOCALE, SUPPORTED_LOCALES, detectLocale, isSupportedLocale, isUiLocale, resolveLocale };
export type { LocaleDetectionInput } from "./locale.js";
export type { CliCopy, TuiCopy, UiLocale, SupportedLocale, KnorviaCopy } from "./types.js";

/** 每个受支持语言恰好一份目录；表本身不可变。 */
const CATALOG_BY_LOCALE: Readonly<Record<SupportedLocale, KnorviaCopy>> = Object.freeze({
  "en-US": enUS,
  "zh-CN": zhCN,
});

/**
 * 取某个语言的目录。
 * 缺省或无法识别时回落 `DEFAULT_LOCALE`；`detected` 只在 `locale === "auto"` 时参与。
 */
export function getKnorviaCopy(
  requested?: UiLocale | string,
  detected?: string | null,
): KnorviaCopy {
  return CATALOG_BY_LOCALE[resolveLocale(requested, detected)];
}

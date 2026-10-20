// SPDX-License-Identifier: Apache-2.0
// 包入口：把探测与解析能力转给 locale 模块，并负责「解析结果 → 目录」这一步选择。
// 目录对象就两个、模块求值时已是定值，所以按 resolveLocale 的结果直接分支，
// 返回的引用在进程内恒定——调用方可以拿身份比较两个 locale 是否同一套文案。
import type { UiLocale } from "@knorvia/contracts";
import {
  DEFAULT_LOCALE,
  detectLocale,
  isSupportedLocale,
  isUiLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "./locale.js";
import { enUS } from "./locales/en-US.js";
import { zhCN } from "./locales/zh-CN.js";
import type { KnorviaCopy } from "./types.js";

export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  detectLocale,
  isSupportedLocale,
  isUiLocale,
  resolveLocale,
};
export type { LocaleDetectionInput } from "./locale.js";
export type { CliCopy, TuiCopy, UiLocale, SupportedLocale, KnorviaCopy } from "./types.js";

/**
 * 取某个语言的目录：`auto` 交给第二个实参，其余按已支持的取值判定，
 * 认不出的一律落到 `DEFAULT_LOCALE`。新增目录时这里必须同步加上分支（联合类型会提示）。
 */
export function getKnorviaCopy(
  requested?: UiLocale | string,
  detectedTag?: string | null,
): KnorviaCopy {
  const chosen = resolveLocale(requested, detectedTag);
  return chosen === "zh-CN" ? zhCN : enUS;
}

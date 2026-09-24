import type { UiLocale, SupportedLocale } from "@knorvia/contracts";
import { enUS } from "./locales/en-US.js";
import { zhCN } from "./locales/zh-CN.js";
import {
  DEFAULT_LOCALE,
  detectLocale,
  isSupportedLocale,
  isUiLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "./locale.js";
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

const CATALOGS: Record<SupportedLocale, KnorviaCopy> = {
  "en-US": enUS,
  "zh-CN": zhCN,
};

export function getKnorviaCopy(locale?: UiLocale | string, detected?: string | null): KnorviaCopy {
  return CATALOGS[resolveLocale(locale, detected)];
}

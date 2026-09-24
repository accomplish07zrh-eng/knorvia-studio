import { getKnorviaCopy, type SupportedLocale, type UiLocale } from "@knorvia/i18n";

export function formatCliHelp(
  version: string,
  locale?: UiLocale,
  detectedLocale?: SupportedLocale,
): string {
  return getKnorviaCopy(locale, detectedLocale).cli.help(version);
}

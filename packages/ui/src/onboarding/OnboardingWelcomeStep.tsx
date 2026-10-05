import { cn } from "@/components/lib/utils.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useKnorviaStore } from "@/store/StoreProvider.js";
import type { Theme } from "@/useTheme.js";
import type { LocalePreference } from "@knorvia/shared";
import { Bot, Monitor, Moon, Sparkles, Sun, Workflow, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const LOCALE_OPTIONS: readonly LocalePreference[] = ["system", "zh-CN", "en-US"];
const THEME_OPTIONS: ReadonlyArray<{ value: Theme; key: string; icon: LucideIcon }> = [
  { value: "system", key: "themeSystem", icon: Monitor },
  { value: "knorvia-light", key: "themeLight", icon: Sun },
  { value: "knorvia-dark", key: "themeDark", icon: Moon },
];
const HIGHLIGHTS: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "highlightAgents", icon: Bot },
  { key: "highlightWorkflows", icon: Workflow },
  { key: "highlightCreation", icon: Sparkles },
];

/**
 * 引导第 1 步：语言与外观即时生效，并介绍三项核心能力。
 * 语言写入既有 IntlProvider 偏好，主题写入既有 store 主题；引导不另存一份。
 */
export function OnboardingWelcomeStep({
  saving,
  t,
}: {
  saving: boolean;
  t: (key: string) => string;
}) {
  const { intl, localePreference, setLocalePreference } = useKnorviaIntl();
  const theme = useKnorviaStore((state) => state.theme);
  const setTheme = useKnorviaStore((state) => state.setTheme);
  return (
    <div className="mt-8 flex flex-col gap-6">
      <OnboardingChoiceGroup label={t("languageLabel")}>
        {LOCALE_OPTIONS.map((value) => (
          <OnboardingChoice
            key={value}
            pressed={localePreference === value}
            disabled={saving}
            onClick={() => setLocalePreference(value)}
          >
            {intl.formatMessage({ id: `settings.locale.${value}` })}
          </OnboardingChoice>
        ))}
      </OnboardingChoiceGroup>
      <OnboardingChoiceGroup label={t("themeLabel")}>
        {THEME_OPTIONS.map(({ value, key, icon: Icon }) => (
          <OnboardingChoice
            key={value}
            pressed={theme === value}
            disabled={saving}
            onClick={() => setTheme(value)}
          >
            <Icon className="size-4" />
            {t(key)}
          </OnboardingChoice>
        ))}
      </OnboardingChoiceGroup>
      <ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
        {HIGHLIGHTS.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-start gap-3 px-4 py-3.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-foreground">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-ui-base font-medium text-foreground">{t(key)}</span>
              <span className="mt-0.5 block text-ui-sm leading-5 text-foreground-subtle">
                {t(`${key}Description`)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OnboardingChoiceGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="px-1 text-ui-sm font-medium text-foreground-subtle">{label}</span>
      <div role="group" aria-label={label} className="grid grid-cols-3 gap-2">
        {children}
      </div>
    </div>
  );
}

function OnboardingChoice({
  pressed,
  disabled,
  onClick,
  children,
}: {
  pressed: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-10 min-w-0 items-center justify-center gap-2 truncate rounded-full border px-3 text-ui-base transition-colors disabled:opacity-60",
        pressed
          ? "bg-selected border-transparent font-medium text-foreground"
          : "border-border text-foreground-subtle hover:bg-surface-hover hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

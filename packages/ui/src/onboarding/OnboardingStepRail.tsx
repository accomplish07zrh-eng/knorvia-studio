import knorviaLogo from "@/assets/knorvia-logo.png";
import { cn } from "@/components/lib/utils.js";
import { Check } from "lucide-react";

export type OnboardingStep = 0 | 1 | 2;

export const ONBOARDING_STEP_KEYS = ["stepWelcome", "stepRole", "stepPreferences"] as const;

/**
 * 引导左侧步骤栏（≥lg）：标志、三道笔画、标语与竖向步骤。当前步为纸片选中，
 * 已完成步显示对勾。只展示，不持有任何引导状态。
 */
export function OnboardingStepRail({
  step,
  t,
}: {
  step: OnboardingStep;
  t: (key: string) => string;
}) {
  return (
    <aside
      data-onboarding-rail="true"
      className="relative hidden min-h-0 w-[300px] shrink-0 flex-col justify-between overflow-y-auto border-r border-border bg-sidebar px-7 pb-8 pt-16 lg:flex"
    >
      <div className="flex flex-col">
        <img
          src={knorviaLogo}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="size-12 shrink-0 object-contain"
        />
        <span aria-hidden="true" data-knorvia-strokes="true" className="mt-6 ml-1" />
        <h2 className="mt-5 text-ui-xl font-semibold tracking-tight text-foreground">
          {t("heroTitle")}
        </h2>
        <p className="mt-2 text-ui-sm leading-5 text-foreground-subtle">{t("heroDescription")}</p>
        <ol aria-label={t("progressLabel")} className="mt-10 flex flex-col gap-1">
          {ONBOARDING_STEP_KEYS.map((key, index) => {
            const current = step === index;
            const done = index < step;
            return (
              <li
                key={key}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-full px-3 text-ui-base transition-colors",
                  current ? "bg-selected font-medium text-foreground" : "text-foreground-subtle",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-ui-xs",
                    current || done
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-foreground-subtle",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span className="truncate">{t(key)}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-10 text-ui-xs leading-5 text-foreground-subtlest">{t("reopenHint")}</p>
    </aside>
  );
}

/** 窄屏顶部进度：左栏收起后用三段胶囊表示当前步骤。 */
export function OnboardingStepProgress({
  step,
  t,
}: {
  step: OnboardingStep;
  t: (key: string) => string;
}) {
  return (
    <ol aria-label={t("progressLabel")} className="flex w-24 items-center gap-1.5 lg:hidden">
      {ONBOARDING_STEP_KEYS.map((key, index) => (
        <li key={key} aria-current={step === index ? "step" : undefined} className="flex-1">
          <div
            aria-hidden="true"
            className={cn(
              "h-1 rounded-full transition-colors",
              index <= step ? "bg-foreground" : "bg-border",
            )}
          />
          <span className="sr-only">
            {index + 1}. {t(key)}
          </span>
        </li>
      ))}
    </ol>
  );
}

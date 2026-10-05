import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { DesktopWindowControls } from "@/DesktopWindowControls.js";
import { useOnboardingRecordService } from "@/hooks/useOnboardingRecordService.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import { occupations, type OccupationValue } from "@/onboarding/occupationOptions.js";
import { OnboardingOccupationGrid } from "@/onboarding/OnboardingOccupationGrid.js";
import {
  OnboardingStepProgress,
  OnboardingStepRail,
  type OnboardingStep,
} from "@/onboarding/OnboardingStepRail.js";
import { OnboardingWelcomeStep } from "@/onboarding/OnboardingWelcomeStep.js";
import { useOnboardingTelemetry } from "@/onboarding/useOnboardingTelemetry.js";
import { appendOnboardingRecord, useOnboardingTrigger } from "@/onboarding/useOnboardingTrigger.js";
import { matchesShortcutBinding } from "@/shortcuts/bindings.js";
import { useEffectiveShortcutBindings } from "@/shortcuts/useShortcutBindings.js";
import { useKnorviaStore } from "@/store/StoreProvider.js";
import type { OnboardingRecordEntry } from "@knorvia/shared";
import { ArrowLeft, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export function OccupationOnboarding({
  children,
  showWindowControls = false,
  showChildrenWhileLoading = false,
}: {
  children: ReactNode;
  /** Windows/Linux 自绘窗控：引导全屏覆盖主界面（含标题栏），需在此补最小化/最大化/关闭。 */
  showWindowControls?: boolean;
  /** 独立设置页不依赖引导设置加载，避免应用级引导外层遮住设置内容。 */
  showChildrenWhileLoading?: boolean;
  /** 保留调用方既有参数；新版引导不再按平台绘制右侧主视觉圆角。 */
  isMacDesktop?: boolean;
  isWindowsDesktop?: boolean;
}) {
  const { settings, update } = useSettings();
  const platform = usePlatform();
  const onboardingRecord = useOnboardingRecordService();
  const shortcutBindings = useEffectiveShortcutBindings();
  const requested = useKnorviaStore((state) => state.newUserOnboardingOpen);
  const setRequested = useKnorviaStore((state) => state.setNewUserOnboardingOpen);
  // 偏好引导按本机记录显示，不依赖产品账号。
  const { intl } = useKnorviaIntl();
  const t = (key: string) => intl.formatMessage({ id: `occupationOnboarding.${key}` });
  const [occupation, setOccupation] = useState<OccupationValue | null>("developer");
  // 2026-10-05 统一模式：引导改为 欢迎 → 工作方向 → 偏好，不再询问界面模式。
  const [step, setStep] = useState<OnboardingStep>(0);
  const preferences = step === 2;
  const requestOnboardingDialog = useKnorviaStore((state) => state.requestOnboardingDialog);
  const [migration, setMigration] = useState(false);
  const [memory, setMemory] = useState(false);
  const [suggestions, setSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [needsOnboarding, markOnboarded] = useOnboardingTrigger({
    onboardingRecord,
    hasStoredOccupation: Boolean(settings?.onboardingOccupation),
  });
  const onboardingVisible = requested || (needsOnboarding === true && !dismissed);
  const captureEnd = useOnboardingTelemetry({
    platform,
    visible:
      Boolean(settings) &&
      onboardingVisible &&
      (requested || needsOnboarding !== null || Boolean(settings?.onboardingOccupation)),
    step,
    occupation,
    memory,
    suggestions,
    migration,
  });
  const closeOnboarding = useCallback(() => {
    if (savingRef.current) return;
    captureEnd("close", intl.formatMessage({ id: "occupationOnboarding.close" }))();
    setStep(0);
    setDismissed(true);
    setRequested(false);
  }, [captureEnd, intl, setRequested]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onboardingVisible && !saving) {
        // 直接退出引导（设置里主动打开的场景尤其需要）：不保存、不改记录，
        // 本次会话不再显示，下次启动按记录重新触发。
        event.preventDefault();
        event.stopImmediatePropagation();
        closeOnboarding();
        return;
      }
      if (
        !shortcutBindings.openOnboarding.some((binding) => matchesShortcutBinding(event, binding))
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (saving) return;
      // 关闭调试引导不保存偏好，也不把首次引导标记为已完成。
      if (onboardingVisible) {
        closeOnboarding();
      } else {
        setRequested(true);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeOnboarding, shortcutBindings, setRequested, onboardingVisible, saving]);
  // 从设置或快捷键再次打开引导时，用本机 record 里的最近作答预填，
  // 而不是每次都从写死的默认选项开始；跳过页记 null 的字段落默认值。
  const [latestEntry, setLatestEntry] = useState<OnboardingRecordEntry | null>(null);
  // 预填异步后到时不得覆盖用户已经做出的选择。
  const userEditedRef = useRef(false);
  useEffect(() => {
    if (!onboardingRecord) return;
    let cancelled = false;
    onboardingRecord.getLatestEntry().then(
      (entry) => {
        if (!cancelled) setLatestEntry(entry);
      },
      (cause) => {
        logger.warn("[occupation-onboarding] 读取预填作答失败", { error: String(cause) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [onboardingRecord]);
  const markUserEdited = () => {
    userEditedRef.current = true;
  };

  const applyLatestEntry = () => {
    const entry = latestEntry;
    setStep(0);
    setOccupation(
      entry?.occupation && (occupations as readonly string[]).includes(entry.occupation)
        ? (entry.occupation as OccupationValue)
        : "developer",
    );
    // 恢复本机最近一次作答；跳过页记 null 的偏好落保守默认值（关闭）。
    setMemory(entry?.memoryEnabled ?? false);
    setSuggestions(entry?.proactiveSuggestionsEnabled ?? false);
    setMigration(false);
    setError(false);
  };
  useEffect(() => {
    if (!requested) return;
    userEditedRef.current = false;
    applyLatestEntry();
    // latestEntry 异步到达时若引导已打开，重新预填一次（用户未交互前覆盖默认值）。
  }, [requested]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!onboardingVisible || userEditedRef.current) return;
    applyLatestEntry();
    // eslint-disable-line react-hooks/exhaustive-deps
  }, [latestEntry]);
  if (!settings) return showChildrenWhileLoading ? <>{children}</> : null;
  // 判定进行中先不渲染，避免引导闪现后立即消失（判定为需引导）或先闪引导再进主界面。
  // 只有疑似首跑（settings 里也没有职业）才等待记录判定；存量用户（已有
  // onboardingOccupation）不等 RPC 直接进主界面，杜绝黑屏。
  if (!requested && needsOnboarding === null && !settings.onboardingOccupation) return null;
  if (!onboardingVisible) return <>{children}</>;
  const save = async (skip = false) => {
    if (savingRef.current) return;
    savingRef.current = true;
    const reportEnd = captureEnd(skip ? "skip" : "start", t(skip ? "skip" : "start"));
    setSaving(true);
    setError(false);
    try {
      logger.info("[occupation-onboarding] 保存偏好", { skip });
      await update({
        // settings 侧保持既有语义：跳过落保守默认值（职业 other / 偏好关），
        // "跳过也算答案"的区分度只体现在 onboarding-record.json 里。
        onboardingOccupation: occupation ?? "other",
        memoryEnabled: skip ? false : memory,
        proactiveSuggestionsEnabled: !skip && suggestions,
      });
      // 偏好是完成事实源；先取消旧判定，附属记录失败不能让已完成引导复活。
      markOnboarded();
      reportEnd();
      // 保存成功就是本次引导的终点；本地记录失败不应留下可再次上报的引导页面。
      setStep(0);
      setDismissed(true);
      setRequested(false);
      if (!skip && migration) requestOnboardingDialog("migration");
      logger.info("[occupation-onboarding] 偏好保存完成", { skip });
      if (onboardingRecord) {
        try {
          // 追加当前本机偏好记录。
          // appendRecord 走 RPC，channel 缺失时会挂起导致保存按钮永远转圈，加超时保护。
          // 跳过是显式答案：该页被跳过时记 null（occupation 在工作方向页跳过时已是 null，
          // 偏好页整体跳过时两个布尔记 null）。统一模式不再询问界面模式，interfaceMode 恒为 null。
          await appendOnboardingRecord(onboardingRecord, platform.getDeviceId(), {
            occupation,
            interfaceMode: null,
            memoryEnabled: skip ? null : memory,
            proactiveSuggestionsEnabled: skip ? null : suggestions,
            completedAt: new Date().toISOString(),
          });
        } catch (cause) {
          // 偏好已保存成功，记录写失败只留 warn 日志；下次启动通过职业偏好识别已完成。
          logger.warn("[occupation-onboarding] 写入引导记录失败", { error: String(cause) });
        }
      }
    } catch (cause) {
      logger.warn("[occupation-onboarding] 保存偏好失败", { error: String(cause) });
      setError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const titleKey = preferences ? "preferences" : step === 1 ? "title" : "welcomeTitle";
  const descriptionKey = preferences
    ? "preferencesDescription"
    : step === 1
      ? "description"
      : "welcomeDescription";
  return (
    <main
      aria-label={t("pageLabel")}
      data-testid="onboarding-page"
      className="relative flex h-dvh w-full min-h-0 overflow-hidden bg-background text-foreground"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 [app-region:drag]" />
      {/* 与 Settings 相同，计入 Workspace 的 4px 外层留白、1px 边框和 8px 内边距。 */}
      {showWindowControls ? (
        <div className="absolute right-1 top-1 z-30 mt-px mr-px flex h-12 items-center px-2">
          <DesktopWindowControls />
        </div>
      ) : null}
      <OnboardingStepRail step={step} t={t} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-12 [@media(max-height:740px)]:pt-10">
        <header className="relative grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-6 sm:px-10">
          {step > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              className="col-start-1 row-start-1 justify-self-start gap-1.5 px-2.5 text-foreground-subtle [app-region:no-drag]"
              onClick={() => setStep(step === 2 ? 1 : 0)}
            >
              <ArrowLeft className="size-4" />
              {t("back")}
            </Button>
          ) : null}
          <div className="col-start-2 row-start-1">
            <OnboardingStepProgress step={step} t={t} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            disabled={saving}
            aria-label={t("close")}
            title={t("close")}
            className={cn(
              "col-start-3 row-start-1 justify-self-end size-9 text-foreground-subtle [app-region:no-drag]",
              // Windows/Linux 自绘窗控位于右上角，关闭引导按钮避开它们。
              showWindowControls && "mr-[120px]",
            )}
            onClick={closeOnboarding}
          >
            <X className="size-4" />
          </Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6 sm:px-10">
          {/* 自动外边距让短内容居中，长内容从顶部正常滚动，不影响固定导航。 */}
          <section className="mx-auto my-auto flex w-full max-w-xl shrink-0 flex-col">
            <p className="text-ui-sm font-medium text-foreground-subtle">
              {intl.formatMessage(
                { id: "occupationOnboarding.stepCounter" },
                { current: step + 1, total: 3 },
              )}
            </p>
            <h1 className="mt-2 text-ui-xl font-semibold tracking-tight">{t(titleKey)}</h1>
            <p className="mt-2 text-ui-base leading-relaxed text-foreground-subtle">
              {t(descriptionKey)}
            </p>
            {step === 0 ? (
              <OnboardingWelcomeStep saving={saving} t={t} />
            ) : step === 1 ? (
              <OnboardingOccupationGrid
                occupation={occupation}
                saving={saving}
                onSelect={(value) => {
                  markUserEdited();
                  setOccupation(value);
                }}
                label={t("title")}
                formatLabel={(value) => t(value)}
              />
            ) : (
              <div className="mt-8 flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                {(["suggestions", "memory", "migration"] as const).map((key) => (
                  <label
                    key={key}
                    className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3.5 px-4 py-3.5 transition-colors hover:bg-surface-hover"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={
                        key === "migration" ? migration : key === "memory" ? memory : suggestions
                      }
                      disabled={saving}
                      onCheckedChange={(checked) => {
                        markUserEdited();
                        if (key === "migration") setMigration(checked === true);
                        else if (key === "memory") setMemory(checked === true);
                        else setSuggestions(checked === true);
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block text-ui-base font-medium">{t(key)}</span>
                      <span className="mt-0.5 block text-ui-sm leading-5 text-foreground-subtle">
                        {t(`${key}Description`)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {error ? (
              <p role="alert" className="mt-4 text-ui-sm text-destructive">
                {t("error")}
              </p>
            ) : null}
            <footer className="mt-8 flex items-center justify-between gap-3 [@media(max-height:740px)]:mt-5">
              <Button
                variant="ghost"
                disabled={saving}
                className="px-3 text-foreground-subtle"
                onClick={() => {
                  markUserEdited();
                  if (preferences) void save(true);
                  else {
                    // 工作方向页跳过是显式答案：记录里职业记 null。
                    if (step === 1) setOccupation(null);
                    setStep(step === 0 ? 1 : 2);
                  }
                }}
              >
                {t("skip")}
              </Button>
              <Button
                size="lg"
                disabled={saving || (step === 1 && !occupation)}
                className="min-w-32 px-6"
                onClick={() => {
                  if (!preferences) setStep(step === 0 ? 1 : 2);
                  else void save();
                }}
              >
                {t(saving ? "saving" : preferences ? "start" : "continue")}
              </Button>
            </footer>
          </section>
        </div>
      </div>
    </main>
  );
}

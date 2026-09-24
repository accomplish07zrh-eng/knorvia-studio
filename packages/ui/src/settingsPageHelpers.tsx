/* oxlint-disable eslint(max-lines) -- settings helper 聚合多个设置分组；终端、网络与自动归档多侧能力暂时超过行数限制。 */
import { Button } from "@/components/ui/button.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Switch } from "@/components/ui/switch.js";
import { useOptionalServices } from "@/hooks/useServices.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { normalizeInterfaceMode, type InterfaceMode } from "@/lib/interfaceMode.js";
import { AsyncSettingTextRow } from "@/settings/AsyncSettingTextRow.js";
import { DataStorageSettings } from "@/settings/DataStorageSettings.js";
import { ReleaseUpdateSettings } from "@/settings/ReleaseUpdateSettings.js";
import { ProactiveSuggestionsSetting } from "@/settings/ProactiveSuggestionsSetting.js";
import {
  createSettingsPageConfig,
  resolveSettingsSectionForPlatform,
  type SettingsSectionId,
} from "@/settings/settingsPageConfig.js";
import { SettingsBadge, SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";
import type {
  IPlatformService,
  IntegratedTerminalShellOption,
  IntegratedTerminalShellSelection,
  LocalePreference,
  KnorviaInteractionBehavior,
} from "@knorvia/shared";
import {
  TID_SETTINGS_ASK_USER_QUESTION_AUTO_RESOLUTION_SWITCH,
  TID_SETTINGS_LOCALE_SELECT_ITEM,
  TID_SETTINGS_LOCALE_SELECT_TRIGGER,
  TID_SETTINGS_NATIVE_SEARCH_SWITCH,
  testId,
} from "@knorvia/shared";
import { useCallback } from "react";

export type { Locale, LocalePreference } from "@knorvia/shared";
export { createSettingsPageConfig, resolveSettingsSectionForPlatform, type SettingsSectionId };

const TASK_AUTO_ARCHIVE_DAY_OPTIONS = [3, 7, 14, 30] as const;
const KNORVIA_INTERACTION_BEHAVIOR_OPTIONS: readonly KnorviaInteractionBehavior[] = [
  "queue",
  "guide",
];

export function GeneralSectionContent({
  localePreference,
  interfaceMode = "coding",
  setInterfaceMode = () => {},
  notificationEnabled,
  notificationSoundEnabled,
  closeToTrayOnWindows,
  keepAwakeWhileRunning = false,
  desktopChromiumHardwareAccelerationEnabled = true,
  terminalInheritSystemProfile = true,
  terminalFontFamily = "",
  integratedTerminalShell = { mode: "auto" },
  integratedTerminalShellOptions = [],
  nativeSearchEnhancementsEnabled,
  httpProxy = "",
  httpProxyNoProxy = "",
  httpProxyCaCertPath = "",
  defaultHomeDir,
  isDesktop,
  isWindowsDesktop,
  showIntegratedTerminalShell = false,
  setLocalePreference,
  setNotificationEnabled,
  setNotificationSoundEnabled,
  taskAutoArchiveEnabled,
  taskAutoArchiveOlderThanDays,
  messageStreamShowReasoning,
  messageStreamShowTodos,
  toolGroupingExploreEnabled,
  toolGroupingTerminalEnabled,
  toolGroupingChangesEnabled,
  knorviaInteractionBehavior,
  askUserQuestionAutoResolutionEnabled = true,
  modelIoFullRetentionEnabled = false,
  onDataBaseDirChange,
  onSelectDataBaseDir,
  onTerminalInheritSystemProfileChange = async () => {},
  onTerminalFontFamilyChange = async () => {},
  onIntegratedTerminalShellChange = async () => {},
  onNativeSearchEnhancementsEnabledChange,
  onHttpProxyChange = async () => {},
  onHttpProxyNoProxyChange = async () => {},
  onHttpProxyCaCertPathChange = async () => {},
  onTaskAutoArchiveEnabledChange,
  onTaskAutoArchiveOlderThanDaysChange,
  onCloseToTrayOnWindowsChange,
  onKeepAwakeWhileRunningChange = async () => {},
  onDesktopChromiumHardwareAccelerationChange = async () => {},
  onMessageStreamShowReasoningChange,
  onMessageStreamShowTodosChange,
  onToolGroupingExploreEnabledChange,
  onToolGroupingTerminalEnabledChange,
  onToolGroupingChangesEnabledChange,
  onKnorviaInteractionBehaviorChange,
  onAskUserQuestionAutoResolutionEnabledChange = async () => {},
  onModelIoFullRetentionEnabledChange = async () => {},
  onOpenOnboardingDialog,
}: {
  localePreference: LocalePreference;
  interfaceMode?: InterfaceMode;
  setInterfaceMode?: (mode: InterfaceMode) => void;
  notificationEnabled: boolean;
  notificationSoundEnabled: boolean;
  closeToTrayOnWindows: boolean;
  keepAwakeWhileRunning?: boolean;
  desktopChromiumHardwareAccelerationEnabled?: boolean;
  dataBaseDir: string;
  terminalInheritSystemProfile: boolean;
  terminalFontFamily: string;
  integratedTerminalShell?: IntegratedTerminalShellSelection;
  integratedTerminalShellOptions?: IntegratedTerminalShellOption[];
  nativeSearchEnhancementsEnabled: boolean;
  httpProxy?: string;
  httpProxyNoProxy?: string;
  httpProxyCaCertPath?: string;
  defaultHomeDir: string;
  isDesktop?: boolean;
  isWindowsDesktop?: boolean;
  showIntegratedTerminalShell?: boolean;
  platform?: IPlatformService;
  setLocalePreference: (locale: LocalePreference) => void;
  setNotificationEnabled: (enabled: boolean) => void;
  setNotificationSoundEnabled: (enabled: boolean) => void;
  taskAutoArchiveEnabled: boolean;
  taskAutoArchiveOlderThanDays: number;
  messageStreamShowReasoning: boolean;
  messageStreamShowTodos: boolean;
  toolGroupingExploreEnabled: boolean;
  toolGroupingTerminalEnabled: boolean;
  toolGroupingChangesEnabled: boolean;
  knorviaInteractionBehavior: KnorviaInteractionBehavior;
  askUserQuestionAutoResolutionEnabled?: boolean;
  modelIoFullRetentionEnabled?: boolean;
  onDataBaseDirChange: (dir: string) => Promise<void>;
  onSelectDataBaseDir: () => Promise<string | null>;
  onTerminalInheritSystemProfileChange: (enabled: boolean) => Promise<void>;
  onTerminalFontFamilyChange: (fontFamily: string) => Promise<void>;
  onIntegratedTerminalShellChange?: (selection: IntegratedTerminalShellSelection) => Promise<void>;
  onNativeSearchEnhancementsEnabledChange: (enabled: boolean) => Promise<void>;
  onHttpProxyChange?: (httpProxy: string) => Promise<void>;
  onHttpProxyNoProxyChange?: (noProxy: string) => Promise<void>;
  onHttpProxyCaCertPathChange?: (caCertPath: string) => Promise<void>;
  onTaskAutoArchiveEnabledChange: (enabled: boolean) => Promise<void>;
  onTaskAutoArchiveOlderThanDaysChange: (days: number) => Promise<void>;
  onCloseToTrayOnWindowsChange: (enabled: boolean) => Promise<void>;
  onKeepAwakeWhileRunningChange?: (enabled: boolean) => Promise<void>;
  onDesktopChromiumHardwareAccelerationChange?: (enabled: boolean) => Promise<void>;
  onMessageStreamShowReasoningChange: (enabled: boolean) => Promise<void>;
  onMessageStreamShowTodosChange: (enabled: boolean) => Promise<void>;
  onToolGroupingExploreEnabledChange: (enabled: boolean) => Promise<void>;
  onToolGroupingTerminalEnabledChange: (enabled: boolean) => Promise<void>;
  onToolGroupingChangesEnabledChange: (enabled: boolean) => Promise<void>;
  onKnorviaInteractionBehaviorChange: (behavior: KnorviaInteractionBehavior) => Promise<void>;
  onAskUserQuestionAutoResolutionEnabledChange?: (enabled: boolean) => Promise<void>;
  onModelIoFullRetentionEnabledChange?: (enabled: boolean) => Promise<void>;
  onOpenOnboardingDialog: () => void;
}) {
  const { intl } = useKnorviaIntl();
  const hasServices = Boolean(useOptionalServices());
  const integratedTerminalShellValue =
    integratedTerminalShell.mode === "shell" ? integratedTerminalShell.id : "auto";
  const selectedIntegratedTerminalShellOption =
    integratedTerminalShell.mode === "shell"
      ? (integratedTerminalShellOptions.find(
          (option) => option.id === integratedTerminalShell.id,
        ) ?? {
          dialect: integratedTerminalShell.dialect,
          id: integratedTerminalShell.id,
          label: integratedTerminalShell.label,
          path: integratedTerminalShell.path,
          source: "system" as const,
        })
      : undefined;
  const visibleIntegratedTerminalShellOptions = selectedIntegratedTerminalShellOption
    ? [
        selectedIntegratedTerminalShellOption,
        ...integratedTerminalShellOptions.filter(
          (option) => option.id !== selectedIntegratedTerminalShellOption.id,
        ),
      ]
    : integratedTerminalShellOptions;

  const handleIntegratedTerminalShellChange = useCallback(
    async (value: string) => {
      if (value === "auto") {
        await onIntegratedTerminalShellChange({ mode: "auto" });
        return;
      }
      const option = visibleIntegratedTerminalShellOptions.find(
        (candidate) => candidate.id === value,
      );
      if (!option) {
        return;
      }
      await onIntegratedTerminalShellChange({
        mode: "shell",
        dialect: option.dialect,
        id: option.id,
        label: option.label,
        path: option.path,
      });
    },
    [onIntegratedTerminalShellChange, visibleIntegratedTerminalShellOptions],
  );

  return (
    <div className="space-y-4">
      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.locale" })}
          description={intl.formatMessage({ id: "settings.localeDescription" })}
          control={
            <Select
              value={localePreference}
              onValueChange={(value) => setLocalePreference(value as LocalePreference)}
            >
              <SelectTrigger
                size="lg"
                className="w-[260px] min-w-0 justify-between"
                data-testid={TID_SETTINGS_LOCALE_SELECT_TRIGGER}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="system"
                  data-testid={testId(TID_SETTINGS_LOCALE_SELECT_ITEM, "system")}
                >
                  {intl.formatMessage({ id: "settings.locale.system" })}
                </SelectItem>
                <SelectItem
                  value="zh-CN"
                  data-testid={testId(TID_SETTINGS_LOCALE_SELECT_ITEM, "zh-CN")}
                >
                  {intl.formatMessage({ id: "settings.locale.zh-CN" })}
                </SelectItem>
                <SelectItem
                  value="en-US"
                  data-testid={testId(TID_SETTINGS_LOCALE_SELECT_ITEM, "en-US")}
                >
                  {intl.formatMessage({ id: "settings.locale.en-US" })}
                </SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </SettingsGroupCard>

      <SettingsGroupCard>
        <SettingsRow
          controlLayout="wide"
          label={intl.formatMessage({ id: "settings.interfaceMode" })}
          description={intl.formatMessage({ id: "settings.interfaceMode.description" })}
          control={
            <Select
              value={interfaceMode}
              onValueChange={(value) => setInterfaceMode(normalizeInterfaceMode(value))}
            >
              <SelectTrigger
                size="lg"
                className="w-full min-w-0 sm:w-64"
                aria-label={intl.formatMessage({ id: "settings.interfaceMode" })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="coding">
                  {intl.formatMessage({ id: "settings.interfaceMode.coding" })}
                </SelectItem>
                <SelectItem value="office">
                  {intl.formatMessage({ id: "settings.interfaceMode.office" })}
                </SelectItem>
              </SelectContent>
            </Select>
          }
        />
        {hasServices ? <ProactiveSuggestionsSetting /> : null}
      </SettingsGroupCard>

      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.terminalProfile" })}
          description={intl.formatMessage({ id: "settings.terminalProfileDescription" })}
          control={
            <Switch
              checked={terminalInheritSystemProfile}
              onCheckedChange={(checked) => {
                void onTerminalInheritSystemProfileChange(checked);
              }}
            />
          }
        />
        <AsyncSettingTextRow
          fieldId="terminalFontFamily"
          label={intl.formatMessage({ id: "settings.terminalFontFamily" })}
          description={intl.formatMessage({ id: "settings.terminalFontFamilyDescription" })}
          placeholder={intl.formatMessage({ id: "settings.terminalFontFamilyPlaceholder" })}
          value={terminalFontFamily}
          onSave={onTerminalFontFamilyChange}
        />
        {showIntegratedTerminalShell ? (
          <SettingsRow
            label={intl.formatMessage({ id: "settings.integratedTerminalShell" })}
            description={intl.formatMessage({
              id: "settings.integratedTerminalShellDescription",
            })}
            control={
              <Select
                value={integratedTerminalShellValue}
                onValueChange={(value) => {
                  void handleIntegratedTerminalShellChange(value);
                }}
              >
                <SelectTrigger size="lg" className="w-[260px] min-w-0 justify-between">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    {intl.formatMessage({ id: "settings.integratedTerminalShell.auto" })}
                  </SelectItem>
                  {visibleIntegratedTerminalShellOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        ) : null}
        <SettingsRow
          label={intl.formatMessage({
            id: "settings.nativeSearchEnhancements",
          })}
          description={intl.formatMessage({
            id: "settings.nativeSearchEnhancementsDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({
                id: "settings.nativeSearchEnhancements",
              })}
              checked={nativeSearchEnhancementsEnabled}
              data-testid={TID_SETTINGS_NATIVE_SEARCH_SWITCH}
              onCheckedChange={(checked) => {
                void onNativeSearchEnhancementsEnabledChange(checked);
              }}
            />
          }
        />
      </SettingsGroupCard>

      <SettingsGroupCard>
        <AsyncSettingTextRow
          fieldId="httpProxy"
          label={intl.formatMessage({ id: "settings.httpProxy" })}
          description={intl.formatMessage({ id: "settings.httpProxyDescription" })}
          placeholder={intl.formatMessage({ id: "settings.httpProxyPlaceholder" })}
          value={httpProxy}
          onSave={onHttpProxyChange}
        />
        {/* No Proxy 与 HTTP 代理共同决定同一出口策略，必须贴在代理地址下面。*/}
        <AsyncSettingTextRow
          fieldId="httpProxyNoProxy"
          label={intl.formatMessage({ id: "settings.httpProxyNoProxy" })}
          description={intl.formatMessage({ id: "settings.httpProxyNoProxyDescription" })}
          placeholder={intl.formatMessage({ id: "settings.httpProxyNoProxyPlaceholder" })}
          value={httpProxyNoProxy}
          onSave={onHttpProxyNoProxyChange}
          commaSeparated
        />
        {/* 自定义 CA 属于 HTTP 代理的同一网络出口策略，必须跟代理输入放在同一卡片里。*/}
        <AsyncSettingTextRow
          fieldId="httpProxyCaCertPath"
          label={intl.formatMessage({ id: "settings.httpProxyCaCertPath" })}
          description={intl.formatMessage({ id: "settings.httpProxyCaCertPathDescription" })}
          placeholder={intl.formatMessage({ id: "settings.httpProxyCaCertPathPlaceholder" })}
          value={httpProxyCaCertPath}
          onSave={onHttpProxyCaCertPathChange}
        />
      </SettingsGroupCard>

      <SettingsGroupCard>
        {isDesktop ? (
          <>
            <SettingsRow
              label={intl.formatMessage({
                id: "settings.desktopChromiumHardwareAcceleration",
              })}
              description={intl.formatMessage({
                id: "settings.desktopChromiumHardwareAccelerationDescription",
              })}
              control={
                <Switch
                  aria-label={intl.formatMessage({
                    id: "settings.desktopChromiumHardwareAcceleration",
                  })}
                  checked={desktopChromiumHardwareAccelerationEnabled}
                  onCheckedChange={(checked) => {
                    void onDesktopChromiumHardwareAccelerationChange(checked);
                  }}
                />
              }
            />
          </>
        ) : null}
        <SettingsRow
          label={intl.formatMessage({ id: "settings.notification" })}
          description={intl.formatMessage({
            id: "settings.notificationDescription",
          })}
          control={
            <Switch checked={notificationEnabled} onCheckedChange={setNotificationEnabled} />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.notificationSound" })}
          description={intl.formatMessage({
            id: "settings.notificationSoundDescription",
          })}
          control={
            <Switch
              checked={notificationSoundEnabled}
              disabled={!notificationEnabled}
              onCheckedChange={setNotificationSoundEnabled}
            />
          }
        />
        {isWindowsDesktop ? (
          <SettingsRow
            label={intl.formatMessage({ id: "settings.closeToTrayOnWindows" })}
            description={intl.formatMessage({
              id: "settings.closeToTrayOnWindowsDescription",
            })}
            control={
              <Switch
                checked={closeToTrayOnWindows}
                onCheckedChange={(checked) => {
                  void onCloseToTrayOnWindowsChange(checked);
                }}
              />
            }
          />
        ) : null}
        {isDesktop ? (
          <SettingsRow
            label={intl.formatMessage({ id: "settings.keepAwakeWhileRunning" })}
            description={intl.formatMessage({
              id: "settings.keepAwakeWhileRunningDescription",
            })}
            control={
              <Switch
                aria-label={intl.formatMessage({
                  id: "settings.keepAwakeWhileRunning",
                })}
                checked={keepAwakeWhileRunning}
                onCheckedChange={(checked) => {
                  void onKeepAwakeWhileRunningChange(checked);
                }}
              />
            }
          />
        ) : null}
      </SettingsGroupCard>

      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.knorviaInteractionBehavior" })}
          description={intl.formatMessage({
            id: "settings.knorviaInteractionBehaviorDescription",
          })}
          control={
            <Select
              value={knorviaInteractionBehavior}
              onValueChange={(value) => {
                void onKnorviaInteractionBehaviorChange(value as KnorviaInteractionBehavior);
              }}
            >
              <SelectTrigger size="lg" className="w-[260px] min-w-0 justify-between">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KNORVIA_INTERACTION_BEHAVIOR_OPTIONS.map((behavior) => (
                  <SelectItem key={behavior} value={behavior}>
                    {intl.formatMessage({
                      id: `settings.knorviaInteractionBehavior.option.${behavior}`,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow
          label={intl.formatMessage({
            id: "settings.askUserQuestionAutoResolution",
          })}
          description={intl.formatMessage({
            id: "settings.askUserQuestionAutoResolutionDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({
                id: "settings.askUserQuestionAutoResolution",
              })}
              checked={askUserQuestionAutoResolutionEnabled}
              data-testid={TID_SETTINGS_ASK_USER_QUESTION_AUTO_RESOLUTION_SWITCH}
              onCheckedChange={(checked) => {
                void onAskUserQuestionAutoResolutionEnabledChange(checked);
              }}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.modelIoFullRetention" })}
          description={intl.formatMessage({
            id: "settings.modelIoFullRetentionDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({ id: "settings.modelIoFullRetention" })}
              checked={modelIoFullRetentionEnabled}
              onCheckedChange={(checked) => {
                void onModelIoFullRetentionEnabledChange(checked);
              }}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.messageStreamShowReasoning" })}
          description={intl.formatMessage({
            id: "settings.messageStreamShowReasoningDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({ id: "settings.messageStreamShowReasoning" })}
              checked={messageStreamShowReasoning}
              onCheckedChange={(checked) => {
                void onMessageStreamShowReasoningChange(checked);
              }}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.messageStreamShowTodos" })}
          description={intl.formatMessage({
            id: "settings.messageStreamShowTodosDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({ id: "settings.messageStreamShowTodos" })}
              checked={messageStreamShowTodos}
              onCheckedChange={(checked) => {
                void onMessageStreamShowTodosChange(checked);
              }}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.toolGroupingExplore" })}
          description={intl.formatMessage({
            id: "settings.toolGroupingExploreDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({ id: "settings.toolGroupingExplore" })}
              checked={toolGroupingExploreEnabled}
              onCheckedChange={(checked) => {
                void onToolGroupingExploreEnabledChange(checked);
              }}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.toolGroupingTerminal" })}
          description={intl.formatMessage({
            id: "settings.toolGroupingTerminalDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({ id: "settings.toolGroupingTerminal" })}
              checked={toolGroupingTerminalEnabled}
              onCheckedChange={(checked) => {
                void onToolGroupingTerminalEnabledChange(checked);
              }}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.toolGroupingChanges" })}
          description={intl.formatMessage({
            id: "settings.toolGroupingChangesDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({ id: "settings.toolGroupingChanges" })}
              checked={toolGroupingChangesEnabled}
              onCheckedChange={(checked) => {
                void onToolGroupingChangesEnabledChange(checked);
              }}
            />
          }
        />
      </SettingsGroupCard>

      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.taskAutoArchive" })}
          description={intl.formatMessage({
            id: "settings.taskAutoArchiveDescription",
          })}
          control={
            <Switch
              checked={taskAutoArchiveEnabled}
              onCheckedChange={(checked) => {
                void onTaskAutoArchiveEnabledChange(checked);
              }}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.taskAutoArchiveDays" })}
          description={intl.formatMessage({
            id: "settings.taskAutoArchiveDaysDescription",
          })}
          control={
            <Select
              value={String(taskAutoArchiveOlderThanDays)}
              onValueChange={(value) => {
                void onTaskAutoArchiveOlderThanDaysChange(Number(value));
              }}
              disabled={!taskAutoArchiveEnabled}
            >
              <SelectTrigger size="lg" className="w-[260px] min-w-0 justify-between">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_AUTO_ARCHIVE_DAY_OPTIONS.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {intl.formatMessage({
                      id: `settings.taskAutoArchiveDays.option.${days}`,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SettingsGroupCard>

      {isDesktop ? <ReleaseUpdateSettings /> : null}

      <DataStorageSettings
        defaultHomeDir={defaultHomeDir}
        onDataBaseDirChange={onDataBaseDirChange}
        onSelectDataBaseDir={onSelectDataBaseDir}
      />

      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.onboarding" })}
          description={intl.formatMessage({
            id: "settings.onboardingDescription",
          })}
          control={
            <Button type="button" size="lg" variant="outline" onClick={onOpenOnboardingDialog}>
              {intl.formatMessage({ id: "settings.onboardingOpen" })}
            </Button>
          }
        />
      </SettingsGroupCard>
    </div>
  );
}

export function GeneralSectionHeader({ localePreference }: { localePreference: LocalePreference }) {
  const { intl } = useKnorviaIntl();

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <SettingsBadge>
        {intl.formatMessage({ id: `settings.locale.${localePreference}` })}
      </SettingsBadge>
    </div>
  );
}

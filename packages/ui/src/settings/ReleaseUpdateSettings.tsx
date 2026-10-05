import { useEffect, useRef, useState } from "react";
import type { ReleaseUpdateCheckResult, ReleaseUpdateInstallResult } from "@knorvia/shared";
import { Download, ExternalLink, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Switch } from "@/components/ui/switch.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { SettingsGroupCard, SettingsRow } from "./SettingsPageParts.js";

type Format = (id: string, values?: Record<string, string | number>) => string;

function resultMessage(result: ReleaseUpdateCheckResult, format: Format): string {
  switch (result.status) {
    case "unconfigured":
      return format("settings.releaseUpdate.unconfigured");
    case "disabled":
      return format("settings.releaseUpdate.disabled");
    case "up-to-date":
      return format("settings.releaseUpdate.current", { version: result.currentVersion });
    case "no-compatible-release":
      return format("settings.releaseUpdate.noCompatibleRelease");
    case "available":
      return format(
        result.installable
          ? "settings.releaseUpdate.availableInstallable"
          : "settings.releaseUpdate.available",
        { version: result.latestVersion, current: result.currentVersion },
      );
    case "failed":
      return format("settings.releaseUpdate.failed", {
        reason:
          result.reason === "http" && result.httpStatus
            ? `HTTP ${result.httpStatus}`
            : format(`settings.releaseUpdate.reason.${result.reason}`),
      });
  }
}

/**
 * 更新检测与一键安装（specs/knorvia-release-update-install.md）。
 * 下载地址只由 Main 从发布记录中选择；这里只触发检查、安装或打开发布页。
 */
export function ReleaseUpdateSettings() {
  const { intl } = useKnorviaIntl();
  const platform = usePlatform();
  const { settings, update } = useSettings();
  const [source, setSource] = useState("");
  const [working, setWorking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<ReleaseUpdateCheckResult | null>(null);
  const [installResult, setInstallResult] = useState<ReleaseUpdateInstallResult | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const autoCheckedRef = useRef(false);
  useEffect(() => setSource(settings?.releaseInfoUrl ?? ""), [settings?.releaseInfoUrl]);
  const format: Format = (id, values) => intl.formatMessage({ id }, values);
  const savedSource = settings?.releaseInfoUrl ?? "";
  const dirty = source.trim() !== savedSource;
  const enabled = settings?.releaseChecksEnabled !== false;

  const check = async () => {
    if (!platform.checkReleaseUpdate) return;
    setWorking(true);
    setInstallResult(null);
    try {
      setResult(await platform.checkReleaseUpdate());
    } catch {
      setResult({ status: "failed", currentVersion: "", reason: "offline" });
    } finally {
      setWorking(false);
    }
  };

  // 打开设置时自动检查一次，让「当前版本 / 是否有新版本」直接可见；关闭检查时不发请求。
  useEffect(() => {
    if (!settings || !enabled || autoCheckedRef.current || !platform.checkReleaseUpdate) return;
    autoCheckedRef.current = true;
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, enabled]);

  const saveSource = async () => {
    setWorking(true);
    setSaveFailed(false);
    try {
      await update({ releaseInfoUrl: source.trim() });
      setResult(null);
    } catch {
      setSaveFailed(true);
    } finally {
      setWorking(false);
    }
  };
  const setEnabled = async (next: boolean) => {
    setWorking(true);
    setSaveFailed(false);
    try {
      await update({ releaseChecksEnabled: next });
      setResult(null);
    } catch {
      setSaveFailed(true);
    } finally {
      setWorking(false);
    }
  };
  const install = async () => {
    if (!platform.installReleaseUpdate) return;
    setInstalling(true);
    setInstallResult(null);
    try {
      setInstallResult(await platform.installReleaseUpdate());
    } catch {
      setInstallResult({ status: "failed", reason: "download" });
    } finally {
      setInstalling(false);
    }
  };

  const available = result?.status === "available" ? result : null;
  const statusText = installing
    ? format("settings.releaseUpdate.installing")
    : installResult?.status === "started"
      ? format("settings.releaseUpdate.installStarted", { version: installResult.version })
      : installResult?.status === "failed"
        ? format("settings.releaseUpdate.installFailed", {
            reason: format(`settings.releaseUpdate.installReason.${installResult.reason}`),
          })
        : saveFailed
          ? format("settings.releaseUpdate.saveFailed")
          : dirty
            ? format("settings.releaseUpdate.saveFirst")
            : working && !result
              ? format("settings.releaseUpdate.checking")
              : result
                ? resultMessage(result, format)
                : format(
                    enabled
                      ? "settings.releaseUpdate.notChecked"
                      : "settings.releaseUpdate.disabled",
                  );

  return (
    <SettingsGroupCard title={intl.formatMessage({ id: "settings.general.group.updates" })}>
      <SettingsRow
        label={format("settings.releaseUpdate.statusTitle")}
        description={
          <span role="status" data-testid="release-update-status">
            {statusText}
          </span>
        }
        control={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {available?.installable && platform.installReleaseUpdate ? (
              <Button
                type="button"
                size="lg"
                onClick={() => void install()}
                disabled={installing || working}
                data-testid="release-update-install"
              >
                {installing ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Download aria-hidden="true" />
                )}
                {format("settings.releaseUpdate.install")}
              </Button>
            ) : null}
            {available?.releaseUrl ? (
              <Button
                type="button"
                size="lg"
                variant={available.installable ? "outline" : "default"}
                onClick={() => platform.openExternal(available.releaseUrl!)}
                data-testid="release-update-open-release"
              >
                <ExternalLink aria-hidden="true" />
                {format(
                  available.installable
                    ? "settings.releaseUpdate.releaseNotes"
                    : "settings.releaseUpdate.openRelease",
                )}
              </Button>
            ) : null}
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => void check()}
              disabled={
                !settings ||
                working ||
                installing ||
                dirty ||
                !platform.checkReleaseUpdate ||
                !enabled
              }
              data-testid="release-update-check"
            >
              {working ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCcw aria-hidden="true" />
              )}
              {format("settings.releaseUpdate.check")}
            </Button>
          </div>
        }
      />
      <SettingsRow
        label={format("settings.releaseUpdate.title")}
        description={format("settings.releaseUpdate.description")}
        control={
          <Switch
            checked={enabled}
            disabled={!settings || working}
            onCheckedChange={(next) => void setEnabled(next)}
            aria-label={format("settings.releaseUpdate.title")}
          />
        }
      />
      <SettingsRow
        label={format("settings.releaseUpdate.source")}
        description={format("settings.releaseUpdate.sourceDescription")}
        controlLayout="wide"
        control={
          <div className="flex w-full items-center gap-2">
            <Input
              size="lg"
              type="url"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder={format("settings.releaseUpdate.sourcePlaceholder")}
              aria-label={format("settings.releaseUpdate.source")}
              disabled={!settings || working}
            />
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => void saveSource()}
              disabled={!settings || working || !dirty}
            >
              {format("settings.releaseUpdate.save")}
            </Button>
          </div>
        }
      />
    </SettingsGroupCard>
  );
}

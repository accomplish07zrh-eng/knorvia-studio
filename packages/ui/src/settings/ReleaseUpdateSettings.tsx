import { useEffect, useState } from "react";
import type { ReleaseUpdateCheckResult } from "@knorvia/shared";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Switch } from "@/components/ui/switch.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { SettingsGroupCard, SettingsRow } from "./SettingsPageParts.js";

function resultMessage(result: ReleaseUpdateCheckResult, format: (id: string, values?: Record<string, string | number>) => string): string {
  switch (result.status) {
    case "unconfigured": return format("settings.releaseUpdate.unconfigured");
    case "disabled": return format("settings.releaseUpdate.disabled");
    case "up-to-date": return format("settings.releaseUpdate.current");
    case "no-compatible-release": return format("settings.releaseUpdate.noCompatibleRelease");
    case "available": return format("settings.releaseUpdate.available", { version: result.latestVersion });
    case "failed": return format("settings.releaseUpdate.failed", {
      reason: result.reason === "http" && result.httpStatus
        ? `HTTP ${result.httpStatus}` : format(`settings.releaseUpdate.reason.${result.reason}`),
    });
  }
}

/** Release checks live in the existing General settings page and never install software. */
export function ReleaseUpdateSettings() {
  const { intl } = useKnorviaIntl();
  const platform = usePlatform();
  const { settings, update } = useSettings();
  const [source, setSource] = useState("");
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<ReleaseUpdateCheckResult | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => setSource(settings?.releaseInfoUrl ?? ""), [settings?.releaseInfoUrl]);
  const format = (id: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id }, values);
  const savedSource = settings?.releaseInfoUrl ?? "";
  const dirty = source.trim() !== savedSource;

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
  const setEnabled = async (enabled: boolean) => {
    setWorking(true);
    setSaveFailed(false);
    try {
      await update({ releaseChecksEnabled: enabled });
      setResult(null);
    } catch {
      setSaveFailed(true);
    } finally {
      setWorking(false);
    }
  };
  const check = async () => {
    if (!platform.checkReleaseUpdate) return;
    setWorking(true);
    try {
      setResult(await platform.checkReleaseUpdate());
    } catch {
      setResult({ status: "failed", currentVersion: "", reason: "offline" });
    } finally {
      setWorking(false);
    }
  };

  return (
    <SettingsGroupCard>
      <SettingsRow
        label={format("settings.releaseUpdate.title")}
        description={format("settings.releaseUpdate.description")}
        control={
          <Switch
            checked={settings?.releaseChecksEnabled !== false}
            disabled={!settings || working}
            onCheckedChange={(enabled) => void setEnabled(enabled)}
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
              placeholder="https://..."
              aria-label={format("settings.releaseUpdate.source")}
              disabled={!settings || working}
            />
            <Button type="button" size="lg" variant="outline" onClick={() => void saveSource()} disabled={!settings || working || !dirty}>
              {format("settings.releaseUpdate.save")}
            </Button>
          </div>
        }
      />
      <SettingsRow
        label={format("settings.releaseUpdate.check")}
        description={saveFailed ? format("settings.releaseUpdate.saveFailed") : dirty
          ? format("settings.releaseUpdate.saveFirst")
          : result ? resultMessage(result, format) : savedSource
            ? format("settings.releaseUpdate.notChecked") : format("settings.releaseUpdate.unconfigured")}
        control={
          <Button type="button" size="lg" variant="outline" onClick={() => void check()}
            disabled={!settings || working || dirty || !platform.checkReleaseUpdate || settings.releaseChecksEnabled === false}>
            {format("settings.releaseUpdate.check")}
          </Button>
        }
      />
    </SettingsGroupCard>
  );
}

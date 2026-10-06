import { useState } from "react";
import type {
  CliProviderSwitchCandidate,
  CliProviderSwitchStatus,
  CliProviderSwitchTarget,
} from "@knorvia/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Button } from "@/components/ui/button.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useCliProviderSwitch } from "@/hooks/useCliProviderSwitch.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";
import { StudioKernelIcon } from "./StudioKernelIcon.js";

const NAMES: Record<CliProviderSwitchTarget, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "grok-build": "Grok Build",
};
const OFFICIAL = "official";
const candidateValue = (item: Pick<CliProviderSwitchCandidate, "providerId" | "modelId">) =>
  `${item.providerId}\u0000${item.modelId}`;

/**
 * Claude Code / Codex / Grok Build 的全局模型配置切换（specs/knorvia-cli-provider-switch.md）。
 * 每个 CLI 独立；切换只改各自配置文件中的少数字段，可一键回到官方订阅。
 */
export function CliProviderSwitchCard() {
  const { intl } = useKnorviaIntl();
  const t = (id: string, values?: Record<string, string>) => intl.formatMessage({ id }, values);
  const confirm = useConfirmDialog();
  const { available, view, loading, error, apply } = useCliProviderSwitch();
  const [busy, setBusy] = useState<CliProviderSwitchTarget | null>(null);
  const [message, setMessage] = useState<{ tone: "status" | "alert"; text: string } | null>(null);
  if (!available) return null;

  const statusText = (status: CliProviderSwitchStatus) => {
    switch (status.state) {
      case "official":
        return t("studio.cliSwitch.state.official");
      case "external":
        return t("studio.cliSwitch.state.external");
      case "unreadable":
        return t("studio.cliSwitch.state.unreadable", { reason: status.error ?? "" });
      case "knorvia":
        return t(
          status.active?.stale ? "studio.cliSwitch.state.stale" : "studio.cliSwitch.state.knorvia",
          {
            provider: status.active?.providerName ?? "",
            model: status.active?.modelId ?? "",
          },
        );
    }
  };

  const change = async (status: CliProviderSwitchStatus, value: string) => {
    const name = NAMES[status.cli];
    let takeOver = false;
    if (status.state === "external") {
      takeOver = await confirm({
        title: t("studio.cliSwitch.takeOverTitle", { name }),
        description: t("studio.cliSwitch.takeOverDescription", { path: status.configPath }),
        confirmLabel: t("studio.cliSwitch.takeOver"),
      });
      if (!takeOver) return;
    }
    if (value !== OFFICIAL && !localStorageAcknowledged()) {
      const ok = await confirm({
        title: t("studio.cliSwitch.firstTitle"),
        description: t("studio.cliSwitch.firstDescription"),
        confirmLabel: t("studio.cliSwitch.firstConfirm"),
      });
      if (!ok) return;
      acknowledge();
    }
    const [providerId, modelId] = value.split("\u0000");
    setBusy(status.cli);
    setMessage(null);
    try {
      const result = await apply({
        cli: status.cli,
        takeOver,
        target:
          value === OFFICIAL
            ? { kind: "official" }
            : { kind: "provider", providerId: providerId!, modelId: modelId! },
      });
      setMessage({
        tone: "status",
        text: t(
          result.restartRequired === "restart-running"
            ? "studio.cliSwitch.doneRestart"
            : "studio.cliSwitch.done",
          { name },
        ),
      });
    } catch (cause) {
      setMessage({
        tone: "alert",
        text: t("studio.cliSwitch.failed", {
          name,
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsGroupCard
      title={t("studio.cliSwitch.title")}
      description={t("studio.cliSwitch.description")}
    >
      {(view?.statuses ?? []).map((status) => {
        const candidates = view?.candidates[status.cli] ?? [];
        const current =
          status.state === "knorvia" && status.active
            ? candidateValue(status.active)
            : status.state === "official"
              ? OFFICIAL
              : undefined;
        return (
          <SettingsRow
            key={status.cli}
            label={
              <span className="flex items-center gap-2">
                <StudioKernelIcon kernelId={status.cli} className="size-4" />
                {NAMES[status.cli]}
              </span>
            }
            description={
              <span data-testid={`cli-switch-status-${status.cli}`}>
                {statusText(status)}
                {candidates.length === 0 ? ` ${t("studio.cliSwitch.noCandidates")}` : ""}
              </span>
            }
            control={
              <div className="flex items-center gap-2">
                <Select
                  value={current ?? ""}
                  disabled={busy !== null || loading || status.state === "unreadable"}
                  onValueChange={(value) => void change(status, value)}
                >
                  <SelectTrigger
                    className="h-9 w-[220px] max-w-full rounded-full px-3 text-ui-base"
                    aria-label={t("studio.cliSwitch.select", { name: NAMES[status.cli] })}
                    data-testid={`cli-switch-select-${status.cli}`}
                  >
                    <SelectValue placeholder={t("studio.cliSwitch.state.externalShort")} />
                  </SelectTrigger>
                  <SelectContent position="popper" align="end">
                    <SelectItem value={OFFICIAL}>{t("studio.cliSwitch.official")}</SelectItem>
                    {candidates.map((item) => (
                      <SelectItem key={candidateValue(item)} value={candidateValue(item)}>
                        {item.providerName} · {item.modelId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {status.state === "knorvia" && status.active?.stale ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void change(status, candidateValue(status.active!))}
                  >
                    {t("studio.cliSwitch.reapply")}
                  </Button>
                ) : null}
              </div>
            }
          />
        );
      })}
      {error || message ? (
        <p
          role={error || message?.tone === "alert" ? "alert" : "status"}
          className={
            error || message?.tone === "alert"
              ? "break-words px-5 pb-4 text-ui-sm text-destructive max-sm:px-4"
              : "px-5 pb-4 text-ui-sm text-foreground-subtle max-sm:px-4"
          }
        >
          {error ? t("studio.cliSwitch.loadFailed", { reason: error }) : message?.text}
        </p>
      ) : null}
    </SettingsGroupCard>
  );
}

/** 首次写入明文密钥前的说明只需确认一次；仅为本机便利，读写失败时每次都询问。 */
const ACK_KEY = "knorvia.cliSwitch.plaintextAcknowledged";
function localStorageAcknowledged(): boolean {
  try {
    return window.localStorage.getItem(ACK_KEY) === "1";
  } catch {
    return false;
  }
}
function acknowledge(): void {
  try {
    window.localStorage.setItem(ACK_KEY, "1");
  } catch {
    /* 存储不可用时下次继续提示。 */
  }
}

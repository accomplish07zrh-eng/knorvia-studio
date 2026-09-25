// 设置页插件管理入口内的「兼容性」区块（不是新页面、不是新入口）。
//
// 只呈现 `.knorvia-plugin/compatibility.json` 的声明与宿主上报的能力处置：
// 未验证永远显示为未验证；没有证据不显示「已验证」；不安装、不启用、不执行、不改文件。
// 渲染规则见 specs/knorvia-plugin-compatibility.md「Settings 兼容性面板的渲染规则」。
import { useCallback } from "react";
import type { KnorviaPluginInfo } from "@knorvia/shared";
import type { IFileService } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { Loader2, RefreshCw } from "lucide-react";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { SettingsBadge } from "@/settings/SettingsPageParts.js";
import { StatusDot, type StatusDotTone } from "@/settings/StatusDot.js";
import { usePluginCompatibilityView } from "@/settings/usePluginCompatibility.js";
import {
  PLUGIN_COMPATIBILITY_REASON_MESSAGE_IDS,
  type PluginCapabilityDisposition,
  type PluginCompatibilityStatus,
} from "@/settings/pluginCompatibilityProjection.js";

const STATUS_TONES: Readonly<Record<PluginCompatibilityStatus, StatusDotTone>> = {
  verified: "green",
  declared: "amber",
  unsupported: "red",
  unknown: "muted",
};

const STATUS_LABEL_IDS: Readonly<Record<PluginCompatibilityStatus, string>> = {
  verified: "settings.plugins.compatibility.status.verified",
  declared: "settings.plugins.compatibility.status.declared",
  unsupported: "settings.plugins.compatibility.status.unsupported",
  unknown: "settings.plugins.compatibility.status.unknown",
};

const DISPOSITION_LABEL_IDS: Readonly<Record<PluginCapabilityDisposition, string>> = {
  available: "settings.plugins.compatibility.capability.available",
  unavailable: "settings.plugins.compatibility.capability.unavailable",
  unverified: "settings.plugins.compatibility.capability.unverified",
};

const DISPOSITION_TONES: Readonly<Record<PluginCapabilityDisposition, StatusDotTone>> = {
  available: "green",
  unavailable: "red",
  unverified: "muted",
};

const WHEN_MISSING_LABEL_IDS: Readonly<Record<string, string>> = {
  report: "settings.plugins.compatibility.capability.whenMissing.report",
  degrade: "settings.plugins.compatibility.capability.whenMissing.degrade",
  refuse: "settings.plugins.compatibility.capability.whenMissing.refuse",
};

export interface PluginCompatibilitySectionProps {
  plugin: Pick<
    KnorviaPluginInfo,
    "id" | "name" | "rootPath" | "enabled" | "skillRootCount" | "components"
  >;
  fileService: Pick<IFileService, "readTextFile" | "checkFilesExist"> | null | undefined;
}

export function PluginCompatibilitySection({
  plugin,
  fileService,
}: PluginCompatibilitySectionProps) {
  const { intl } = useKnorviaIntl();
  const { state, reload } = usePluginCompatibilityView({ plugin, fileService });
  const onReload = useCallback(() => reload(), [reload]);

  if (state.kind !== "ready") {
    return (
      <div
        className="rounded-lg border border-border bg-card px-3 py-2 text-ui-sm text-foreground-subtle"
        data-testid="plugin-compatibility-panel"
        data-state={state.kind}
      >
        {state.kind === "loading" ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            {intl.formatMessage({ id: "settings.plugins.compatibility.loading" })}
          </span>
        ) : (
          intl.formatMessage({ id: "settings.plugins.compatibility.idle" })
        )}
      </div>
    );
  }

  const { view } = state;
  return (
    <div
      className="space-y-3 rounded-lg border border-border bg-card px-3 py-3"
      data-testid="plugin-compatibility-panel"
      data-state="ready"
      data-plugin-id={view.pluginId}
      data-compatibility-status={view.status}
      data-sidecar-state={view.sidecarState}
      data-capability-gaps={view.gapCount}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-ui-xs font-medium text-foreground">
          {intl.formatMessage({ id: "settings.plugins.compatibility.title" })}
        </div>
        <div className="flex items-center gap-2">
          <SettingsBadge>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={STATUS_TONES[view.status]} />
              {intl.formatMessage({ id: STATUS_LABEL_IDS[view.status] })}
            </span>
          </SettingsBadge>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={intl.formatMessage({ id: "settings.plugins.compatibility.reload" })}
            onClick={onReload}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <p className="text-ui-sm text-foreground-subtle">
        {intl.formatMessage({ id: "settings.plugins.compatibility.description" })}
      </p>

      <dl className="space-y-1 text-ui-sm">
        <div className="flex gap-2">
          <dt className="shrink-0 text-foreground-subtle">
            {intl.formatMessage({ id: "settings.plugins.compatibility.kernelLabel" })}
          </dt>
          <dd className="min-w-0 break-all text-foreground">{view.kernelId}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-foreground-subtle">
            {intl.formatMessage({ id: "settings.plugins.compatibility.sidecarLabel" })}
          </dt>
          <dd className="min-w-0 break-all text-foreground-subtle">{view.sidecarPath}</dd>
        </div>
      </dl>

      <div className="space-y-1 text-ui-sm text-foreground-subtle">
        <p>
          {intl.formatMessage({
            id: PLUGIN_COMPATIBILITY_REASON_MESSAGE_IDS[view.statusReasonCode],
          })}
        </p>
        {view.authorReason ? (
          <p>
            {intl.formatMessage(
              { id: "settings.plugins.compatibility.authorReason" },
              { reason: view.authorReason },
            )}
          </p>
        ) : null}
        {view.sidecarError ? (
          <p data-testid="plugin-compatibility-sidecar-error">{view.sidecarError}</p>
        ) : null}
      </div>

      {view.evidence.length > 0 ? (
        <div className="space-y-1">
          <div className="text-ui-xs font-medium text-foreground">
            {intl.formatMessage({ id: "settings.plugins.compatibility.evidenceLabel" })}
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-ui-sm text-foreground-subtle">
            {view.evidence.map((item) => (
              <li key={item} className="break-all">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="text-ui-xs font-medium text-foreground">
          {intl.formatMessage({ id: "settings.plugins.compatibility.capabilities.title" })}
        </div>
        {view.capabilities.length === 0 ? (
          <p className="text-ui-sm text-foreground-subtle">
            {intl.formatMessage({ id: "settings.plugins.compatibility.capabilities.empty" })}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="plugin-compatibility-capabilities">
            {view.capabilities.map((entry) => (
              <li
                key={entry.capability}
                className="rounded-md bg-surface px-2.5 py-2 text-ui-sm"
                data-capability={entry.capability}
                data-disposition={entry.disposition}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-medium text-foreground">{entry.capability}</span>
                  <span className="inline-flex items-center gap-1.5 text-foreground-subtle">
                    <StatusDot tone={DISPOSITION_TONES[entry.disposition]} />
                    {intl.formatMessage({ id: DISPOSITION_LABEL_IDS[entry.disposition] })}
                  </span>
                  <span className="text-foreground-subtlest">
                    {intl.formatMessage(
                      { id: "settings.plugins.compatibility.capability.whenMissing" },
                      {
                        behaviour: intl.formatMessage({
                          id:
                            WHEN_MISSING_LABEL_IDS[entry.whenMissing] ??
                            "settings.plugins.compatibility.capability.whenMissing.report",
                        }),
                      },
                    )}
                  </span>
                </div>
                <div className="mt-1 text-foreground-subtle">
                  {intl.formatMessage({
                    id: PLUGIN_COMPATIBILITY_REASON_MESSAGE_IDS[entry.reasonCode],
                  })}
                </div>
                {entry.evidence ? (
                  <div className="mt-1 break-all text-foreground-subtlest">{entry.evidence}</div>
                ) : null}
                {entry.blocksRun ? (
                  <div className="mt-1 text-foreground-subtle">
                    {intl.formatMessage({
                      id: "settings.plugins.compatibility.capability.blocksRun",
                    })}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {view.otherKernels.length > 0 ? (
        <p className="text-ui-sm text-foreground-subtle">
          {intl.formatMessage(
            { id: "settings.plugins.compatibility.otherKernels" },
            { count: view.otherKernels.length },
          )}
        </p>
      ) : null}

      <p className="text-ui-sm text-foreground-subtlest">
        {intl.formatMessage({ id: "settings.plugins.compatibility.installableNotice" })}
      </p>
    </div>
  );
}

import type { StudioKernelStatus } from "@knorvia/services";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import {
  studioAuthHint,
  studioProbeCached,
  studioProbeStageViews,
  type StudioProbeStageView,
} from "./kernelProbeView.js";

/**
 * 分层探测证据的紧凑呈现：四段状态一行摘要，「查看诊断」展开每段的状态/代码/原因/耗时。
 * 未知状态如实显示 `unknown`，绝不渲染成通过（见 specs/knorvia-kernel-status.md）。
 */
export function StudioAgentProbeDetails({
  status,
  cliName,
}: {
  status?: StudioKernelStatus;
  cliName: string;
}) {
  const { intl } = useKnorviaIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const views = studioProbeStageViews(status?.probe);
  const auth = studioAuthHint(status, cliName);
  if (!status) return null;
  // 内置内核不走 CLI 探测（没有可定位的程序），不需要「缺少分层证据」的说明。
  if (status.origin === "builtin") return null;
  if (!status.probe) {
    // 旧记录、远端快照与被拒清单没有分层证据：如实说明，不据此声称可用。
    return (
      <p className="text-ui-xs leading-5 text-foreground-subtle">
        {t("studio.agents.probe.legacy")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-xs text-foreground-subtle"
        aria-label={t("studio.agents.probe.title")}
      >
        {views.map((view) => (
          <span key={view.stage} title={view.reason}>
            {t(view.labelKey)} · {t(view.statusKey)}
          </span>
        ))}
        <span>{`${status.probe.durationMs} ms`}</span>
        {studioProbeCached(status) ? (
          <span className="rounded-md bg-surface px-1.5 py-0.5">
            {t("studio.agents.probe.cached")}
          </span>
        ) : null}
        <button
          type="button"
          className="inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {t("studio.agents.probe.viewDiagnostics")}
        </button>
      </div>
      {open ? (
        <div className="space-y-1 rounded-lg border border-border px-3 py-2" role="group">
          {views.map((view) => (
            <ProbeStageRow key={view.stage} view={view} />
          ))}
        </div>
      ) : null}
      {auth ? (
        <div className="space-y-1">
          <button
            type="button"
            className="text-ui-xs font-medium underline decoration-dotted underline-offset-2"
            aria-expanded={authOpen}
            onClick={() => setAuthOpen((value) => !value)}
          >
            {t(auth.actionKey)}
          </button>
          {authOpen ? (
            <p className="text-ui-xs leading-5 text-foreground-subtle">
              {t(auth.titleKey)}：{intl.formatMessage({ id: auth.bodyKey }, { name: auth.cliName })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProbeStageRow({ view }: { view: StudioProbeStageView }) {
  const { intl } = useKnorviaIntl();
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-ui-xs">
      <span className="w-16 shrink-0 text-foreground-subtle">
        {intl.formatMessage({ id: view.labelKey })}
      </span>
      <span className={cn("shrink-0", view.state === "failed" && "text-destructive")}>
        {intl.formatMessage({ id: view.statusKey })}
      </span>
      {view.code ? (
        <span className="shrink-0 font-mono text-foreground-subtle select-text">{view.code}</span>
      ) : null}
      {view.glossKey ? (
        <span className="text-foreground-subtle">{intl.formatMessage({ id: view.glossKey })}</span>
      ) : null}
      <span className="shrink-0 text-foreground-subtle">{`${view.ms} ms`}</span>
      {view.reason ? (
        <span className="min-w-0 flex-1 basis-40 break-words text-foreground-subtle select-text">
          {view.reason}
        </span>
      ) : null}
    </div>
  );
}

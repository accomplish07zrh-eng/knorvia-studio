import type { StudioKernelConfig, StudioKernelStatus } from "@knorvia/services";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import type { StudioKernelOption } from "../types.js";
import { studioProbeBadgeKey } from "./kernelProbeView.js";
import { StudioAgentStatusDetails } from "./StudioAgentStatusDetails.js";
import { StudioKernelIcon } from "./StudioKernelIcon.js";

/** 单个内核卡片：徽标按分层证据给出，动作只放在既有 Agent 管理surface 内。 */
export function StudioKernelCard({
  kernel,
  status,
  config,
  inspected,
  managing,
  reprobing,
  busy,
  onConfigure,
  onManage,
  onReprobe,
}: {
  kernel: StudioKernelOption;
  status?: StudioKernelStatus;
  config?: StudioKernelConfig;
  inspected: boolean;
  managing: boolean;
  reprobing: boolean;
  busy: boolean;
  onConfigure?: () => void;
  onManage?: () => void;
  onReprobe: () => void;
}) {
  const { intl } = useKnorviaIntl();
  const t = (id: string) => intl.formatMessage({ id });
  return (
    <article
      className="rounded-xl border border-border bg-card px-5 py-4 max-sm:px-4"
      aria-busy={managing || reprobing}
      data-kernel-id={kernel.id}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
          <StudioKernelIcon kernelId={kernel.id} className="size-5" />
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-ui-base font-semibold text-foreground">{kernel.name}</h3>
            <span className="inline-flex h-5 items-center rounded-full border border-border px-2 text-ui-xs text-foreground-subtle">
              {t(studioProbeBadgeKey({ status, inspected, builtin: kernel.builtin }))}
            </span>
          </div>
          <p className="mt-0.5 text-ui-sm text-foreground-subtle">
            {kernel.vendor}
            {status?.version ? " · " + status.version : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="ghost" size="sm" disabled={busy || reprobing} onClick={onReprobe}>
            <RefreshCw className={reprobing ? "animate-spin" : undefined} />
            {t(reprobing ? "studio.agents.reprobing" : "studio.agents.reprobe")}
          </Button>
          {onManage ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onManage}>
              {t("studio.agents.managementOpen")}
            </Button>
          ) : null}
          {onConfigure ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={onConfigure}>
              {kernel.builtin ? null : <SlidersHorizontal />}
              {t(kernel.builtin ? "studio.agents.models" : "studio.agents.configure")}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-ui-sm leading-5 text-foreground-subtle">
        {t(
          kernel.builtin ? "studio.agents.builtinDescription" : "studio.agents.externalDescription",
        )}
      </p>
      {status?.remoteWorkspacePath ? (
        <p className="mt-1 break-all text-ui-sm text-foreground-subtle">
          SSH · {status.remoteEnvironmentLabel} · {status.remoteWorkspacePath}
        </p>
      ) : null}
      <StudioAgentStatusDetails status={status} config={config} name={kernel.name} />
      {kernel.id === "antigravity" ? (
        <p className="mt-2 text-ui-sm leading-5 text-foreground-subtle">
          {t("studio.agents.antigravityNote")}
        </p>
      ) : null}
      {kernel.id === "deepseek-harness" ? (
        <p className="mt-2 text-ui-sm leading-5 text-foreground-subtle">
          {t("studio.agents.previewNote")}
        </p>
      ) : null}
    </article>
  );
}

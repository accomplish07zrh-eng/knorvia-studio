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
      className="rounded-xl border border-card-border bg-card p-4"
      aria-busy={managing || reprobing}
      data-kernel-id={kernel.id}
    >
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <StudioKernelIcon kernelId={kernel.id} className="size-8" />
        <div className="min-w-0 flex-1 basis-36">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-ui-base font-medium text-foreground">{kernel.name}</h3>
            <span className="rounded-md bg-surface px-1.5 py-0.5 text-ui-xs text-foreground-subtle">
              {t(studioProbeBadgeKey({ status, inspected, builtin: kernel.builtin }))}
            </span>
          </div>
          <p className="mt-0.5 text-ui-sm text-foreground-subtle">
            {kernel.vendor}
            {status?.version ? " · " + status.version : ""}
          </p>
        </div>
        {onConfigure ? (
          <Button variant="outline" disabled={busy} onClick={onConfigure}>
            {kernel.builtin ? null : <SlidersHorizontal />}
            {t(kernel.builtin ? "studio.agents.models" : "studio.agents.configure")}
          </Button>
        ) : null}
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={busy || reprobing} onClick={onReprobe}>
          <RefreshCw className={reprobing ? "animate-spin" : undefined} />
          {t(reprobing ? "studio.agents.reprobing" : "studio.agents.reprobe")}
        </Button>
        {onManage ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onManage}>
            {t("studio.agents.managementOpen")}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

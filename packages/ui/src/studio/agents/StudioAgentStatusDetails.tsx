import type { StudioKernelConfig, StudioKernelStatus } from "@knorvia/services";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { studioCapabilityRows } from "./kernelProbeView.js";
import { StudioAgentProbeDetails } from "./StudioAgentProbeDetails.js";

export function StudioAgentStatusDetails({
  status,
  config,
  name,
}: {
  status?: StudioKernelStatus;
  config?: StudioKernelConfig;
  name?: string;
}) {
  const { intl } = useKnorviaIntl();
  const capabilities = studioCapabilityRows(status);
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-start justify-between gap-2 text-ui-sm text-foreground-subtle">
        <span className="min-w-0 flex-1 break-all font-mono select-text">
          {status?.remoteWorkspacePath ||
            status?.executablePath ||
            config?.executablePath ||
            intl.formatMessage({ id: "studio.agents.autoPath" })}
        </span>
        {status ? (
          <span className="shrink-0">
            {intl.formatMessage({ id: `studio.agents.origin.${status.origin}` })}
          </span>
        ) : null}
      </div>
      {config ? (
        <p className="break-words text-ui-sm text-foreground-subtle">
          {intl.formatMessage({ id: `studio.agents.permission.${config.permission}` })}
          {config.model ? ` · ${config.model}` : ""}
          {config.reasoningEffort ? ` · ${config.reasoningEffort}` : ""}
        </p>
      ) : null}
      <StudioAgentProbeDetails status={status} cliName={name ?? status?.displayName ?? ""} />
      {status?.installed ? (
        <div className="space-y-1">
          <div
            className="flex flex-wrap gap-x-4 gap-y-1 text-ui-xs text-foreground-subtle"
            aria-label={intl.formatMessage({ id: "studio.agents.capabilities" })}
          >
            {capabilities.map((row) => (
              <span key={row.capability}>
                {intl.formatMessage({ id: row.capabilityKey })} ·{" "}
                {intl.formatMessage({
                  id: row.supported ? "studio.agents.supported" : "studio.agents.unsupported",
                })}{" "}
                <span className="text-foreground-subtle">
                  ({intl.formatMessage({ id: row.evidenceKey })})
                </span>
              </span>
            ))}
          </div>
          {capabilities.some((row) => row.evidenceState === "unverified") ? (
            <p className="text-ui-xs leading-5 text-foreground-subtle">
              {intl.formatMessage(
                { id: "studio.agents.capabilitiesUnverified" },
                { version: status.version ?? "" },
              )}
            </p>
          ) : null}
          {!status.capabilities.fullAccess && status.capabilities.approval ? (
            <p className="text-ui-xs leading-5 text-foreground-subtle">
              {intl.formatMessage({ id: "studio.agents.capabilityScope" })}
            </p>
          ) : null}
        </div>
      ) : null}
      {status?.error ? (
        <p role="alert" className="break-words text-ui-sm text-destructive">
          {status.error}
        </p>
      ) : null}
    </div>
  );
}

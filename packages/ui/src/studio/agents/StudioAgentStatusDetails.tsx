import type { StudioKernelConfig, StudioKernelStatus } from "@knorvia/services";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";

export function StudioAgentStatusDetails({
  status,
  config,
}: {
  status?: StudioKernelStatus;
  config?: StudioKernelConfig;
}) {
  const { intl } = useKnorviaIntl();
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
      {status?.installed ? (
        <div className="space-y-1">
          <div
            className="flex flex-wrap gap-x-4 gap-y-1 text-ui-xs text-foreground-subtle"
            aria-label={intl.formatMessage({ id: "studio.agents.capabilities" })}
          >
            {(["resume", "approval", "questions", "readOnly", "fullAccess"] as const).map(
              (capability) => (
                <span key={capability}>
                  {intl.formatMessage({ id: `studio.agents.capability.${capability}` })} ·{" "}
                  {intl.formatMessage({
                    id: status.capabilities[capability]
                      ? "studio.agents.supported"
                      : "studio.agents.unsupported",
                  })}
                </span>
              ),
            )}
          </div>
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

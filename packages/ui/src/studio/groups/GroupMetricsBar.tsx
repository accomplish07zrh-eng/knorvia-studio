import type { StudioGroupMetrics } from "@knorvia/services";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { formatCompactTokenNumber } from "@/lib/tokenNumberFormat.js";
import { useStudioKernelCatalog } from "../agents/useStudioKernelCatalog.js";
import { studioKernelOption } from "../types.js";

function duration(milliseconds: number | undefined): string {
  if (milliseconds === undefined) return "—";
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function GroupMetricsBar({ metrics }: { metrics?: StudioGroupMetrics }) {
  const { intl } = useKnorviaIntl();
  const { statuses } = useStudioKernelCatalog();
  const t = (key: string) => intl.formatMessage({ id: `studio.groups.metrics.${key}` });
  if (!metrics) return null;
  const tokenText = (tokens: number | undefined, partial: boolean) =>
    tokens === undefined
      ? "—"
      : `${partial ? "≥" : ""}${formatCompactTokenNumber("en-US", tokens)}`;
  const timeText = (elapsed: number | undefined, partial: boolean) =>
    elapsed === undefined ? "—" : `${partial ? "≥" : ""}${duration(elapsed)}`;
  return (
    <div
      className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-2 text-ui-sm text-foreground-subtle tabular-nums"
      data-testid="studio-group-metrics"
      aria-label={t("title")}
      aria-describedby="studio-group-metrics-scope"
      tabIndex={0}
    >
      <span id="studio-group-metrics-scope" className="sr-only">
        {t("scope")}
      </span>
      <span className="font-medium text-foreground">
        {t("total")} · {tokenText(metrics.total.tokens, metrics.total.tokensPartial)} tok ·{" "}
        {timeText(metrics.total.durationMs, metrics.total.durationPartial)}
      </span>
      {metrics.members.map((item) => (
        <span key={item.member}>
          {studioKernelOption(item.member, statuses).name} ·{" "}
          {tokenText(item.tokens, item.tokensPartial)} tok ·{" "}
          {timeText(item.durationMs, item.durationPartial)}
        </span>
      ))}
      {metrics.truncated || metrics.total.tokensPartial || metrics.total.durationPartial ? (
        <span className="text-ui-xs">{t("partial")}</span>
      ) : null}
    </div>
  );
}

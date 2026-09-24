import { DatabaseIcon, GaugeIcon, CircleIcon } from "lucide-react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { formatCompactTokenNumber } from "@/lib/tokenNumberFormat.js";
import { ChatContextUsage } from "./contextUsage.js";
import { metricNumber, metricTotal, type ChatMetrics } from "./chatMetrics.js";

/** One quiet footer for both native and external chats; all facts come from the owner. */
export function ChatMetricsBar({ metrics }: { metrics: ChatMetrics }) {
  const { intl, locale } = useKnorviaIntl();
  const t = (id: string) => intl.formatMessage({ id: `chat.metrics.${id}` });
  const format = (value: number | undefined) =>
    value === undefined
      ? "—"
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const total = metricTotal(metrics.inputTokens, metrics.outputTokens);
  const rate = metricNumber(metrics.cacheHitRate);
  const cache =
    rate !== undefined && rate <= 1
      ? new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(rate)
      : "—";
  const context =
    metrics.contextUsedTokens !== undefined &&
    metrics.contextMaxTokens !== undefined &&
    metrics.contextMaxTokens > 0
      ? {
          used: metrics.contextUsedTokens,
          size: metrics.contextMaxTokens,
          cache: { hitRate: rate ?? null },
          breakdown: metrics.contextBreakdown,
        }
      : null;
  const counters = intl.formatMessage(
    { id: "chat.metrics.counters" },
    {
      rounds: `${metrics.roundsAtLeast ? "≥" : ""}${format(metrics.rounds)}`,
      steps: format(metrics.steps),
    },
  );
  const focus =
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused";
  return (
    <div
      data-testid="chat-metrics-bar"
      aria-label={t("label")}
      className="flex min-h-7 min-w-0 flex-wrap items-center gap-x-5 gap-y-1 px-2 pt-1.5 text-ui-sm text-foreground-subtle tabular-nums"
    >
      <ControlHintTooltip
        title={t("execution")}
        description={`${t(metrics.roundsAtLeast ? "executionPartial" : "executionDetail")} ${t("speedDetail")}`}
      >
        <span tabIndex={0} className={focus}>
          <GaugeIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {counters}
            <span className="mx-1.5" aria-hidden="true">
              ·
            </span>
            {format(metrics.tokensPerSecond)} tok/s
          </span>
        </span>
      </ControlHintTooltip>
      <ControlHintTooltip
        title={t(`scope.${metrics.scope}`)}
        description={`${t("input")} ${format(metrics.inputTokens)} · ${t("output")} ${format(metrics.outputTokens)}. ${t("unknown")}`}
      >
        <span tabIndex={0} className={focus}>
          <DatabaseIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {total === undefined ? "—" : formatCompactTokenNumber("en-US", total)} tok
            <span className="mx-1.5" aria-hidden="true">
              ·
            </span>
            {t("cache")} {cache}
          </span>
        </span>
      </ControlHintTooltip>
      {context ? (
        <ChatContextUsage taskUsage={context} intl={intl} locale={locale} showPercentage />
      ) : (
        <ControlHintTooltip title={t("context")} description={t("unknown")}>
          <span tabIndex={0} className={focus}>
            <CircleIcon className="size-3.5 opacity-40" aria-hidden="true" />
            <span>—</span>
          </span>
        </ControlHintTooltip>
      )}
    </div>
  );
}

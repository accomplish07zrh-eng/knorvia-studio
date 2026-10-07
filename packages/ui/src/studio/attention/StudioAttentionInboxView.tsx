import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { studioKernelOption } from "../types.js";
import type { StudioAttentionRow } from "./attentionRows.js";

/** Uses the same production action callbacks in the shell and controlled browser fixture. */
export function StudioAttentionInboxView({
  rows,
  open,
  read,
  refresh,
  busy,
  error,
  loading,
  unsupported,
  partial,
}: {
  rows: StudioAttentionRow[];
  open: (row: StudioAttentionRow) => unknown;
  read: (row: StudioAttentionRow) => unknown;
  refresh: () => void;
  busy: ReadonlySet<string>;
  error?: string;
  loading: boolean;
  unsupported: boolean;
  partial: boolean;
}) {
  const { intl } = useKnorviaIntl();
  const t = (key: string) => intl.formatMessage({ id: `studio.attention.${key}` });
  const [filter, setFilter] = useState("all");
  const [showRead, setShowRead] = useState(false);
  const [limit, setLimit] = useState(25);
  const selected = rows.filter(
    (row) =>
      (filter === "all" || row.category === filter) &&
      (showRead || row.unread || row.category === "pending"),
  );
  const count = (category: string) =>
    rows.filter((row) => row.category === category && (row.unread || category === "pending"))
      .length;
  return (
    <section
      className="flex h-full min-h-0 flex-col text-foreground"
      data-testid="studio-attention-inbox"
      aria-label={t("title")}
    >
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <h1 className="min-w-0 flex-1 text-ui-base font-medium">{t("title")}</h1>
        <Button size="sm" variant="ghost" onClick={refresh}>
          {t("refresh")}
        </Button>
      </header>
      <div
        className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-4 py-2"
        aria-label={t("filters")}
      >
        {["all", "pending", "failed", "completed"].map((value) => (
          <Button
            key={value}
            size="sm"
            variant="ghost"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setLimit(25);
            }}
          >
            {t(value)}
            {value !== "all" ? ` (${count(value)})` : ""}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-ui-xs">
          <input
            type="checkbox"
            checked={showRead}
            onChange={(event) => setShowRead(event.target.checked)}
          />
          {t("showRead")}
        </label>
      </div>
      <p className="shrink-0 px-4 py-2 text-ui-xs text-foreground-subtle">{t("sourceScope")}</p>
      {error ? (
        <p role="alert" className="px-4 py-2 text-ui-sm text-destructive">
          {error.startsWith("studio.attention.") ? intl.formatMessage({ id: error }) : error}
        </p>
      ) : null}
      {unsupported || partial ? (
        <p role="status" className="px-4 py-2 text-ui-sm text-foreground-subtle">
          {t(unsupported ? "unavailable" : "partial")}
        </p>
      ) : null}
      {loading ? (
        <p role="status" className="px-4 py-2 text-ui-sm text-foreground-subtle">
          {t("loading")}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {!loading && !error && !unsupported && !partial && !selected.length ? (
          <p className="py-8 text-ui-sm text-foreground-subtle">{t("empty")}</p>
        ) : null}
        <ul className="space-y-2">
          {selected.slice(0, limit).map((row) => (
            <li
              key={row.key}
              data-testid="studio-attention-row"
              data-attention-id={row.source === "studio" ? row.item.id : row.item.taskId}
              className="rounded-xl border border-border px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 break-words text-ui-sm font-medium">
                  {row.title}
                </span>
                <span className="text-ui-xs text-foreground-subtle">{t(`state.${row.state}`)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={row.unavailable || busy.has(`open:${row.key}`)}
                  onClick={() => void open(row)}
                >
                  {t("open")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!row.unread || row.unavailable || busy.has(`read:${row.key}`)}
                  onClick={() => void read(row)}
                >
                  {t("read")}
                </Button>
              </div>
              <p className="break-all text-ui-xs text-foreground-subtle">
                {row.kernels.map((id) => studioKernelOption(id).name).join(" · ")} ·{" "}
                {row.workspacePath}
              </p>
              <p className="break-all text-ui-xs text-foreground-subtlest">
                {row.source === "studio"
                  ? `${row.item.targetId} · ${row.item.runId} · #${row.item.attempt}`
                  : row.item.taskId}
              </p>
              {row.source === "studio" && row.item.interactionKind ? (
                <p className="text-ui-xs">{t(row.item.interactionKind)}</p>
              ) : null}
              {row.source === "studio" && row.item.kernelUnavailable ? (
                <p className="text-ui-xs text-foreground-subtle">{t("kernelRemoved")}</p>
              ) : null}
              {row.source === "studio" && row.item.resultUnknown ? (
                <p className="text-ui-xs text-foreground-subtle">{t("unknownResult")}</p>
              ) : null}
              {row.unavailable ? (
                <p className="text-ui-xs text-foreground-subtle">
                  {t(row.source === "native" ? "offline" : "missing")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {selected.length > limit ? (
          <Button
            className="mt-3"
            size="sm"
            variant="ghost"
            onClick={() => setLimit((value) => value + 25)}
          >
            {t("more")} ({selected.length - limit})
          </Button>
        ) : null}
      </div>
    </section>
  );
}

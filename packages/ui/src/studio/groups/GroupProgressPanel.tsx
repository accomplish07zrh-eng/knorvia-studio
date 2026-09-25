import { useState } from "react";
import type { StudioTimeline } from "@knorvia/services";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useStudioKernelCatalog } from "../agents/useStudioKernelCatalog.js";
import { studioKernelOption } from "../types.js";
import { groupProgress } from "./groupProgress.js";

/** The plan is rendered from the Host's persisted checkpoint, without local progress state. */
export function GroupProgressPanel({ timeline }: { timeline?: StudioTimeline }) {
  const progress = groupProgress(timeline);
  const { intl } = useKnorviaIntl();
  const { statuses } = useStudioKernelCatalog();
  const t = (key: string) => intl.formatMessage({ id: `studio.groups.progress.${key}` });
  const [expanded, setExpanded] = useState(true);
  if (!progress) return null;
  return (
    <details
      key={progress.runId}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="mx-auto max-h-64 w-full max-w-3xl shrink-0 overflow-y-auto border-b border-border px-4 py-3 text-ui-sm sm:px-6"
      data-testid="studio-group-progress"
    >
      <summary className="cursor-pointer font-medium text-foreground">
        {t("title")} · {t(`phase.${progress.phase}`)}
        {progress.phase !== "planning"
          ? ` · ${intl.formatMessage({ id: "studio.groups.progress.round" }, { round: progress.round + 1 })}`
          : ""}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-foreground-subtle">
          {t("host")}: {studioKernelOption(progress.host, statuses).name}
          {progress.runState === "interrupted" ? ` · ${t("runUnknown")}` : ""}
        </p>
        <ul className="space-y-2">
          {progress.members.map((member) => (
            <li
              key={member.id}
              className="rounded-2xl border border-border px-3 py-2"
              data-testid={`studio-group-member-${member.id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{studioKernelOption(member.id, statuses).name}</span>
                <span className="text-foreground-subtle">{t(`state.${member.state}`)}</span>
              </div>
              {member.tasks.map((task) => (
                <div key={task.stepId} className="mt-2 border-t border-border pt-2">
                  <p className="whitespace-pre-wrap break-words">{task.instruction}</p>
                  <p className="mt-1 text-ui-xs text-foreground-subtle">
                    {t(`state.${task.state}`)}
                  </p>
                  {task.evidence ? (
                    <div className="mt-2 text-ui-xs text-foreground-subtle">
                      <a
                        className="underline underline-offset-2 focus-visible:outline focus-visible:outline-2"
                        href={`#${encodeURIComponent(`studio-run-step-${progress.runId}-${task.stepId}`)}`}
                        onClick={() => {
                          const evidence = document.getElementById(
                            `studio-run-step-${progress.runId}-${task.stepId}`,
                          );
                          const history = evidence?.closest<HTMLDetailsElement>(
                            "details[data-studio-run-history]",
                          );
                          if (history) history.open = true;
                          requestAnimationFrame(() =>
                            evidence?.scrollIntoView({ block: "center" }),
                          );
                        }}
                      >
                        {t("evidenceLink")}
                      </a>
                      {task.evidence.workspacePath ? (
                        <p className="mt-1 break-all">
                          {t("workspace")}: {task.evidence.workspacePath}
                        </p>
                      ) : null}
                      {task.evidence.changesSummary ? (
                        <p className="mt-1 whitespace-pre-wrap break-words">
                          {task.evidence.changesSummary}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </li>
          ))}
        </ul>
        {progress.review ? (
          <section
            className="rounded-2xl border border-border px-3 py-2"
            data-testid="studio-group-review"
          >
            <h3 className="font-medium">
              {t("review")} · {t(`review.${progress.review.status}`)}
            </h3>
            <p className="mt-1 whitespace-pre-wrap break-words text-foreground-subtle">
              {progress.review.summary}
            </p>
          </section>
        ) : (
          <p className="text-foreground-subtle">{t("noReview")}</p>
        )}
      </div>
    </details>
  );
}

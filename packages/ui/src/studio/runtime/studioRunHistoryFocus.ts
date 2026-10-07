import {
  STUDIO_RUN_HISTORY_ACTIVE_STATES,
  STUDIO_RUN_HISTORY_COMPACT_WINDOW,
  STUDIO_RUN_HISTORY_WINDOW,
  studioRunHistoryWindow,
} from "./studioRunHistoryWindow.js";
import { useEffect, useRef } from "react";
import type { StudioRun } from "@knorvia/services";
import { useStudioRunFocus } from "./studioRunFocus.js";

/** One historical source remains visible without expanding every intervening run. */
export function useStudioRunHistoryFocus(targetId: string, connection: number, runs: StudioRun[]) {
  const focusRunId = useStudioRunFocus(targetId);
  const root = useRef<HTMLDivElement>(null);
  const scrolled = useRef("");
  useEffect(() => {
    const key = `${connection}:${targetId}:${focusRunId ?? ""}`;
    if (!focusRunId || scrolled.current === key) return;
    const row = [
      ...(root.current?.querySelectorAll<HTMLElement>("[data-studio-run-history]") ?? []),
    ].find((element) => element.dataset.studioRunHistory === focusRunId);
    if (row) {
      row.scrollIntoView({ block: "nearest" });
      scrolled.current = key;
    }
  }, [connection, targetId, focusRunId, runs]);
  const windowRuns =
    focusRunId && runs.some((run) => run.id === focusRunId)
      ? [
          ...runs.filter((run) => run.id === focusRunId),
          ...runs.filter((run) => run.id !== focusRunId),
        ]
      : runs;
  return { focusRunId, root, windowRuns };
}

export function studioFocusedHistoryWindow(
  runs: StudioRun[],
  options: { focusRunId?: string; compact: boolean; olderPages: number; reviewRunId?: string },
) {
  return studioRunHistoryWindow({
    runs,
    initial: options.compact ? STUDIO_RUN_HISTORY_COMPACT_WINDOW : STUDIO_RUN_HISTORY_WINDOW,
    extra: options.compact ? 0 : options.olderPages * STUDIO_RUN_HISTORY_WINDOW,
    pinned: options.compact
      ? [options.focusRunId]
      : [
          ...runs
            .filter((run) => STUDIO_RUN_HISTORY_ACTIVE_STATES.includes(run.state))
            .map((run) => run.id),
          options.reviewRunId,
          options.focusRunId,
        ],
  });
}

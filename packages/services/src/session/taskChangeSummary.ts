// SPDX-License-Identifier: Apache-2.0
// Source-exposed reimplementation; see specs/knorvia-session-leaf-contract-8389.md.
import type {
  KnorviaPersistedFileChange,
  KnorviaTaskChangeSummary,
  KnorviaTaskChangedFileSummary,
} from "@knorvia/shared";
import { computeLineChangeStat } from "@knorvia/shared";

type FileEndpoints = {
  before: string | null;
  after: string;
  writes: number;
  turn: number;
};

/** A transient projection: caller order determines the endpoints, not turn numbers. */
class ChangeSummaryProjection {
  private readonly endpoints = new Map<string, FileEndpoints>();

  accept({ turnIndex, snapshots }: KnorviaPersistedFileChange): void {
    for (const { path, beforeContent, afterContent, writeCount } of snapshots) {
      const endpoints = this.endpoints.get(path);
      this.endpoints.set(path, {
        before: endpoints ? endpoints.before : beforeContent,
        after: afterContent,
        writes: endpoints ? endpoints.writes + writeCount : writeCount,
        turn: turnIndex,
      });
    }
  }

  finish(): KnorviaTaskChangeSummary | undefined {
    if (this.endpoints.size === 0) return undefined;

    const files: KnorviaTaskChangedFileSummary[] = [];
    let added = 0;
    let removed = 0;
    for (const [path, endpoints] of this.endpoints) {
      const stat = computeLineChangeStat(endpoints.before, endpoints.after);
      files.push({
        path,
        added: stat.added,
        removed: stat.removed,
        writeCount: endpoints.writes,
        lastTurnIndex: endpoints.turn,
      });
      added += stat.added;
      removed += stat.removed;
    }
    files.sort((left, right) => left.path.localeCompare(right.path));
    return { fileCount: files.length, added, removed, files };
  }
}

export function buildPerTurnChangeSummaries(
  fileChanges: readonly KnorviaPersistedFileChange[] | undefined,
): Map<number, KnorviaTaskChangeSummary> {
  const summaries = new Map<number, KnorviaTaskChangeSummary>();
  for (const turn of fileChanges ?? []) {
    const projection = new ChangeSummaryProjection();
    projection.accept(turn);
    const summary = projection.finish();
    if (summary) summaries.set(turn.turnIndex, summary);
  }
  return summaries;
}

export function buildTaskChangeSummary(
  fileChanges: readonly KnorviaPersistedFileChange[] | undefined,
): KnorviaTaskChangeSummary | undefined {
  const projection = new ChangeSummaryProjection();
  for (const turn of fileChanges ?? []) projection.accept(turn);
  return projection.finish();
}

import type { StoredRun, StudioRepository } from "./storePort.js";

/** Filter before paging so old unresolved effects remain a scheduling barrier. */
export function hasUnknownStudioRun(
  db: StudioRepository,
  targetId: string,
  except?: string,
): boolean {
  return db
    .list<StoredRun>("run", { scope: targetId, unresolvedRunsOnly: true, limit: except ? 2 : 1 })
    .some((run) => run.id !== except);
}

/** Keep the recent window, then older unresolved runs in their original newest-first order. */
export function studioRunHistory(db: StudioRepository, scope?: string): StoredRun[] {
  const recent = db.list<StoredRun>("run", { scope, limit: 100 });
  const unknown = db.list<StoredRun>("run", { scope, unresolvedRunsOnly: true, limit: 10000 });
  return [...new Map([...recent, ...unknown].map((run) => [run.id, run])).values()];
}

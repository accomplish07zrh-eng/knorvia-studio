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
  // 最近完成历史可能挤掉仍在等待的旧运行；从既有 active 索引读全量，不受并发上限影响。
  const active = db
    .list<{ id: string; targetId: string }>("active", { all: true })
    .filter((entry) => scope === undefined || entry.targetId === scope)
    .flatMap((entry) => {
      const run = db.read<StoredRun>("run", entry.id);
      return run && (scope === undefined || run.targetId === scope) ? [run] : [];
    });
  const unknown = db.list<StoredRun>("run", { scope, unresolvedRunsOnly: true, all: true });
  return [...new Map([...recent, ...active, ...unknown].map((run) => [run.id, run])).values()];
}

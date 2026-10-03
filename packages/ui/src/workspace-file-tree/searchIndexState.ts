// SPDX-License-Identifier: Apache-2.0
// Contract-authored state transitions; source review and verification pending.
export interface WorkspaceFileSearchIndexSnapshot {
  packed: string;
  loading: boolean;
  loaded: boolean;
  error: Error | null;
}

export type WorkspaceFileSearchIndexAction =
  | { type: "reset" }
  | { type: "start" }
  | { type: "ready"; packed: string }
  | { type: "failed"; error: unknown }
  | { type: "settled" }
  | { type: "paused" };

export function emptyWorkspaceFileSearchIndex(): WorkspaceFileSearchIndexSnapshot {
  return { packed: "", loading: false, loaded: false, error: null };
}

export function reduceWorkspaceFileSearchIndex(
  snapshot: WorkspaceFileSearchIndexSnapshot,
  action: WorkspaceFileSearchIndexAction,
): WorkspaceFileSearchIndexSnapshot {
  switch (action.type) {
    case "reset":
      return emptyWorkspaceFileSearchIndex();
    case "start":
      return { ...snapshot, loading: true, error: null };
    case "ready":
      return { ...snapshot, packed: action.packed, loaded: true };
    case "failed":
      return {
        ...snapshot,
        error: action.error instanceof Error ? action.error : new Error(String(action.error)),
      };
    case "settled":
    case "paused":
      return snapshot.loading ? { ...snapshot, loading: false } : snapshot;
  }
}

/** Accepts only the latest live request; the React reducer owns the sole index snapshot. */
export class WorkspaceFileSearchIndexRequests {
  private current: object | null = null;

  constructor(private readonly publish: (action: WorkspaceFileSearchIndexAction) => void) {}

  invalidate(): void {
    this.current = null;
  }

  start(load: (isCurrent: () => boolean) => Promise<string>): () => void {
    const ticket = {};
    this.current = ticket;
    this.publish({ type: "start" });
    void this.complete(ticket, load);
    return () => {
      if (this.current === ticket) this.invalidate();
    };
  }

  private async complete(
    ticket: object,
    load: (isCurrent: () => boolean) => Promise<string>,
  ): Promise<void> {
    try {
      const packed = await load(() => this.current === ticket);
      if (this.current === ticket) this.publish({ type: "ready", packed });
    } catch (error) {
      if (this.current === ticket) this.publish({ type: "failed", error });
    } finally {
      if (this.current === ticket) this.publish({ type: "settled" });
    }
  }
}

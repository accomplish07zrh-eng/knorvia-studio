// Original type owner: apps/cli/packages/core/src/runtime/types.ts
export interface RuntimeTurnFileChangeEntry {
    afterContent?: string;
    beforeContent: string | null;
    fallbackAdditions: number;
    fallbackDeletions: number;
    path: string;
    toolNames: Set<string>;
    writeCount: number;
}
export type RuntimeTurnFileChangeMap = Map<string, RuntimeTurnFileChangeEntry>;

// Original type owner: apps/cli/packages/contracts/src/tools/write.ts
export interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
}

// Original type owner: apps/cli/packages/contracts/src/events/session.events.ts
export interface TurnFileChangeSummary {
    additions: number;
    deletions: number;
    files: number;
    items: TurnFileChangeSummaryItem[];
}
export interface TurnFileChangeSummaryItem {
    additions: number;
    deletions: number;
    path: string;
    toolNames?: string[];
    writeCount: number;
}


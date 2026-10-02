import type { DiffHunk, TurnFileChangeSummary } from "../deps.js";
import type { RuntimeTurnFileChangeMap } from "../types.js";
export declare function recordTurnFileChange(changes: RuntimeTurnFileChangeMap, input: {
    afterContent?: string;
    beforeContent: string | null;
    path: string;
    structuredPatch: DiffHunk[];
    toolName: string;
}): void;
export declare function buildTurnFileChangeSummary(changes: RuntimeTurnFileChangeMap): TurnFileChangeSummary | undefined;

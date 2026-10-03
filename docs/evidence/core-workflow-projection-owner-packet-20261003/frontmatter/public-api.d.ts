import { type SavedWorkflowMeta } from "@knorvia/contracts";
export declare const SAVED_WORKFLOW_SENTINEL = "/* knorvia-workflow";
export declare const LEGACY_SAVED_WORKFLOW_SENTINEL = "/* zcode-workflow";
export declare function isSavedWorkflowSentinel(value: string): boolean;
export type SavedWorkflowParseErrorReason = "missing_frontmatter" | "unterminated_frontmatter" | "invalid_yaml" | "invalid_metadata";
export type SavedWorkflowParseResult = {
    ok: true;
    meta: SavedWorkflowMeta;
    script: string;
    bodyLineOffset: number;
} | {
    ok: false;
    reason: SavedWorkflowParseErrorReason;
    detail: string;
};
export declare function serializeSavedWorkflow(meta: SavedWorkflowMeta, script: string): string;
export declare function parseSavedWorkflow(source: string): SavedWorkflowParseResult;

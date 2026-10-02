// Public supporting type facts only; dependency locations are labels.
// apps/cli/packages/core/src/runtime/types.ts
export interface ModelExecutionContext {
    memoryExtraction?: "skip";
    selectionScope: "execution";
    requestDependencies?: ModelRequestDependencies;
    subagents?: {
        foregroundModel: "submission";
        background: "deny";
    };
}

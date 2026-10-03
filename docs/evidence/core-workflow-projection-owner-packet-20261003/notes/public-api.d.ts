import type { CreateWorkflowDiagnostic } from "@knorvia/contracts";
export interface WorkflowScriptLocation {
    kind: "draft" | "path";
    described: string;
    lineOffset: number;
}
export declare function formatWorkflowDiagnosticLines(diagnostics: readonly CreateWorkflowDiagnostic[], location: WorkflowScriptLocation | undefined): string[];
export declare function workflowScriptFileNote(location: WorkflowScriptLocation): string;
export declare function workflowSavedDraftNote(options: {
    savedName: string;
    savedPath: string;
    draft: string;
}): string;
export declare function workflowLaunchedScriptSentence(location: WorkflowScriptLocation): string;
export declare function workflowAmendedScriptSentence(location: WorkflowScriptLocation): string;

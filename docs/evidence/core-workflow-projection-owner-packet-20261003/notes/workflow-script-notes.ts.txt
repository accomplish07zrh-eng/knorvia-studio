import type { CreateWorkflowDiagnostic } from "@knorvia/contracts";

export interface WorkflowScriptLocation {
    kind: "draft" | "path";
    described: string;
    lineOffset: number;
}

export function formatWorkflowDiagnosticLines(
    diagnostics: readonly CreateWorkflowDiagnostic[],
    location: WorkflowScriptLocation | undefined,
): string[] {
    if (location === undefined) {
        return diagnostics.map((diagnostic) =>
            `L${diagnostic.line}:C${diagnostic.column} ${diagnostic.message}`,
        );
    }

    return diagnostics.map((diagnostic) =>
        `${location.described}:L${diagnostic.line + location.lineOffset}:C${diagnostic.column} ${diagnostic.message}`,
    );
}

export function workflowScriptFileNote(location: WorkflowScriptLocation): string {
    const sentence = location.kind === "draft"
        ? `The script is saved at ${location.described}.`
        : `The script file is ${location.described}.`;

    return `NOTE: The workflow was NOT executed. ${sentence} Edit that file in place and resubmit with \`path: "${location.described}"\` — do not paste the script inline again.`;
}

export function workflowSavedDraftNote(options: {
    savedName: string;
    savedPath: string;
    draft: string;
}): string {
    return `NOTE: The workflow was NOT executed. A working copy of the saved workflow '${options.savedName}' (${options.savedPath}) was written to ${options.draft}. Edit that copy in place and resubmit with \`path: "${options.draft}"\` (pass its \`args\` again); to change the saved definition itself, use SaveWorkflow.`;
}

export function workflowLaunchedScriptSentence(location: WorkflowScriptLocation): string {
    const sentence = location.kind === "draft"
        ? `The script is saved at ${location.described}`
        : `The script file is ${location.described}`;

    return ` ${sentence}; to revise it later, edit that file and pass \`path\` to AmendWorkflow.`;
}

export function workflowAmendedScriptSentence(location: WorkflowScriptLocation): string {
    return ` The revision's script is at ${location.described}; edit it there for a further revision.`;
}

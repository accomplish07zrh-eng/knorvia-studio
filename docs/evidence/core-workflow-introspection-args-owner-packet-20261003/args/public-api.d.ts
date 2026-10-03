import type { SavedWorkflowArgsDeclaration } from "@knorvia/contracts";
export type WorkflowArgsValidation = {
    ok: true;
    args: Record<string, unknown>;
} | {
    ok: false;
    errors: string[];
};
export declare function validateWorkflowArgs(declaration: SavedWorkflowArgsDeclaration | undefined, provided: Record<string, unknown> | undefined): WorkflowArgsValidation;

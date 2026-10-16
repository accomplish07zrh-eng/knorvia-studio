// SPDX-License-Identifier: Apache-2.0

import type ts from "typescript";

export interface CompileDiagnostic {
  code: number;
  column: number;
  line: number;
  message: string;
}

export interface CompileResult {
  diagnostics: CompileDiagnostic[];
  ok: boolean;
}

export const SCRIPT_FILE_NAME = "workflow-script.ts";
export const WORKFLOW_FUNCTION_NAME = "__workflowScript__";

export interface ScriptLoc {
  line: number;
  column: number;
}

export interface WorkflowProgram {
  program: ts.Program;
  scriptFile: ts.SourceFile;
  toScriptLoc(pos: number): ScriptLoc;
}

export interface CreateWorkflowProgramOptions {
  facadeDts?: string;
}

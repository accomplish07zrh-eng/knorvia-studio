// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";

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

export function defaultCompilerOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts"],
    types: [],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    allowJs: false,
  };
}

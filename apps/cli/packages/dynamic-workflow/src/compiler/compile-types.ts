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

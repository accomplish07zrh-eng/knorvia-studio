// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import { FACADE_DTS, FACADE_FILE_NAME } from "../facade/dts.js";
import { TS_LIBS } from "./libs.generated.js";
import type {
  CompileDiagnostic,
  CompileResult,
  CreateWorkflowProgramOptions,
  ScriptLoc,
  WorkflowProgram,
} from "./compile-types.js";

export type {
  CompileDiagnostic,
  CompileResult,
  CreateWorkflowProgramOptions,
  ScriptLoc,
  WorkflowProgram,
};

// File name the in-memory host uses for the wrapped workflow script.
export const SCRIPT_FILE_NAME = "workflow-script.ts";

// Name of the async function that holds the authored body. Analysis locates
// this declaration so the walk stays inside the script and can separate a
// top-level return from a return inside a nested function.
export const WORKFLOW_FUNCTION_NAME = "__workflowScript__";

// Typecheck-only options. The script targets ES2022, is treated as ESM with
// bundler resolution, and sees only the ES2022 library. Ambient @types are
// withheld, strict checking stays on, library files are not rechecked, nothing
// is emitted, and JavaScript sources are refused.
function defaultCompilerOptions(): ts.CompilerOptions {
  const options: ts.CompilerOptions = {};
  options.target = ts.ScriptTarget.ES2022;
  options.module = ts.ModuleKind.ESNext;
  options.moduleResolution = ts.ModuleResolutionKind.Bundler;
  options.lib = ["lib.es2022.d.ts"];
  options.types = [];
  options.strict = true;
  options.noEmit = true;
  options.skipLibCheck = true;
  options.allowJs = false;
  return options;
}

const SCRIPT_PRELUDE_HEADER = `async function ${WORKFLOW_FUNCTION_NAME}() {\n`;
const SCRIPT_EPILOGUE_FOOTER = "\n}\nexport {};\n";
const SCRIPT_HEADER_LINE_COUNT = 1;
const CODE_INVALID_MODIFIER = 1184;

const AMBIENT_FIX_ADVICE: Record<string, string> = {
  declare:
    "The `declare` modifier is not allowed in a workflow script: the script is compiled inside a function body, where ambient declarations are illegal. Remove `declare` and write a plain declaration (e.g. `interface Foo { ... }`).",
  export:
    "`export` is not allowed in a workflow script: the script is compiled inside a function body. Remove `export` — the workflow's output is its final `return` value.",
};

class InMemoryVirtualHost implements ts.CompilerHost {
  private readonly fileMap = new Map<string, string>();
  private readonly fileCache = new Map<string, ts.SourceFile>();

  constructor(mainScript: string, facadeDefs: string) {
    for (const [libName, libContent] of Object.entries(TS_LIBS)) {
      this.fileMap.set(libName, libContent);
    }
    this.fileMap.set(SCRIPT_FILE_NAME, mainScript);
    this.fileMap.set(FACADE_FILE_NAME, facadeDefs);
  }

  getSourceFile(
    fileName: string,
    langVer: ts.ScriptTarget | ts.CreateSourceFileOptions,
  ): ts.SourceFile | undefined {
    const hit = this.fileCache.get(fileName);
    if (hit) return hit;
    const content = this.fileMap.get(fileName);
    if (content === undefined) return undefined;
    const parsed = ts.createSourceFile(fileName, content, langVer, true);
    this.fileCache.set(fileName, parsed);
    return parsed;
  }

  getDefaultLibFileName(options: ts.CompilerOptions): string {
    return ts.getDefaultLibFileName(options);
  }

  writeFile(): never {
    throw new Error("workflow virtual compilation is noEmit; output files are forbidden");
  }

  getCurrentDirectory(): string {
    return "/";
  }

  getCanonicalFileName(fileName: string): string {
    return fileName;
  }

  useCaseSensitiveFileNames(): boolean {
    return true;
  }

  getNewLine(): string {
    return "\n";
  }

  fileExists(fileName: string): boolean {
    return this.fileMap.has(fileName);
  }

  readFile(fileName: string): string | undefined {
    return this.fileMap.get(fileName);
  }
}

export function createWorkflowProgram(
  scriptText: string,
  options?: CreateWorkflowProgramOptions,
): WorkflowProgram {
  const wrappedScript = `${SCRIPT_PRELUDE_HEADER}${scriptText}${SCRIPT_EPILOGUE_FOOTER}`;
  const facadeContent = options?.facadeDts ?? FACADE_DTS;
  const virtualHost = new InMemoryVirtualHost(wrappedScript, facadeContent);

  const program = ts.createProgram(
    [SCRIPT_FILE_NAME, FACADE_FILE_NAME],
    defaultCompilerOptions(),
    virtualHost,
  );

  const scriptFile = program.getSourceFile(SCRIPT_FILE_NAME);
  if (!scriptFile) throw new Error("workflow script source file missing from program");

  const toScriptLoc = (pos: number): ScriptLoc => {
    const coords = scriptFile.getLineAndCharacterOfPosition(pos);
    const mappedLine = Math.max(1, coords.line - SCRIPT_HEADER_LINE_COUNT + 1);
    return { column: coords.character + 1, line: mappedLine };
  };

  return { program, scriptFile, toScriptLoc };
}

function customizeModifierDiagnostic(diag: ts.Diagnostic): string | undefined {
  if (diag.code !== CODE_INVALID_MODIFIER) return undefined;
  if (diag.file?.fileName !== SCRIPT_FILE_NAME) return undefined;
  if (diag.start === undefined || diag.length === undefined) return undefined;
  const token = diag.file.text.slice(diag.start, diag.start + diag.length);
  return AMBIENT_FIX_ADVICE[token];
}

function normalizeDiagnostic(diag: ts.Diagnostic): CompileDiagnostic {
  const message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
  if (!diag.file || diag.start === undefined) {
    return { code: diag.code, column: 1, line: 1, message };
  }
  const pos = diag.file.getLineAndCharacterOfPosition(diag.start);
  const adjustedLine =
    diag.file.fileName === SCRIPT_FILE_NAME ? pos.line - SCRIPT_HEADER_LINE_COUNT : pos.line;
  const finalMessage = customizeModifierDiagnostic(diag) ?? message;

  return {
    code: diag.code,
    column: pos.character + 1,
    line: Math.max(1, adjustedLine + 1),
    message: finalMessage,
  };
}

export function collectDiagnostics(program: ts.Program): CompileDiagnostic[] {
  const diagnosticsList: ts.Diagnostic[] = [];
  for (const d of program.getSyntacticDiagnostics()) diagnosticsList.push(d);
  for (const d of program.getSemanticDiagnostics()) diagnosticsList.push(d);
  return diagnosticsList.map(normalizeDiagnostic);
}

export function compileWorkflowScript(scriptText: string): CompileResult {
  const prog = createWorkflowProgram(scriptText);
  const detected = collectDiagnostics(prog.program);
  return { diagnostics: detected, ok: detected.length === 0 };
}

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
import { SCRIPT_FILE_NAME, WORKFLOW_FUNCTION_NAME } from "./compile-types.js";

export type {
  CompileDiagnostic,
  CompileResult,
  CreateWorkflowProgramOptions,
  ScriptLoc,
  WorkflowProgram,
};
export { SCRIPT_FILE_NAME, WORKFLOW_FUNCTION_NAME };

const SCRIPT_PRELUDE_HEADER = `async function ${WORKFLOW_FUNCTION_NAME}() {\n`;
const SCRIPT_EPILOGUE_FOOTER = "\n}\nexport {};\n";
const SCRIPT_HEADER_LINE_COUNT = 1;
const CODE_INVALID_MODIFIER = 1184;

function buildCompilerOptions(): ts.CompilerOptions {
  const baseConfig: ts.CompilerOptions = {
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
  return baseConfig;
}

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
    buildCompilerOptions(),
    virtualHost,
  );

  const scriptFile = program.getSourceFile(SCRIPT_FILE_NAME);
  if (!scriptFile) throw new Error("workflow script source file missing from program");

  const toScriptLoc = (pos: number): ScriptLoc => {
    const coords = scriptFile.getLineAndCharacterOfPosition(pos);
    const mappedLine = Math.max(1, coords.line - SCRIPT_HEADER_LINE_COUNT + 1);
    return { line: mappedLine, column: coords.character + 1 };
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

// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import { FACADE_DTS, FACADE_FILE_NAME } from "../facade/dts.js";
import { TS_LIBS } from "./libs.generated.js";

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

const PRELUDE_HEADER = `async function ${WORKFLOW_FUNCTION_NAME}() {\n`;
const EPILOGUE_FOOTER = "\n}\nexport {};\n";
const SCRIPT_PRELUDE_LINES = 1;
const ILLEGAL_MODIFIER_CODE = 1184;

const STATIC_MODIFIER_GUIDANCE: Record<string, string> = {
  declare:
    "The `declare` modifier is not allowed in a workflow script: the script is compiled inside a function body, where ambient declarations are illegal. Remove `declare` and write a plain declaration (e.g. `interface Foo { ... }`).",
  export:
    "`export` is not allowed in a workflow script: the script is compiled inside a function body. Remove `export` — the workflow's output is its final `return` value.",
};

const WORKFLOW_TS_CONFIG: ts.CompilerOptions = {
  allowJs: false,
  lib: ["lib.es2022.d.ts"],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
  types: [],
};

function constructVirtualHost(scriptCode: string, facadeDefs: string): ts.CompilerHost {
  const fileTable = new Map<string, string>([
    [SCRIPT_FILE_NAME, scriptCode],
    [FACADE_FILE_NAME, facadeDefs],
    ...Object.entries(TS_LIBS),
  ]);
  const parsedFileStore = new Map<string, ts.SourceFile>();

  return {
    getSourceFile(fileName, languageVersionOrOptions) {
      const existing = parsedFileStore.get(fileName);
      if (existing) return existing;
      const content = fileTable.get(fileName);
      if (content === undefined) return undefined;
      const parsed = ts.createSourceFile(fileName, content, languageVersionOrOptions, true);
      parsedFileStore.set(fileName, parsed);
      return parsed;
    },
    getDefaultLibFileName: (cfg) => ts.getDefaultLibFileName(cfg),
    writeFile() {
      throw new Error("workflow compile is noEmit; nothing may write output");
    },
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (f) => fileTable.has(f),
    readFile: (f) => fileTable.get(f),
  };
}

export function createWorkflowProgram(
  scriptText: string,
  options?: CreateWorkflowProgramOptions,
): WorkflowProgram {
  const fullSource = `${PRELUDE_HEADER}${scriptText}${EPILOGUE_FOOTER}`;
  const facadeSource = options?.facadeDts ?? FACADE_DTS;
  const virtualCompilerHost = constructVirtualHost(fullSource, facadeSource);

  const program = ts.createProgram({
    host: virtualCompilerHost,
    options: WORKFLOW_TS_CONFIG,
    rootNames: [SCRIPT_FILE_NAME, FACADE_FILE_NAME],
  });

  const scriptFile = program.getSourceFile(SCRIPT_FILE_NAME);
  if (!scriptFile) {
    throw new Error("workflow script source file missing from program");
  }

  const toScriptLoc = (pos: number): ScriptLoc => {
    const loc = scriptFile.getLineAndCharacterOfPosition(pos);
    return {
      column: loc.character + 1,
      line: Math.max(1, loc.line - SCRIPT_PRELUDE_LINES + 1),
    };
  };

  return { program, scriptFile, toScriptLoc };
}

function refineAmbientModifierMessage(diag: ts.Diagnostic): string | undefined {
  if (
    diag.code !== ILLEGAL_MODIFIER_CODE ||
    diag.file?.fileName !== SCRIPT_FILE_NAME ||
    diag.start === undefined ||
    diag.length === undefined
  ) {
    return undefined;
  }
  const token = diag.file.text.slice(diag.start, diag.start + diag.length);
  return STATIC_MODIFIER_GUIDANCE[token];
}

function adaptDiagnostic(diag: ts.Diagnostic): CompileDiagnostic {
  const standardText = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
  if (!diag.file || diag.start === undefined) {
    return { code: diag.code, column: 1, line: 1, message: standardText };
  }
  const pos = diag.file.getLineAndCharacterOfPosition(diag.start);
  const rawLine = diag.file.fileName === SCRIPT_FILE_NAME ? pos.line - SCRIPT_PRELUDE_LINES : pos.line;
  const contextualMessage = refineAmbientModifierMessage(diag) ?? standardText;

  return {
    code: diag.code,
    column: pos.character + 1,
    line: Math.max(1, rawLine + 1),
    message: contextualMessage,
  };
}

export function collectDiagnostics(program: ts.Program): CompileDiagnostic[] {
  const syntaxErrors = program.getSyntacticDiagnostics();
  const semanticErrors = program.getSemanticDiagnostics();
  return [...syntaxErrors, ...semanticErrors].map(adaptDiagnostic);
}

export function compileWorkflowScript(scriptText: string): CompileResult {
  const { program } = createWorkflowProgram(scriptText);
  const diagnostics = collectDiagnostics(program);
  return { diagnostics, ok: diagnostics.length === 0 };
}

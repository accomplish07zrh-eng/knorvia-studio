// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import {
  collectDiagnostics,
  createWorkflowProgram,
  WORKFLOW_FUNCTION_NAME,
  type CompileDiagnostic,
  type WorkflowProgram,
} from "../compiler/compile.js";
import { collectFacadeMisuse } from "../analysis/facade-misuse.js";
import { collectSites, type SiteTable } from "../analysis/sites.js";
import { WorkflowAstRewriter } from "./ast-rewriter.js";

// Host binding identifier injected into workflow sandbox execution contexts.
export const HOST_BINDING = "__host";

// Lowered workflow artifact consumed by sandbox runners.
export interface LoweredWorkflow {
  readonly code: string;
  readonly siteIds: string[];
}

// Result container holding lowered code or diagnostic rejections.
export interface LowerResult {
  readonly diagnostics: CompileDiagnostic[];
  readonly ok: boolean;
  readonly lowered?: LoweredWorkflow;
}

function resolveTranspileSettings(): ts.TranspileOptions {
  const compilerSettings: ts.CompilerOptions = {};
  compilerSettings.target = ts.ScriptTarget.ES2022;
  compilerSettings.module = ts.ModuleKind.ESNext;
  compilerSettings.newLine = ts.NewLineKind.LineFeed;
  compilerSettings.removeComments = false;
  compilerSettings.isolatedModules = false;
  return {
    compilerOptions: compilerSettings,
    reportDiagnostics: false,
  };
}

function createSourcePrinter(): ts.Printer {
  const printOptions: ts.PrinterOptions = {};
  printOptions.newLine = ts.NewLineKind.LineFeed;
  printOptions.removeComments = false;
  return ts.createPrinter(printOptions);
}

// End-to-end lowering pipeline parsing, verifying, and translating workflow scripts.
export function lowerWorkflowScript(scriptText: string): LowerResult {
  const workflowInstance = createWorkflowProgram(scriptText);
  const syntaxIssues = collectDiagnostics(workflowInstance.program);
  if (syntaxIssues.length > 0) {
    return { diagnostics: syntaxIssues, ok: false };
  }

  const siteCatalog = collectSites(workflowInstance);
  const misuseViolations = collectFacadeMisuse(workflowInstance, siteCatalog);
  if (misuseViolations.length > 0) {
    return { diagnostics: misuseViolations, ok: false };
  }

  const generated = lowerWorkflow(workflowInstance, siteCatalog);
  return { diagnostics: syntaxIssues, lowered: generated, ok: true };
}

// Lowers an analyzed workflow AST into sandbox-compatible ES2022 JavaScript code.
export function lowerWorkflow(workflow: WorkflowProgram, table: SiteTable): LoweredWorkflow {
  const typeChecker = workflow.program.getTypeChecker();
  const rewriter = new WorkflowAstRewriter(typeChecker, table, HOST_BINDING);

  const transformationResult = ts.transform(workflow.scriptFile, [rewriter.createTransformer()]);
  const transformedFile = transformationResult.transformed[0];
  if (!transformedFile) {
    throw new Error("lowering: transform produced no source file");
  }

  const printer = createSourcePrinter();
  const statementList = locateWorkflowFunctionBody(transformedFile);
  const printedSegments: string[] = [];
  for (const statement of statementList) {
    printedSegments.push(printer.printNode(ts.EmitHint.Unspecified, statement, transformedFile));
  }
  const combinedInstrumentedSource = printedSegments.join("\n");
  transformationResult.dispose();

  const transpilation = ts.transpileModule(combinedInstrumentedSource, resolveTranspileSettings());

  return {
    code: transpilation.outputText,
    siteIds: compileOrderedSiteIdentities(table),
  };
}

function compileOrderedSiteIdentities(table: SiteTable): string[] {
  const flattened: { order: number; id: string }[] = [];
  const siteGroups = [table.actors, table.artifacts, table.asks, table.reports, table.worldReads];

  for (const group of siteGroups) {
    for (const siteItem of group) {
      flattened.push(siteItem);
    }
  }

  return flattened.sort((first, second) => first.order - second.order).map((entry) => entry.id);
}

function locateWorkflowFunctionBody(source: ts.SourceFile): ts.NodeArray<ts.Statement> {
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node)) {
      if (node.name?.text === WORKFLOW_FUNCTION_NAME && node.body) {
        return node.body.statements;
      }
    }
  }
  throw new Error(`lowering: missing ${WORKFLOW_FUNCTION_NAME} declaration`);
}

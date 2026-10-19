// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import type { CompileDiagnostic, WorkflowProgram } from "../compiler/compile.js";
import { createWorkflowProgram, collectDiagnostics } from "../compiler/compile.js";
import { collectSites, type SiteTable } from "../analysis/sites.js";
import type { AskSpec } from "../engine/types.js";
import { SchemaEmitter, SchemaRejection } from "./emit.js";
import { harvestConstraints, mergeConstraints } from "./jsdoc.js";
import type { JsonSchema } from "./types.js";
import { SCHEMA_DIAGNOSTIC_CODE } from "./types.js";

// Knorvia dynamic-workflow schema synthesis: extracts JSON Schemas for typed asks and audits report payload serializability.

export interface SchemaSynthesisResult {
  // Map of typed ask site IDs to their corresponding JSON Schema.
  schemas: Record<string, JsonSchema>;
  // Diagnostics emitted for non-serializable types at ask or report sites.
  diagnostics: CompileDiagnostic[];
}

class AskSchemaSynthesizer {
  private readonly typeChecker: ts.TypeChecker;
  private readonly compiledSchemas: Record<string, JsonSchema> = {};
  private readonly collectedDiagnostics: CompileDiagnostic[] = [];

  constructor(workflow: WorkflowProgram) {
    this.typeChecker = workflow.program.getTypeChecker();
  }

  synthesizeAll(siteTable: SiteTable): SchemaSynthesisResult {
    this.processAskSites(siteTable.asks);
    this.verifyReportSites(siteTable.reports);
    return {
      schemas: this.compiledSchemas,
      diagnostics: this.collectedDiagnostics,
    };
  }

  private processAskSites(asks: SiteTable["asks"]): void {
    for (const site of asks) {
      const resolvedType = this.resolveTypedAskTarget(site.call);
      if (!resolvedType) {
        continue;
      }
      try {
        const typeArgNode = site.call.typeArguments![0]!;
        const emitter = new SchemaEmitter(this.typeChecker, typeArgNode);
        const rawSchema = emitter.emitTop(resolvedType);
        this.compiledSchemas[site.id] = this.enrichWithRootDoc(rawSchema, resolvedType);
      } catch (err: unknown) {
        if (err instanceof SchemaRejection) {
          this.recordRejection(err, "ask result type", site.loc);
        } else {
          throw err;
        }
      }
    }
  }

  private verifyReportSites(reports: SiteTable["reports"]): void {
    for (const site of reports) {
      if (!site.item) {
        continue;
      }
      try {
        const valType = this.typeChecker.getTypeAtLocation(site.item);
        new SchemaEmitter(this.typeChecker, site.item).emitTop(valType);
      } catch (err: unknown) {
        if (err instanceof SchemaRejection) {
          this.recordRejection(err, "report item type", site.loc);
        } else {
          throw err;
        }
      }
    }
  }

  private resolveTypedAskTarget(call: ts.CallExpression): ts.Type | undefined {
    const typeArgs = call.typeArguments;
    if (!typeArgs || typeArgs.length === 0) {
      return undefined;
    }
    const firstArg = typeArgs[0];
    if (!firstArg) {
      return undefined;
    }
    const target = this.typeChecker.getTypeFromTypeNode(firstArg);
    if ((target.flags & ts.TypeFlags.String) !== 0) {
      return undefined;
    }
    return target;
  }

  private enrichWithRootDoc(schema: JsonSchema, type: ts.Type): JsonSchema {
    const sym = type.aliasSymbol ?? type.getSymbol();
    if (!sym) {
      return schema;
    }
    const extra = harvestConstraints(sym, this.typeChecker);
    return mergeConstraints(schema, extra);
  }

  private recordRejection(
    rejection: SchemaRejection,
    targetKind: string,
    loc: { line: number; column: number },
  ): void {
    const locSuffix = rejection.path && rejection.path !== "$" ? ` (at ${rejection.path})` : "";
    this.collectedDiagnostics.push({
      code: SCHEMA_DIAGNOSTIC_CODE,
      line: loc.line,
      column: loc.column,
      message: `unsupported ${targetKind}: ${rejection.reason}${locSuffix}`,
    });
  }
}

// Emits JSON Schemas for all typed ask call sites within the analyzed program.
export function synthesizeAskSchemas(
  workflow: WorkflowProgram,
  table: SiteTable,
): SchemaSynthesisResult {
  const synthesizer = new AskSchemaSynthesizer(workflow);
  return synthesizer.synthesizeAll(table);
}

// High-level compilation pipeline: checks syntax/types, extracts sites, and synthesizes schemas.
export function synthesizeWorkflowSchemas(scriptText: string): SchemaSynthesisResult {
  const program = createWorkflowProgram(scriptText);
  const typeErrors = collectDiagnostics(program.program);
  if (typeErrors.length > 0) {
    return { schemas: {}, diagnostics: typeErrors };
  }
  const discoveredSites = collectSites(program);
  return synthesizeAskSchemas(program, discoveredSites);
}

// Assembles an AskSpec mapping covering every ask site in the site table.
export function buildAskSpecs(
  table: SiteTable,
  schemas: Record<string, JsonSchema>,
): Map<string, AskSpec> {
  const specMap = new Map<string, AskSpec>();
  for (const site of table.asks) {
    const schema = schemas[site.id];
    if (schema !== undefined) {
      specMap.set(site.id, { typed: true, schema });
    } else {
      specMap.set(site.id, { typed: false });
    }
  }
  return specMap;
}

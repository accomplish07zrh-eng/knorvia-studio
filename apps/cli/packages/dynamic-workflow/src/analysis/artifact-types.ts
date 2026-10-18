// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import type { WorkflowProgram } from "../compiler/compile.js";
import type { SiteTable } from "./sites.js";
import { provisionalFanoutId } from "./domain.js";

export interface ArtifactTypes {
  siteType: Map<string, string>;
  joinPortTypes: Map<string, (string | undefined)[]>;
}

const SKIP_TYPE_LABELS = new Set<string>(["any", "unknown", "never", "void"]);
const MAX_ARRAY_UNWRAP_DEPTH = 8;
const PRINT_OPTIONS = ts.TypeFormatFlags.NoTruncation;

/**
 * Derives artifact data types for all producer sites registered in the site table.
 */
export function computeArtifactTypes(workflow: WorkflowProgram, table: SiteTable): ArtifactTypes {
  const typeChecker = workflow.program.getTypeChecker();
  const siteType = new Map<string, string>();
  const joinPortTypes = new Map<string, (string | undefined)[]>();

  function stringifyType(target: ts.Type | undefined): string | undefined {
    if (!target) return undefined;
    const representation = typeChecker.typeToString(target, undefined, PRINT_OPTIONS);
    return SKIP_TYPE_LABELS.has(representation) ? undefined : representation;
  }

  function resolveAwaited(astNode: ts.Node): ts.Type | undefined {
    return typeChecker.getAwaitedType(typeChecker.getTypeAtLocation(astNode));
  }

  function extractArrayItemType(t: ts.Type): ts.Type | undefined {
    const symbolTarget = (t as ts.TypeReference).target;
    const symbolName = symbolTarget?.symbol?.name;
    if (symbolName !== "Array" && symbolName !== "ReadonlyArray") return undefined;
    const typeArguments = typeChecker.getTypeArguments(t as ts.TypeReference);
    return typeArguments.length > 0 ? typeArguments[0] : undefined;
  }

  function inspectFanoutType(callExpression: ts.Node): string | undefined {
    const rootType = resolveAwaited(callExpression);
    if (!rootType) return undefined;
    const fallbackText = stringifyType(rootType);

    let current = rootType;
    let nestingLevel = 0;
    while (nestingLevel < MAX_ARRAY_UNWRAP_DEPTH) {
      const inner = extractArrayItemType(current);
      if (!inner) break;
      current = typeChecker.getAwaitedType(inner) ?? inner;
      nestingLevel += 1;
    }

    if (nestingLevel === 0) return fallbackText;
    const unwrappedText = stringifyType(current);
    if (!unwrappedText) return fallbackText;

    const needsParens = /\s[|&]\s/.test(unwrappedText);
    const itemPrefix = needsParens ? `(${unwrappedText})` : unwrappedText;
    return itemPrefix + "[]".repeat(nestingLevel);
  }

  for (const askSite of table.asks) {
    const explicitArg = askSite.call.typeArguments?.[0];
    const resolved = explicitArg
      ? typeChecker.getTypeFromTypeNode(explicitArg)
      : resolveAwaited(askSite.call);
    const label = stringifyType(resolved);
    if (label !== undefined) {
      siteType.set(askSite.id, label);
    }
  }

  for (const readSite of table.worldReads) {
    const label = stringifyType(resolveAwaited(readSite.call));
    if (label !== undefined) {
      siteType.set(readSite.id, label);
    }
  }

  for (const joinSite of table.joins) {
    const label = stringifyType(resolveAwaited(joinSite.call));
    if (label !== undefined) {
      siteType.set(joinSite.id, label);
    }

    if (joinSite.arg && ts.isArrayLiteralExpression(joinSite.arg)) {
      const ports = joinSite.arg.elements.map((elem) => stringifyType(resolveAwaited(elem)));
      joinPortTypes.set(joinSite.id, ports);
    }
  }

  for (const iter of table.iterations) {
    if (iter.form === "array-method" && iter.call) {
      const fanoutLabel = inspectFanoutType(iter.call);
      if (fanoutLabel !== undefined) {
        siteType.set(provisionalFanoutId(iter.order), fanoutLabel);
      }
    }
  }

  return { joinPortTypes, siteType };
}

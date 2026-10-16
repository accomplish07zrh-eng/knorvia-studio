// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import { FACADE_FILE_NAME } from "../facade/dts.js";
import type { WorldReadOp } from "../facade/registry.js";
import type { ScriptLoc } from "../compiler/compile.js";
import type { NamePattern } from "./types.js";
import type { CallbackSemantics } from "./callbacks.js";
import type { IterationCandidate } from "./sites.js";

// Helper routines for site discovery: resolves symbol aliases, identifies facade origins,
// and extracts actor names, ask labels, iteration candidates, and template affixes.

export function resolveSymbol(
  targetNode: ts.Node,
  typeChecker: ts.TypeChecker,
): ts.Symbol | undefined {
  const sym = typeChecker.getSymbolAtLocation(targetNode);
  if (!sym) return void 0;
  return (sym.flags & ts.SymbolFlags.Alias) !== 0 ? typeChecker.getAliasedSymbol(sym) : sym;
}

export function isFacadeDeclared(candidateSymbol: ts.Symbol | undefined): boolean {
  const declarations = candidateSymbol?.declarations;
  if (!declarations || declarations.length === 0) return false;
  return declarations.some((decl) => decl.getSourceFile().fileName === FACADE_FILE_NAME);
}

export function literalText(expression: ts.Expression | undefined): string | undefined {
  return expression && ts.isStringLiteralLike(expression) ? expression.text : void 0;
}

export class Counter {
  #counterValue = 0;
  public next(): number {
    this.#counterValue += 1;
    return this.#counterValue;
  }
}

function isDirectAgentCall(callExpr: ts.CallExpression, typeChecker: ts.TypeChecker): boolean {
  if (ts.isPropertyAccessExpression(callExpr.expression)) return false;
  const sym = resolveSymbol(callExpr.expression, typeChecker);
  return Boolean(sym && sym.name === "agent" && isFacadeDeclared(sym));
}

function extractTemplateAffixes(templateArg: ts.Expression | undefined): NamePattern | undefined {
  if (!templateArg || !ts.isTemplateExpression(templateArg)) return void 0;

  const validAffix = (segment: string | undefined): string | undefined => {
    const trimmed = segment?.trim();
    return trimmed && /[\p{L}\p{N}]/u.test(trimmed) ? trimmed : void 0;
  };

  const headPart = validAffix(templateArg.head.text);
  const tailNode = templateArg.templateSpans.at(-1)?.literal.text;
  const tailPart = validAffix(tailNode);

  if (headPart === undefined && tailPart === undefined) return void 0;
  const pattern: NamePattern = {};
  if (headPart !== undefined) pattern.head = headPart;
  if (tailPart !== undefined) pattern.tail = tailPart;
  return pattern;
}

export function askLabel(targetReceiver: ts.Expression, typeChecker: ts.TypeChecker): string {
  if (ts.isCallExpression(targetReceiver) && isDirectAgentCall(targetReceiver, typeChecker)) {
    const firstArg = targetReceiver.arguments[0];
    if (firstArg && ts.isStringLiteralLike(firstArg)) {
      return firstArg.text;
    }
  }
  return ts.isIdentifier(targetReceiver) ? targetReceiver.text : "ask";
}

export function askLabelPattern(
  targetReceiver: ts.Expression,
  typeChecker: ts.TypeChecker,
): NamePattern | undefined {
  if (!ts.isCallExpression(targetReceiver) || !isDirectAgentCall(targetReceiver, typeChecker)) {
    return void 0;
  }
  return extractTemplateAffixes(targetReceiver.arguments[0]);
}

export function actorName(actorCall: ts.CallExpression): string | undefined {
  const primaryArg = actorCall.arguments[0];
  if (primaryArg && ts.isStringLiteralLike(primaryArg)) {
    return primaryArg.text;
  }
  const callParent = actorCall.parent;
  if (ts.isVariableDeclaration(callParent) && callParent.initializer === actorCall) {
    if (ts.isIdentifier(callParent.name)) {
      return callParent.name.text;
    }
  }
  return void 0;
}

export function actorNamePattern(actorCall: ts.CallExpression): NamePattern | undefined {
  return extractTemplateAffixes(actorCall.arguments[0]);
}

export function worldReadLabel(
  operation: WorldReadOp,
  firstArgument: ts.Expression | undefined,
): string {
  const literal =
    firstArgument && ts.isStringLiteralLike(firstArgument) ? firstArgument.text : null;
  return literal !== null ? `${operation} ${literal}` : operation;
}

export function eachCandidate(
  callExpr: ts.CallExpression,
  cbSemantics: CallbackSemantics,
  discoveryOrder: number,
  scriptLoc: ScriptLoc,
): IterationCandidate | undefined {
  const cbPosition = cbSemantics.callbacks[0];
  if (cbPosition === undefined) return void 0;
  const cbArg = callExpr.arguments[cbPosition];
  const iterExpr = cbSemantics.iterated;
  if (!cbArg || !iterExpr) return void 0;

  const isFunctionLiteral = ts.isArrowFunction(cbArg) || ts.isFunctionExpression(cbArg);
  const elemIndex = cbSemantics.elementParams?.[0] ?? 0;

  return {
    order: discoveryOrder,
    form: "array-method",
    loc: scriptLoc,
    method: cbSemantics.label,
    call: callExpr,
    semantics: cbSemantics,
    iterated: iterExpr,
    body: isFunctionLiteral ? cbArg.body : cbArg,
    element: isFunctionLiteral ? cbArg.parameters[elemIndex]?.name : void 0,
    ...(isFunctionLiteral ? { callback: cbArg } : { callbackExpr: cbArg }),
  };
}

export function forOfCandidate(
  loopStmt: ts.ForOfStatement,
  discoveryOrder: number,
  scriptLoc: ScriptLoc,
): IterationCandidate {
  let boundElement: ts.BindingName | undefined;
  if (ts.isVariableDeclarationList(loopStmt.initializer)) {
    boundElement = loopStmt.initializer.declarations[0]?.name;
  }

  return {
    order: discoveryOrder,
    form: "for-of",
    loc: scriptLoc,
    iterated: loopStmt.expression,
    body: loopStmt.statement,
    element: boundElement,
  };
}

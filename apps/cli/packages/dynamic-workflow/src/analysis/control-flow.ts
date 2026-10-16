// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import {
  addOcc,
  cloneValue,
  collapse,
  mergeInto,
  provisionalFanoutId,
  type AbstractValue,
} from "./domain.js";
import { bindForInitializer } from "./assign.js";
import type { EvalContext, Evaluator } from "./taint.js";

// `for` clauses run for effect, then the body, all in one weak iteration.
export function visitForStatement(analysis: Evaluator, syntax: ts.ForStatement, frame: EvalContext): void {
  const init = syntax.initializer;
  if (init !== undefined) evaluateForInit(analysis, init, frame);
  const cond = syntax.condition;
  if (cond !== undefined) analysis.recordGuard(cond, analysis.evalExpr(cond, frame));
  const step = syntax.incrementor;
  if (step !== undefined) analysis.evalExpr(step, frame);
  analysis.visit(syntax.statement, frame);
}

function evaluateForInit(analysis: Evaluator, init: ts.ForInitializer, frame: EvalContext): void {
  if (ts.isVariableDeclarationList(init) === false) {
    analysis.evalExpr(init, frame);
    return;
  }
  init.declarations.forEach((decl) => {
    analysis.handleDeclaration(decl, frame);
  });
}

// `for await` stashes the iterated value at the expression start — the ordering
// walk's per-iteration barrier key. Promoted loops also stamp a fan-out label.
// Write-back reads the env slots the body actually mutated: later passes adopt
// the first object, and a destructured name keeps its own slot.
export function handleForOf(analysis: Evaluator, syntax: ts.ForOfStatement, frame: EvalContext): void {
  const cand = analysis.s.candByForOf.get(syntax);
  const iterated = collapse(analysis.evalExpr(syntax.expression, frame));
  if (syntax.awaitModifier !== undefined) {
    const at = syntax.expression.getStart(analysis.s.scriptFile);
    analysis.s.mergeSink(analysis.s.awaitVal, at, iterated);
  }
  const element = cloneValue(iterated);
  const regionStack = stampForOfRegion(analysis, cand, iterated, element, frame.regionStack);
  bindForInitializer(analysis, syntax.initializer, element, frame);
  analysis.visit(syntax.statement, { onReturn: frame.onReturn, regionStack });
  const collectionPlace = analysis.resolvePlace(syntax.expression);
  if (collectionPlace === undefined) return;
  pourFields(analysis, collectionPlace, element);
  symbolsBoundBy(analysis, syntax.initializer).forEach((sym) => {
    const slot = analysis.s.env.get(sym);
    if (slot !== undefined && slot !== collectionPlace) pourFields(analysis, collectionPlace, slot);
  });
}

function stampForOfRegion(
  analysis: Evaluator,
  cand: { order: number } | undefined,
  iterated: AbstractValue,
  element: AbstractValue,
  regionStack: string[],
): string[] {
  if (cand === undefined) return regionStack;
  if (analysis.s.promotedOrders.has(cand.order)) {
    const fanoutId = provisionalFanoutId(cand.order);
    analysis.s.mergeSink(analysis.s.fanoutInVal, fanoutId, iterated);
    addOcc(element, { exact: true, site: fanoutId });
  }
  return [...regionStack, `cand@${cand.order}`];
}

function pourFields(analysis: Evaluator, collection: AbstractValue, holder: AbstractValue): void {
  holder.fields.forEach((field) => {
    analysis.s.changed = mergeInto(collection, collapse(field)) || analysis.s.changed;
  });
}

function symbolsBoundBy(analysis: Evaluator, initializer: ts.ForInitializer): ts.Symbol[] {
  const found: ts.Symbol[] = [];
  if (ts.isVariableDeclarationList(initializer)) {
    const decl = initializer.declarations[0];
    if (decl !== undefined) collectBinding(analysis, decl.name, found);
    return found;
  }
  if (ts.isIdentifier(initializer)) pushSymbol(analysis, initializer, found);
  return found;
}

function collectBinding(analysis: Evaluator, name: ts.BindingName, found: ts.Symbol[]): void {
  const stack: ts.BindingName[] = [name];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    if (ts.isIdentifier(current)) {
      pushSymbol(analysis, current, found);
      continue;
    }
    const parts = current.elements;
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const part = parts[index];
      if (part !== undefined && ts.isBindingElement(part)) stack.push(part.name);
    }
  }
}

function pushSymbol(analysis: Evaluator, name: ts.Identifier, found: ts.Symbol[]): void {
  const sym = analysis.checker.getSymbolAtLocation(name);
  if (sym !== undefined) found.push(sym);
}

// for-in binds the collapsed object: enumerated key strings keep its taint.
export function handleForIn(analysis: Evaluator, syntax: ts.ForInStatement, frame: EvalContext): void {
  const keys = collapse(analysis.evalExpr(syntax.expression, frame));
  bindForInitializer(analysis, syntax.initializer, keys, frame);
  analysis.visit(syntax.statement, frame);
}

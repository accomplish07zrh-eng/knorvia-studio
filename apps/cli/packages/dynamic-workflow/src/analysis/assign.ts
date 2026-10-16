// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import {
  collapse,
  liveField,
  mergeInto,
  replayMayAliasWrite,
  staticIndexKey,
  unionValues,
  type AbstractValue,
} from "./domain.js";
import { type EvalContext, type Evaluator } from "./taint.js";

// Plain `=` aliases a place RHS. Compound ops stay weak: the target keeps its
// identity, and there is no kill of the prior value.

export function handleAssignment(
  analysis: Evaluator,
  syntax: ts.BinaryExpression,
  frame: EvalContext,
): AbstractValue {
  const value = analysis.evalExpr(syntax.right, frame);
  const rhsPlace = analysis.resolvePlace(syntax.right);
  const target = peelParens(syntax.left);
  const patterned = ts.isArrayLiteralExpression(target) || ts.isObjectLiteralExpression(target);
  if (patterned) bindAssignmentPattern(analysis, target, value, frame, rhsPlace);
  else writeTarget(analysis, target, value, frame, rhsPlace);
  return value;
}

export function handleCompoundAssignment(
  analysis: Evaluator,
  syntax: ts.BinaryExpression,
  frame: EvalContext,
): AbstractValue {
  const rhs = analysis.evalExpr(syntax.right, frame);
  const prior = analysis.evalExpr(syntax.left, frame);
  writeTarget(analysis, peelParens(syntax.left), rhs, frame);
  return unionValues(prior, rhs);
}

function writeTarget(
  analysis: Evaluator,
  target: ts.Expression,
  value: AbstractValue,
  frame: EvalContext,
  rhsPlace?: AbstractValue,
): void {
  switch (target.kind) {
    case ts.SyntaxKind.Identifier:
      bindIdentifier(analysis, target as ts.Identifier, value, rhsPlace);
      return;
    case ts.SyntaxKind.PropertyAccessExpression:
      writeProperty(analysis, target as ts.PropertyAccessExpression, value, rhsPlace);
      return;
    case ts.SyntaxKind.ElementAccessExpression:
      writeElement(analysis, target as ts.ElementAccessExpression, value, frame, rhsPlace);
      return;
    default:
      return;
  }
}

function bindIdentifier(
  analysis: Evaluator,
  target: ts.Identifier,
  value: AbstractValue,
  rhsPlace?: AbstractValue,
): void {
  const sym = analysis.checker.getSymbolAtLocation(target);
  if (sym === undefined) return;
  analysis.s.bindSymbol(sym, rhsPlace ?? value);
}

function writeProperty(
  analysis: Evaluator,
  target: ts.PropertyAccessExpression,
  value: AbstractValue,
  rhsPlace?: AbstractValue,
): void {
  const recv = analysis.resolvePlace(target.expression, true);
  const key = target.name.text;
  if (recv === undefined) mergeIntoRootIdentifier(analysis, target.expression, value);
  else writeField(analysis, recv, key, value, rhsPlace);
  recordSetterWrite(analysis, key, value);
}

function writeElement(
  analysis: Evaluator,
  target: ts.ElementAccessExpression,
  value: AbstractValue,
  frame: EvalContext,
  rhsPlace?: AbstractValue,
): void {
  const key = staticIndexKey(target.argumentExpression);
  const recv = analysis.resolvePlace(target.expression, true);
  if (key !== undefined) {
    if (recv === undefined) mergeIntoRootIdentifier(analysis, target.expression, value);
    else writeField(analysis, recv, key, value, rhsPlace);
    return;
  }
  // A computed key is an observable property name, so its taint joins the container.
  // The key expression still runs: a sink can sit inside it.
  const keyTaint = collapse(analysis.evalExpr(target.argumentExpression, frame));
  if (recv === undefined) {
    mergeIntoRootIdentifier(analysis, target.expression, keyTaint);
    mergeIntoRootIdentifier(analysis, target.expression, value);
    return;
  }
  analysis.s.changed = mergeInto(recv, keyTaint) || analysis.s.changed;
  analysis.s.changed = mergeInto(recv, collapse(value)) || analysis.s.changed;
}

function writeField(
  analysis: Evaluator,
  container: AbstractValue,
  key: string,
  value: AbstractValue,
  rhsPlace?: AbstractValue,
): void {
  const stored = rhsPlace ?? value;
  if (rhsPlace !== undefined && container.fields.has(key) === false) {
    container.fields.set(key, rhsPlace);
    analysis.s.changed = true;
    return;
  }
  const field = liveField(container, key);
  if (field !== stored) analysis.s.changed = mergeInto(field, stored) || analysis.s.changed;
  // An earlier guarded write may already have filled this slot. Merge that
  // material back onto the place so re-pointing does not strand it.
  if (rhsPlace !== undefined && field !== rhsPlace) {
    analysis.s.changed = mergeInto(rhsPlace, field) || analysis.s.changed;
  }
  analysis.s.changed = replayMayAliasWrite(container, key, stored) || analysis.s.changed;
}

function recordSetterWrite(analysis: Evaluator, name: string, value: AbstractValue): void {
  const setters = analysis.s.settersByProp.get(name);
  if (setters === undefined) return;
  const actual = collapse(value);
  setters.forEach((id) => {
    analysis.s.addParamActual(id, 0, actual);
  });
}

function bindAssignmentPattern(
  analysis: Evaluator,
  target: ts.Expression,
  value: AbstractValue,
  frame: EvalContext,
  sourcePlace?: AbstractValue,
): void {
  if (ts.isArrayLiteralExpression(target)) {
    bindArrayPattern(analysis, target, value, frame, sourcePlace);
    return;
  }
  if (ts.isObjectLiteralExpression(target)) bindObjectPattern(analysis, target, value, frame, sourcePlace);
}

function bindArrayPattern(
  analysis: Evaluator,
  target: ts.ArrayLiteralExpression,
  value: AbstractValue,
  frame: EvalContext,
  sourcePlace?: AbstractValue,
): void {
  let slot = 0;
  target.elements.forEach((element) => {
    if (ts.isOmittedExpression(element)) {
      slot += 1;
      return;
    }
    if (ts.isSpreadElement(element)) {
      bindAssignmentTarget(analysis, element.expression, collapse(value), frame);
      return;
    }
    const key = String(slot);
    slot += 1;
    if (sourcePlace === undefined) {
      bindAssignmentTarget(analysis, element, analysis.selectField(value, key), frame);
      return;
    }
    const field = analysis.extractField(sourcePlace, key);
    bindAssignmentTarget(analysis, element, field, frame, field);
  });
}

function bindObjectPattern(
  analysis: Evaluator,
  target: ts.ObjectLiteralExpression,
  value: AbstractValue,
  frame: EvalContext,
  sourcePlace?: AbstractValue,
): void {
  target.properties.forEach((prop) => {
    switch (prop.kind) {
      case ts.SyntaxKind.SpreadAssignment:
        bindAssignmentTarget(analysis, (prop as ts.SpreadAssignment).expression, collapse(value), frame);
        return;
      case ts.SyntaxKind.ShorthandPropertyAssignment:
        bindShorthand(analysis, prop as ts.ShorthandPropertyAssignment, value, frame, sourcePlace);
        return;
      case ts.SyntaxKind.PropertyAssignment:
        bindNamedProperty(analysis, prop as ts.PropertyAssignment, value, frame, sourcePlace);
        return;
      default:
        return;
    }
  });
}

function bindShorthand(
  analysis: Evaluator,
  prop: ts.ShorthandPropertyAssignment,
  value: AbstractValue,
  frame: EvalContext,
  sourcePlace?: AbstractValue,
): void {
  const key = prop.name.text;
  const fallback = prop.objectAssignmentInitializer;
  if (sourcePlace !== undefined) {
    const field = analysis.extractField(sourcePlace, key);
    if (fallback !== undefined) {
      analysis.s.changed = mergeInto(field, analysis.evalExpr(fallback, frame)) || analysis.s.changed;
    }
    writeTarget(analysis, prop.name, field, frame, field);
    return;
  }
  const selected = analysis.selectField(value, key);
  const elemValue =
    fallback === undefined ? selected : unionValues(selected, analysis.evalExpr(fallback, frame));
  writeTarget(analysis, prop.name, elemValue, frame);
}

function bindNamedProperty(
  analysis: Evaluator,
  prop: ts.PropertyAssignment,
  value: AbstractValue,
  frame: EvalContext,
  sourcePlace?: AbstractValue,
): void {
  if (ts.isComputedPropertyName(prop.name)) {
    bindAssignmentTarget(analysis, prop.initializer, collapse(value), frame);
    return;
  }
  const key = prop.name.getText(analysis.s.scriptFile);
  if (sourcePlace === undefined) {
    bindAssignmentTarget(analysis, prop.initializer, analysis.selectField(value, key), frame);
    return;
  }
  const field = analysis.extractField(sourcePlace, key);
  bindAssignmentTarget(analysis, prop.initializer, field, frame, field);
}

export function bindForInitializer(
  analysis: Evaluator,
  initializer: ts.ForInitializer,
  value: AbstractValue,
  frame: EvalContext,
): void {
  if (ts.isVariableDeclarationList(initializer)) {
    const decl = initializer.declarations[0];
    if (decl !== undefined) analysis.bindPattern(decl.name, value, frame);
    return;
  }
  bindAssignmentTarget(analysis, initializer, value, frame);
}

function bindAssignmentTarget(
  analysis: Evaluator,
  target: ts.Expression,
  value: AbstractValue,
  frame: EvalContext,
  sourcePlace?: AbstractValue,
): void {
  let current = peelParens(target);
  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    const fallback = analysis.evalExpr(current.right, frame);
    if (sourcePlace === undefined) value = unionValues(value, fallback);
    else analysis.s.changed = mergeInto(value, fallback) || analysis.s.changed;
    current = peelParens(current.left);
  }
  if (ts.isArrayLiteralExpression(current) || ts.isObjectLiteralExpression(current)) {
    bindAssignmentPattern(analysis, current, value, frame, sourcePlace);
    return;
  }
  writeTarget(analysis, current, value, frame, sourcePlace);
}

// Unresolvable member chains fold into the root identifier rather than dropping the write.
export function mergeIntoRootIdentifier(
  analysis: Evaluator,
  expr: ts.Expression,
  value: AbstractValue,
): void {
  const root = unwrapChain(expr);
  if (ts.isIdentifier(root) === false) return;
  const sym = analysis.checker.getSymbolAtLocation(root);
  if (sym === undefined) return;
  analysis.s.changed = mergeInto(analysis.s.envSlot(sym), collapse(value)) || analysis.s.changed;
}

function unwrapChain(expr: ts.Expression): ts.Expression {
  switch (expr.kind) {
    case ts.SyntaxKind.ParenthesizedExpression:
    case ts.SyntaxKind.PropertyAccessExpression:
    case ts.SyntaxKind.ElementAccessExpression:
    case ts.SyntaxKind.NonNullExpression:
    case ts.SyntaxKind.AsExpression:
    case ts.SyntaxKind.SatisfiesExpression:
    case ts.SyntaxKind.TypeAssertionExpression:
      return unwrapChain((expr as unknown as { expression: ts.Expression }).expression);
    default:
      return expr;
  }
}

function peelParens(expr: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(expr) ? peelParens(expr.expression) : expr;
}

// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import {
  adoptFields,
  cloneValue,
  collapseInto,
  emptyValue,
  mergeInto,
  type AbstractValue,
} from "./domain.js";
import type { EvalContext, Evaluator } from "./taint.js";

/**
 * Field-sensitive container literals. A place element is stored live (shared object).
 * The value returned here is fresh for this pass; `literalPlaceOf` adopts it on first
 * sight and merges later passes. These functions therefore never touch `ev.s.changed`.
 */

export function evalArrayLiteral(
  ev: Evaluator,
  node: ts.ArrayLiteralExpression,
  ctx: EvalContext,
): AbstractValue {
  const out = emptyValue();
  if (arrayHasSpread(node)) return foldSpreadArray(ev, node, ctx, out);
  let index = 0;
  while (index < node.elements.length) {
    const el = node.elements[index];
    if (el !== undefined) out.fields.set(String(index), fieldValue(ev, el, ctx));
    index += 1;
  }
  return out;
}

export function evalObjectLiteral(
  ev: Evaluator,
  node: ts.ObjectLiteralExpression,
  ctx: EvalContext,
): AbstractValue {
  const out = emptyValue();
  let index = 0;
  while (index < node.properties.length) {
    const prop = node.properties[index];
    index += 1;
    if (prop !== undefined) absorbProperty(ev, out, prop, ctx);
  }
  return out;
}

function arrayHasSpread(node: ts.ArrayLiteralExpression): boolean {
  let index = 0;
  while (index < node.elements.length) {
    const el = node.elements[index];
    index += 1;
    if (el !== undefined && ts.isSpreadElement(el)) return true;
  }
  return false;
}

function foldSpreadArray(
  ev: Evaluator,
  node: ts.ArrayLiteralExpression,
  ctx: EvalContext,
  out: AbstractValue,
): AbstractValue {
  // A lone `[...place]` shares each numeric field object with the source. Any other
  // spread shape folds by value; reference sharing is not modeled there.
  const sole = node.elements[0];
  if (
    node.elements.length === 1 &&
    sole !== undefined &&
    ts.isSpreadElement(sole) &&
    spreadShare(ev, out, sole.expression)
  ) {
    return out;
  }
  let index = 0;
  while (index < node.elements.length) {
    const el = node.elements[index];
    index += 1;
    if (el !== undefined) collapseInto(out, ev.evalExpr(el, ctx));
  }
  return out;
}

function absorbProperty(
  ev: Evaluator,
  out: AbstractValue,
  prop: ts.ObjectLiteralElementLike,
  ctx: EvalContext,
): void {
  switch (prop.kind) {
    case ts.SyntaxKind.PropertyAssignment:
      takeProperty(ev, out, prop, ctx);
      return;
    case ts.SyntaxKind.ShorthandPropertyAssignment:
      takeShorthand(ev, out, prop);
      return;
    case ts.SyntaxKind.SpreadAssignment:
      takeSpread(ev, out, prop, ctx);
      return;
    case ts.SyntaxKind.MethodDeclaration:
      takeMethod(ev, out, prop, ctx);
      return;
    case ts.SyntaxKind.GetAccessor:
      takeGetter(ev, out, prop, ctx);
      return;
    case ts.SyntaxKind.SetAccessor:
      takeSetterKey(ev, out, prop, ctx);
      return;
    default:
      return;
  }
}

function takeProperty(
  ev: Evaluator,
  out: AbstractValue,
  prop: ts.PropertyAssignment,
  ctx: EvalContext,
): void {
  if (ts.isComputedPropertyName(prop.name)) {
    // The key expression can host a sink, and the key string is an observable name.
    collapseInto(out, ev.evalExpr(prop.name.expression, ctx));
    collapseInto(out, ev.evalExpr(prop.initializer, ctx));
    return;
  }
  out.fields.set(prop.name.getText(ev.s.scriptFile), fieldValue(ev, prop.initializer, ctx));
}

function takeShorthand(
  ev: Evaluator,
  out: AbstractValue,
  prop: ts.ShorthandPropertyAssignment,
): void {
  // The value symbol, not the property symbol. The property symbol would mint an empty slot
  // and drop the local's taint at the literal.
  const sym = ev.checker.getShorthandAssignmentValueSymbol(prop);
  const stored = sym === undefined ? emptyValue() : ev.s.envSlot(sym);
  out.fields.set(prop.name.text, stored);
}

function takeSpread(
  ev: Evaluator,
  out: AbstractValue,
  prop: ts.SpreadAssignment,
  ctx: EvalContext,
): void {
  if (spreadShare(ev, out, prop.expression)) return;
  mergeInto(out, ev.evalExpr(prop.expression, ctx));
}

function takeMethod(
  ev: Evaluator,
  out: AbstractValue,
  prop: ts.MethodDeclaration,
  ctx: EvalContext,
): void {
  if (ts.isComputedPropertyName(prop.name)) {
    collapseInto(out, ev.evalExpr(prop.name.expression, ctx));
    return;
  }
  const fnVal = emptyValue();
  fnVal.fns.add(prop);
  out.fields.set(prop.name.getText(ev.s.scriptFile), fnVal);
}

function takeGetter(
  ev: Evaluator,
  out: AbstractValue,
  prop: ts.GetAccessorDeclaration,
  ctx: EvalContext,
): void {
  if (ts.isComputedPropertyName(prop.name)) {
    collapseInto(out, ev.evalExpr(prop.name.expression, ctx));
    return;
  }
  const id = ev.s.fnId.get(prop);
  const summary = id === undefined ? emptyValue() : cloneValue(ev.s.summaryOf(id));
  out.fields.set(prop.name.getText(ev.s.scriptFile), summary);
}

function takeSetterKey(
  ev: Evaluator,
  out: AbstractValue,
  prop: ts.SetAccessorDeclaration,
  ctx: EvalContext,
): void {
  // A non-computed setter has no read value; writes are fed through settersByProp.
  if (!ts.isComputedPropertyName(prop.name)) return;
  collapseInto(out, ev.evalExpr(prop.name.expression, ctx));
}

function fieldValue(ev: Evaluator, expr: ts.Expression, ctx: EvalContext): AbstractValue {
  const place = ev.resolvePlace(expr);
  if (place !== undefined) return place;
  return ev.evalExpr(expr, ctx);
}

/**
 * If `expr` is a place, share its field objects and merge container-level labels.
 * Do not raise `changed` here. `adoptFields` can weak-merge into the persistent source
 * without reporting; that extra label stays until a later pass touches the source
 * through a path that does report growth. Reporting here would spin the fixpoint,
 * because this fresh literal is merged into its place on every pass.
 */
function spreadShare(ev: Evaluator, out: AbstractValue, expr: ts.Expression): boolean {
  const place = ev.resolvePlace(expr);
  if (place === undefined) return false;
  adoptFields(out, place);
  mergeInto(out, place);
  return true;
}

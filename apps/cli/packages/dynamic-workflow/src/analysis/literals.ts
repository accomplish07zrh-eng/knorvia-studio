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

// A container literal is field-sensitive. A place element stores the live value it
// denotes, and a spread copies the source's fields by reference. Both builders return
// a fresh value for this pass. The evaluator stores it with literalPlaceOf, which
// adopts it on first sight and merges later passes. These functions do not touch
// `changed`; the persistent place raises that signal.

type ObjProp = ts.ObjectLiteralElementLike;
type PropKind = "prop" | "computed-prop" | "shorthand" | "spread" | "method" | "computed-member" | "getter" | "skip";

function propKind(prop: ObjProp): PropKind {
  if (ts.isSpreadAssignment(prop)) return "spread";
  if (ts.isShorthandPropertyAssignment(prop)) return "shorthand";
  if (ts.isPropertyAssignment(prop)) return ts.isComputedPropertyName(prop.name) ? "computed-prop" : "prop";
  if (ts.isMethodDeclaration(prop)) return ts.isComputedPropertyName(prop.name) ? "computed-member" : "method";
  if (ts.isGetAccessorDeclaration(prop)) return ts.isComputedPropertyName(prop.name) ? "computed-member" : "getter";
  if (ts.isSetAccessorDeclaration(prop) && ts.isComputedPropertyName(prop.name)) return "computed-member";
  return "skip";
}

function storedValue(ev: Evaluator, expr: ts.Expression, ctx: EvalContext): AbstractValue {
  return ev.resolvePlace(expr) ?? ev.evalExpr(expr, ctx);
}

// If `expr` is a place, share its field objects and merge container-level labels.
// Growth of a colliding field is not reported here: reporting it would spin the
// fixpoint, and the overwritten value is only an over-approximation that a later
// reporting path still observes.
function shareSpread(ev: Evaluator, out: AbstractValue, expr: ts.Expression): boolean {
  const place = ev.resolvePlace(expr);
  if (place === undefined) return false;
  adoptFields(out, place);
  mergeInto(out, place);
  return true;
}

function nameText(ev: Evaluator, name: ts.PropertyName): string {
  return name.getText(ev.s.scriptFile);
}

class ObjectLiteral {
  constructor(
    private readonly ev: Evaluator,
    private readonly ctx: EvalContext,
    private readonly out = emptyValue(),
  ) {}

  build(node: ts.ObjectLiteralExpression): AbstractValue {
    for (const prop of node.properties) this.one(prop);
    return this.out;
  }

  private one(prop: ObjProp): void {
    const kind = propKind(prop);
    const handler = this.handlers[kind];
    handler(prop);
  }

  private readonly handlers: Record<PropKind, (prop: ObjProp) => void> = {
    prop: (prop) => this.named(prop as ts.PropertyAssignment),
    "computed-prop": (prop) => this.computedProp(prop as ts.PropertyAssignment),
    shorthand: (prop) => this.shorthand(prop as ts.ShorthandPropertyAssignment),
    spread: (prop) => this.spread(prop as ts.SpreadAssignment),
    method: (prop) => this.method(prop as ts.MethodDeclaration),
    getter: (prop) => this.getter(prop as ts.GetAccessorDeclaration),
    "computed-member": (prop) => this.computedKey(prop),
    skip: () => undefined,
  };

  private named(prop: ts.PropertyAssignment): void {
    this.out.fields.set(nameText(this.ev, prop.name), storedValue(this.ev, prop.initializer, this.ctx));
  }

  // A computed key cannot be a tracked field. The key expression can host a facade
  // and its string becomes an observable property name, so both the key and the
  // value fold into the object's labels.
  private computedProp(prop: ts.PropertyAssignment): void {
    if (!ts.isComputedPropertyName(prop.name)) return;
    this.foldKey(prop.name);
    collapseInto(this.out, this.ev.evalExpr(prop.initializer, this.ctx));
  }

  // `{ o }` stores o's live slot. getSymbolAtLocation(prop.name) is the property
  // symbol, not the referenced local, so the value symbol is the shorthand API.
  private shorthand(prop: ts.ShorthandPropertyAssignment): void {
    const sym = this.ev.checker.getShorthandAssignmentValueSymbol(prop);
    const value = sym === undefined ? emptyValue() : this.ev.s.envSlot(sym);
    this.out.fields.set(prop.name.text, value);
  }

  private spread(prop: ts.SpreadAssignment): void {
    if (shareSpread(this.ev, this.out, prop.expression)) return;
    mergeInto(this.out, this.ev.evalExpr(prop.expression, this.ctx));
  }

  private method(prop: ts.MethodDeclaration): void {
    const fnVal = emptyValue();
    fnVal.fns.add(prop);
    this.out.fields.set(nameText(this.ev, prop.name), fnVal);
  }

  // The field's read value is the getter's return summary, re-read each pass.
  private getter(prop: ts.GetAccessorDeclaration): void {
    const id = this.ev.s.fnId.get(prop);
    const summary = id === undefined ? emptyValue() : cloneValue(this.ev.s.summaryOf(id));
    this.out.fields.set(nameText(this.ev, prop.name), summary);
  }

  // Computed method or accessor name. The member value cannot be tracked under a
  // dynamic key. Set accessors carry no read value; their writes are global.
  private computedKey(prop: ObjProp): void {
    if (!ts.isMethodDeclaration(prop) && !ts.isGetAccessorDeclaration(prop) && !ts.isSetAccessorDeclaration(prop)) return;
    if (!ts.isComputedPropertyName(prop.name)) return;
    this.foldKey(prop.name);
  }

  private foldKey(name: ts.ComputedPropertyName): void {
    collapseInto(this.out, this.ev.evalExpr(name.expression, this.ctx));
  }
}

class ArrayLiteral {
  constructor(
    private readonly ev: Evaluator,
    private readonly ctx: EvalContext,
    private readonly out = emptyValue(),
  ) {}

  build(node: ts.ArrayLiteralExpression): AbstractValue {
    const spread = node.elements.some((el) => ts.isSpreadElement(el));
    if (!spread) {
      node.elements.forEach((el, index) => {
        this.out.fields.set(String(index), storedValue(this.ev, el, this.ctx));
      });
      return this.out;
    }
    // A lone `[...xs]` of a place shares numeric element references. Any other
    // spread shape folds by value; sharing is not modeled there.
    if (this.soleShare(node)) return this.out;
    for (const el of node.elements) collapseInto(this.out, this.ev.evalExpr(el, this.ctx));
    return this.out;
  }

  private soleShare(node: ts.ArrayLiteralExpression): boolean {
    const sole = node.elements.length === 1 ? node.elements[0] : undefined;
    if (sole === undefined || !ts.isSpreadElement(sole)) return false;
    return shareSpread(this.ev, this.out, sole.expression);
  }
}

export function evalArrayLiteral(ev: Evaluator, node: ts.ArrayLiteralExpression, ctx: EvalContext): AbstractValue {
  return new ArrayLiteral(ev, ctx).build(node);
}

export function evalObjectLiteral(ev: Evaluator, node: ts.ObjectLiteralExpression, ctx: EvalContext): AbstractValue {
  return new ObjectLiteral(ev, ctx).build(node);
}

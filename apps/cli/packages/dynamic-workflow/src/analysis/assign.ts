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

// Plain `=`, compound and logical assignments, and destructuring assignment
// expressions. A place on the right is shared, not snapshotted, so a later write
// through either name is visible through both. Compound forms have no kills: the
// previous value stays and the expression yields the union of that value and the
// right-hand side. These builders do not own the lattice; they only route writes.

const PAREN_ONLY = new Set<ts.SyntaxKind>([ts.SyntaxKind.ParenthesizedExpression]);

// Wrappers that still denote the same lvalue. Comma expressions are not peeled:
// a comma is a value, not an alias of its left operand.
const UNWRAP_LVALUE = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.PropertyAccessExpression,
  ts.SyntaxKind.ElementAccessExpression,
  ts.SyntaxKind.NonNullExpression,
  ts.SyntaxKind.AsExpression,
  ts.SyntaxKind.SatisfiesExpression,
  ts.SyntaxKind.TypeAssertionExpression,
]);

function childExpr(expr: ts.Expression): ts.Expression {
  return (expr as ts.ParenthesizedExpression).expression;
}

function strip(expr: ts.Expression, kinds: ReadonlySet<ts.SyntaxKind>): ts.Expression {
  return kinds.has(expr.kind) ? strip(childExpr(expr), kinds) : expr;
}

function stripParens(expr: ts.Expression): ts.Expression {
  return strip(expr, PAREN_ONLY);
}

function note(ev: Evaluator, grew: boolean): void {
  if (grew) ev.s.changed = true;
}

function isBindingPattern(expr: ts.Expression): expr is ts.ArrayLiteralExpression | ts.ObjectLiteralExpression {
  return ts.isArrayLiteralExpression(expr) || ts.isObjectLiteralExpression(expr);
}

class TargetWriter {
  constructor(
    private readonly ev: Evaluator,
    private readonly ctx: EvalContext,
  ) {}

  write(target: ts.Expression, value: AbstractValue, rhsPlace?: AbstractValue): void {
    const node = stripParens(target);
    if (ts.isIdentifier(node)) this.bindName(node, rhsPlace ?? value);
    else if (ts.isPropertyAccessExpression(node)) this.writeProperty(node, value, rhsPlace);
    else if (ts.isElementAccessExpression(node)) this.writeElement(node, value, rhsPlace);
  }

  private bindName(name: ts.Identifier, bound: AbstractValue): void {
    const sym = this.ev.checker.getSymbolAtLocation(name);
    if (sym !== undefined) this.ev.s.bindSymbol(sym, bound);
  }

  private writeProperty(target: ts.PropertyAccessExpression, value: AbstractValue, rhsPlace?: AbstractValue): void {
    const recv = this.ev.resolvePlace(target.expression, true);
    const name = target.name.text;
    if (recv === undefined) mergeIntoRootIdentifier(this.ev, target.expression, value);
    else this.writeField(recv, name, value, rhsPlace);
    // Set accessors are indexed only by property name. Element writes do not
    // reach them. The receiver object is ignored: any write of this name feeds
    // every setter's first parameter.
    this.recordSetter(name, value);
  }

  private writeElement(target: ts.ElementAccessExpression, value: AbstractValue, rhsPlace?: AbstractValue): void {
    const recv = this.ev.resolvePlace(target.expression, true);
    const literalKey = staticIndexKey(target.argumentExpression);
    if (literalKey === undefined) this.writeDynamicIndex(target, recv, value);
    else if (recv === undefined) mergeIntoRootIdentifier(this.ev, target.expression, value);
    else this.writeField(recv, literalKey, value, rhsPlace);
  }

  // A computed key can host a facade (`o[await ask()] = v`). The key string is
  // also an observable property name (`for..in`, `Object.keys`), so its taint
  // joins the container beside the written value.
  private writeDynamicIndex(target: ts.ElementAccessExpression, recv: AbstractValue | undefined, value: AbstractValue): void {
    const keyTaint = collapse(this.ev.evalExpr(target.argumentExpression, this.ctx));
    const smeared = collapse(value);
    if (recv === undefined) {
      mergeIntoRootIdentifier(this.ev, target.expression, keyTaint);
      mergeIntoRootIdentifier(this.ev, target.expression, value);
    } else {
      note(this.ev, mergeInto(recv, keyTaint));
      note(this.ev, mergeInto(recv, smeared));
    }
  }

  // A fresh slot adopts a place by reference and stops. Replaying may-alias on
  // that path would treat a brand-new alias as a write into every candidate.
  // An existing slot is weak-merged, and the place is merged back so a slot
  // fabricated earlier in a loop (`wrap.box.f = t` then `wrap.box = box`) is
  // not stranded. May-alias targets then receive the write inexactly.
  private writeField(container: AbstractValue, key: string, value: AbstractValue, rhsPlace?: AbstractValue): void {
    const incoming = rhsPlace ?? value;
    const occupied = container.fields.has(key);
    if (rhsPlace !== undefined && occupied === false) {
      container.fields.set(key, incoming);
      this.ev.s.changed = true;
    } else {
      this.mergeSlot(container, key, incoming, rhsPlace);
    }
  }

  private mergeSlot(container: AbstractValue, key: string, incoming: AbstractValue, rhsPlace?: AbstractValue): void {
    const slot = liveField(container, key);
    if (slot !== incoming) note(this.ev, mergeInto(slot, incoming));
    if (rhsPlace !== undefined && slot !== rhsPlace) note(this.ev, mergeInto(rhsPlace, slot));
    note(this.ev, replayMayAliasWrite(container, key, incoming));
  }

  private recordSetter(name: string, value: AbstractValue): void {
    const ids = this.ev.s.settersByProp.get(name);
    const payload = collapse(value);
    ids?.forEach((id) => this.ev.s.addParamActual(id, 0, payload));
  }
}

interface IndexCursor {
  pos: number;
}

class PatternBinder {
  constructor(
    private readonly ev: Evaluator,
    private readonly ctx: EvalContext,
  ) {}

  bind(target: ts.Expression, value: AbstractValue, sourcePlace?: AbstractValue): void {
    let node = stripParens(target);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      value = this.withDefault(node, value, sourcePlace);
      node = stripParens(node.left);
    }
    if (isBindingPattern(node)) this.pattern(node, value, sourcePlace);
    else new TargetWriter(this.ev, this.ctx).write(node, value, sourcePlace);
  }

  pattern(target: ts.Expression, value: AbstractValue, sourcePlace?: AbstractValue): void {
    if (ts.isArrayLiteralExpression(target)) this.arrayPattern(target, value, sourcePlace);
    else if (ts.isObjectLiteralExpression(target)) this.objectPattern(target, value, sourcePlace);
  }

  private arrayPattern(target: ts.ArrayLiteralExpression, value: AbstractValue, sourcePlace?: AbstractValue): void {
    const cursor: IndexCursor = { pos: 0 };
    target.elements.forEach((element) => this.arrayHole(element, value, sourcePlace, cursor));
  }

  // A hole consumes an index. A rest element does not: the runtime rest starts
  // at the current index, and a later element (illegal in real JS, still in the
  // tree) keeps reading that same index. Place sources alias the live field;
  // everything else copies a value.
  private arrayHole(element: ts.Expression, value: AbstractValue, sourcePlace: AbstractValue | undefined, cursor: IndexCursor): void {
    const kind = element.kind;
    if (kind === ts.SyntaxKind.OmittedExpression) {
      cursor.pos += 1;
    } else if (kind === ts.SyntaxKind.SpreadElement) {
      this.bind((element as ts.SpreadElement).expression, collapse(value));
    } else {
      this.take(element, value, sourcePlace, String(cursor.pos));
      cursor.pos += 1;
    }
  }

  private objectPattern(target: ts.ObjectLiteralExpression, value: AbstractValue, sourcePlace?: AbstractValue): void {
    for (const prop of target.properties) this.objectProp(prop, value, sourcePlace);
  }

  private objectProp(prop: ts.ObjectLiteralElementLike, value: AbstractValue, sourcePlace?: AbstractValue): void {
    const kind = prop.kind;
    if (kind === ts.SyntaxKind.SpreadAssignment) {
      this.bind((prop as ts.SpreadAssignment).expression, collapse(value));
    } else if (kind === ts.SyntaxKind.ShorthandPropertyAssignment) {
      this.shorthand(prop as ts.ShorthandPropertyAssignment, value, sourcePlace);
    } else if (kind === ts.SyntaxKind.PropertyAssignment) {
      this.namedProp(prop as ts.PropertyAssignment, value, sourcePlace);
    }
  }

  private namedProp(prop: ts.PropertyAssignment, value: AbstractValue, sourcePlace?: AbstractValue): void {
    if (ts.isComputedPropertyName(prop.name)) this.bind(prop.initializer, collapse(value));
    else this.take(prop.initializer, value, sourcePlace, prop.name.getText(this.ev.s.scriptFile));
  }

  private take(target: ts.Expression, value: AbstractValue, sourcePlace: AbstractValue | undefined, key: string): void {
    const field = sourcePlace === undefined ? undefined : this.ev.extractField(sourcePlace, key);
    if (field === undefined) this.bind(target, this.ev.selectField(value, key));
    else this.bind(target, field, field);
  }

  // `{ x = d }` on a place merges the default into the live field and keeps the
  // alias. Without a place the default is joined by value.
  private shorthand(prop: ts.ShorthandPropertyAssignment, value: AbstractValue, sourcePlace?: AbstractValue): void {
    const key = prop.name.text;
    const fallback = prop.objectAssignmentInitializer;
    const writer = new TargetWriter(this.ev, this.ctx);
    if (sourcePlace) {
      const field = this.ev.extractField(sourcePlace, key);
      if (fallback) note(this.ev, mergeInto(field, this.ev.evalExpr(fallback, this.ctx)));
      writer.write(prop.name, field, field);
    } else {
      const base = this.ev.selectField(value, key);
      const chosen = fallback === undefined ? base : unionValues(base, this.ev.evalExpr(fallback, this.ctx));
      writer.write(prop.name, chosen);
    }
  }

  // `[a = d]` / `{ x: a = d }`. When aliasing, `carried` is the live field, so
  // the default merges into it and the alias stays.
  private withDefault(node: ts.BinaryExpression, carried: AbstractValue, sourcePlace?: AbstractValue): AbstractValue {
    const fallback = this.ev.evalExpr(node.right, this.ctx);
    if (sourcePlace === undefined) return unionValues(carried, fallback);
    note(this.ev, mergeInto(carried, fallback));
    return carried;
  }
}

class AssignTransfer {
  constructor(
    private readonly ev: Evaluator,
    private readonly ctx: EvalContext,
  ) {}

  plain(node: ts.BinaryExpression): AbstractValue {
    const written = this.ev.evalExpr(node.right, this.ctx);
    const alias = this.ev.resolvePlace(node.right);
    const left = stripParens(node.left);
    if (isBindingPattern(left)) new PatternBinder(this.ev, this.ctx).pattern(left, written, alias);
    else new TargetWriter(this.ev, this.ctx).write(left, written, alias);
    return written;
  }

  // Read-modify-write keeps the target's identity: the right-hand side is merged,
  // never adopted as a place.
  compound(node: ts.BinaryExpression): AbstractValue {
    const incoming = this.ev.evalExpr(node.right, this.ctx);
    const before = this.ev.evalExpr(node.left, this.ctx);
    new TargetWriter(this.ev, this.ctx).write(stripParens(node.left), incoming);
    return unionValues(before, incoming);
  }
}

export function handleAssignment(ev: Evaluator, node: ts.BinaryExpression, ctx: EvalContext): AbstractValue {
  return new AssignTransfer(ev, ctx).plain(node);
}

export function handleCompoundAssignment(ev: Evaluator, node: ts.BinaryExpression, ctx: EvalContext): AbstractValue {
  return new AssignTransfer(ev, ctx).compound(node);
}

// `for (const k of xs)` is a declaration and uses bindPattern. `for (k of xs)`
// and a destructuring assignment target use the expression binder. The loop
// value is derived, so there is no aliasing place.
export function bindForInitializer(ev: Evaluator, initializer: ts.ForInitializer, value: AbstractValue, ctx: EvalContext): void {
  if (ts.isVariableDeclarationList(initializer)) {
    const head = initializer.declarations.at(0);
    if (head) ev.bindPattern(head.name, value, ctx);
  } else {
    new PatternBinder(ev, ctx).bind(initializer, value);
  }
}

// Fold a member-access chain into its leftmost identifier. A nested target whose
// receiver cannot be resolved used to drop the written taint. The root slot is a
// field-insensitive over-approximation, which is preferred to dropping the flow.
// A chain rooted in a call still has no slot: function returns are summaries.
export function mergeIntoRootIdentifier(ev: Evaluator, expr: ts.Expression, value: AbstractValue): void {
  const root = strip(expr, UNWRAP_LVALUE);
  if (ts.isIdentifier(root) === false) return;
  const sym = ev.checker.getSymbolAtLocation(root);
  if (sym === undefined) return;
  note(ev, mergeInto(ev.s.envSlot(sym), collapse(value)));
}

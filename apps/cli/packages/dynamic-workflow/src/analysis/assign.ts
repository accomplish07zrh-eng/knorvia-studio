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

type BindingPattern = ts.ArrayLiteralExpression | ts.ObjectLiteralExpression;

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

function isBindingPattern(expr: ts.Expression): expr is BindingPattern {
  return ts.isArrayLiteralExpression(expr) || ts.isObjectLiteralExpression(expr);
}

interface TargetWrite {
  target: ts.Expression;
  value: AbstractValue;
  place?: AbstractValue;
}

interface PropWrite {
  target: ts.PropertyAccessExpression;
  value: AbstractValue;
  place?: AbstractValue;
}

interface ElemWrite {
  target: ts.ElementAccessExpression;
  value: AbstractValue;
  place?: AbstractValue;
}

interface DynamicWrite {
  target: ts.ElementAccessExpression;
  recv: AbstractValue | undefined;
  value: AbstractValue;
}

interface FieldWrite {
  container: AbstractValue;
  key: string;
  value: AbstractValue;
  place?: AbstractValue;
}

interface SlotWrite {
  container: AbstractValue;
  key: string;
  incoming: AbstractValue;
  place?: AbstractValue;
}

class TargetWriter {
  constructor(
    private readonly ev: Evaluator,
    private readonly ctx: EvalContext,
  ) {}

  write(job: TargetWrite): void {
    const node = stripParens(job.target);
    if (ts.isIdentifier(node)) {
      this.bindName(node, job.place ?? job.value);
      return;
    }
    if (ts.isPropertyAccessExpression(node)) {
      this.writeProperty({ place: job.place, target: node, value: job.value });
      return;
    }
    if (ts.isElementAccessExpression(node)) {
      this.writeElement({ place: job.place, target: node, value: job.value });
    }
  }

  private bindName(name: ts.Identifier, bound: AbstractValue): void {
    const sym = this.ev.checker.getSymbolAtLocation(name);
    if (sym !== undefined) this.ev.s.bindSymbol(sym, bound);
  }

  private writeProperty(job: PropWrite): void {
    const recv = this.ev.resolvePlace(job.target.expression, true);
    const name = job.target.name.text;
    if (recv === undefined) mergeIntoRootIdentifier(this.ev, job.target.expression, job.value);
    if (recv !== undefined) {
      this.writeField({ container: recv, key: name, place: job.place, value: job.value });
    }
    // Set accessors are indexed only by property name. Element writes do not
    // reach them. The receiver object is ignored: any write of this name feeds
    // every setter's first parameter.
    this.recordSetter(name, job.value);
  }

  private writeElement(job: ElemWrite): void {
    const recv = this.ev.resolvePlace(job.target.expression, true);
    const literalKey = staticIndexKey(job.target.argumentExpression);
    if (literalKey === undefined) {
      this.writeDynamicIndex({ recv, target: job.target, value: job.value });
      return;
    }
    if (recv === undefined) {
      mergeIntoRootIdentifier(this.ev, job.target.expression, job.value);
      return;
    }
    this.writeField({ container: recv, key: literalKey, place: job.place, value: job.value });
  }

  // A computed key can host a facade (`o[await ask()] = v`). The key string is
  // also an observable property name (`for..in`, `Object.keys`), so its taint
  // joins the container beside the written value.
  private writeDynamicIndex(job: DynamicWrite): void {
    const keyTaint = collapse(this.ev.evalExpr(job.target.argumentExpression, this.ctx));
    const smeared = collapse(job.value);
    if (job.recv === undefined) {
      mergeIntoRootIdentifier(this.ev, job.target.expression, keyTaint);
      mergeIntoRootIdentifier(this.ev, job.target.expression, job.value);
      return;
    }
    note(this.ev, mergeInto(job.recv, keyTaint));
    note(this.ev, mergeInto(job.recv, smeared));
  }

  // A fresh slot adopts a place by reference and stops. Replaying may-alias on
  // that path would treat a brand-new alias as a write into every candidate.
  // An existing slot is weak-merged, and the place is merged back so a slot
  // fabricated earlier in a loop (`wrap.box.f = t` then `wrap.box = box`) is
  // not stranded. May-alias targets then receive the write inexactly.
  private writeField(job: FieldWrite): void {
    const incoming = job.place ?? job.value;
    const occupied = job.container.fields.has(job.key);
    if (job.place !== undefined && occupied === false) {
      job.container.fields.set(job.key, incoming);
      this.ev.s.changed = true;
      return;
    }
    this.mergeSlot({ container: job.container, incoming, key: job.key, place: job.place });
  }

  private mergeSlot(job: SlotWrite): void {
    const slot = liveField(job.container, job.key);
    if (slot !== job.incoming) note(this.ev, mergeInto(slot, job.incoming));
    if (job.place !== undefined && slot !== job.place) note(this.ev, mergeInto(job.place, slot));
    note(this.ev, replayMayAliasWrite(job.container, job.key, job.incoming));
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

interface PatternWrite {
  target: ts.Expression;
  value: AbstractValue;
  place?: AbstractValue;
}

interface ArraySlot {
  element: ts.Expression;
  value: AbstractValue;
  place: AbstractValue | undefined;
  cursor: IndexCursor;
}

interface ObjectSlot {
  prop: ts.ObjectLiteralElementLike;
  value: AbstractValue;
  place?: AbstractValue;
}

interface NamedSlot {
  prop: ts.PropertyAssignment;
  value: AbstractValue;
  place?: AbstractValue;
}

interface FieldTake {
  target: ts.Expression;
  value: AbstractValue;
  place: AbstractValue | undefined;
  key: string;
}

interface ShorthandWrite {
  prop: ts.ShorthandPropertyAssignment;
  value: AbstractValue;
  place?: AbstractValue;
}

interface Defaulted {
  node: ts.BinaryExpression;
  carried: AbstractValue;
  place?: AbstractValue;
}

class PatternBinder {
  constructor(
    private readonly ev: Evaluator,
    private readonly ctx: EvalContext,
  ) {}

  bind(job: PatternWrite): void {
    let node = stripParens(job.target);
    let value = job.value;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      value = this.withDefault({ carried: value, node, place: job.place });
      node = stripParens(node.left);
    }
    if (isBindingPattern(node)) {
      this.pattern({ place: job.place, target: node, value });
      return;
    }
    new TargetWriter(this.ev, this.ctx).write({ place: job.place, target: node, value });
  }

  pattern(job: PatternWrite): void {
    if (ts.isArrayLiteralExpression(job.target)) {
      this.arrayPattern(job);
      return;
    }
    if (ts.isObjectLiteralExpression(job.target)) this.objectPattern(job);
  }

  private arrayPattern(job: PatternWrite): void {
    const cursor: IndexCursor = { pos: 0 };
    const target = job.target as ts.ArrayLiteralExpression;
    target.elements.forEach((element) => {
      this.arrayHole({ cursor, element, place: job.place, value: job.value });
    });
  }

  // A hole consumes an index. A rest element does not: the runtime rest starts
  // at the current index, and a later element (illegal in real JS, still in the
  // tree) keeps reading that same index. Place sources alias the live field;
  // everything else copies a value.
  private arrayHole(slot: ArraySlot): void {
    const kind = slot.element.kind;
    if (kind === ts.SyntaxKind.OmittedExpression) {
      slot.cursor.pos += 1;
      return;
    }
    if (kind === ts.SyntaxKind.SpreadElement) {
      this.bind({
        target: (slot.element as ts.SpreadElement).expression,
        value: collapse(slot.value),
      });
      return;
    }
    this.take({
      key: String(slot.cursor.pos),
      place: slot.place,
      target: slot.element,
      value: slot.value,
    });
    slot.cursor.pos += 1;
  }

  private objectPattern(job: PatternWrite): void {
    const target = job.target as ts.ObjectLiteralExpression;
    for (const prop of target.properties) {
      this.objectProp({ place: job.place, prop, value: job.value });
    }
  }

  private objectProp(job: ObjectSlot): void {
    const kind = job.prop.kind;
    if (kind === ts.SyntaxKind.SpreadAssignment) {
      this.bind({
        target: (job.prop as ts.SpreadAssignment).expression,
        value: collapse(job.value),
      });
      return;
    }
    if (kind === ts.SyntaxKind.ShorthandPropertyAssignment) {
      this.shorthand({
        place: job.place,
        prop: job.prop as ts.ShorthandPropertyAssignment,
        value: job.value,
      });
      return;
    }
    if (kind === ts.SyntaxKind.PropertyAssignment) {
      this.namedProp({
        place: job.place,
        prop: job.prop as ts.PropertyAssignment,
        value: job.value,
      });
    }
  }

  private namedProp(job: NamedSlot): void {
    if (ts.isComputedPropertyName(job.prop.name)) {
      this.bind({ target: job.prop.initializer, value: collapse(job.value) });
      return;
    }
    this.take({
      key: job.prop.name.getText(this.ev.s.scriptFile),
      place: job.place,
      target: job.prop.initializer,
      value: job.value,
    });
  }

  private take(job: FieldTake): void {
    const field = job.place === undefined ? undefined : this.ev.extractField(job.place, job.key);
    if (field === undefined) {
      this.bind({ target: job.target, value: this.ev.selectField(job.value, job.key) });
      return;
    }
    this.bind({ place: field, target: job.target, value: field });
  }

  // `{ x = d }` on a place merges the default into the live field and keeps the
  // alias. Without a place the default is joined by value.
  private shorthand(job: ShorthandWrite): void {
    const key = job.prop.name.text;
    const fallback = job.prop.objectAssignmentInitializer;
    const writer = new TargetWriter(this.ev, this.ctx);
    if (job.place) {
      const field = this.ev.extractField(job.place, key);
      if (fallback) note(this.ev, mergeInto(field, this.ev.evalExpr(fallback, this.ctx)));
      writer.write({ place: field, target: job.prop.name, value: field });
      return;
    }
    const base = this.ev.selectField(job.value, key);
    const chosen =
      fallback === undefined ? base : unionValues(base, this.ev.evalExpr(fallback, this.ctx));
    writer.write({ target: job.prop.name, value: chosen });
  }

  // `[a = d]` / `{ x: a = d }`. When aliasing, `carried` is the live field, so
  // the default merges into it and the alias stays.
  private withDefault(job: Defaulted): AbstractValue {
    const fallback = this.ev.evalExpr(job.node.right, this.ctx);
    if (job.place === undefined) return unionValues(job.carried, fallback);
    note(this.ev, mergeInto(job.carried, fallback));
    return job.carried;
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
    if (isBindingPattern(left)) {
      new PatternBinder(this.ev, this.ctx).pattern({ place: alias, target: left, value: written });
      return written;
    }
    new TargetWriter(this.ev, this.ctx).write({ place: alias, target: left, value: written });
    return written;
  }

  // Read-modify-write keeps the target's identity: the right-hand side is merged,
  // never adopted as a place.
  compound(node: ts.BinaryExpression): AbstractValue {
    const incoming = this.ev.evalExpr(node.right, this.ctx);
    const before = this.ev.evalExpr(node.left, this.ctx);
    new TargetWriter(this.ev, this.ctx).write({
      target: stripParens(node.left),
      value: incoming,
    });
    return unionValues(before, incoming);
  }
}

export function handleAssignment(
  ev: Evaluator,
  node: ts.BinaryExpression,
  ctx: EvalContext,
): AbstractValue {
  return new AssignTransfer(ev, ctx).plain(node);
}

export function handleCompoundAssignment(
  ev: Evaluator,
  node: ts.BinaryExpression,
  ctx: EvalContext,
): AbstractValue {
  return new AssignTransfer(ev, ctx).compound(node);
}

// `for (const k of xs)` is a declaration and uses bindPattern. `for (k of xs)`
// and a destructuring assignment target use the expression binder. The loop
// value is derived, so there is no aliasing place.
export function bindForInitializer(
  ev: Evaluator,
  initializer: ts.ForInitializer,
  value: AbstractValue,
  ctx: EvalContext,
): void {
  if (ts.isVariableDeclarationList(initializer)) {
    const head = initializer.declarations.at(0);
    if (head) ev.bindPattern(head.name, value, ctx);
    return;
  }
  new PatternBinder(ev, ctx).bind({ target: initializer, value });
}

// Fold a member-access chain into its leftmost identifier. A nested target whose
// receiver cannot be resolved used to drop the written taint. The root slot is a
// field-insensitive over-approximation, which is preferred to dropping the flow.
// A chain rooted in a call still has no slot: function returns are summaries.
export function mergeIntoRootIdentifier(
  ev: Evaluator,
  expr: ts.Expression,
  value: AbstractValue,
): void {
  const root = strip(expr, UNWRAP_LVALUE);
  if (ts.isIdentifier(root) === false) return;
  const sym = ev.checker.getSymbolAtLocation(root);
  if (sym === undefined) return;
  note(ev, mergeInto(ev.s.envSlot(sym), collapse(value)));
}

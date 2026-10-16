// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import { WORKFLOW_FUNCTION_NAME, type ScriptLoc } from "../compiler/compile.js";
import { AliasReplay, shareFields } from "./domain/alias-replay.js";
import {
  Exactness,
  OccurrenceJoin,
  PlaceholderJoin,
  ValueFold,
  ValueJoin,
  ensureField,
  freshValue,
  grewFrom,
  smearRead,
} from "./domain/lattice.js";

// Gen-only lattice for the taint fixpoint. A value only grows, which is what makes the
// pass terminate. Three facts travel together:
//   occurrences — site labels that reached this value, plus formal placeholders inside a summary
//   fields — members whose names are known statically (properties and tuple slots)
//   functions — script-local callees reachable as this value
// Two extra axes stay off the common path: a bind prefix, and may-alias back-edges.

// A label is a site id, an exactness bit, and an optional join or element port.
// A missing port means the whole value. That portless label replaces every ported
// label of the same site and keeps exactness if either side was exact. A selected
// element keeps its port until a whole-value read joins it.
export interface TaintOcc {
  port?: number;
  site: string;
  exact: boolean;
}

// One formal of one function summary. `rest` means every actual at index >= `param`
// belongs to this formal. Dropping the bit would stop the tail from being gathered
// when the summary is substituted (calls.ts) or when facts are emitted (state.ts).
export interface Placeholder {
  rest?: boolean;
  fnId: number;
  param: number;
}

export interface AbstractValue {
  // Script-local functions this value may be. A merged bound and unbound function
  // cannot say which one carries the prefix, so application tries both alignments.
  fns: Set<ts.Node>;
  // Statically named members. Absent means "not tracked", not "empty of taint".
  fields: Map<string, AbstractValue>;
  // Keyed by site + "|" + (port ?? "").
  occs: Map<string, TaintOcc>;
  // Keyed by fnId + ":" + param. The rest bit is payload, not part of the key.
  phs: Map<string, Placeholder>;
  // Arguments already supplied by bind, earlier binds first. Absent when unbound.
  // At the real call the prefix is prepended to the actuals.
  bound?: AbstractValue[];
  // Places a write through this value must also reach, because at runtime this value
  // may be one of them. Set for a conditional binding (`flag ? box1 : box2`) and for
  // a Promise.all element that aliases its input. The replay is weak and inexact:
  // the write lands on one arm only, so it never strong-updates a target, and it
  // follows each target's own mayAlias set. Identity dedup keeps loop-carried merges
  // finite.
  //
  // That only terminates if every target is a pass-stable heap node: an env slot, a
  // class instance, a join result, a conditional place, a literal place, or a field
  // of one of those. A fresh object minted each pass is a new identity, the set grows
  // forever, and the fixpoint hits the iteration cap. joinResultOf and condPlaceOf
  // exist so those two nodes stay stable.
  mayAlias?: Set<AbstractValue>;
}

export interface PromotedFanout {
  order: number;
  id: string;
  loc: ScriptLoc;
  label: string;
}

// Edge facts for graph assembly. Fan-out ids are still provisional (`fan-out@N`).
export interface TaintFacts {
  promoted: PromotedFanout[];
  returnData: TaintOcc[];
  askData: Map<string, TaintOcc[]>;
  askActor: Map<string, TaintOcc[]>;
  worldReadData: Map<string, TaintOcc[]>;
  joinIn: Map<string, TaintOcc[]>;
  fanoutIn: Map<string, TaintOcc[]>;
}

// Field chains and bind prefixes both stop here. Deeper structure is smeared into
// occurrences so a cyclic heap cannot mint a fresh node on every pass. A self-rebind
// (`h = h.bind(null, x)`) grows the prefix by one slot per pass and never gets deeper,
// so the same cap also limits prefix length. Past it, each extra element is smeared
// onto the value. Labels survive; routing through more than CAP distinct bound values
// does not. Every path into a persistent slot goes through the prefix join, so a
// stored prefix never exceeds the cap.
export const VALUE_DEPTH_CAP = 8;

const kind = ts.SyntaxKind;
const FUNCTION_KINDS = new Set<ts.SyntaxKind>([
  kind.FunctionDeclaration,
  kind.FunctionExpression,
  kind.ArrowFunction,
  kind.MethodDeclaration,
  kind.GetAccessor,
  kind.SetAccessor,
  kind.Constructor,
]);
const DIRECT_CALLEE_KINDS = new Set<ts.SyntaxKind>([
  kind.Identifier,
  kind.PropertyAccessExpression,
  kind.FunctionExpression,
  kind.ArrowFunction,
]);

function compoundOps(): Set<ts.SyntaxKind> {
  return new Set<ts.SyntaxKind>([
    kind.PlusEqualsToken,
    kind.MinusEqualsToken,
    kind.AsteriskEqualsToken,
    kind.AsteriskAsteriskEqualsToken,
    kind.SlashEqualsToken,
    kind.PercentEqualsToken,
    kind.LessThanLessThanEqualsToken,
    kind.GreaterThanGreaterThanEqualsToken,
    kind.GreaterThanGreaterThanGreaterThanEqualsToken,
    kind.AmpersandEqualsToken,
    kind.BarEqualsToken,
    kind.CaretEqualsToken,
    kind.BarBarEqualsToken,
    kind.AmpersandAmpersandEqualsToken,
    kind.QuestionQuestionEqualsToken,
  ]);
}

// Names that mutate the receiver: array push/unshift/splice and Map.set / Set.add.
// A false match only adds taint. A member that actually holds a tracked function
// still dispatches as a call.
const HEAP_MUTATOR_NAMES = ["push", "unshift", "splice", "set", "add"] as const;
export const HEAP_MUTATORS = new Set<string>(HEAP_MUTATOR_NAMES);

// Read-modify-write tokens, including ||=, &&=, and ??=. Gen-only has no kills,
// so the transfer keeps the old value and weak-merges the right-hand side.
export const COMPOUND_ASSIGNMENT_OPS = compoundOps();

// Wrappers that do not change which place an expression denotes. The comma operator
// denotes its last operand. `await` is not peeled: it is a place only when the
// awaited value is a real promise, which resolvePlace decides from the value.
const UNWRAP_KINDS = new Set<ts.SyntaxKind>([
  kind.ParenthesizedExpression,
  kind.NonNullExpression,
  kind.AsExpression,
  kind.SatisfiesExpression,
  kind.TypeAssertionExpression,
]);

function peeledChild(expr: ts.Expression): ts.Expression | undefined {
  if (UNWRAP_KINDS.has(expr.kind)) return (expr as ts.ParenthesizedExpression).expression;
  if (expr.kind === kind.BinaryExpression) {
    const bin = expr as ts.BinaryExpression;
    return bin.operatorToken.kind === kind.CommaToken ? bin.right : undefined;
  }
  if (expr.kind !== kind.CommaListExpression) return undefined;
  return (expr as ts.CommaListExpression).elements.at(-1);
}

function literalText(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return;
}

export function emptyValue(): AbstractValue {
  return freshValue();
}
export function phKey(ph: Placeholder): string {
  return PlaceholderJoin.key(ph);
}
export function addOcc(target: AbstractValue, occ: TaintOcc): boolean {
  return OccurrenceJoin.admit(target, occ);
}
export function addPlaceholder(target: AbstractValue, ph: Placeholder): boolean {
  return PlaceholderJoin.admit(target, ph);
}
export function mergeInto(target: AbstractValue, source: AbstractValue, depth = 0): boolean {
  return ValueJoin.into(target, source, depth);
}
export function mergeBound(
  target: AbstractValue,
  sourceBound: AbstractValue[],
  depth: number,
): boolean {
  return ValueJoin.prefix(target, sourceBound, depth);
}
export function cloneValue(v: AbstractValue): AbstractValue {
  const copy = freshValue();
  ValueJoin.into(copy, v, 0);
  return copy;
}
export function unionValues(...values: AbstractValue[]): AbstractValue {
  const joined = freshValue();
  grewFrom(values, (value) => ValueJoin.into(joined, value, 0));
  return joined;
}
export function singleOcc(site: string, exact: boolean, port?: number): AbstractValue {
  const labeled = freshValue();
  OccurrenceJoin.admit(labeled, { exact, port, site });
  return labeled;
}
export function collapse(v: AbstractValue): AbstractValue {
  return ValueFold.fresh(v);
}
export function collapseInto(
  out: AbstractValue,
  v: AbstractValue,
  seen = new Set<AbstractValue>(),
): boolean {
  return ValueFold.into(out, v, seen);
}

export function readField(container: AbstractValue, key: string): AbstractValue {
  const known = container.fields.get(key);
  if (known === undefined) return ValueFold.fresh(container);
  const snapshot = freshValue();
  ValueJoin.into(snapshot, known, 0);
  smearRead(snapshot, container);
  return snapshot;
}

export function clearExact(v: AbstractValue): AbstractValue {
  return Exactness.cleared(v);
}

export { isActorSite } from "./core.js";

export function provisionalFanoutId(order: number): string {
  return "fan-out@" + String(order);
}

function isWorkflowWrapper(statement: ts.Statement): statement is ts.FunctionDeclaration {
  if (statement.kind !== ts.SyntaxKind.FunctionDeclaration) return false;
  const decl = statement as ts.FunctionDeclaration;
  const name = decl.name?.text;
  return name === WORKFLOW_FUNCTION_NAME && decl.body !== undefined;
}

export function findWorkflowBody(scriptFile: ts.SourceFile): ts.Block {
  const body = scriptFile.statements.find(isWorkflowWrapper)?.body;
  if (body !== undefined) return body;
  throw new Error("workflow wrapper function " + WORKFLOW_FUNCTION_NAME + " not found");
}

export function isFunctionLike(node: ts.Node): boolean {
  return FUNCTION_KINDS.has(node.kind);
}

// Every function-like node except an arrow owns an `arguments` object. An arrow sees
// the enclosing function's arguments.
export function isNonArrowFunctionLike(node: ts.Node): boolean {
  return node.kind !== kind.ArrowFunction && FUNCTION_KINDS.has(node.kind);
}

// A directly named callee, or a function literal, keeps exactness. One parenthesis
// layer is ignored; deeper wrappers are not direct.
export function isDirectCallee(callee: ts.Expression): boolean {
  const expr =
    callee.kind === kind.ParenthesizedExpression
      ? (callee as ts.ParenthesizedExpression).expression
      : callee;
  return DIRECT_CALLEE_KINDS.has(expr.kind);
}

export function isJsonStringify(access: ts.PropertyAccessExpression): boolean {
  const receiver = access.expression;
  return ts.isIdentifier(receiver) && receiver.text === "JSON" && access.name.text === "stringify";
}

export function staticIndexKey(arg: ts.Expression): string | undefined {
  return ts.isNumericLiteral(arg) || ts.isStringLiteralLike(arg) ? arg.text : undefined;
}

export function peelPlace(expr: ts.Expression): ts.Expression {
  let cursor = expr;
  let next = peeledChild(cursor);
  while (next !== undefined) {
    cursor = next;
    next = peeledChild(cursor);
  }
  return cursor;
}

export function liveField(container: AbstractValue, key: string): AbstractValue {
  return ensureField(container, key);
}
export function replayMayAliasWrite(
  container: AbstractValue,
  key: string,
  value: AbstractValue,
): boolean {
  return AliasReplay.write(container, key, value);
}
export function replayMayAliasMerge(container: AbstractValue, value: AbstractValue): boolean {
  return AliasReplay.smear(container, value);
}
export function adoptFields(target: AbstractValue, source: AbstractValue): boolean {
  return shareFields(target, source);
}
export function bindingPropertyKey(element: ts.BindingElement): string | undefined {
  return literalText(element.propertyName ?? element.name);
}

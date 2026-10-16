// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import { WORKFLOW_FUNCTION_NAME, type ScriptLoc } from "../compiler/compile.js";

/**
 * Gen-only abstract values for the taint fixpoint: occurrence labels, parameter
 * placeholders, named fields, and reachable local functions. Joins only grow.
 * Field chains stop at {@link VALUE_DEPTH_CAP}; deeper structure is smeared into
 * occurrences so a cyclic heap cannot add a fresh node on every pass.
 */

/** Site label, exactness, and an optional join/element port. */
export interface TaintOcc {
  port?: number;
  site: string;
  exact: boolean;
}

/**
 * A formal inside one function summary. `rest` means every actual at index >= `param`
 * belongs to this formal; dropping the bit would stop the tail from being gathered.
 */
export interface Placeholder {
  rest?: boolean;
  fnId: number;
  param: number;
}

export interface AbstractValue {
  fns: Set<ts.Node>;
  fields: Map<string, AbstractValue>;
  /** Keyed by `site + "|" + (port ?? "")`. */
  occs: Map<string, TaintOcc>;
  /** Keyed by `fnId + ":" + param` (the rest bit is not part of the key). */
  phs: Map<string, Placeholder>;
  /**
   * Partial-application prefix from `bind`. A merged plain/bound value applies both
   * alignments. Absent on the common unbound value.
   */
  bound?: AbstractValue[];
  /**
   * Places a write through this value must also reach, deduped by object identity.
   * Targets have to be pass-stable heap nodes (env slots, class instances, join and
   * conditional places, literal places, and their fields). A fresh object each pass
   * would make this set grow forever and the fixpoint would hit the iteration cap.
   */
  mayAlias?: Set<AbstractValue>;
}

export interface PromotedFanout {
  order: number;
  id: string;
  loc: ScriptLoc;
  label: string;
}

/** Edge facts for graph assembly. Fan-out ids are still provisional (`fan-out@N`). */
export interface TaintFacts {
  promoted: PromotedFanout[];
  returnData: TaintOcc[];
  askData: Map<string, TaintOcc[]>;
  askActor: Map<string, TaintOcc[]>;
  worldReadData: Map<string, TaintOcc[]>;
  joinIn: Map<string, TaintOcc[]>;
  fanoutIn: Map<string, TaintOcc[]>;
}

/** Nesting limit for fields and for bind-prefix length. */
export const VALUE_DEPTH_CAP = 8;

function reduceIter<T>(items: Iterable<T>, acc: boolean, step: (item: T) => boolean): boolean {
  const cursor = items[Symbol.iterator]();
  let next = cursor.next();
  while (next.done !== true) {
    const item = next.value;
    acc = step(item) || acc;
    next = cursor.next();
  }
  return acc;
}

function reduceIndex<T>(
  items: readonly T[],
  acc: boolean,
  step: (item: T, index: number) => boolean,
): boolean {
  let index = 0;
  while (index < items.length) {
    acc = step(items[index] as T, index) || acc;
    index += 1;
  }
  return acc;
}

export function emptyValue(): AbstractValue {
  const fields = new Map<string, AbstractValue>();
  const fns = new Set<ts.Node>();
  const occs = new Map<string, TaintOcc>();
  const phs = new Map<string, Placeholder>();
  return { fields, fns, occs, phs };
}

function occKey(site: string, port: number | undefined): string {
  const tail = port === undefined ? "" : String(port);
  return site + "|" + tail;
}

export function phKey(ph: Placeholder): string {
  return String(ph.fnId) + ":" + String(ph.param);
}

function putOcc(target: AbstractValue, occ: TaintOcc): boolean {
  const key = occKey(occ.site, occ.port);
  const prior = target.occs.get(key);
  if (prior === undefined) {
    target.occs.set(key, { exact: occ.exact, port: occ.port, site: occ.site });
    return true;
  }
  if (!occ.exact || prior.exact) return false;
  prior.exact = true;
  return true;
}

// A portless label of a site replaces every ported label of that site and ORs exactness.
function widenSite(target: AbstractValue, occ: TaintOcc): boolean {
  let exact = occ.exact;
  const doomed: string[] = [];
  reduceIter(target.occs, false, ([key, row]) => {
    if (row.site !== occ.site || row.port === undefined) return false;
    exact = exact || row.exact;
    doomed.push(key);
    return false;
  });
  let removed = false;
  reduceIndex(doomed, false, (key) => (target.occs.delete(key), (removed = true), false));
  return putOcc(target, { exact, site: occ.site }) || removed;
}

function keepPort(target: AbstractValue, occ: TaintOcc): boolean {
  const cover = target.occs.get(occKey(occ.site, undefined));
  if (cover === undefined) return putOcc(target, occ);
  if (!occ.exact || cover.exact) return false;
  cover.exact = true;
  return true;
}

export function addOcc(target: AbstractValue, occ: TaintOcc): boolean {
  if (occ.port !== undefined) return keepPort(target, occ);
  return widenSite(target, occ);
}

export function addPlaceholder(target: AbstractValue, ph: Placeholder): boolean {
  const key = phKey(ph);
  const prior = target.phs.get(key);
  if (prior === undefined) {
    const row: Placeholder = { fnId: ph.fnId, param: ph.param };
    if (ph.rest === true) row.rest = true;
    target.phs.set(key, row);
    return true;
  }
  if (ph.rest !== true || prior.rest === true) return false;
  prior.rest = true;
  return true;
}

function unionFlat(target: AbstractValue, source: AbstractValue): boolean {
  const occs = reduceIter(source.occs.values(), false, (occ) => addOcc(target, occ));
  const phs = reduceIter(source.phs.values(), false, (ph) => addPlaceholder(target, ph));
  const fns = reduceIter(source.fns, false, (fn) =>
    target.fns.has(fn) ? false : (target.fns.add(fn), true),
  );
  return occs || phs || fns;
}

function unionAliases(target: AbstractValue, incoming: Set<AbstractValue>): boolean {
  const slot = (target.mayAlias ??= new Set<AbstractValue>());
  return reduceIter(incoming, false, (alias) =>
    slot.has(alias) ? false : (slot.add(alias), true),
  );
}

export function mergeInto(target: AbstractValue, source: AbstractValue, depth = 0): boolean {
  // Same object: do not walk. A field that points at its container is handled by the depth cap,
  // which still smears labels; a visited-set on this walk would hide that growth.
  if (target === source) return false;
  let grew = unionFlat(target, source);
  if (source.bound !== undefined) grew = mergeBound(target, source.bound, depth) || grew;
  if (source.mayAlias !== undefined) grew = unionAliases(target, source.mayAlias) || grew;
  if (depth < VALUE_DEPTH_CAP) {
    return (
      reduceIter(source.fields, false, ([key, field]) =>
        mergeInto(liveField(target, key), field, depth + 1),
      ) || grew
    );
  }
  return reduceIter(source.fields.values(), false, (field) => collapseInto(target, field)) || grew;
}

export function mergeBound(
  target: AbstractValue,
  sourceBound: AbstractValue[],
  depth: number,
): boolean {
  // Past the cap, do not lengthen `bound` — smear each element into occurrences.
  // A self-rebind grows the prefix by one slot per pass and never gets deeper, so the
  // field cap alone would not stop it. Persistent prefixes stay within the cap because
  // every store goes through here.
  if (depth >= VALUE_DEPTH_CAP) {
    return reduceIndex(sourceBound, false, (el) => collapseInto(target, el));
  }
  if (target.bound === undefined) target.bound = [];
  const prefix = target.bound;
  return reduceIndex(sourceBound, false, (el, index) => {
    if (index >= VALUE_DEPTH_CAP) return collapseInto(target, el);
    const prior = prefix[index];
    const slot = prior ?? (prefix[index] = emptyValue());
    return mergeInto(slot, el, depth + 1) || prior === undefined;
  });
}

export function cloneValue(v: AbstractValue): AbstractValue {
  const copy = emptyValue();
  mergeInto(copy, v);
  return copy;
}

export function unionValues(...values: AbstractValue[]): AbstractValue {
  const out = emptyValue();
  reduceIndex(values, false, (value) => mergeInto(out, value));
  return out;
}

export function singleOcc(site: string, exact: boolean, port?: number): AbstractValue {
  const out = emptyValue();
  addOcc(out, { exact, port, site });
  return out;
}

export function collapse(v: AbstractValue): AbstractValue {
  const out = emptyValue();
  collapseInto(out, v);
  return out;
}

export function collapseInto(
  out: AbstractValue,
  v: AbstractValue,
  seen = new Set<AbstractValue>(),
): boolean {
  if (seen.has(v)) return false;
  seen.add(v);
  const flat = unionFlat(out, v);
  const fields = reduceIter(v.fields.values(), false, (field) => collapseInto(out, field, seen));
  const prefix = v.bound;
  const bound =
    prefix === undefined ? false : reduceIndex(prefix, false, (el) => collapseInto(out, el, seen));
  return flat || fields || bound;
}

function portedSite(v: AbstractValue, site: string): boolean {
  let hit = false;
  reduceIter(v.occs.values(), false, (occ) => ((hit ||= occ.site === site && occ.port !== undefined), false));
  return hit;
}

// Skip a portless container label when the field already carries a port of that site.
// Otherwise addOcc would let the portless label erase the port.
function smearLooseOccs(out: AbstractValue, container: AbstractValue): void {
  reduceIter(container.occs.values(), false, (occ) => {
    if (occ.port !== undefined || !portedSite(out, occ.site)) addOcc(out, occ);
    return false;
  });
}

export function readField(container: AbstractValue, key: string): AbstractValue {
  const field = container.fields.get(key);
  if (field === undefined) return collapse(container);
  const out = cloneValue(field);
  smearLooseOccs(out, container);
  reduceIter(container.phs.values(), false, (ph) => addPlaceholder(out, ph));
  return out;
}

function scrubExact(v: AbstractValue, seen: Set<AbstractValue>): void {
  if (seen.has(v)) return;
  seen.add(v);
  reduceIter(v.occs.values(), false, (occ) => ((occ.exact = false), false));
  reduceIter(v.fields.values(), false, (field) => (scrubExact(field, seen), false));
  const prefix = v.bound;
  if (prefix !== undefined) reduceIndex(prefix, false, (el) => (scrubExact(el, seen), false));
}

export function clearExact(v: AbstractValue): AbstractValue {
  const out = cloneValue(v);
  scrubExact(out, new Set());
  return out;
}

export { isActorSite } from "./core.js";

export function provisionalFanoutId(order: number): string {
  return "fan-out@" + String(order);
}

function takeKinds(ops: Set<ts.SyntaxKind>, kinds: readonly ts.SyntaxKind[]): void {
  let index = 0;
  while (index < kinds.length) {
    const kind = kinds[index];
    index += 1;
    if (kind !== undefined) ops.add(kind);
  }
}

const FUNCTION_LIKE = new Set<ts.SyntaxKind>();

function fillKindSets(): void {
  const kind = ts.SyntaxKind;
  const ops = COMPOUND_ASSIGNMENT_OPS;
  takeKinds(FUNCTION_LIKE, [kind.FunctionDeclaration, kind.FunctionExpression]);
  takeKinds(FUNCTION_LIKE, [kind.ArrowFunction, kind.MethodDeclaration]);
  takeKinds(FUNCTION_LIKE, [kind.GetAccessor, kind.SetAccessor, kind.Constructor]);
  takeKinds(ops, [kind.PlusEqualsToken, kind.MinusEqualsToken]);
  takeKinds(ops, [kind.AsteriskEqualsToken, kind.AsteriskAsteriskEqualsToken]);
  takeKinds(ops, [kind.SlashEqualsToken, kind.PercentEqualsToken]);
  takeKinds(ops, [kind.LessThanLessThanEqualsToken, kind.GreaterThanGreaterThanEqualsToken]);
  takeKinds(ops, [kind.GreaterThanGreaterThanGreaterThanEqualsToken, kind.AmpersandEqualsToken]);
  takeKinds(ops, [kind.BarEqualsToken, kind.CaretEqualsToken]);
  takeKinds(ops, [kind.BarBarEqualsToken, kind.AmpersandAmpersandEqualsToken]);
  takeKinds(ops, [kind.QuestionQuestionEqualsToken]);
}

export const HEAP_MUTATORS = new Set(["push", "unshift", "splice", "set", "add"]);
export const COMPOUND_ASSIGNMENT_OPS = new Set<ts.SyntaxKind>();
fillKindSets();

export function findWorkflowBody(scriptFile: ts.SourceFile): ts.Block {
  const stmts = scriptFile.statements;
  let index = 0;
  while (index < stmts.length) {
    const statement = stmts[index];
    index += 1;
    if (statement === undefined || !ts.isFunctionDeclaration(statement)) continue;
    if (statement.name?.text !== WORKFLOW_FUNCTION_NAME || statement.body === undefined) continue;
    return statement.body;
  }
  throw new Error("workflow wrapper function " + WORKFLOW_FUNCTION_NAME + " not found");
}

export function isFunctionLike(node: ts.Node): boolean {
  return FUNCTION_LIKE.has(node.kind);
}

export function isNonArrowFunctionLike(node: ts.Node): boolean {
  if (ts.isArrowFunction(node)) return false;
  return isFunctionLike(node);
}

export function isDirectCallee(callee: ts.Expression): boolean {
  const expr = ts.isParenthesizedExpression(callee) ? callee.expression : callee;
  const kind = expr.kind;
  return (
    kind === ts.SyntaxKind.Identifier ||
    kind === ts.SyntaxKind.PropertyAccessExpression ||
    kind === ts.SyntaxKind.FunctionExpression ||
    kind === ts.SyntaxKind.ArrowFunction
  );
}

export function isJsonStringify(access: ts.PropertyAccessExpression): boolean {
  if (!ts.isIdentifier(access.expression) || access.expression.text !== "JSON") return false;
  return access.name.text === "stringify";
}

export function staticIndexKey(arg: ts.Expression): string | undefined {
  if (ts.isNumericLiteral(arg) || ts.isStringLiteralLike(arg)) return arg.text;
  return undefined;
}

export function peelPlace(expr: ts.Expression): ts.Expression {
  let cur = expr;
  while (true) {
    switch (cur.kind) {
      case ts.SyntaxKind.ParenthesizedExpression:
      case ts.SyntaxKind.NonNullExpression:
      case ts.SyntaxKind.AsExpression:
      case ts.SyntaxKind.SatisfiesExpression:
      case ts.SyntaxKind.TypeAssertionExpression:
        cur = (cur as ts.ParenthesizedExpression).expression;
        break;
      case ts.SyntaxKind.BinaryExpression: {
        const bin = cur as ts.BinaryExpression;
        if (bin.operatorToken.kind !== ts.SyntaxKind.CommaToken) return cur;
        cur = bin.right;
        break;
      }
      case ts.SyntaxKind.CommaListExpression: {
        const list = cur as ts.CommaListExpression;
        const last = list.elements[list.elements.length - 1];
        if (last === undefined) return cur;
        cur = last;
        break;
      }
      default:
        return cur;
    }
  }
}

export function liveField(container: AbstractValue, key: string): AbstractValue {
  let field = container.fields.get(key);
  if (field === undefined) container.fields.set(key, (field = emptyValue()));
  return field;
}

function replayField(
  targets: Set<AbstractValue>,
  key: string,
  write: AbstractValue,
  seen: Set<AbstractValue>,
  depth: number,
): boolean {
  return reduceIter(targets, false, (target) => {
    if (seen.has(target)) return false;
    seen.add(target);
    if (depth >= VALUE_DEPTH_CAP) return collapseInto(target, write);
    const direct = mergeInto(liveField(target, key), write);
    const nested = target.mayAlias;
    return nested === undefined
      ? direct
      : replayField(nested, key, write, seen, depth + 1) || direct;
  });
}

export function replayMayAliasWrite(
  container: AbstractValue,
  key: string,
  value: AbstractValue,
): boolean {
  const aliases = container.mayAlias;
  if (aliases === undefined) return false;
  return replayField(aliases, key, clearExact(value), new Set(), 0);
}

function replayMerge(
  targets: Set<AbstractValue>,
  write: AbstractValue,
  seen: Set<AbstractValue>,
): boolean {
  return reduceIter(targets, false, (target) => {
    if (seen.has(target)) return false;
    seen.add(target);
    const direct = mergeInto(target, write);
    const nested = target.mayAlias;
    return nested === undefined ? direct : replayMerge(nested, write, seen) || direct;
  });
}

export function replayMayAliasMerge(container: AbstractValue, value: AbstractValue): boolean {
  const aliases = container.mayAlias;
  if (aliases === undefined) return false;
  return replayMerge(aliases, clearExact(collapse(value)), new Set());
}

export function adoptFields(target: AbstractValue, source: AbstractValue): boolean {
  return reduceIter(source.fields, false, ([key, srcField]) => {
    const existing = target.fields.get(key);
    if (existing === srcField) return false;
    if (existing !== undefined) mergeInto(srcField, existing);
    target.fields.set(key, srcField);
    return true;
  });
}

function textOfStaticName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

export function bindingPropertyKey(element: ts.BindingElement): string | undefined {
  const renamed = element.propertyName;
  if (renamed !== undefined) return textOfStaticName(renamed);
  return ts.isIdentifier(element.name) ? element.name.text : undefined;
}

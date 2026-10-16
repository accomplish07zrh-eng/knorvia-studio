// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import { WORKFLOW_FUNCTION_NAME, type ScriptLoc } from "../compiler/compile.js";

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

function freshValue(): AbstractValue {
  const fields = new Map<string, AbstractValue>();
  const fns = new Set<ts.Node>();
  const occs = new Map<string, TaintOcc>();
  const phs = new Map<string, Placeholder>();
  return { fields, fns, occs, phs };
}

function labelKey(site: string, port: number | undefined): string {
  const suffix = port === undefined ? "" : String(port);
  return [site, suffix].join("|");
}

function overCap(depth: number): boolean {
  return depth >= VALUE_DEPTH_CAP;
}

function grewFrom<T>(items: Iterable<T>, step: (item: T) => boolean): boolean {
  let grew = false;
  for (const item of items) {
    if (step(item)) grew = true;
  }
  return grew;
}

function grewAt<T>(items: readonly T[], step: (item: T, index: number) => boolean): boolean {
  let grew = false;
  let index = 0;
  while (index < items.length) {
    const item = items[index];
    if (item !== undefined && step(item, index)) grew = true;
    index += 1;
  }
  return grew;
}

// Returns whether this is the first time `node` is seen. The set is the cycle brake
// for a field that points back at its container.
function claim(seen: Set<AbstractValue>, node: AbstractValue): boolean {
  if (seen.has(node)) return false;
  seen.add(node);
  return true;
}

class OccurrenceJoin {
  static admit(host: AbstractValue, occ: TaintOcc): boolean {
    if (occ.port === undefined) return OccurrenceJoin.cover(host, occ);
    return OccurrenceJoin.keep(host, occ);
  }

  // A portless label erases every ported label of the same site and ORs exactness.
  private static cover(host: AbstractValue, occ: TaintOcc): boolean {
    const doomed = [...host.occs].filter(([, row]) => row.site === occ.site && row.port !== undefined);
    const exact = doomed.reduce((bit, [, row]) => bit || row.exact, occ.exact);
    for (const [key] of doomed) host.occs.delete(key);
    const stored = OccurrenceJoin.store(host, { exact, site: occ.site });
    return stored || doomed.length > 0;
  }

  // A ported label is redundant once a portless label of that site is present.
  // Exactness still upgrades the covering label.
  private static keep(host: AbstractValue, occ: TaintOcc): boolean {
    const cover = host.occs.get(labelKey(occ.site, undefined));
    if (cover === undefined) return OccurrenceJoin.store(host, occ);
    const raised = occ.exact && cover.exact === false;
    if (raised) cover.exact = true;
    return raised;
  }

  private static store(host: AbstractValue, occ: TaintOcc): boolean {
    const key = labelKey(occ.site, occ.port);
    const prior = host.occs.get(key);
    if (prior === undefined) {
      host.occs.set(key, { exact: occ.exact, port: occ.port, site: occ.site });
      return true;
    }
    const raised = occ.exact && prior.exact === false;
    if (raised) prior.exact = true;
    return raised;
  }
}

class PlaceholderJoin {
  static key(ph: Placeholder): string {
    return String(ph.fnId) + ":" + String(ph.param);
  }

  static admit(host: AbstractValue, ph: Placeholder): boolean {
    const key = PlaceholderJoin.key(ph);
    const prior = host.phs.get(key);
    if (prior === undefined) {
      const row: Placeholder = { fnId: ph.fnId, param: ph.param };
      if (ph.rest === true) row.rest = true;
      host.phs.set(key, row);
      return true;
    }
    // A later rest witness must stick. A non-rest witness must not clear it.
    const raised = ph.rest === true && prior.rest !== true;
    if (raised) prior.rest = true;
    return raised;
  }
}

function absorbFunctions(host: AbstractValue, source: AbstractValue): boolean {
  const fresh = [...source.fns].filter((fn) => host.fns.has(fn) === false);
  for (const fn of fresh) host.fns.add(fn);
  return fresh.length > 0;
}

function absorbAliases(host: AbstractValue, incoming: Set<AbstractValue>): boolean {
  const slot = host.mayAlias ?? new Set<AbstractValue>();
  if (host.mayAlias === undefined) host.mayAlias = slot;
  let grew = false;
  for (const alias of incoming) {
    if (slot.has(alias)) continue;
    slot.add(alias);
    grew = true;
  }
  return grew;
}

// Occurrences, placeholders, and functions. Structure is handled by the caller.
function absorbFlat(host: AbstractValue, source: AbstractValue): boolean {
  const labels = grewFrom(source.occs.values(), (occ) => OccurrenceJoin.admit(host, occ));
  const formals = grewFrom(source.phs.values(), (ph) => PlaceholderJoin.admit(host, ph));
  return labels || formals || absorbFunctions(host, source);
}

class ValueJoin {
  static into(target: AbstractValue, source: AbstractValue, depth: number): boolean {
    // Same object: do not walk. A field that points at its container is stopped by the
    // depth cap, which still smears labels. A visited-set here would hide that growth.
    if (target === source) return false;
    const flat = absorbFlat(target, source);
    const prefix =
      source.bound === undefined ? false : ValueJoin.prefix(target, source.bound, depth);
    const aliases = source.mayAlias === undefined ? false : absorbAliases(target, source.mayAlias);
    const structure = ValueJoin.fields(target, source, depth);
    return flat || prefix || aliases || structure;
  }

  private static fields(target: AbstractValue, source: AbstractValue, depth: number): boolean {
    if (overCap(depth)) {
      return grewFrom(source.fields.values(), (field) => ValueFold.into(target, field, new Set()));
    }
    return grewFrom(source.fields, ([key, field]) =>
      ValueJoin.into(ensureField(target, key), field, depth + 1),
    );
  }

  static prefix(target: AbstractValue, sourceBound: readonly AbstractValue[], depth: number): boolean {
    if (overCap(depth)) {
      return grewFrom(sourceBound, (part) => ValueFold.into(target, part, new Set()));
    }
    target.bound ??= [];
    const prefix = target.bound;
    return grewAt(sourceBound, (part, index) => {
      if (overCap(index)) return ValueFold.into(target, part, new Set());
      const prior = prefix[index];
      const created = prior === undefined;
      const slot = prior ?? freshValue();
      if (created) prefix[index] = slot;
      return ValueJoin.into(slot, part, depth + 1) || created;
    });
  }
}

class ValueFold {
  // Drop field structure. Keep labels, formals, and every nested function. Ports stay
  // until a portless label of the same site subsumes them. Functions ride along so a
  // widened read (`fns[i]`, an iterated element) still dispatches instead of becoming
  // an unknown call. The function set is bounded by the script, so this cannot diverge.
  static into(out: AbstractValue, source: AbstractValue, seen: Set<AbstractValue>): boolean {
    if (!claim(seen, source)) return false;
    const flat = absorbFlat(out, source);
    const nested = grewFrom(source.fields.values(), (field) => ValueFold.into(out, field, seen));
    const prefix = source.bound;
    const bound =
      prefix === undefined
        ? false
        : grewFrom(prefix, (part) => ValueFold.into(out, part, seen));
    return flat || nested || bound;
  }

  static fresh(source: AbstractValue): AbstractValue {
    const folded = freshValue();
    ValueFold.into(folded, source, new Set());
    return folded;
  }
}

function carriesPort(value: AbstractValue, site: string): boolean {
  return [...value.occs.values()].some((row) => row.site === site && row.port !== undefined);
}

// Smear container-level labels onto a field read. Skip a portless container label
// when the field already carries a port of that site, or the portless label would
// erase the port. Placeholders always smear. Other fields do not.
function smearRead(out: AbstractValue, container: AbstractValue): void {
  for (const occ of container.occs.values()) {
    if (occ.port === undefined && carriesPort(out, occ.site)) continue;
    OccurrenceJoin.admit(out, occ);
  }
  for (const ph of container.phs.values()) PlaceholderJoin.admit(out, ph);
}

class Exactness {
  static cleared(source: AbstractValue): AbstractValue {
    const copy = freshValue();
    ValueJoin.into(copy, source, 0);
    Exactness.scrub(copy, new Set());
    return copy;
  }

  private static scrub(node: AbstractValue, seen: Set<AbstractValue>): void {
    if (!claim(seen, node)) return;
    for (const occ of node.occs.values()) occ.exact = false;
    for (const field of node.fields.values()) Exactness.scrub(field, seen);
    const prefix = node.bound;
    if (prefix === undefined) return;
    for (const part of prefix) Exactness.scrub(part, seen);
  }
}

function ensureField(container: AbstractValue, key: string): AbstractValue {
  const found = container.fields.get(key);
  if (found !== undefined) return found;
  const created = freshValue();
  container.fields.set(key, created);
  return created;
}

interface FieldWave {
  aliases: Set<AbstractValue>;
  member: string;
  payload: AbstractValue;
  seen: Set<AbstractValue>;
  depth: number;
}

interface NodeWave {
  aliases: Set<AbstractValue>;
  payload: AbstractValue;
  seen: Set<AbstractValue>;
}

class AliasReplay {
  // A field write also reaches `target[key]` for every place the container may be.
  // Exactness is cleared first: the write happens on one arm only. The container's
  // own slot is updated by the caller and stays exact. Chained aliases recurse, and
  // past the depth cap the write smears into the target's occurrences.
  static write(container: AbstractValue, key: string, value: AbstractValue): boolean {
    const aliases = container.mayAlias;
    if (aliases === undefined) return false;
    return AliasReplay.fields({ aliases, depth: 0, member: key, payload: Exactness.cleared(value), seen: new Set() });
  }

  private static fields(wave: FieldWave): boolean {
    return grewFrom(wave.aliases, (target) => {
      if (!claim(wave.seen, target)) return false;
      if (overCap(wave.depth)) return ValueFold.into(target, wave.payload, new Set());
      const direct = ValueJoin.into(ensureField(target, wave.member), wave.payload, 0);
      const nested = target.mayAlias;
      if (nested === undefined) return direct;
      const deeper = AliasReplay.fields({ aliases: nested, depth: wave.depth + 1, member: wave.member, payload: wave.payload, seen: wave.seen });
      return direct || deeper;
    });
  }

  // In-place mutation (`push`, `Map.set`): smear the collapsed value into each alias.
  static smear(container: AbstractValue, value: AbstractValue): boolean {
    const aliases = container.mayAlias;
    if (aliases === undefined) return false;
    return AliasReplay.nodes({ aliases, payload: Exactness.cleared(ValueFold.fresh(value)), seen: new Set() });
  }

  private static nodes(wave: NodeWave): boolean {
    return grewFrom(wave.aliases, (target) => {
      if (!claim(wave.seen, target)) return false;
      const direct = ValueJoin.into(target, wave.payload, 0);
      const nested = target.mayAlias;
      if (nested === undefined) return direct;
      const deeper = AliasReplay.nodes({ aliases: nested, payload: wave.payload, seen: wave.seen });
      return direct || deeper;
    });
  }
}

// Shallow copy: `target` adopts each of `source`'s field objects by reference, so a
// later write through either name hits the same node. A colliding field is merged
// into the source's field first (runtime overwrites; gen-only keeps both), then both
// names share that object. Only the top level is shared. The merge's own growth is
// not reported — callers that must not spin the fixpoint rely on that.
function shareFields(target: AbstractValue, source: AbstractValue): boolean {
  const adopted = [...source.fields].filter(([key, incoming]) => target.fields.get(key) !== incoming);
  for (const [key, incoming] of adopted) {
    const prior = target.fields.get(key);
    if (prior !== undefined) ValueJoin.into(incoming, prior, 0);
    target.fields.set(key, incoming);
  }
  return adopted.length > 0;
}

const kind = ts.SyntaxKind;
const FUNCTION_KINDS = new Set<ts.SyntaxKind>([
  kind.FunctionDeclaration, kind.FunctionExpression, kind.ArrowFunction, kind.MethodDeclaration,
  kind.GetAccessor, kind.SetAccessor, kind.Constructor,
]);
const DIRECT_CALLEE_KINDS = new Set<ts.SyntaxKind>([
  kind.Identifier, kind.PropertyAccessExpression, kind.FunctionExpression, kind.ArrowFunction,
]);

function compoundOps(): Set<ts.SyntaxKind> {
  return new Set<ts.SyntaxKind>([
    kind.PlusEqualsToken, kind.MinusEqualsToken, kind.AsteriskEqualsToken, kind.AsteriskAsteriskEqualsToken,
    kind.SlashEqualsToken, kind.PercentEqualsToken, kind.LessThanLessThanEqualsToken,
    kind.GreaterThanGreaterThanEqualsToken, kind.GreaterThanGreaterThanGreaterThanEqualsToken,
    kind.AmpersandEqualsToken, kind.BarEqualsToken, kind.CaretEqualsToken,
    kind.BarBarEqualsToken, kind.AmpersandAmpersandEqualsToken, kind.QuestionQuestionEqualsToken,
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
  kind.ParenthesizedExpression, kind.NonNullExpression, kind.AsExpression,
  kind.SatisfiesExpression, kind.TypeAssertionExpression,
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

export function emptyValue(): AbstractValue { return freshValue(); }
export function phKey(ph: Placeholder): string { return PlaceholderJoin.key(ph); }
export function addOcc(target: AbstractValue, occ: TaintOcc): boolean { return OccurrenceJoin.admit(target, occ); }
export function addPlaceholder(target: AbstractValue, ph: Placeholder): boolean { return PlaceholderJoin.admit(target, ph); }
export function mergeInto(target: AbstractValue, source: AbstractValue, depth = 0): boolean { return ValueJoin.into(target, source, depth); }
export function mergeBound(target: AbstractValue, sourceBound: AbstractValue[], depth: number): boolean { return ValueJoin.prefix(target, sourceBound, depth); }
export function cloneValue(v: AbstractValue): AbstractValue { const copy = freshValue(); ValueJoin.into(copy, v, 0); return copy; }
export function unionValues(...values: AbstractValue[]): AbstractValue { const joined = freshValue(); grewFrom(values, (value) => ValueJoin.into(joined, value, 0)); return joined; }
export function singleOcc(site: string, exact: boolean, port?: number): AbstractValue { const labeled = freshValue(); OccurrenceJoin.admit(labeled, { exact, port, site }); return labeled; }
export function collapse(v: AbstractValue): AbstractValue { return ValueFold.fresh(v); }
export function collapseInto(out: AbstractValue, v: AbstractValue, seen = new Set<AbstractValue>()): boolean { return ValueFold.into(out, v, seen); }

export function readField(container: AbstractValue, key: string): AbstractValue {
  const known = container.fields.get(key);
  if (known === undefined) return ValueFold.fresh(container);
  const snapshot = freshValue();
  ValueJoin.into(snapshot, known, 0);
  smearRead(snapshot, container);
  return snapshot;
}

export function clearExact(v: AbstractValue): AbstractValue { return Exactness.cleared(v); }

export { isActorSite } from "./core.js";

export function provisionalFanoutId(order: number): string { return "fan-out@" + String(order); }

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

export function isFunctionLike(node: ts.Node): boolean { return FUNCTION_KINDS.has(node.kind); }

// Every function-like node except an arrow owns an `arguments` object. An arrow sees
// the enclosing function's arguments.
export function isNonArrowFunctionLike(node: ts.Node): boolean {
  return node.kind !== kind.ArrowFunction && FUNCTION_KINDS.has(node.kind);
}

// A directly named callee, or a function literal, keeps exactness. One parenthesis
// layer is ignored; deeper wrappers are not direct.
export function isDirectCallee(callee: ts.Expression): boolean {
  const expr = callee.kind === kind.ParenthesizedExpression ? (callee as ts.ParenthesizedExpression).expression : callee;
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

export function liveField(container: AbstractValue, key: string): AbstractValue { return ensureField(container, key); }
export function replayMayAliasWrite(container: AbstractValue, key: string, value: AbstractValue): boolean { return AliasReplay.write(container, key, value); }
export function replayMayAliasMerge(container: AbstractValue, value: AbstractValue): boolean { return AliasReplay.smear(container, value); }
export function adoptFields(target: AbstractValue, source: AbstractValue): boolean { return shareFields(target, source); }
export function bindingPropertyKey(element: ts.BindingElement): string | undefined { return literalText(element.propertyName ?? element.name); }

import ts from "typescript";
import type { TaintOcc } from "./domain.js";
import { isFunctionLike } from "./sites.js";
import { boundIdentifiers } from "./causality-order-functions.js";
import type { TraceState } from "./causality-order-state.js";
import {
  currentFrame,
  isVisiblySettled,
  joinStrands,
  type AwaitedOperand,
} from "./causality-order-strands.js";

// Oracle witnesses, barriers and guard bindings share the existing TraceState.
/** Ordered site claims; empty results share readonly arrays and must not be mutated. */
interface OracleClaim {
  certain: readonly string[];
  maybe: readonly string[];
}

const NO_CLAIM: OracleClaim = { certain: [], maybe: [] };

type Admission = "issued" | "repetition";

const LOOP_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
]);

/**
 * Cache lexical loop/callback ancestors by node identity. Parent links and iteration
 * indexes must remain stable while this TraceState cache is in use.
 */
function iterationAncestorsOf(trace: TraceState, node: ts.Node): Set<ts.Node> {
  const cached = trace.iterationAncestorCache.get(node);
  if (cached !== undefined) {
    return cached;
  }
  const found = new Set<ts.Node>();
  let cursor = node.parent;
  while (cursor !== undefined) {
    if (hostsIteration(trace, cursor)) found.add(cursor);
    cursor = cursor.parent;
  }
  trace.iterationAncestorCache.set(node, found);
  return found;
}

function hostsIteration(trace: TraceState, node: ts.Node): boolean {
  return (
    LOOP_KINDS.has(node.kind) || trace.candByCallback.has(node) || trace.eachCallbackFns.has(node)
  );
}

/**
 * Admit issued requests, or later sites sharing an indexed lexical iteration with
 * the await. Unissued sites outside that shared iteration are excluded.
 */
function admitStep(trace: TraceState, awaitNode: ts.Node, step: string): Admission | undefined {
  if (trace.issued.has(step)) return "issued";
  const call = trace.callByStep.get(step);
  if (call === undefined) return;
  const aroundAwait = iterationAncestorsOf(trace, awaitNode);
  if (aroundAwait.size === 0) return;
  for (const ancestor of iterationAncestorsOf(trace, call)) {
    if (aroundAwait.has(ancestor)) return "repetition";
  }
  return;
}

interface SiteRow {
  issuedFirst: boolean;
  exact: boolean;
}

function foldOccurrences(
  trace: TraceState,
  occs: readonly TaintOcc[],
  admit: ((step: string) => Admission | undefined) | undefined,
): Map<string, SiteRow> {
  const rows = new Map<string, SiteRow>();
  const present = occs.filter((occ) => trace.realSteps.has(occ.site));
  present.forEach((occ) => {
    const how = admit === undefined ? ("issued" as const) : admit(occ.site);
    if (how === undefined) return;
    const prior = rows.get(occ.site);
    if (prior === undefined)
      rows.set(occ.site, { issuedFirst: how === "issued", exact: occ.exact });
    else if (occ.exact) prior.exact = true;
  });
  return rows;
}

/**
 * Classify real, admitted sites in first-witness order, combining duplicate exactness.
 * Only one exact issued site is certain. Repetition stays maybe: boundary iterations
 * can await a seed or leave the final request pending. Guard reads omit temporal
 * admission because they describe control evidence rather than settlement.
 */
function claimAt(
  trace: TraceState,
  map: ReadonlyMap<number, ReadonlyArray<TaintOcc>>,
  at: number,
  admit?: (step: string) => Admission | undefined,
): OracleClaim {
  // First admission owns eligibility; any admitted exact witness can establish exactness.
  const occs = map.get(at);
  const rows =
    occs === undefined ? new Map<string, SiteRow>() : foldOccurrences(trace, occs, admit);
  const sites = [...rows.keys()];
  const only = sites.length === 1 ? sites[0] : undefined;
  const row = only === undefined ? undefined : rows.get(only);
  if (only !== undefined && row !== undefined && row.exact && row.issuedFirst) {
    return { certain: [only], maybe: [] };
  }
  if (sites.length === 0) {
    return NO_CLAIM;
  }
  const mixed: OracleClaim = { certain: [], maybe: sites };
  return mixed;
}

/** Read await-position witnesses using the current temporal admission rule. */
export function settlesAt(state: TraceState, node: ts.Node, at: number): OracleClaim {
  return claimAt(state, state.oracle.awaitSettles, at, (step) => admitStep(state, node, step));
}

function summarySteps(trace: TraceState, regions: readonly string[]): string[] {
  const steps: string[] = [];
  for (const region of regions) {
    const record = trace.strands.find((item) => item.region === region);
    if (record === undefined) continue;
    for (const step of record.summary) steps.push(step);
  }
  return steps;
}

function unseen(trace: TraceState, steps: readonly string[]): string[] {
  const fresh: string[] = [];
  const local = new Set<string>();
  steps.forEach((step) => {
    if (local.has(step) || isVisiblySettled(trace, step)) return;
    local.add(step);
    fresh.push(step);
  });
  return fresh;
}

function commit(frame: { settled: Set<string> }, steps: readonly string[]): void {
  for (const step of steps) frame.settled.add(step);
}

function pushSettle(
  trace: TraceState,
  chain: readonly string[],
  steps: readonly string[],
  maybe: boolean,
  joins: readonly string[] | undefined,
): void {
  if (joins === undefined) {
    trace.events.push({ at: "settle", maybe, regions: chain, steps });
    return;
  }
  trace.events.push({ at: "settle", maybe, regions: chain, steps, joins });
}

/**
 * Settle witnesses and joined summaries in certain-before-maybe order. Visibility
 * spans active frames; writes affect only the current frame. Already-settled claims
 * add no steps. Empty evidence widens to pending issued sites and may overstate order.
 * Joins attach to the first event, including an empty event when only a join remains.
 * Strand ownership and await-operand interpretation stay in joinStrands.
 */
// Commit one side before reading the next; certain steps become visible to maybe.
export function barrier(
  state: TraceState,
  certain: readonly string[],
  maybe: readonly string[],
  chain: readonly string[],
  awaited?: AwaitedOperand,
): void {
  const trace = state;
  const joins = joinStrands(trace, certain, maybe, awaited);
  const certainNamed = certain.concat(summarySteps(trace, joins.certain));
  const maybeNamed = maybe.concat(summarySteps(trace, joins.maybe));
  const hadEvidence = certainNamed.length > 0 || maybeNamed.length > 0;
  const joined = joins.certain.concat(joins.maybe);
  const frame = currentFrame(trace);
  const certainFresh = unseen(trace, certainNamed);
  commit(frame, certainFresh);
  let maybeFresh = unseen(trace, maybeNamed);
  commit(frame, maybeFresh);
  if (certainFresh.length === 0 && maybeFresh.length === 0 && !hadEvidence) {
    maybeFresh = unseen(trace, [...trace.issued]);
    commit(frame, maybeFresh);
  }
  // Resolve all state changes before publishing; a join with no steps still has an event.
  let pending: readonly string[] | undefined = joined.length === 0 ? undefined : joined;
  if (certainFresh.length === 0 && maybeFresh.length === 0) {
    if (pending !== undefined) {
      trace.events.push({ at: "settle", joins: pending, maybe: false, regions: chain, steps: [] });
    }
    return;
  }
  if (certainFresh.length > 0) {
    pushSettle(trace, chain, certainFresh, false, pending);
    pending = undefined;
  }
  if (maybeFresh.length > 0) pushSettle(trace, chain, maybeFresh, true, pending);
}

/** Bind each pattern leaf to ordered step identities; ignore identifiers without symbols. */
export function bindSteps(state: TraceState, name: ts.BindingName, steps: readonly string[]): void {
  const idle = steps.length === 0;
  if (idle) return;
  for (const identifier of boundIdentifiers(name)) {
    const located = state.checker.getSymbolAtLocation(identifier);
    if (located === undefined) continue;
    const bucket = state.stepsBySymbol.get(located) ?? new Set<string>();
    for (const step of steps) bucket.add(step);
    state.stepsBySymbol.set(located, bucket);
  }
}

function appendUnique(into: string[], seen: Set<string>, steps: Iterable<string>): void {
  for (const step of steps) {
    if (seen.has(step)) continue;
    seen.add(step);
    into.push(step);
  }
}

function guardIdentifiers(guard: ts.Expression): ts.Identifier[] {
  const names: ts.Identifier[] = [];
  const visit = (node: ts.Node): undefined => {
    if (isFunctionLike(node)) {
      return undefined;
    }
    if (node.kind === ts.SyntaxKind.Identifier) {
      names.push(node as ts.Identifier);
      return undefined;
    }
    ts.forEachChild(node, visit);
    return undefined;
  };
  visit(guard);
  return names;
}

/**
 * Scan guard bindings without entering nested functions, then merge oracle witnesses.
 * Syntactic and exact singleton controllers take precedence over ambiguous sites.
 * Both inputs are needed for implicit-control and derived-value evidence.
 */
function controllersOf(
  trace: TraceState,
  guard: ts.Expression,
): { controllers: string[]; maybeControllers: string[] } {
  const direct: string[] = [];
  const seen = new Set<string>();
  for (const name of guardIdentifiers(guard)) {
    const symbol = trace.checker.getSymbolAtLocation(name);
    const steps = symbol === undefined ? undefined : trace.stepsBySymbol.get(symbol);
    if (steps !== undefined) appendUnique(direct, seen, steps);
  }
  const claim = claimAt(trace, trace.oracle.guardReads, guard.getStart(trace.scriptFile));
  appendUnique(direct, seen, claim.certain);
  return { controllers: direct, maybeControllers: claim.maybe.filter((step) => !seen.has(step)) };
}

/** Append a control record only when either controller list has entries. */
export function recordControl(state: TraceState, guard: ts.Expression, region: string): void {
  const found = controllersOf(state, guard);
  if (found.controllers.length === 0 && found.maybeControllers.length === 0) return;
  state.controls.push({
    controllers: found.controllers,
    maybeControllers: found.maybeControllers,
    region,
  });
}

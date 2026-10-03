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

/**
 * Cache lexical loop/callback ancestors by node identity. Parent links and iteration
 * indexes must remain stable while this TraceState cache is in use.
 */
function iterationAncestorsOf(state: TraceState, node: ts.Node): Set<ts.Node> {
  const cached = state.iterationAncestorCache.get(node);
  if (cached !== undefined) return cached;
  const out = new Set<ts.Node>();
  for (let cur = node.parent; cur !== undefined; cur = cur.parent) {
    if (
      ts.isForStatement(cur) ||
      ts.isForOfStatement(cur) ||
      ts.isForInStatement(cur) ||
      ts.isWhileStatement(cur) ||
      ts.isDoStatement(cur) ||
      state.candByCallback.has(cur) ||
      state.eachCallbackFns.has(cur)
    ) {
      out.add(cur);
    }
  }
  state.iterationAncestorCache.set(node, out);
  return out;
}

/**
 * Admit issued requests, or later sites sharing an indexed lexical iteration with
 * the await. Unissued sites outside that shared iteration are excluded.
 */
function admissionOf(
  state: TraceState,
  awaitNode: ts.Node,
  step: string,
): "issued" | "repetition" | undefined {
  if (state.issued.has(step)) return "issued";
  const call = state.callByStep.get(step);
  if (call === undefined) return undefined;
  const enclosing = iterationAncestorsOf(state, awaitNode);
  if (enclosing.size === 0) return undefined;
  for (const ancestor of iterationAncestorsOf(state, call)) {
    if (enclosing.has(ancestor)) return "repetition";
  }
  return undefined;
}

/**
 * Classify real, admitted sites in first-witness order, combining duplicate exactness.
 * Only one exact issued site is certain. Repetition stays maybe: boundary iterations
 * can await a seed or leave the final request pending. Guard reads omit temporal
 * admission because they describe control evidence rather than settlement.
 */
function claimAt(
  state: TraceState,
  map: Map<number, TaintOcc[]>,
  at: number,
  admit?: (step: string) => "issued" | "repetition" | undefined,
): OracleClaim {
  const occs = (map.get(at) ?? []).filter((occ) => state.realSteps.has(occ.site));
  // First admission owns eligibility; any admitted exact witness can establish exactness.
  const eligible = new Map<string, boolean>();
  const exact = new Set<string>();
  for (const occ of occs) {
    const how = admit === undefined ? "issued" : admit(occ.site);
    if (how === undefined) continue;
    if (!eligible.has(occ.site)) eligible.set(occ.site, how === "issued");
    if (!exact.has(occ.site) && occ.exact) exact.add(occ.site);
  }
  const sites = [...eligible.keys()];
  if (sites.length === 0) return NO_CLAIM;
  const only = sites[0] as string;
  if (sites.length === 1 && exact.has(only) && eligible.get(only))
    return { certain: [only], maybe: [] };
  return { certain: [], maybe: sites };
}

/** Read await-position witnesses using the current temporal admission rule. */
export function settlesAt(state: TraceState, node: ts.Node, at: number): OracleClaim {
  return claimAt(state, state.oracle.awaitSettles, at, (step) => admissionOf(state, node, step));
}

/**
 * Settle witnesses and joined summaries in certain-before-maybe order. Visibility
 * spans active frames; writes affect only the current frame. Already-settled claims
 * add no steps. Empty evidence widens to pending issued sites and may overstate order.
 * Joins attach to the first event, including an empty event when only a join remains.
 * Strand ownership and await-operand interpretation stay in joinStrands.
 */
export function barrier(
  state: TraceState,
  certain: readonly string[],
  maybe: readonly string[],
  chain: readonly string[],
  awaited?: AwaitedOperand,
): void {
  const { events, issued } = state;
  const joins = joinStrands(state, certain, maybe, awaited);
  const summaryOf = (regions: readonly string[]): string[] =>
    regions.flatMap((region) => [
      ...(state.strands.find((record) => record.region === region)?.summary ?? []),
    ]);
  const batches: [string[], string[]] = [
    [...certain, ...summaryOf(joins.certain)],
    [...maybe, ...summaryOf(joins.maybe)],
  ];
  const resolved = batches.some((steps) => steps.length > 0);
  const joined = [...joins.certain, ...joins.maybe];
  const frame = currentFrame(state);

  // Commit one side before reading the next; certain steps become visible to maybe.
  for (const [index, requests] of batches.entries()) {
    const fresh: string[] = [];
    for (const step of requests) {
      if (!isVisiblySettled(state, step) && !fresh.includes(step)) fresh.push(step);
    }
    for (const step of fresh) frame.settled.add(step);
    batches[index] = fresh;
  }
  if (batches[0].length === 0 && batches[1].length === 0 && !resolved) {
    batches[1] = [...issued].filter((step) => !isVisiblySettled(state, step));
    for (const step of batches[1]) frame.settled.add(step);
  }

  // Resolve all state changes before publishing; a join with no steps still has an event.
  if (batches[0].length === 0 && batches[1].length === 0) {
    if (joined.length > 0)
      events.push({ at: "settle", joins: joined, maybe: false, regions: chain, steps: [] });
    return;
  }
  let withJoins: { joins?: string[] } = joined.length === 0 ? {} : { joins: joined };
  for (const [index, steps] of batches.entries()) {
    if (steps.length === 0) continue;
    events.push({ at: "settle", maybe: index === 1, regions: chain, steps, ...withJoins });
    withJoins = {};
  }
}

/** Bind each pattern leaf to ordered step identities; ignore identifiers without symbols. */
export function bindSteps(state: TraceState, name: ts.BindingName, steps: readonly string[]): void {
  if (steps.length === 0) return;
  for (const identifier of boundIdentifiers(name)) {
    const symbol = state.checker.getSymbolAtLocation(identifier);
    if (symbol === undefined) continue;
    const set = state.stepsBySymbol.get(symbol) ?? new Set<string>();
    for (const step of steps) set.add(step);
    state.stepsBySymbol.set(symbol, set);
  }
}

/**
 * Scan guard bindings without entering nested functions, then merge oracle witnesses.
 * Syntactic and exact singleton controllers take precedence over ambiguous sites.
 * Both inputs are needed for implicit-control and derived-value evidence.
 */
function controllersOf(
  state: TraceState,
  guard: ts.Expression,
): { controllers: string[]; maybeControllers: string[] } {
  const controllers: string[] = [];
  const scan = (node: ts.Node): void => {
    if (isFunctionLike(node)) return;
    if (ts.isIdentifier(node)) {
      const symbol = state.checker.getSymbolAtLocation(node);
      const steps = symbol === undefined ? undefined : state.stepsBySymbol.get(symbol);
      if (steps !== undefined) {
        for (const step of steps) if (!controllers.includes(step)) controllers.push(step);
      }
      return;
    }
    ts.forEachChild(node, scan);
  };
  scan(guard);
  const claim = claimAt(state, state.oracle.guardReads, guard.getStart(state.scriptFile));
  for (const step of claim.certain) if (!controllers.includes(step)) controllers.push(step);
  return {
    controllers,
    maybeControllers: claim.maybe.filter((step) => !controllers.includes(step)),
  };
}

/** Append a control record only when either controller list has entries. */
export function recordControl(state: TraceState, guard: ts.Expression, region: string): void {
  const { controllers, maybeControllers } = controllersOf(state, guard);
  if (controllers.length > 0 || maybeControllers.length > 0) {
    state.controls.push({ controllers, maybeControllers, region });
  }
}

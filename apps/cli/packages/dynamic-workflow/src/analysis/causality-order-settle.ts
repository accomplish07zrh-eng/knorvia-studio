import ts from "typescript";
import type { TaintOcc } from "./domain.js";
import { isFunctionLike } from "./sites.js";
import type { SettleEvent } from "./causality-order-types.js";
import { boundIdentifiers } from "./causality-order-functions.js";
import type { TraceState } from "./causality-order-state.js";
import {
  currentFrame,
  type Frame,
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

type Admit = (step: string) => Admission | undefined;

type WitnessTable = ReadonlyMap<number, ReadonlyArray<TaintOcc>>;

type CarriedJoins = { joins?: readonly string[] };

type StrandJoin = { certain: string[]; maybe: string[] };

const NO_JOINS: CarriedJoins = {};

interface Witness {
  admittedBy: Admission;
  exactWitness: boolean;
  step: string;
}

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
function iterationAncestorsOf(trace: TraceState, origin: ts.Node): Set<ts.Node> {
  const memoized = trace.iterationAncestorCache.get(origin);
  if (memoized !== undefined) {
    return memoized;
  }
  const enclosing = enclosingLoops(trace, origin);
  trace.iterationAncestorCache.set(origin, enclosing);
  return enclosing;
}

function enclosingLoops(trace: TraceState, origin: ts.Node): Set<ts.Node> {
  const found = new Set<ts.Node>();
  let cursor: ts.Node | undefined = origin.parent;
  while (cursor !== undefined) {
    if (hostsIteration(trace, cursor)) {
      found.add(cursor);
    }
    cursor = cursor.parent;
  }
  return found;
}

function hostsIteration(trace: TraceState, candidate: ts.Node): boolean {
  return (
    LOOP_KINDS.has(candidate.kind) ||
    trace.candByCallback.has(candidate) ||
    trace.eachCallbackFns.has(candidate)
  );
}

/**
 * Admit issued requests, or later sites sharing an indexed lexical iteration with
 * the await. Unissued sites outside that shared iteration are excluded.
 */
function admitStep(trace: TraceState, awaitNode: ts.Node, step: string): Admission | undefined {
  if (trace.issued.has(step)) {
    return "issued";
  }
  const request = trace.callByStep.get(step);
  const loopShared = request !== undefined && sharesIteration(trace, awaitNode, request);
  return loopShared ? "repetition" : undefined;
}

function sharesIteration(trace: TraceState, awaitNode: ts.Node, request: ts.Node): boolean {
  const aroundAwait = iterationAncestorsOf(trace, awaitNode);
  if (aroundAwait.size === 0) {
    return false;
  }
  for (const ancestor of iterationAncestorsOf(trace, request)) {
    if (aroundAwait.has(ancestor)) {
      return true;
    }
  }
  return false;
}

function realOccurrences(trace: TraceState, occurrences: readonly TaintOcc[]): TaintOcc[] {
  return occurrences.filter((occ) => trace.realSteps.has(occ.site));
}

/**
 * Classify real, admitted sites in first-witness order, combining duplicate exactness.
 * Only one exact issued site is certain. Repetition stays maybe: boundary iterations
 * can await a seed or leave the final request pending. Guard reads omit temporal
 * admission because they describe control evidence rather than settlement.
 */
function admittedWitnesses(
  trace: TraceState,
  table: WitnessTable,
  position: number,
  admit?: Admit,
): Witness[] {
  const rows: Witness[] = [];
  const admittedByStep = new Map<string, Witness>();
  // First admission owns eligibility; any admitted exact witness can establish exactness.
  for (const occ of realOccurrences(trace, table.get(position) ?? [])) {
    const how = admit === undefined ? ("issued" as const) : admit(occ.site);
    const prior = how === undefined ? undefined : admittedByStep.get(occ.site);
    if (prior !== undefined) {
      prior.exactWitness ||= occ.exact;
    } else if (how !== undefined) {
      const row: Witness = { admittedBy: how, exactWitness: occ.exact, step: occ.site };
      admittedByStep.set(occ.site, row);
      rows.push(row);
    }
  }
  return rows;
}

function claimedSites(rows: readonly Witness[]): string[] {
  return rows.map((row) => row.step);
}

function settlesExactly(solo: Witness | undefined): boolean {
  return solo !== undefined && solo.exactWitness && solo.admittedBy === "issued";
}

function settleCertainty(rows: readonly Witness[]): OracleClaim {
  const witnesses = claimedSites(rows);
  const only = witnesses.length === 1 ? rows[0] : undefined;
  if (settlesExactly(only)) {
    return { certain: witnesses, maybe: [] };
  }
  if (rows.length === 0) {
    return NO_CLAIM;
  }
  return { certain: [], maybe: witnesses };
}

/** Read await-position witnesses using the current temporal admission rule. */
export function settlesAt(state: TraceState, node: ts.Node, at: number): OracleClaim {
  const admit = (step: string): Admission | undefined => admitStep(state, node, step);
  return settleCertainty(admittedWitnesses(state, state.oracle.awaitSettles, at, admit));
}

function summarisedStrands(trace: TraceState, regions: readonly string[]): string[] {
  const summaries: string[] = [];
  for (const region of regions) {
    const record = trace.strands.find((item) => item.region === region);
    if (record !== undefined) {
      summaries.push(...record.summary);
    }
  }
  return summaries;
}

function settledClaims(trace: TraceState, awaited: OracleClaim, joined: StrandJoin): OracleClaim {
  const certainSummary = summarisedStrands(trace, joined.certain);
  const maybeSummary = summarisedStrands(trace, joined.maybe);
  const batch: OracleClaim = {
    certain: awaited.certain.concat(certainSummary),
    maybe: awaited.maybe.concat(maybeSummary),
  };
  return batch;
}

function freshlySettled(trace: TraceState, frame: Frame, requested: readonly string[]): string[] {
  const freshSteps: string[] = [];
  requested.forEach((step) => {
    const already = freshSteps.includes(step) || isVisiblySettled(trace, step);
    if (!already) {
      frame.settled.add(step);
      freshSteps.push(step);
    }
  });
  return freshSteps;
}

function carriedJoins(linked: readonly string[]): CarriedJoins {
  return linked.length === 0 ? NO_JOINS : { joins: linked };
}

function joinOnlyEvent(chain: readonly string[], linked: readonly string[]): SettleEvent {
  return { at: "settle", joins: linked, maybe: false, regions: chain, steps: [] };
}

function settleEvent(
  steps: readonly string[],
  maybe: boolean,
  regions: readonly string[],
  rides: CarriedJoins,
): SettleEvent {
  return { at: "settle", maybe, regions, steps, ...rides };
}

function publishBarrier(
  trace: TraceState,
  regions: readonly string[],
  settled: readonly string[],
  pending: readonly string[],
  linked: readonly string[],
): void {
  const rides = carriedJoins(linked);
  const silent = settled.length + pending.length === 0;
  if (silent) {
    if (linked.length > 0) {
      trace.events.push(joinOnlyEvent(regions, linked));
    }
  } else if (settled.length > 0) {
    trace.events.push(settleEvent(settled, false, regions, rides));
    if (pending.length > 0) {
      trace.events.push(settleEvent(pending, true, regions, NO_JOINS));
    }
  } else {
    trace.events.push(settleEvent(pending, true, regions, rides));
  }
}

function widenedBatch(
  trace: TraceState,
  active: Frame,
  hadEvidence: boolean,
  settled: readonly string[],
  pending: readonly string[],
): readonly string[] {
  const nothingResolved = settled.length + pending.length === 0 && !hadEvidence;
  if (!nothingResolved) {
    return pending;
  }
  return freshlySettled(trace, active, [...trace.issued]);
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
  const merged = joinStrands(state, certain, maybe, awaited);
  const claimed = settledClaims(state, { certain, maybe }, merged);
  const hadEvidence = claimed.certain.length > 0 || claimed.maybe.length > 0;
  const linked = merged.certain.concat(merged.maybe);
  const active = currentFrame(state);
  const settled = freshlySettled(state, active, claimed.certain);
  const committed = freshlySettled(state, active, claimed.maybe);
  const pending = widenedBatch(state, active, hadEvidence, settled, committed);
  // Resolve all state changes before publishing; a join with no steps still has an event.
  publishBarrier(state, chain, settled, pending, linked);
}

/** Bind each pattern leaf to ordered step identities; ignore identifiers without symbols. */
export function bindSteps(state: TraceState, name: ts.BindingName, steps: readonly string[]): void {
  if (steps.length > 0) {
    for (const leaf of boundIdentifiers(name)) {
      rememberSteps(state, leaf, steps);
    }
  }
}

function rememberSteps(trace: TraceState, leaf: ts.Identifier, steps: readonly string[]): void {
  const symbol = trace.checker.getSymbolAtLocation(leaf);
  if (symbol !== undefined) {
    const bucket = trace.stepsBySymbol.get(symbol) ?? new Set<string>();
    steps.forEach((step) => bucket.add(step));
    trace.stepsBySymbol.set(symbol, bucket);
  }
}

function isGuardLeaf(node: ts.Node): node is ts.Identifier {
  return !isFunctionLike(node) && ts.isIdentifier(node);
}

function guardNames(collected: ts.Identifier[], node: ts.Node): void {
  if (isGuardLeaf(node)) {
    collected.push(node);
  } else if (!isFunctionLike(node)) {
    ts.forEachChild(node, (child) => guardNames(collected, child));
  }
}

function mergeSteps(
  leaves: readonly ts.Identifier[],
  exact: readonly string[],
  trace: TraceState,
): string[] {
  const merged: string[] = [];
  const take = (steps: Iterable<string>): void => {
    for (const step of steps) {
      if (!merged.includes(step)) {
        merged.push(step);
      }
    }
  };
  for (const leaf of leaves) {
    const symbol = trace.checker.getSymbolAtLocation(leaf);
    const bound = symbol === undefined ? undefined : trace.stepsBySymbol.get(symbol);
    if (bound !== undefined) {
      take(bound);
    }
  }
  take(exact);
  return merged;
}

/**
 * Scan guard bindings without entering nested functions, then merge oracle witnesses.
 * Syntactic and exact singleton controllers take precedence over ambiguous sites.
 * Both inputs are needed for implicit-control and derived-value evidence.
 */
function controllerLists(trace: TraceState, condition: ts.Expression): [string[], string[]] {
  const leaves: ts.Identifier[] = [];
  guardNames(leaves, condition);
  const position = condition.getStart(trace.scriptFile);
  const claim = settleCertainty(admittedWitnesses(trace, trace.oracle.guardReads, position));
  const controllers = mergeSteps(leaves, claim.certain, trace);
  const ambiguous = claim.maybe.filter((step) => !controllers.includes(step));
  return [controllers, ambiguous];
}

/** Append a control record only when either controller list has entries. */
export function recordControl(state: TraceState, guard: ts.Expression, region: string): void {
  const [controllers, ambiguous] = controllerLists(state, guard);
  if (controllers.length > 0 || ambiguous.length > 0) {
    state.controls.push({ controllers, maybeControllers: ambiguous, region });
  }
}

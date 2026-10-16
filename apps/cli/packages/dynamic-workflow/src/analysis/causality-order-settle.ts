// SPDX-License-Identifier: Apache-2.0

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

// Oracle claims, barriers, and guard bindings. The empty claim is shared and must not be mutated.

interface OracleClaim {
  certain: readonly string[];
  maybe: readonly string[];
}

const NO_CLAIM: OracleClaim = { certain: [], maybe: [] };

type Admission = "issued" | "repetition";

function iterationAncestorsOf(trace: TraceState, node: ts.Node): Set<ts.Node> {
  const cached = trace.iterationAncestorCache.get(node);
  if (cached !== undefined) return cached;
  const found = new Set<ts.Node>();
  let cursor: ts.Node | undefined = node.parent;
  while (cursor !== undefined) {
    if (hostsIteration(trace, cursor)) found.add(cursor);
    cursor = cursor.parent;
  }
  trace.iterationAncestorCache.set(node, found);
  return found;
}

function hostsIteration(trace: TraceState, node: ts.Node): boolean {
  switch (node.kind) {
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForOfStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.WhileStatement:
    case ts.SyntaxKind.DoStatement:
      return true;
    default:
      return trace.candByCallback.has(node) || trace.eachCallbackFns.has(node);
  }
}

function admitStep(trace: TraceState, awaitNode: ts.Node, step: string): Admission | undefined {
  if (trace.issued.has(step)) return "issued";
  const call = trace.callByStep.get(step);
  if (call === undefined) return undefined;
  const aroundAwait = iterationAncestorsOf(trace, awaitNode);
  if (aroundAwait.size === 0) return undefined;
  for (const ancestor of iterationAncestorsOf(trace, call)) {
    if (aroundAwait.has(ancestor)) return "repetition";
  }
  return undefined;
}

interface SiteRow {
  issuedFirst: boolean;
  exact: boolean;
}

function claimAt(
  trace: TraceState,
  map: ReadonlyMap<number, ReadonlyArray<TaintOcc>>,
  at: number,
  admit?: (step: string) => Admission | undefined,
): OracleClaim {
  const occs = map.get(at);
  const rows = new Map<string, SiteRow>();
  if (occs !== undefined) {
    let cursor = 0;
    while (cursor < occs.length) {
      const occ = occs[cursor];
      cursor += 1;
      if (occ === undefined || !trace.realSteps.has(occ.site)) continue;
      const how = admit === undefined ? "issued" : admit(occ.site);
      if (how === undefined) continue;
      const prior = rows.get(occ.site);
      if (prior === undefined) {
        rows.set(occ.site, { issuedFirst: how === "issued", exact: occ.exact });
      } else if (occ.exact) {
        prior.exact = true;
      }
    }
  }
  const sites = [...rows.keys()];
  if (sites.length === 0) return NO_CLAIM;
  const only = sites[0];
  const row = only === undefined ? undefined : rows.get(only);
  if (
    sites.length === 1 &&
    only !== undefined &&
    row !== undefined &&
    row.exact &&
    row.issuedFirst
  ) {
    return { certain: [only], maybe: [] };
  }
  return { certain: [], maybe: sites };
}

export function settlesAt(trace: TraceState, node: ts.Node, at: number): OracleClaim {
  return claimAt(trace, trace.oracle.awaitSettles, at, (step) => admitStep(trace, node, step));
}

function summarySteps(trace: TraceState, regions: readonly string[]): string[] {
  const steps: string[] = [];
  let cursor = 0;
  while (cursor < regions.length) {
    const region = regions[cursor];
    cursor += 1;
    if (region === undefined) continue;
    const record = trace.strands.find((item) => item.region === region);
    if (record === undefined) continue;
    for (const step of record.summary) steps.push(step);
  }
  return steps;
}

function unseen(trace: TraceState, steps: readonly string[]): string[] {
  const fresh: string[] = [];
  const local = new Set<string>();
  for (const step of steps) {
    if (local.has(step) || isVisiblySettled(trace, step)) continue;
    local.add(step);
    fresh.push(step);
  }
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
 * Certain steps are committed before maybe steps are filtered, so a step named
 * both ways is only certain. No evidence at all widens to every issued step that
 * is still unsettled on the open frames, and that widen is a may-settle. Joins ride
 * on the first published event, including an empty certain event when nothing else remains.
 */
export function barrier(
  trace: TraceState,
  certain: readonly string[],
  maybe: readonly string[],
  chain: readonly string[],
  awaited?: AwaitedOperand,
): void {
  const joins = joinStrands(trace, certain, maybe, awaited);
  const certainNamed = [...certain, ...summarySteps(trace, joins.certain)];
  const maybeNamed = [...maybe, ...summarySteps(trace, joins.maybe)];
  const hadEvidence = certainNamed.length > 0 || maybeNamed.length > 0;
  const joined = [...joins.certain, ...joins.maybe];
  const frame = currentFrame(trace);
  const certainFresh = unseen(trace, certainNamed);
  commit(frame, certainFresh);
  let maybeFresh = unseen(trace, maybeNamed);
  commit(frame, maybeFresh);
  if (certainFresh.length === 0 && maybeFresh.length === 0 && !hadEvidence) {
    maybeFresh = unseen(trace, [...trace.issued]);
    commit(frame, maybeFresh);
  }
  if (certainFresh.length === 0 && maybeFresh.length === 0) {
    if (joined.length > 0) {
      trace.events.push({
        at: "settle",
        joins: joined,
        maybe: false,
        regions: chain,
        steps: [],
      });
    }
    return;
  }
  let pendingJoins: readonly string[] | undefined = joined.length === 0 ? undefined : joined;
  if (certainFresh.length > 0) {
    pushSettle(trace, chain, certainFresh, false, pendingJoins);
    pendingJoins = undefined;
  }
  if (maybeFresh.length > 0) pushSettle(trace, chain, maybeFresh, true, pendingJoins);
}

export function bindSteps(trace: TraceState, name: ts.BindingName, steps: readonly string[]): void {
  if (steps.length === 0) return;
  const identifiers = boundIdentifiers(name);
  let cursor = 0;
  while (cursor < identifiers.length) {
    const identifier = identifiers[cursor];
    cursor += 1;
    if (identifier === undefined) continue;
    const symbol = trace.checker.getSymbolAtLocation(identifier);
    if (symbol === undefined) continue;
    const bucket = trace.stepsBySymbol.get(symbol) ?? new Set<string>();
    for (const step of steps) bucket.add(step);
    trace.stepsBySymbol.set(symbol, bucket);
  }
}

function appendUnique(into: string[], seen: Set<string>, steps: Iterable<string>): void {
  for (const step of steps) {
    if (seen.has(step)) continue;
    seen.add(step);
    into.push(step);
  }
}

function controllersOf(
  trace: TraceState,
  guard: ts.Expression,
): { controllers: string[]; maybeControllers: string[] } {
  const controllers: string[] = [];
  const seen = new Set<string>();
  const scan = (node: ts.Node): void => {
    if (isFunctionLike(node)) return;
    if (ts.isIdentifier(node)) {
      const symbol = trace.checker.getSymbolAtLocation(node);
      const steps = symbol === undefined ? undefined : trace.stepsBySymbol.get(symbol);
      if (steps !== undefined) appendUnique(controllers, seen, steps);
      return;
    }
    ts.forEachChild(node, scan);
  };
  scan(guard);
  const claim = claimAt(trace, trace.oracle.guardReads, guard.getStart(trace.scriptFile));
  appendUnique(controllers, seen, claim.certain);
  const maybeControllers = claim.maybe.filter((step) => !seen.has(step));
  return { controllers, maybeControllers };
}

export function recordControl(trace: TraceState, guard: ts.Expression, region: string): void {
  const found = controllersOf(trace, guard);
  if (found.controllers.length === 0 && found.maybeControllers.length === 0) return;
  trace.controls.push({
    controllers: found.controllers,
    maybeControllers: found.maybeControllers,
    region,
  });
}

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

// Claims, barriers, and guard bindings. The empty claim is shared and must stay immutable.

interface OracleClaim {
  readonly certain: readonly string[];
  readonly maybe: readonly string[];
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

function iterationAncestorsOf(trace: TraceState, node: ts.Node): Set<ts.Node> {
  const cached = trace.iterationAncestorCache.get(node);
  if (cached !== undefined) return cached;
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
  occs.forEach((occ) => {
    if (!trace.realSteps.has(occ.site)) return;
    const how = admit === undefined ? ("issued" as const) : admit(occ.site);
    if (how === undefined) return;
    const prior = rows.get(occ.site);
    if (prior === undefined)
      rows.set(occ.site, { issuedFirst: how === "issued", exact: occ.exact });
    else if (occ.exact) prior.exact = true;
  });
  return rows;
}

function claimAt(
  trace: TraceState,
  map: ReadonlyMap<number, ReadonlyArray<TaintOcc>>,
  at: number,
  admit?: (step: string) => Admission | undefined,
): OracleClaim {
  const occs = map.get(at);
  const rows =
    occs === undefined ? new Map<string, SiteRow>() : foldOccurrences(trace, occs, admit);
  const sites = [...rows.keys()];
  const only = sites.length === 1 ? sites[0] : undefined;
  const row = only === undefined ? undefined : rows.get(only);
  if (only !== undefined && row !== undefined && row.exact && row.issuedFirst) {
    return { certain: [only], maybe: [] };
  }
  if (sites.length === 0) return NO_CLAIM;
  return { certain: [], maybe: sites };
}

export function settlesAt(trace: TraceState, node: ts.Node, at: number): OracleClaim {
  return claimAt(trace, trace.oracle.awaitSettles, at, (step) => admitStep(trace, node, step));
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

// Certain steps are committed before maybe steps are filtered, so a step named
// both ways is only certain. No evidence widens to every issued step still
// unsettled on the open frames, and that widen is a may-settle. Joins ride on
// the first published event, including an empty certain event.
export function barrier(
  trace: TraceState,
  certain: readonly string[],
  maybe: readonly string[],
  chain: readonly string[],
  awaited?: AwaitedOperand,
): void {
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

export function bindSteps(trace: TraceState, name: ts.BindingName, steps: readonly string[]): void {
  if (steps.length === 0) return;
  for (const identifier of boundIdentifiers(name)) {
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

function guardIdentifiers(guard: ts.Expression): ts.Identifier[] {
  const names: ts.Identifier[] = [];
  const visit = (node: ts.Node): undefined => {
    if (isFunctionLike(node)) return;
    if (node.kind === ts.SyntaxKind.Identifier) {
      names.push(node as ts.Identifier);
      return;
    }
    ts.forEachChild(node, visit);
    return;
  };
  visit(guard);
  return names;
}

function controllersOf(
  trace: TraceState,
  guard: ts.Expression,
): { controllers: string[]; maybeControllers: string[] } {
  const controllers: string[] = [];
  const seen = new Set<string>();
  for (const name of guardIdentifiers(guard)) {
    const symbol = trace.checker.getSymbolAtLocation(name);
    const steps = symbol === undefined ? undefined : trace.stepsBySymbol.get(symbol);
    if (steps !== undefined) appendUnique(controllers, seen, steps);
  }
  const claim = claimAt(trace, trace.oracle.guardReads, guard.getStart(trace.scriptFile));
  appendUnique(controllers, seen, claim.certain);
  return { controllers, maybeControllers: claim.maybe.filter((step) => !seen.has(step)) };
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

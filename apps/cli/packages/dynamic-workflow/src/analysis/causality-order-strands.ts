// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import { isGlobalLibValue } from "./callbacks.js";
import { boundIdentifiers } from "./causality-order-functions.js";
import type { TraceState } from "./causality-order-state.js";

// One settled-set per open activation. The root frame is never a strand. A barrier
// writes only the innermost frame, so an await inside a strand does not settle the
// spawner's steps. `at` is a spawn index, not an event index: an event-index mark
// would let a strand that emits nothing tie with the await inside it and join itself.

export interface Frame {
  readonly region: string;
  readonly settled: Set<string>;
}

export interface StrandRecord {
  readonly region: string;
  readonly at: number;
  readonly issued: Set<string>;
  summary: ReadonlySet<string>;
  closed: boolean;
}

export interface AwaitedOperand {
  mark: number;
  operand: ts.Expression;
}

export function currentFrame(trace: TraceState): Frame {
  const top = trace.frames.at(-1);
  if (top === undefined) throw new Error("ordering walk has no active frame");
  return top;
}

export function isVisiblySettled(trace: TraceState, step: string): boolean {
  let cursor = 0;
  while (cursor < trace.frames.length) {
    const frame = trace.frames[cursor];
    cursor += 1;
    if (frame !== undefined && frame.settled.has(step)) return true;
  }
  return false;
}

export function innermostOpenStrand(trace: TraceState): StrandRecord | undefined {
  let cursor = trace.strands.length;
  while (cursor > 0) {
    cursor -= 1;
    const record = trace.strands[cursor];
    if (record !== undefined && !record.closed) return record;
  }
  return undefined;
}

export function openStrand(trace: TraceState, region: string): StrandRecord {
  const record: StrandRecord = {
    at: trace.strands.length,
    closed: false,
    issued: new Set<string>(),
    region,
    summary: new Set<string>(),
  };
  trace.strands.push(record);
  trace.frames.push({ region, settled: new Set<string>() });
  return record;
}

export function closeStrand(trace: TraceState, record: StrandRecord): void {
  const frame = trace.frames.pop();
  record.summary = frame === undefined ? new Set<string>() : frame.settled;
  record.closed = true;
}

export function strandMark(trace: TraceState): number {
  return trace.strands.length;
}

export function strandsSince(trace: TraceState, mark: number): string[] {
  const regions: string[] = [];
  for (const record of trace.strands) {
    if (record.at >= mark) regions.push(record.region);
  }
  return regions;
}

function addSymbols(
  trace: TraceState,
  name: ts.BindingName,
  values: readonly string[],
  map: Map<ts.Symbol, Set<string>>,
): void {
  if (values.length === 0) return;
  const identifiers = boundIdentifiers(name);
  let cursor = 0;
  while (cursor < identifiers.length) {
    const identifier = identifiers[cursor];
    cursor += 1;
    if (identifier === undefined) continue;
    const symbol = trace.checker.getSymbolAtLocation(identifier);
    if (symbol === undefined) continue;
    const bucket = map.get(symbol) ?? new Set<string>();
    let valueAt = 0;
    while (valueAt < values.length) {
      const value = values[valueAt];
      valueAt += 1;
      if (value !== undefined) bucket.add(value);
    }
    map.set(symbol, bucket);
  }
}

export function bindStrands(
  trace: TraceState,
  name: ts.BindingName,
  regions: readonly string[],
): void {
  addSymbols(trace, name, regions, trace.strandsBySymbol);
}

export function isAsyncFunction(decl: ts.Node): boolean {
  const modifiers = (decl as { modifiers?: ts.NodeArray<ts.ModifierLike> }).modifiers;
  if (modifiers === undefined) return false;
  let cursor = 0;
  while (cursor < modifiers.length) {
    const modifier = modifiers[cursor];
    cursor += 1;
    if (modifier !== undefined && modifier.kind === ts.SyntaxKind.AsyncKeyword) return true;
  }
  return false;
}

function promiseMethod(name: string): boolean {
  switch (name) {
    case "all":
    case "allSettled":
    case "race":
    case "any":
      return true;
    default:
      return false;
  }
}

function promiseCombinator(trace: TraceState, node: ts.CallExpression): boolean {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee) || !promiseMethod(callee.name.text)) return false;
  return isGlobalLibValue(callee.expression, "Promise", trace.checker, trace.program);
}

function unwrapAwaited(node: ts.Expression): ts.Expression | undefined {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSpreadElement(node)
  ) {
    return node.expression;
  }
  return undefined;
}

function pushReversed(stack: ts.Expression[], nodes: readonly ts.Expression[]): void {
  let cursor = nodes.length;
  while (cursor > 0) {
    cursor -= 1;
    const node = nodes[cursor];
    if (node !== undefined) stack.push(node);
  }
}

// Depth-first, left to right. Anything that is not an awaited position is opaque,
// so `await f(work.length)` does not join strands stored in `work`.
function awaitedIdentifiers(trace: TraceState, operand: ts.Expression): ts.Identifier[] {
  const found: ts.Identifier[] = [];
  const stack: ts.Expression[] = [operand];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    const inner = unwrapAwaited(node);
    if (inner !== undefined) {
      stack.push(inner);
      continue;
    }
    if (ts.isIdentifier(node)) {
      found.push(node);
      continue;
    }
    if (ts.isArrayLiteralExpression(node)) {
      pushReversed(stack, node.elements);
      continue;
    }
    if (ts.isCallExpression(node) && promiseCombinator(trace, node)) {
      pushReversed(stack, node.arguments);
    }
  }
  return found;
}

function takeJoin(trace: TraceState, region: string, side: string[]): void {
  if (trace.joined.has(region)) return;
  trace.joined.add(region);
  side.push(region);
}

function adoptSpawned(trace: TraceState, awaited: AwaitedOperand, certain: string[]): void {
  const spawned = strandsSince(trace, awaited.mark);
  let cursor = 0;
  while (cursor < spawned.length) {
    const region = spawned[cursor];
    cursor += 1;
    if (region !== undefined) takeJoin(trace, region, certain);
  }
  const identifiers = awaitedIdentifiers(trace, awaited.operand);
  let nameAt = 0;
  while (nameAt < identifiers.length) {
    const identifier = identifiers[nameAt];
    nameAt += 1;
    if (identifier === undefined) continue;
    const symbol = trace.checker.getSymbolAtLocation(identifier);
    const bound = symbol === undefined ? undefined : trace.strandsBySymbol.get(symbol);
    if (bound === undefined) continue;
    for (const region of bound) takeJoin(trace, region, certain);
  }
}

function holdsStep(record: StrandRecord, steps: readonly string[]): boolean {
  let cursor = 0;
  while (cursor < steps.length) {
    const step = steps[cursor];
    cursor += 1;
    if (step !== undefined && record.issued.has(step)) return true;
  }
  return false;
}

/**
 * Certain joins are strands spawned or named by the operand, plus closed strands
 * whose issued steps this barrier claims for certain. Maybe claims lift the same
 * way at maybe strength. A region is joined at most once.
 */
export function joinStrands(
  trace: TraceState,
  certain: readonly string[],
  maybe: readonly string[],
  awaited: AwaitedOperand | undefined,
): { certain: string[]; maybe: string[] } {
  const joins = { certain: [] as string[], maybe: [] as string[] };
  if (awaited !== undefined) adoptSpawned(trace, awaited, joins.certain);
  for (const record of trace.strands) {
    if (!record.closed || trace.joined.has(record.region)) continue;
    if (holdsStep(record, certain)) takeJoin(trace, record.region, joins.certain);
    else if (holdsStep(record, maybe)) takeJoin(trace, record.region, joins.maybe);
  }
  return joins;
}

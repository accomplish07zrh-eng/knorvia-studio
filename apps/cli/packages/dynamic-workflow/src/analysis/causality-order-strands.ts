// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import { isGlobalLibValue } from "./callbacks.js";
import { boundIdentifiers } from "./causality-order-functions.js";
import type { TraceState } from "./causality-order-state.js";

// One settled-set per open activation. The root frame is never a strand. A barrier
// writes only the innermost frame. `at` is a spawn index, not an event index.

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

const PROMISE_COMBINATORS: ReadonlySet<string> = new Set(["all", "allSettled", "race", "any"]);

const UNWRAP_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.AsExpression,
  ts.SyntaxKind.SatisfiesExpression,
  ts.SyntaxKind.NonNullExpression,
  ts.SyntaxKind.SpreadElement,
]);

export function currentFrame(trace: TraceState): Frame {
  const top = trace.frames.at(-1);
  if (top === undefined) throw new Error("ordering walk has no active frame");
  return top;
}

export function isVisiblySettled(trace: TraceState, step: string): boolean {
  return trace.frames.some((frame) => frame.settled.has(step));
}

export function innermostOpenStrand(trace: TraceState): StrandRecord | undefined {
  for (let index = trace.strands.length - 1; index >= 0; index -= 1) {
    const record = trace.strands[index];
    if (record !== undefined && !record.closed) return record;
  }
  return undefined;
}

export function openStrand(trace: TraceState, region: string): StrandRecord {
  const issued = new Set<string>();
  const summary = new Set<string>();
  const record = {
    at: trace.strands.length,
    closed: false,
    issued,
    region,
    summary,
  } as StrandRecord;
  trace.strands.push(record);
  trace.frames.push({ region, settled: new Set<string>() });
  return trace.strands.at(-1) ?? record;
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
  return trace.strands.filter((record) => record.at >= mark).map((record) => record.region);
}

export function bindStrands(
  trace: TraceState,
  name: ts.BindingName,
  regions: readonly string[],
): void {
  if (regions.length === 0) return;
  boundIdentifiers(name).forEach((identifier) => {
    const symbol = trace.checker.getSymbolAtLocation(identifier);
    if (symbol === undefined) return;
    const bucket = trace.strandsBySymbol.get(symbol) ?? new Set<string>();
    regions.forEach((region) => {
      bucket.add(region);
    });
    trace.strandsBySymbol.set(symbol, bucket);
  });
}

export function isAsyncFunction(decl: ts.Node): boolean {
  if (!ts.canHaveModifiers(decl)) return false;
  const modifiers = ts.getModifiers(decl);
  if (modifiers === undefined) return false;
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword);
}

function promiseCombinator(trace: TraceState, node: ts.CallExpression): boolean {
  if (node.expression.kind !== ts.SyntaxKind.PropertyAccessExpression) return false;
  const callee = node.expression as ts.PropertyAccessExpression;
  if (!PROMISE_COMBINATORS.has(callee.name.text)) return false;
  return isGlobalLibValue(callee.expression, "Promise", trace.checker, trace.program);
}

function innerExpression(node: ts.Node): ts.Expression | undefined {
  if (!UNWRAP_KINDS.has(node.kind)) return undefined;
  return (node as ts.Node & { expression: ts.Expression }).expression;
}

// Left to right. A call that is not a Promise combinator is opaque, so
// `await f(work.length)` does not join strands stored in `work`.
class AwaitedNames {
  constructor(
    private readonly trace: TraceState,
    private readonly into: ts.Identifier[],
  ) {}

  collect(node: ts.Expression): void {
    const unwrapped = innerExpression(node);
    if (unwrapped !== undefined) {
      this.collect(unwrapped);
    } else if (node.kind === ts.SyntaxKind.Identifier) {
      this.into.push(node as ts.Identifier);
    } else if (node.kind === ts.SyntaxKind.ArrayLiteralExpression) {
      this.elements((node as ts.ArrayLiteralExpression).elements);
    } else if (
      node.kind === ts.SyntaxKind.CallExpression &&
      promiseCombinator(this.trace, node as ts.CallExpression)
    ) {
      this.elements((node as ts.CallExpression).arguments);
    }
  }

  private elements(nodes: readonly ts.Expression[]): void {
    nodes.forEach((element) => {
      if (element.kind !== ts.SyntaxKind.OmittedExpression) this.collect(element);
    });
  }
}

function collectAwaited(trace: TraceState, node: ts.Expression, into: ts.Identifier[]): void {
  new AwaitedNames(trace, into).collect(node);
}

function takeJoin(trace: TraceState, region: string, side: string[]): void {
  if (trace.joined.has(region)) return;
  trace.joined.add(region);
  side.splice(side.length, 0, region);
}

function adoptSpawned(trace: TraceState, awaited: AwaitedOperand, certain: string[]): void {
  for (const region of strandsSince(trace, awaited.mark)) takeJoin(trace, region, certain);
  const names: ts.Identifier[] = [];
  collectAwaited(trace, awaited.operand, names);
  for (const identifier of names) {
    const symbol = trace.checker.getSymbolAtLocation(identifier);
    const bound = symbol === undefined ? undefined : trace.strandsBySymbol.get(symbol);
    if (bound === undefined) continue;
    for (const region of bound) takeJoin(trace, region, certain);
  }
}

function holdsStep(record: StrandRecord, steps: readonly string[]): boolean {
  return steps.some((step) => record.issued.has(step));
}

// Certain joins are strands spawned or named by the operand, plus closed strands
// whose issued steps this barrier claims for certain. Maybe claims lift the same
// way. A region is joined at most once.
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
  return { certain: joins.certain, maybe: joins.maybe };
}

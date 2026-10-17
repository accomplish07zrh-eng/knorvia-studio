// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import { isGlobalLibValue } from "./callbacks.js";
import { boundIdentifiers } from "./causality-order-functions.js";
import type { TraceState } from "./causality-order-state.js";

// One settled-set per open activation. The root frame is never a strand. A barrier
// writes only the innermost frame. `at` is a spawn index, not an event index.

/**
 * Activation-stack entry. `region` names the activation. `settled` holds the
 * step ids committed while that entry is top of `frames`.
 */
export interface Frame {
  readonly region: string;
  readonly settled: Set<string>;
}

/** Opened by `openStrand` and sealed by `closeStrand`. */
export interface StrandRecord {
  /** Same region string copied onto the frame pushed with this record. */
  readonly region: string;
  /**
   * `strands.length` taken before this record is pushed, so it is the index
   * the record occupies. `strandsSince` keeps records with `at` at or above a mark.
   */
  readonly at: number;
  /** Step ids added by `issue` when this record is the innermost one still open. */
  readonly issued: Set<string>;
  /** Set by `closeStrand` to the popped frame's `settled` set, or to a new empty set when no frame was popped. */
  summary: ReadonlySet<string>;
  /** Flipped to true by `closeStrand`. The lift loop skips a record while this stays false. */
  closed: boolean;
}

/** Inputs `joinStrands` uses when the barrier was given an await operand. */
export interface AwaitedOperand {
  /** Compared with `StrandRecord.at` to choose regions opened after the save point. */
  mark: number;
  operand: ts.Expression;
}

// A strand the walk itself opened. Plain records still close through `sealRecord`,
// because a caller may hold the interface rather than this class.
class OpenStrand implements StrandRecord {
  readonly issued = new Set<string>();
  summary: ReadonlySet<string> = new Set<string>();
  closed = false;

  constructor(
    readonly region: string,
    readonly at: number,
  ) {}
}

function sealRecord(this: StrandRecord, settled: ReadonlySet<string>): void {
  this.summary = settled;
  this.closed = true;
}

const PROMISE_COMBINATORS: ReadonlySet<string> = new Set(["all", "allSettled", "race", "any"]);

const UNWRAP_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.AsExpression,
  ts.SyntaxKind.SatisfiesExpression,
  ts.SyntaxKind.NonNullExpression,
  ts.SyntaxKind.SpreadElement,
]);

/** Return the last frame. Throw if `frames` has no entry. */
export function currentFrame(state: TraceState): Frame;
export function currentFrame(trace: TraceState): Frame {
  const top = trace.frames.at(-1);
  if (top === undefined) throw new Error("ordering walk has no active frame");
  return top;
}

/** True when any frame already lists `step` in `settled`. */
export function isVisiblySettled(state: TraceState, step: string): boolean;
export function isVisiblySettled(trace: TraceState, step: string): boolean {
  return trace.frames.some((frame) => frame.settled.has(step));
}

/** Scan `strands` from the end and return the first record that is not closed. */
export function innermostOpenStrand(state: TraceState): StrandRecord | undefined;
export function innermostOpenStrand(trace: TraceState): StrandRecord | undefined {
  for (let index = trace.strands.length - 1; index >= 0; index -= 1) {
    const record = trace.strands[index];
    if (record !== undefined && !record.closed) return record;
  }
}

/** Append an open record whose `at` is the pre-push length, then append a frame with an empty `settled` set. */
export function openStrand(state: TraceState, region: string): StrandRecord;
export function openStrand(trace: TraceState, region: string): StrandRecord {
  const record = new OpenStrand(region, trace.strands.length);
  trace.strands.push(record);
  trace.frames.push({ region, settled: new Set<string>() });
  return trace.strands.at(-1) ?? record;
}

/** Pop one frame and store its `settled` set on `record`, or store a new empty set if the pop yields nothing. */
export function closeStrand(state: TraceState, record: StrandRecord): void;
export function closeStrand(trace: TraceState, record: StrandRecord): void {
  const frame = trace.frames.pop();
  const settled = frame === undefined ? new Set<string>() : frame.settled;
  sealRecord.call(record, settled);
}

/** Present length of `strands`. */
export function strandMark(state: TraceState): number;
export function strandMark(trace: TraceState): number {
  return trace.strands.length;
}

/** Regions whose records have `at >= mark`, in their current array order. */
export function strandsSince(state: TraceState, mark: number): string[];
export function strandsSince(trace: TraceState, mark: number): string[] {
  return trace.strands.filter((record) => record.at >= mark).map((record) => record.region);
}

/**
 * Copy each region onto the symbol of every identifier in `name`.
 * An empty `regions` array does not resolve that binding.
 */
export function bindStrands(
  state: TraceState,
  name: ts.BindingName,
  regions: readonly string[],
): void {
  const trace = state;
  const identifiers = regions.length === 0 ? [] : boundIdentifiers(name);
  identifiers.forEach((identifier) => {
    const symbol = trace.checker.getSymbolAtLocation(identifier);
    if (symbol === undefined) return;
    const bucket = trace.strandsBySymbol.get(symbol) ?? new Set<string>();
    regions.forEach((region) => {
      bucket.add(region);
    });
    trace.strandsBySymbol.set(symbol, bucket);
  });
}

/** True only when `decl` accepts modifiers and one of them is `async`. */
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
  if (UNWRAP_KINDS.has(node.kind)) {
    return (node as ts.Node & { expression: ts.Expression }).expression;
  }
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
      return;
    }
    if (node.kind === ts.SyntaxKind.Identifier) {
      this.into.push(node as ts.Identifier);
      return;
    }
    if (node.kind === ts.SyntaxKind.ArrayLiteralExpression) {
      this.elements((node as ts.ArrayLiteralExpression).elements);
      return;
    }
    if (this.promiseList(node)) this.elements(node.arguments);
  }

  private promiseList(node: ts.Expression): node is ts.CallExpression {
    return ts.isCallExpression(node) && promiseCombinator(this.trace, node);
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
/**
 * Partition joined regions into `certain` and `maybe`.
 * A region already stored in `joined` is left out; each region that is kept is
 * recorded there before it is appended.
 * With `awaited`, regions from `strandsSince(awaited.mark)` go to `certain`, and
 * so do regions previously bound to identifiers gathered from `awaited.operand`.
 * Gathering descends through parentheses, `as`, `satisfies`, non-null, and spread,
 * keeps identifiers, keeps array elements that are not holes, and keeps arguments
 * of a global `Promise.all`, `allSettled`, `race`, or `any` call. Any other call
 * contributes nothing from its interior.
 * Each later closed record is `certain` when one of `certain` occurs in `issued`,
 * and otherwise `maybe` when one of `maybe` occurs in `issued`.
 */
export function joinStrands(
  state: TraceState,
  certain: readonly string[],
  maybe: readonly string[],
  awaited: AwaitedOperand | undefined,
): { certain: string[]; maybe: string[] } {
  const trace = state;
  const joins = { certain: [] as string[], maybe: [] as string[] };
  if (awaited !== undefined) adoptSpawned(trace, awaited, joins.certain);
  for (const record of trace.strands) {
    if (!record.closed || trace.joined.has(record.region)) continue;
    if (holdsStep(record, certain)) takeJoin(trace, record.region, joins.certain);
    else if (holdsStep(record, maybe)) takeJoin(trace, record.region, joins.maybe);
  }
  return { certain: joins.certain, maybe: joins.maybe };
}

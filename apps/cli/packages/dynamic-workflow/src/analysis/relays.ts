// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import { addOcc, collapse, liveField, mergeInto, singleOcc, type AbstractValue } from "./domain.js";
import type { EvalContext, Evaluator } from "./taint.js";

// Port used when a join input is not a closed array literal. Negative so it never
// collides with a real element index, and so emission drops the port on the edge.
const OPAQUE_JOIN_PORT = -1;

function grew(ev: Evaluator, delta: boolean): void {
  if (!delta) return;
  ev.s.changed = true;
}

function sinkCollapsed(
  ev: Evaluator,
  bucket: Map<string, AbstractValue>,
  id: string,
  expr: ts.Expression,
  ctx: EvalContext,
): void {
  ev.s.mergeSink(bucket, id, collapse(ev.evalExpr(expr, ctx)));
}

// Ask's first argument is the receiver, already sunk through the site record.
// Later arguments are visited only so writes and nested facades still run.
function visitNonReceiverArgs(
  ev: Evaluator,
  args: readonly ts.Expression[],
  ctx: EvalContext,
): void {
  let index = 1;
  while (index < args.length) {
    const extra = args[index];
    index += 1;
    if (extra === undefined) continue;
    ev.evalExpr(extra, ctx);
  }
}

export function handleAsk(
  ev: Evaluator,
  node: ts.CallExpression,
  askId: string,
  ctx: EvalContext,
): AbstractValue {
  ev.s.markFacade(ctx.regionStack);
  const recorded = ev.s.askSites.get(askId);
  if (recorded !== undefined) {
    sinkCollapsed(ev, ev.s.askRecv, askId, recorded.receiver, ctx);
    const instructions = recorded.instructions;
    if (instructions !== undefined) {
      sinkCollapsed(ev, ev.s.askInstr, askId, instructions, ctx);
    }
  }
  visitNonReceiverArgs(ev, node.arguments, ctx);
  return singleOcc(askId, true);
}

export function handleWorldRead(
  ev: Evaluator,
  id: string,
  args: readonly ts.Expression[],
  ctx: EvalContext,
): AbstractValue {
  ev.s.markFacade(ctx.regionStack);
  let index = 0;
  while (index < args.length) {
    const arg = args[index];
    index += 1;
    if (arg === undefined) continue;
    // Any position is a dependency. World ops disagree on arity, and an artifact
    // in a trailing optional slot is still data the read depends on.
    sinkCollapsed(ev, ev.s.worldRead, id, arg, ctx);
  }
  return singleOcc(id, true);
}

function closedArrayLiteral(arg: ts.Expression | undefined): arg is ts.ArrayLiteralExpression {
  if (arg === undefined) return false;
  if (!ts.isArrayLiteralExpression(arg)) return false;
  let index = 0;
  while (index < arg.elements.length) {
    const element = arg.elements[index];
    index += 1;
    if (element !== undefined && ts.isSpreadElement(element)) return false;
  }
  return true;
}

// A place element may-aliases its tuple slot: Promise.all resolves a non-promise
// input to that value itself, so a later write through the slot reaches it. The
// port occurrence stays on the field, so the relay edge is not replaced by the alias.
function rememberPlaceAlias(ev: Evaluator, field: AbstractValue, place: AbstractValue): void {
  const known = field.mayAlias;
  const targets = known ?? new Set<AbstractValue>();
  if (known === undefined) field.mayAlias = targets;
  if (targets.has(place)) return;
  targets.add(place);
  ev.s.changed = true;
}

function stampJoinPort(
  ev: Evaluator,
  id: string,
  port: number,
  element: ts.Expression,
  result: AbstractValue,
  ctx: EvalContext,
): void {
  const elemValue = ev.evalExpr(element, ctx);
  ev.s.mergeJoinIn(id, port, collapse(elemValue));
  const field = liveField(result, String(port));
  grew(ev, mergeInto(field, elemValue));
  grew(ev, addOcc(field, { exact: true, port, site: id }));
  const elemPlace = ev.resolvePlace(element);
  if (elemPlace === undefined) return;
  rememberPlaceAlias(ev, field, elemPlace);
}

function stampTuple(
  ev: Evaluator,
  id: string,
  literal: ts.ArrayLiteralExpression,
  result: AbstractValue,
  ctx: EvalContext,
): void {
  let port = 0;
  while (port < literal.elements.length) {
    const element = literal.elements[port];
    const at = port;
    port += 1;
    if (element === undefined) continue;
    stampJoinPort(ev, id, at, element, result, ctx);
  }
}

function relayOpaque(
  ev: Evaluator,
  id: string,
  arg: ts.Expression,
  result: AbstractValue,
  ctx: EvalContext,
): void {
  const collapsed = collapse(ev.evalExpr(arg, ctx));
  ev.s.mergeJoinIn(id, OPAQUE_JOIN_PORT, collapsed);
  grew(ev, mergeInto(result, collapsed));
}

export function handleJoin(
  ev: Evaluator,
  node: ts.CallExpression,
  id: string,
  arg: ts.Expression | undefined,
  ctx: EvalContext,
): AbstractValue {
  ev.s.markFacade(ctx.regionStack);
  // joinResultOf is the pass-stable heap node for this call. A fresh value each
  // pass would be a new mayAlias identity and the fixpoint would never settle.
  // Merges below are weak and must raise `changed`, or a consumer visited earlier
  // in the pass would miss the growth.
  const result = ev.s.joinResultOf(node);
  if (closedArrayLiteral(arg)) {
    stampTuple(ev, id, arg, result, ctx);
  } else if (arg !== undefined) {
    relayOpaque(ev, id, arg, result, ctx);
  }
  grew(ev, addOcc(result, { exact: true, site: id }));
  return result;
}

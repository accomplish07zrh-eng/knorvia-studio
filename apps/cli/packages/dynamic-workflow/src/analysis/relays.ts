// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import { addOcc, collapse, liveField, mergeInto, singleOcc, type AbstractValue } from "./domain.js";
import type { EvalContext, Evaluator } from "./taint.js";

// Port used when a join input is not a closed array literal. Negative so it never
// collides with a real element index, and so emission drops the port on the edge.
const OPAQUE_JOIN_PORT = -1;

function note(ev: Evaluator, grew: boolean): void {
  if (grew) ev.s.changed = true;
}

function entered(ev: Evaluator, ctx: EvalContext): void {
  ev.s.markFacade(ctx.regionStack);
}

function sink(
  ev: Evaluator,
  bucket: Map<string, AbstractValue>,
  id: string,
  expr: ts.Expression,
  ctx: EvalContext,
): void {
  ev.s.mergeSink(bucket, id, collapse(ev.evalExpr(expr, ctx)));
}

// Ask's receiver is sunk through the site record. Later arguments are visited only
// so writes and nested facades still run.
function visitTail(ev: Evaluator, args: readonly ts.Expression[], ctx: EvalContext): void {
  args.slice(1).forEach((extra) => {
    ev.evalExpr(extra, ctx);
  });
}

export function handleAsk(
  ev: Evaluator,
  node: ts.CallExpression,
  askId: string,
  ctx: EvalContext,
): AbstractValue {
  entered(ev, ctx);
  const recorded = ev.s.askSites.get(askId);
  if (recorded !== undefined) {
    sink(ev, ev.s.askRecv, askId, recorded.receiver, ctx);
    if (recorded.instructions !== undefined)
      sink(ev, ev.s.askInstr, askId, recorded.instructions, ctx);
  }
  visitTail(ev, node.arguments, ctx);
  return singleOcc(askId, true);
}

export function handleWorldRead(
  ev: Evaluator,
  id: string,
  args: readonly ts.Expression[],
  ctx: EvalContext,
): AbstractValue {
  entered(ev, ctx);
  // Every position is a dependency. World ops disagree on arity, and an artifact
  // in a trailing optional slot is still data the read depends on.
  args.forEach((arg) => sink(ev, ev.s.worldRead, id, arg, ctx));
  return singleOcc(id, true);
}

function closedArray(arg: ts.Expression | undefined): arg is ts.ArrayLiteralExpression {
  if (arg === undefined || !ts.isArrayLiteralExpression(arg)) return false;
  return arg.elements.some((element) => ts.isSpreadElement(element)) === false;
}

// A place element may-aliases its tuple slot: Promise.all resolves a non-promise
// input to that value itself, so a later write through the slot reaches it. The
// port occurrence stays on the field, so the relay edge is not replaced by the alias.
function rememberAlias(ev: Evaluator, field: AbstractValue, place: AbstractValue): void {
  const targets = field.mayAlias ?? new Set<AbstractValue>();
  if (field.mayAlias === undefined) field.mayAlias = targets;
  if (targets.has(place)) return;
  targets.add(place);
  ev.s.changed = true;
}

class JoinRelay {
  constructor(
    private readonly ev: Evaluator,
    private readonly id: string,
    private readonly result: AbstractValue,
    private readonly ctx: EvalContext,
  ) {}

  static open(ev: Evaluator, node: ts.CallExpression, id: string, ctx: EvalContext): JoinRelay {
    // joinResultOf is the pass-stable heap node. A fresh value each pass would be a
    // new mayAlias identity and the fixpoint would never settle. Merges below are
    // weak and must raise `changed`, or a consumer visited earlier in the pass
    // would miss the growth.
    return new JoinRelay(ev, id, ev.s.joinResultOf(node), ctx);
  }

  transfer(arg: ts.Expression | undefined): AbstractValue {
    if (closedArray(arg)) this.tuple(arg);
    else if (arg !== undefined) this.opaque(arg);
    note(this.ev, addOcc(this.result, { exact: true, site: this.id }));
    return this.result;
  }

  private tuple(literal: ts.ArrayLiteralExpression): void {
    literal.elements.forEach((element, port) => {
      this.port(port, element);
    });
  }

  private port(port: number, element: ts.Expression): void {
    const elemValue = this.ev.evalExpr(element, this.ctx);
    this.ev.s.mergeJoinIn(this.id, port, collapse(elemValue));
    const field = liveField(this.result, String(port));
    note(this.ev, mergeInto(field, elemValue));
    note(this.ev, addOcc(field, { exact: true, port, site: this.id }));
    const place = this.ev.resolvePlace(element);
    if (place !== undefined) rememberAlias(this.ev, field, place);
  }

  private opaque(arg: ts.Expression): void {
    const folded = collapse(this.ev.evalExpr(arg, this.ctx));
    this.ev.s.mergeJoinIn(this.id, OPAQUE_JOIN_PORT, folded);
    note(this.ev, mergeInto(this.result, folded));
  }
}

export function handleJoin(
  ev: Evaluator,
  node: ts.CallExpression,
  id: string,
  arg: ts.Expression | undefined,
  ctx: EvalContext,
): AbstractValue {
  entered(ev, ctx);
  return JoinRelay.open(ev, node, id, ctx).transfer(arg);
}

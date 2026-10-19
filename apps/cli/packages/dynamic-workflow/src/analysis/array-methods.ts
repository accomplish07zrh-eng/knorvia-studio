// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import type { IterationCandidate } from "./sites.js";
import {
  addOcc,
  cloneValue,
  collapse,
  emptyValue,
  mergeInto,
  provisionalFanoutId,
  unionValues,
  type AbstractValue,
} from "./domain.js";
import { applyCallbackFns } from "./calls.js";
import type { EvalContext, Evaluator } from "./taint.js";

// Per-element callbacks (`map`, `reduce`, `Array.from`) promoted to fan-out relays.
// An inline literal is evaluated in place with its parameters bound directly. Any
// other callback expression is applied as the tracked functions it holds, recorded
// as argument applications so the ordering walk inlines the same bodies.

interface AccSeed {
  value: AbstractValue;
}

function bindParam(
  ev: Evaluator,
  cb: ts.FunctionExpression | ts.ArrowFunction,
  index: number,
  value: AbstractValue,
  ctx: EvalContext,
): void {
  const param = cb.parameters.at(index);
  if (param === undefined) return;
  // Binding patterns (`.map(({ q }) => …)`) go through the same pattern machinery
  // as declarations. An identifier-only bind would drop the element and the fan-out label.
  ev.bindPattern(param.name, value, ctx);
}

class ElementFanout {
  private readonly elementParams: readonly number[];
  private readonly wholeParams: readonly number[];
  private readonly isReduce: boolean;
  private readonly regionStack: string[];
  private readonly element: AbstractValue;
  private readonly callbackReturn = emptyValue();

  constructor(
    private readonly ev: Evaluator,
    private readonly node: ts.CallExpression,
    private readonly cand: IterationCandidate,
    private readonly ctx: EvalContext,
  ) {
    const semantics = cand.semantics;
    this.elementParams = semantics?.elementParams ?? [0];
    this.wholeParams = semantics?.wholeParams ?? [2];
    this.isReduce = semantics?.accumulatorParam !== undefined;
    const seeded = this.seedElement();
    this.element = seeded.element;
    this.regionStack = seeded.regions;
  }

  private seedElement(): { element: AbstractValue; regions: string[] } {
    const collection = collapse(this.ev.evalExpr(this.cand.iterated, this.ctx));
    const fanoutId = provisionalFanoutId(this.cand.order);
    const promoted = this.ev.s.promotedOrders.has(this.cand.order);
    if (promoted) this.ev.s.mergeSink(this.ev.s.fanoutInVal, fanoutId, collection);
    const element = cloneValue(collection);
    if (promoted) addOcc(element, { exact: true, site: fanoutId });
    return { element, regions: [...this.ctx.regionStack, "cand@" + String(this.cand.order)] };
  }

  eval(): AbstractValue {
    const cb = this.cand.callback;
    if (cb !== undefined) this.inline(cb);
    else if (this.cand.callbackExpr !== undefined) this.applyTracked();
    this.writeBack();
    if (this.isReduce) this.ev.s.mergeReduceAcc(this.cand.order, this.callbackReturn);
    return unionValues(this.callbackReturn, this.element);
  }

  // The accumulator is the initial-value argument joined with the callback return
  // carried across passes. The return is empty when the parameter is bound, so a
  // fresh local would drop ask-chaining through the accumulator. With no initial
  // value the runtime seed is element 0, so the seed is the element itself.
  // A place seed IS the accumulator object until the callback returns something else,
  // so the chain is joined into that place rather than replacing it.
  private accumulator(): AccSeed {
    const chain = this.ev.s.reduceAccOf(this.cand.order);
    const seedArg = this.node.arguments[1];
    const seedPlace = seedArg === undefined ? undefined : this.ev.resolvePlace(seedArg);
    if (seedPlace !== undefined) {
      if (mergeInto(seedPlace, chain)) this.ev.s.changed = true;
      return { value: seedPlace };
    }
    const initial = seedArg === undefined ? this.element : this.ev.evalExpr(seedArg, this.ctx);
    return { value: unionValues(initial, chain) };
  }

  private inline(cb: ts.FunctionExpression | ts.ArrowFunction): void {
    const cbCtx: EvalContext = {
      onReturn: (value) => {
        mergeInto(this.callbackReturn, value);
      },
      regionStack: this.regionStack,
    };
    if (this.isReduce) {
      bindParam(
        this.ev,
        cb,
        this.cand.semantics?.accumulatorParam ?? 0,
        this.accumulator().value,
        cbCtx,
      );
    }
    // The first element parameter receives the live fanned-out value. Later element
    // parameters and the whole-collection parameter receive clones of it. An index
    // parameter stays unbound: it carries no element data.
    this.elementParams.forEach((index, ordinal) => {
      const value = ordinal === 0 ? this.element : cloneValue(this.element);
      bindParam(this.ev, cb, index, value, cbCtx);
    });
    for (const index of this.wholeParams)
      bindParam(this.ev, cb, index, cloneValue(this.element), cbCtx);
    this.visitBody(cb, cbCtx);
  }

  private visitBody(cb: ts.FunctionExpression | ts.ArrowFunction, cbCtx: EvalContext): void {
    if (ts.isBlock(cb.body)) {
      for (const stmt of cb.body.statements) this.ev.visit(stmt, cbCtx);
      return;
    }
    mergeInto(this.callbackReturn, this.ev.evalExpr(cb.body, cbCtx));
  }

  private applyTracked(): void {
    const expr = this.cand.callbackExpr;
    if (expr === undefined) return;
    const fns = [...this.ev.evalExpr(expr, this.ctx).fns].filter((fn) => this.ev.s.fnId.has(fn));
    if (fns.length === 0) return;
    const width =
      Math.max(
        -1,
        ...this.elementParams,
        ...this.wholeParams,
        this.cand.semantics?.accumulatorParam ?? -1,
      ) + 1;
    const actuals = Array.from({ length: width }, () => emptyValue());
    if (this.isReduce)
      actuals[this.cand.semantics?.accumulatorParam ?? 0] = this.accumulator().value;
    for (const index of this.elementParams) actuals[index] = cloneValue(this.element);
    for (const index of this.wholeParams) actuals[index] = cloneValue(this.element);
    mergeInto(
      this.callbackReturn,
      applyCallbackFns(this.ev, fns, actuals, this.regionStack, this.node),
    );
  }

  // A write through the element parameter reaches the collection: elements are
  // references. Only field effects are merged back, so the fan-out label in `occs`
  // does not flow into the collection.
  private writeBack(): void {
    const place = this.ev.resolvePlace(this.cand.iterated);
    if (place === undefined) return;
    for (const field of this.element.fields.values()) {
      if (mergeInto(place, collapse(field))) this.ev.s.changed = true;
    }
  }
}

export function handleArrayMethod(
  ev: Evaluator,
  node: ts.CallExpression,
  cand: IterationCandidate,
  ctx: EvalContext,
): AbstractValue {
  return new ElementFanout(ev, node, cand, ctx).eval();
}

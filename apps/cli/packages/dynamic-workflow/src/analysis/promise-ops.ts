// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import {
  clearExact,
  cloneValue,
  collapse,
  collapseInto,
  emptyValue,
  mergeInto,
  type AbstractValue,
} from "./domain.js";
import type { EvalContext, Evaluator } from "./taint.js";
import { applyPessimistically, recordCall } from "./calls.js";

// Taint fed into invocations of `fn`'s own parameters (resolve / reject / continuation).
// Empty when the function is not tracked or its parameters are never invoked.
function callbackPot(ev: Evaluator, fn: ts.Node): AbstractValue {
  const id = ev.s.fnId.get(fn);
  const params = id === undefined ? [] : (ev.s.fnParamSymbols.get(id) ?? []);
  return params.reduce((acc, _symbol, param) => {
    if (id === undefined) return acc;
    const captured = ev.s.phCallActualsOf(id, param);
    if (captured !== undefined) mergeInto(acc, captured);
    return acc;
  }, emptyValue());
}

// Sibling data only. A function argument is the callback being invoked, not a value
// passed into a sibling. Leaving `fns` on the pot would make `resolve(draft)` dispatch
// as the executor and skip the placeholder-invocation capture.
function siblingData(argVals: readonly AbstractValue[]): AbstractValue {
  const folded = argVals.reduce((acc, argVal) => {
    collapseInto(acc, argVal);
    return acc;
  }, emptyValue());
  const inexact = clearExact(folded);
  inexact.fns.clear();
  return inexact;
}

class UnknownConstruct {
  private readonly argVals: AbstractValue[];
  private readonly result = emptyValue();

  constructor(
    private readonly ev: Evaluator,
    private readonly node: ts.NewExpression,
    private readonly ctx: EvalContext,
  ) {
    this.argVals = (node.arguments ?? []).map((arg) => ev.evalExpr(arg, ctx));
  }

  // Union of the argument collapses, plus the unknown-call rule (function arguments
  // are applied pessimistically and their return joins the result), plus whatever
  // those functions feed their own parameters. `new Promise((resolve) => resolve(draft))`
  // therefore resolves to `draft`. A reject argument lands in the same pot. The rule
  // is not special-cased by constructor name.
  eval(): AbstractValue {
    for (const argVal of this.argVals) collapseInto(this.result, argVal);
    const pot = siblingData(this.argVals);
    for (const argVal of this.argVals) this.feed(argVal, pot);
    return this.result;
  }

  private feed(argVal: AbstractValue, pot: AbstractValue): void {
    applyPessimistically(this.ev, argVal, pot, this.ctx, this.result, this.node);
    for (const fn of argVal.fns) mergeInto(this.result, callbackPot(this.ev, fn));
  }
}

class AwaitedValue {
  constructor(
    private readonly ev: Evaluator,
    private readonly node: ts.AwaitExpression,
    private readonly ctx: EvalContext,
  ) {}

  // Awaiting a thenable is invoking its `then`. When a tracked `then` is visible, the
  // promise resolves to whatever that method feeds its continuation. Otherwise the
  // operand flows through unchanged. The returned value is also the settle oracle.
  eval(): AbstractValue {
    const at = this.node.getStart(this.ev.s.scriptFile);
    const operand = this.ev.evalExpr(this.node.expression, this.ctx);
    const resolved = this.unwrap(operand);
    this.ev.s.mergeSink(this.ev.s.awaitVal, at, resolved);
    return resolved;
  }

  private unwrap(operand: AbstractValue): AbstractValue {
    const method = operand.fields.get("then");
    if (method === undefined || method.fns.size === 0) return operand;
    const resolved = cloneValue(operand);
    for (const fn of method.fns) this.feed(fn, resolved);
    return resolved;
  }

  private feed(fn: ts.Node, into: AbstractValue): void {
    const id = this.ev.s.fnId.get(fn);
    if (id !== undefined) this.ev.s.markCalled(this.ctx.regionStack, id);
    mergeInto(into, callbackPot(this.ev, fn));
  }
}

function rejectedValue(ev: Evaluator, node: ts.CallExpression, ctx: EvalContext): AbstractValue {
  const arg = node.arguments.at(0);
  if (arg === undefined) return emptyValue();
  return collapse(ev.evalExpr(arg, ctx));
}

function smearArgs(argVals: readonly AbstractValue[]): AbstractValue {
  const pot = argVals.reduce((acc, arg) => {
    collapseInto(acc, arg);
    return acc;
  }, emptyValue());
  return clearExact(pot);
}

export function handleNewUnknown(ev: Evaluator, node: ts.NewExpression, ctx: EvalContext): AbstractValue {
  return new UnknownConstruct(ev, node, ctx).eval();
}

export function evalAwait(ev: Evaluator, node: ts.AwaitExpression, ctx: EvalContext): AbstractValue {
  return new AwaitedValue(ev, node, ctx).eval();
}

// `Promise.reject(x)` joins the global thrown set that every catch binding reads.
// The call result stays that collapsed value, so the resolved path is unchanged.
export function handlePromiseReject(ev: Evaluator, node: ts.CallExpression, ctx: EvalContext): AbstractValue {
  const rejected = rejectedValue(ev, node, ctx);
  ev.s.mergeThrown(rejected);
  return rejected;
}

export function isPromiseReject(access: ts.PropertyAccessExpression): boolean {
  const receiver = access.expression;
  const nameIsReject = access.name.text === "reject";
  return ts.isIdentifier(receiver) && receiver.text === "Promise" && nameIsReject;
}

// Apply a script-local constructor for `new C(args)` or `super(args)`. Actuals are
// recorded like a direct call, including write-back into place arguments. The
// constructor body runs in the function pass and writes `this` on the shared instance.
// A direct `new` or `super` keeps exactness.
export function applyConstructor(ev: Evaluator, id: number, ctx: EvalContext, argVals: AbstractValue[], argPlaces?: (AbstractValue | undefined)[], site?: ts.Node): void {
  const application = site === undefined ? undefined : { site, via: "callee" as const };
  recordCall(ev, id, ctx.regionStack, argVals, argPlaces, application);
}

// `new D()` where `class D extends mix(Base)` cannot see the inherited constructor.
// The base may store any argument in any field, so the collapsed inexact arguments
// smear into the instance and function arguments are applied pessimistically.
export function applyMixinConstructor(ev: Evaluator, ctx: EvalContext, instance: AbstractValue, argVals: AbstractValue[]): void {
  const smeared = smearArgs(argVals);
  if (mergeInto(instance, smeared)) ev.s.changed = true;
  argVals.forEach((arg) => {
    applyPessimistically(ev, arg, smeared, ctx, instance);
  });
}

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

// Taint fed into invocations of a function's own parameters (resolve / reject /
// continuation). Empty when the function is not tracked or its parameters are never invoked.
class TrackedCallback {
  constructor(
    private readonly ev: Evaluator,
    private readonly fn: ts.Node,
  ) {}

  pot(): AbstractValue {
    const id = this.ev.s.fnId.get(this.fn);
    const params = id === undefined ? [] : (this.ev.s.fnParamSymbols.get(id) ?? []);
    return params.reduce((acc, _symbol, param) => this.mix(acc, id, param), emptyValue());
  }

  markCalled(ctx: EvalContext): void {
    const id = this.ev.s.fnId.get(this.fn);
    if (id !== undefined) this.ev.s.markCalled(ctx.regionStack, id);
  }

  private mix(acc: AbstractValue, id: number | undefined, param: number): AbstractValue {
    if (id === undefined) return acc;
    const captured = this.ev.s.phCallActualsOf(id, param);
    if (captured !== undefined) mergeInto(acc, captured);
    return acc;
  }
}

// Collapse argument values, then drop exactness. Sibling data also drops function
// values: a function argument is the callback being invoked, not a value passed into
// a sibling. Leaving `fns` on the pot would make `resolve(draft)` dispatch as the
// executor and skip the placeholder-invocation capture.
class InexactPot {
  private readonly folded = emptyValue();

  absorb(argVals: readonly AbstractValue[]): this {
    argVals.forEach((argVal) => {
      collapseInto(this.folded, argVal);
    });
    return this;
  }

  siblingData(): AbstractValue {
    const inexact = clearExact(this.folded);
    inexact.fns.clear();
    return inexact;
  }

  smeared(): AbstractValue {
    return clearExact(this.folded);
  }
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
    const pot = new InexactPot().absorb(this.argVals).siblingData();
    for (const argVal of this.argVals) this.feed(argVal, pot);
    return this.result;
  }

  private feed(argVal: AbstractValue, pot: AbstractValue): void {
    applyPessimistically(this.ev, argVal, pot, this.ctx, this.result, this.node);
    for (const fn of argVal.fns) mergeInto(this.result, new TrackedCallback(this.ev, fn).pot());
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
    const tracked = new TrackedCallback(this.ev, fn);
    tracked.markCalled(this.ctx);
    mergeInto(into, tracked.pot());
  }
}

// `Promise.reject(x)` joins the global thrown set that every catch binding reads.
// The call result stays that collapsed value, so the resolved path is unchanged.
class RejectedArgument {
  constructor(
    private readonly ev: Evaluator,
    private readonly node: ts.CallExpression,
    private readonly ctx: EvalContext,
  ) {}

  publish(): AbstractValue {
    const rejected = this.collapsed();
    this.ev.s.mergeThrown(rejected);
    return rejected;
  }

  private collapsed(): AbstractValue {
    const arg = this.node.arguments.at(0);
    if (arg === undefined) return emptyValue();
    return collapse(this.ev.evalExpr(arg, this.ctx));
  }
}

function smearArgs(argVals: readonly AbstractValue[]): AbstractValue {
  return new InexactPot().absorb(argVals).smeared();
}

export function handleNewUnknown(
  ev: Evaluator,
  node: ts.NewExpression,
  ctx: EvalContext,
): AbstractValue {
  return new UnknownConstruct(ev, node, ctx).eval();
}

export function evalAwait(
  ev: Evaluator,
  node: ts.AwaitExpression,
  ctx: EvalContext,
): AbstractValue {
  return new AwaitedValue(ev, node, ctx).eval();
}

export function handlePromiseReject(
  ev: Evaluator,
  node: ts.CallExpression,
  ctx: EvalContext,
): AbstractValue {
  return new RejectedArgument(ev, node, ctx).publish();
}

export function isPromiseReject(access: ts.PropertyAccessExpression): boolean {
  const receiver = access.expression;
  const nameIsReject = access.name.text === "reject";
  return ts.isIdentifier(receiver) && receiver.text === "Promise" && nameIsReject;
}

// Apply a script-local constructor for `new C(args)` or `super(args)`. Actuals are
// recorded like a direct call. The constructor body runs in the function pass and
// writes `this` on the shared instance. A direct `new` or `super` keeps exactness.
class DirectConstruct {
  constructor(
    private readonly ev: Evaluator,
    private readonly id: number,
    private readonly ctx: EvalContext,
    private readonly argVals: AbstractValue[],
    private readonly argPlaces: (AbstractValue | undefined)[] | undefined,
    private readonly site: ts.Node | undefined,
  ) {}

  apply(): void {
    recordCall(
      this.ev,
      this.id,
      this.ctx.regionStack,
      this.argVals,
      this.argPlaces,
      this.viaCallee(),
    );
  }

  // A missing site is not a call application. Otherwise the site is the callee
  // (`new` / `super`), which is what keeps the actuals exact.
  private viaCallee(): { site: ts.Node; via: "callee" } | undefined {
    if (this.site === undefined) return undefined;
    return { site: this.site, via: "callee" };
  }
}

export function applyConstructor(
  ev: Evaluator,
  id: number,
  ctx: EvalContext,
  argVals: AbstractValue[],
  // Parallel to argVals. A hole is an argument that has no place to write back into.
  argPlaces?: (AbstractValue | undefined)[],
  site?: ts.Node,
): void {
  new DirectConstruct(ev, id, ctx, argVals, argPlaces, site).apply();
}

// `new D()` where `class D extends mix(Base)` cannot see the inherited constructor.
// The base may store any argument in any field, so the collapsed inexact arguments
// smear into the instance and function arguments are applied pessimistically.
export function applyMixinConstructor(
  ev: Evaluator,
  ctx: EvalContext,
  instance: AbstractValue,
  argVals: AbstractValue[],
): void {
  const smeared = smearArgs(argVals);
  if (mergeInto(instance, smeared)) ev.s.changed = true;
  argVals.forEach((arg) => {
    applyPessimistically(ev, arg, smeared, ctx, instance);
  });
}

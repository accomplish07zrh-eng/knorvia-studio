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

const PROMISE_HOST = "Promise";
const REJECT_MEMBER = "reject";
const THEN_MEMBER = "then";

function grew(ev: Evaluator, delta: boolean): void {
  if (!delta) return;
  ev.s.changed = true;
}

// Taint that flowed into invocations of `fn`'s own parameters. Empty when the
// function is untracked or its parameters are never invoked.
function callbackFeed(ev: Evaluator, fn: ts.Node): AbstractValue {
  const id = ev.s.fnId.get(fn);
  if (id === undefined) return emptyValue();
  const formals = ev.s.fnParamSymbols.get(id) ?? [];
  const acc = emptyValue();
  let param = 0;
  while (param < formals.length) {
    const captured = ev.s.phCallActualsOf(id, param);
    param += 1;
    if (captured === undefined) continue;
    mergeInto(acc, captured);
  }
  return acc;
}

function collapseEach(target: AbstractValue, parts: readonly AbstractValue[]): void {
  let index = 0;
  while (index < parts.length) {
    const part = parts[index];
    index += 1;
    if (part === undefined) continue;
    collapseInto(target, part);
  }
}

// Sibling data handed to a callback, not the callback function itself. Leaving
// `fns` in the pot would bind the executor to its own parameter and skip the
// placeholder capture of `resolve(draft)`.
function dataPot(seed: AbstractValue): AbstractValue {
  const pot = clearExact(seed);
  pot.fns.clear();
  return pot;
}

function evaluatedArguments(
  ev: Evaluator,
  args: readonly ts.Expression[] | undefined,
  ctx: EvalContext,
): AbstractValue[] {
  if (args === undefined) return [];
  const samples: AbstractValue[] = [];
  let index = 0;
  while (index < args.length) {
    const arg = args[index];
    index += 1;
    if (arg === undefined) continue;
    samples.push(ev.evalExpr(arg, ctx));
  }
  return samples;
}

function pourFeeds(ev: Evaluator, sample: AbstractValue, out: AbstractValue): void {
  for (const fn of sample.fns) mergeInto(out, callbackFeed(ev, fn));
}

export function handleNewUnknown(
  ev: Evaluator,
  node: ts.NewExpression,
  ctx: EvalContext,
): AbstractValue {
  const samples = evaluatedArguments(ev, node.arguments, ctx);
  const out = emptyValue();
  // Argument collapses keep exactness: strings launder nothing.
  collapseEach(out, samples);
  const pot = dataPot(out);
  let index = 0;
  while (index < samples.length) {
    const sample = samples[index];
    index += 1;
    if (sample === undefined) continue;
    // Unknown `new` may call function arguments and may capture whatever those
    // functions feed their own parameters (`new Promise((resolve) => resolve(draft))`).
    applyPessimistically(ev, sample, pot, ctx, out, node);
    pourFeeds(ev, sample, out);
  }
  return out;
}

function resumeThenable(
  ev: Evaluator,
  inner: AbstractValue,
  ctx: EvalContext,
): AbstractValue | undefined {
  const thenField = inner.fields.get(THEN_MEMBER);
  if (thenField === undefined || thenField.fns.size === 0) return undefined;
  const out = cloneValue(inner);
  for (const fn of thenField.fns) {
    const id = ev.s.fnId.get(fn);
    if (id !== undefined) ev.s.markCalled(ctx.regionStack, id);
    mergeInto(out, callbackFeed(ev, fn));
  }
  return out;
}

export function evalAwait(
  ev: Evaluator,
  node: ts.AwaitExpression,
  ctx: EvalContext,
): AbstractValue {
  const at = node.getStart(ev.s.scriptFile);
  const inner = ev.evalExpr(node.expression, ctx);
  // No visible `then`: the operand already carries the settled taint and await
  // is a passthrough. A tracked `then` resolves to whatever that method feeds
  // its continuation. Either value is also the settle oracle; recording does
  // not change the value handed back to the caller.
  const resumed = resumeThenable(ev, inner, ctx);
  const settled = resumed ?? inner;
  ev.s.mergeSink(ev.s.awaitVal, at, settled);
  return settled;
}

export function handlePromiseReject(
  ev: Evaluator,
  node: ts.CallExpression,
  ctx: EvalContext,
): AbstractValue {
  const arg = node.arguments[0];
  const rejected = arg === undefined ? emptyValue() : collapse(ev.evalExpr(arg, ctx));
  // Await treats a rejection as a throw, so the operand joins the script-global
  // thrown set. The call result stays that collapse, matching an unknown call.
  ev.s.mergeThrown(rejected);
  return rejected;
}

export function isPromiseReject(access: ts.PropertyAccessExpression): boolean {
  const host = access.expression;
  if (!ts.isIdentifier(host)) return false;
  if (host.text !== PROMISE_HOST) return false;
  return access.name.text === REJECT_MEMBER;
}

function calleeApplication(
  site: ts.Node | undefined,
): { site: ts.Node; via: "callee" } | undefined {
  if (site === undefined) return undefined;
  return { site, via: "callee" };
}

export function applyConstructor(
  ev: Evaluator,
  id: number,
  ctx: EvalContext,
  argVals: AbstractValue[],
  argPlaces?: (AbstractValue | undefined)[],
  site?: ts.Node,
): void {
  // Direct `new` / `super` keeps exactness. The instance is returned by the
  // NewExpression; this only seeds the constructor's parameter actuals. The
  // constructor body itself runs in the function pass.
  recordCall(ev, id, ctx.regionStack, argVals, argPlaces, calleeApplication(site));
}

function smearedArguments(argVals: readonly AbstractValue[]): AbstractValue {
  const pot = emptyValue();
  collapseEach(pot, argVals);
  return clearExact(pot);
}

export function applyMixinConstructor(
  ev: Evaluator,
  ctx: EvalContext,
  instance: AbstractValue,
  argVals: AbstractValue[],
): void {
  // The base constructor is an unresolved mixin call, so it may store any
  // argument in any field and may invoke function arguments. Inexact smear
  // surfaces on every field read; dropping the arguments would be unsound.
  const smeared = smearedArguments(argVals);
  grew(ev, mergeInto(instance, smeared));
  let index = 0;
  while (index < argVals.length) {
    const arg = argVals[index];
    index += 1;
    if (arg === undefined) continue;
    applyPessimistically(ev, arg, smeared, ctx, instance);
  }
}

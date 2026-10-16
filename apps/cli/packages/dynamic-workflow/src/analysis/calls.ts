// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import {
  addOcc,
  addPlaceholder,
  clearExact,
  cloneValue,
  collapse,
  collapseInto,
  emptyValue,
  HEAP_MUTATORS,
  isDirectCallee,
  isJsonStringify,
  mergeBound,
  mergeInto,
  phKey,
  singleOcc,
  VALUE_DEPTH_CAP,
  type AbstractValue,
  type Placeholder,
} from "./domain.js";
import type { EvalContext, Evaluator } from "./taint.js";
import type { ApplicationVia } from "./state.js";
import { applySuperCall } from "./classes.js";
import { handleArrayMethod } from "./array-methods.js";
import { handlePromiseReject, isPromiseReject } from "./promise-ops.js";
import { callbackSemanticsOf, isForeignMember } from "./callbacks.js";
import { handleHeapMutator, handleObjectAssign, isObjectAssign } from "./heap-ops.js";
import { handleAsk, handleJoin, handleWorldRead } from "./relays.js";

// Spread actuals past the first `...` share one inexact tail. A bind prefix is
// tried both with and without that prefix, inexactly. Unknown calls strip
// callables from the pot so a callback is not applied to itself.

interface ActualPack {
  explicit: AbstractValue[];
  places?: (AbstractValue | undefined)[];
  tail?: AbstractValue;
}

export function evalCall(analysis: Evaluator, syntax: ts.CallExpression, frame: EvalContext): AbstractValue {
  const actorId = analysis.s.actorByCall.get(syntax);
  if (actorId !== undefined) return singleOcc(actorId, true);
  if (syntax.expression.kind === ts.SyntaxKind.SuperKeyword) {
    applySuperCall(analysis, syntax, frame);
    return emptyValue();
  }
  const askId = analysis.s.askByCall.get(syntax);
  if (askId !== undefined) return handleAsk(analysis, syntax, askId, frame);
  const world = analysis.s.worldByCall.get(syntax);
  if (world !== undefined) return handleWorldRead(analysis, world.id, world.args, frame);
  const join = analysis.s.joinByCall.get(syntax);
  if (join !== undefined) return handleJoin(analysis, syntax, join.id, join.arg, frame);
  if (ts.isPropertyAccessExpression(syntax.expression)) {
    const hit = memberCall(analysis, syntax, syntax.expression, frame);
    if (hit !== undefined) return hit;
  }
  return genericCall(analysis, syntax, frame);
}

function memberCall(
  analysis: Evaluator,
  syntax: ts.CallExpression,
  access: ts.PropertyAccessExpression,
  frame: EvalContext,
): AbstractValue | undefined {
  const cand = analysis.s.candByCall.get(syntax);
  if (cand !== undefined) return handleArrayMethod(analysis, syntax, cand, frame);
  if (isJsonStringify(access)) {
    const payload = syntax.arguments[0];
    return payload === undefined ? emptyValue() : collapse(analysis.evalExpr(payload, frame));
  }
  if (isPromiseReject(access)) return handlePromiseReject(analysis, syntax, frame);
  if (isObjectAssign(access)) return handleObjectAssign(analysis, syntax, frame);
  if (HEAP_MUTATORS.has(access.name.text)) {
    const smear = handleHeapMutator(analysis, syntax, access, frame);
    const tracked = trackedFns(analysis, analysis.evalExpr(access, frame)).length > 0;
    return tracked ? genericCall(analysis, syntax, frame) : smear;
  }
  const forwarded = forwardInvocation(analysis, syntax, access, frame);
  if (forwarded !== undefined) return forwarded;
  const semantics = callbackSemanticsOf(syntax, analysis.checker, analysis.s.program);
  if (semantics?.deferred === true) {
    const settled = collapse(analysis.evalExpr(access.expression, frame));
    analysis.s.mergeSink(analysis.s.awaitVal, access.name.getStart(analysis.s.scriptFile), settled);
  }
  return undefined;
}

function genericCall(analysis: Evaluator, syntax: ts.CallExpression, frame: EvalContext): AbstractValue {
  const built = buildActuals(analysis, syntax.arguments, frame);
  return applyCall(analysis, syntax.expression, built.explicit, frame, built.places, built.tail, syntax);
}

function firstSpread(argsNodes: readonly ts.Expression[]): number {
  for (let index = 0; index < argsNodes.length; index += 1) {
    if (ts.isSpreadElement(argsNodes[index] as ts.Expression)) return index;
  }
  return argsNodes.length;
}

function buildActuals(
  analysis: Evaluator,
  argsNodes: readonly ts.Expression[],
  frame: EvalContext,
): ActualPack {
  const head = argsNodes.slice(0, firstSpread(argsNodes));
  const explicit = head.map((arg) => analysis.evalExpr(arg, frame));
  const places = head.map((arg, index) =>
    analysis.argWriteBackPlace(arg, explicit[index] as AbstractValue),
  );
  if (head.length === argsNodes.length) return { explicit, places };
  const tail = emptyValue();
  argsNodes.slice(head.length).forEach((arg) => collapseInto(tail, analysis.evalExpr(arg, frame)));
  return { explicit, places, tail: clearExact(tail) };
}

function forwardInvocation(
  analysis: Evaluator,
  syntax: ts.CallExpression,
  access: ts.PropertyAccessExpression,
  frame: EvalContext,
): AbstractValue | undefined {
  const method = access.name.text;
  if (method !== "call" && method !== "apply" && method !== "bind") return undefined;
  const receiverVal = analysis.evalExpr(access.expression, frame);
  const fns = trackedFns(analysis, receiverVal);
  if (fns.length === 0) return undefined;
  if (method === "apply") {
    const argsArray = syntax.arguments[1];
    const tail =
      argsArray === undefined ? emptyValue() : clearExact(collapse(analysis.evalExpr(argsArray, frame)));
    return applyToFns(analysis, fns, false, { explicit: [], tail }, frame, receiverVal.bound, syntax);
  }
  if (method === "bind") {
    const prefix: AbstractValue[] = [];
    syntax.arguments.slice(1).forEach((arg) => prefix.push(analysis.evalExpr(arg, frame)));
    const out = emptyValue();
    receiverVal.fns.forEach((fn) => out.fns.add(fn));
    out.bound = [...(receiverVal.bound ?? []), ...prefix];
    return out;
  }
  const exact = fns.length === 1 && isDirectCallee(access.expression);
  const built = buildActuals(analysis, syntax.arguments.slice(1), frame);
  return applyToFns(analysis, fns, exact, built, frame, receiverVal.bound, syntax);
}

export function applyCall(
  analysis: Evaluator,
  calleeExpr: ts.Expression,
  argVals: AbstractValue[],
  frame: EvalContext,
  argPlaces?: (AbstractValue | undefined)[],
  tail?: AbstractValue,
  site?: ts.Node,
): AbstractValue {
  const calleeVal = analysis.evalExpr(calleeExpr, frame);
  const foreign =
    ts.isPropertyAccessExpression(calleeExpr) &&
    isForeignMember(calleeExpr.name, analysis.checker, analysis.s.scriptFile);
  const fns = foreign ? [] : trackedFns(analysis, calleeVal);
  const pack: ActualPack = { explicit: argVals, places: argPlaces, tail };
  if (fns.length === 0)
    return handleUnknownCall(analysis, calleeExpr, calleeVal, argVals, frame, tail, site);
  const exact = fns.length === 1 && isDirectCallee(calleeExpr);
  return applyToFns(analysis, fns, exact, pack, frame, calleeVal.bound, site);
}

function applyToFns(
  analysis: Evaluator,
  fns: readonly ts.Node[],
  exact: boolean,
  pack: ActualPack,
  frame: EvalContext,
  bound: AbstractValue[] | undefined,
  site: ts.Node | undefined,
): AbstractValue {
  const result = emptyValue();
  const prefix = bound ?? [];
  alignFns(analysis, fns, prefix.length > 0 ? false : exact, pack, frame, result, site);
  if (prefix.length === 0) return result;
  const places = prefix.map(() => undefined as AbstractValue | undefined).concat(pack.places ?? []);
  const shifted: ActualPack = { explicit: prefix.concat(pack.explicit), places, tail: pack.tail };
  alignFns(analysis, fns, false, shifted, frame, result, site);
  return result;
}

function alignFns(
  analysis: Evaluator,
  fns: readonly ts.Node[],
  exact: boolean,
  pack: ActualPack,
  frame: EvalContext,
  result: AbstractValue,
  site: ts.Node | undefined,
): void {
  const { explicit, places, tail } = pack;
  fns.forEach((fn) => {
    const id = analysis.s.fnId.get(fn);
    if (id === undefined) return;
    const paramCount = (analysis.s.fnParamSymbols.get(id) ?? []).length;
    const len = tail === undefined ? explicit.length : Math.max(explicit.length, paramCount);
    const args: AbstractValue[] = [];
    const slots: (AbstractValue | undefined)[] = [];
    for (let index = 0; index < len; index += 1) {
      const explicitVal = index < explicit.length ? explicit[index] : undefined;
      args.push(explicitVal ?? (tail as AbstractValue));
      slots.push(explicitVal === undefined ? undefined : places?.[index]);
    }
    const recorded = exact ? args : args.map((item) => clearExact(item));
    const via = site === undefined ? undefined : { site, via: "callee" as const };
    recordCall(analysis, id, frame.regionStack, recorded, slots, via);
    mergeInto(result, substitute(analysis.s.summaryOf(id), id, args, exact === false));
  });
}

function handleUnknownCall(
  analysis: Evaluator,
  calleeExpr: ts.Expression,
  calleeVal: AbstractValue,
  argVals: AbstractValue[],
  frame: EvalContext,
  tail: AbstractValue | undefined,
  site: ts.Node | undefined,
): AbstractValue {
  const applied = emptyValue();
  if (ts.isPropertyAccessExpression(calleeExpr))
    collapseInto(applied, analysis.evalExpr(calleeExpr.expression, frame));
  argVals.forEach((arg) => collapseInto(applied, arg));
  if (tail !== undefined) collapseInto(applied, tail);
  const out = cloneValue(applied);
  const pot = clearExact(applied);
  pot.fns.clear();
  argVals.forEach((arg) => applyPessimistically(analysis, arg, pot, frame, out, site));
  if (tail !== undefined) applyPessimistically(analysis, tail, pot, frame, out, site);
  argVals.forEach((arg) => recordPhCallActuals(analysis, arg, pot));
  if (tail !== undefined) recordPhCallActuals(analysis, tail, pot);
  if (calleeVal.phs.size === 0) return out;
  const argPot = emptyValue();
  argVals.forEach((arg) => collapseInto(argPot, arg));
  if (tail !== undefined) collapseInto(argPot, tail);
  recordPhCallActuals(analysis, calleeVal, argPot);
  return out;
}

export function applyPessimistically(
  analysis: Evaluator,
  source: AbstractValue,
  pot: AbstractValue,
  frame: EvalContext,
  out: AbstractValue,
  site?: ts.Node,
): void {
  source.fns.forEach((fn) => {
    const id = analysis.s.fnId.get(fn);
    if (id === undefined) return;
    const actuals = (analysis.s.fnParamSymbols.get(id) ?? []).map(() => pot);
    const via = site === undefined ? undefined : { site, via: "argument" as const };
    recordCall(analysis, id, frame.regionStack, actuals, undefined, via);
    mergeInto(out, substitute(analysis.s.summaryOf(id), id, actuals, true));
  });
}

export function applyCallbackFns(
  analysis: Evaluator,
  fns: readonly ts.Node[],
  actuals: AbstractValue[],
  regionStack: string[],
  site: ts.Node,
): AbstractValue {
  const out = emptyValue();
  fns.forEach((fn) => {
    const id = analysis.s.fnId.get(fn);
    if (id === undefined) return;
    recordCall(analysis, id, regionStack, actuals, undefined, { site, via: "argument" });
    mergeInto(out, substitute(analysis.s.summaryOf(id), id, actuals, true));
  });
  return out;
}

function recordPhCallActuals(analysis: Evaluator, source: AbstractValue, value: AbstractValue): void {
  source.phs.forEach((ph) => analysis.s.recordPhCall(phKey(ph), value));
}

export function recordCall(
  analysis: Evaluator,
  id: number,
  regionStack: string[],
  argVals: AbstractValue[],
  argPlaces?: (AbstractValue | undefined)[],
  application?: { site: ts.Node; via: ApplicationVia },
): void {
  analysis.s.markCalled(regionStack, id);
  if (application !== undefined) {
    const fn = analysis.s.functions[id];
    if (fn !== undefined) analysis.s.recordApplication(application.site, fn, application.via);
  }
  const params = analysis.s.fnParamSymbols.get(id) ?? [];
  argVals.forEach((argVal, param) => {
    analysis.s.addParamActual(id, param, argVal);
    const psym = params[param];
    if (psym !== undefined && argVal.fns.size > 0) {
      const fnsOnly = emptyValue();
      argVal.fns.forEach((fn) => fnsOnly.fns.add(fn));
      analysis.s.bindSymbol(psym, fnsOnly);
    }
    const live = argPlaces?.[param];
    const slot = psym === undefined || live === undefined ? undefined : analysis.s.env.get(psym);
    if (slot === undefined || live === undefined || slot === live) return;
    if (mergeHeapEffects(live, slot, id, param, argVals)) analysis.s.changed = true;
  });
}

function trackedFns(analysis: Evaluator, value: AbstractValue): ts.Node[] {
  const found: ts.Node[] = [];
  value.fns.forEach((fn) => {
    if (analysis.s.fnId.has(fn)) found.push(fn);
  });
  return found;
}

// Own placeholder is identity, not an effect. Rest gathers actuals from its index up.
function mergeHeapEffects(
  target: AbstractValue,
  source: AbstractValue,
  fnId: number,
  selfParam: number,
  argVals: AbstractValue[],
): boolean {
  let changed = false;
  source.occs.forEach((occ) => {
    changed = addOcc(target, occ) || changed;
  });
  source.phs.forEach((ph) => {
    changed = adoptEffect(target, ph, fnId, selfParam, argVals) || changed;
  });
  source.fns.forEach((fn) => {
    if (target.fns.has(fn)) return;
    target.fns.add(fn);
    changed = true;
  });
  source.fields.forEach((field, key) => {
    let slot = target.fields.get(key);
    if (slot === undefined) {
      slot = emptyValue();
      target.fields.set(key, slot);
    }
    changed = mergeInto(slot, field) || changed;
  });
  if (source.bound !== undefined) changed = mergeBound(target, source.bound, 0) || changed;
  return changed;
}

function adoptEffect(
  target: AbstractValue,
  ph: Placeholder,
  fnId: number,
  selfParam: number,
  argVals: readonly AbstractValue[],
): boolean {
  if (ph.fnId !== fnId) return addPlaceholder(target, ph);
  if (ph.param === selfParam) return false;
  if (ph.rest !== true) {
    const actual = argVals[ph.param];
    return actual === undefined ? false : mergeInto(target, collapse(actual));
  }
  let changed = false;
  for (let index = ph.param; index < argVals.length; index += 1) {
    const restActual = argVals[index];
    if (restActual !== undefined) changed = mergeInto(target, collapse(restActual)) || changed;
  }
  return changed;
}

function substitute(
  summary: AbstractValue,
  fnId: number,
  argVals: readonly AbstractValue[],
  clear: boolean,
  depth = 0,
): AbstractValue {
  const out = emptyValue();
  summary.occs.forEach((occ) => {
    addOcc(out, { exact: clear ? false : occ.exact, port: occ.port, site: occ.site });
  });
  summary.phs.forEach((ph) => rewritePlaceholder(out, ph, fnId, argVals, clear));
  summary.fns.forEach((fn) => out.fns.add(fn));
  if (depth >= VALUE_DEPTH_CAP) {
    summary.fields.forEach((field) => collapseInto(out, field));
    (summary.bound ?? []).forEach((el) => collapseInto(out, el));
    return out;
  }
  if (summary.bound !== undefined) {
    out.bound = summary.bound.map((el) => substitute(el, fnId, argVals, clear, depth + 1));
  }
  summary.fields.forEach((field, key) => {
    out.fields.set(key, substitute(field, fnId, argVals, clear, depth + 1));
  });
  return out;
}

function rewritePlaceholder(
  out: AbstractValue,
  ph: Placeholder,
  fnId: number,
  argVals: readonly AbstractValue[],
  clear: boolean,
): void {
  if (ph.fnId !== fnId) {
    addPlaceholder(out, ph);
    return;
  }
  const take = (actual: AbstractValue | undefined): void => {
    if (actual !== undefined) mergeInto(out, clear ? clearExact(actual) : actual);
  };
  if (ph.rest !== true) {
    take(argVals[ph.param]);
    return;
  }
  for (let index = ph.param; index < argVals.length; index += 1) take(argVals[index]);
}

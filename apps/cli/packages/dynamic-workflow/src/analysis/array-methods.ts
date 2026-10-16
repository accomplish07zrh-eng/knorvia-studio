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

// Inline callbacks bind parameters directly. Any other callback expression is
// applied as tracked functions with the registry's positional shape. A place
// reduce-seed stays aliased and is joined with the cross-pass accumulator; with
// no initial value the seed is the element, or the first pass would drop it.

export function handleArrayMethod(
  analysis: Evaluator,
  syntax: ts.CallExpression,
  cand: IterationCandidate,
  frame: EvalContext,
): AbstractValue {
  const semantics = cand.semantics;
  const iterated = collapse(analysis.evalExpr(cand.iterated, frame));
  const element = cloneValue(iterated);
  const fanoutId = provisionalFanoutId(cand.order);
  if (analysis.s.promotedOrders.has(cand.order)) {
    analysis.s.mergeSink(analysis.s.fanoutInVal, fanoutId, iterated);
    addOcc(element, { exact: true, site: fanoutId });
  }
  const regionStack = [...frame.regionStack, `cand@${cand.order}`];
  const callbackReturn = emptyValue();
  const reducing = semantics?.accumulatorParam !== undefined;
  const inline = cand.callback;
  if (inline !== undefined) {
    driveInline(analysis, syntax, cand, inline, element, regionStack, callbackReturn, frame, reducing);
  } else if (cand.callbackExpr !== undefined) {
    driveIndirect(analysis, syntax, cand, element, regionStack, callbackReturn, frame, reducing);
  }
  pourElementFields(analysis, cand.iterated, element);
  if (reducing) analysis.s.mergeReduceAcc(cand.order, callbackReturn);
  return unionValues(callbackReturn, element);
}

function driveInline(
  analysis: Evaluator,
  syntax: ts.CallExpression,
  cand: IterationCandidate,
  cb: ts.FunctionExpression | ts.ArrowFunction,
  element: AbstractValue,
  regionStack: string[],
  callbackReturn: AbstractValue,
  frame: EvalContext,
  reducing: boolean,
): void {
  const cbCtx: EvalContext = {
    onReturn: (value) => {
      mergeInto(callbackReturn, value);
    },
    regionStack,
  };
  const semantics = cand.semantics;
  const elementParams = semantics?.elementParams ?? [0];
  const wholeParams = semantics?.wholeParams ?? [2];
  if (reducing) {
    const seed = readReduceSeed(analysis, syntax.arguments[1], element, cand.order, frame);
    bindCallbackParam(analysis, cb, semantics?.accumulatorParam ?? 0, seed, cbCtx);
  }
  bindParamGroup(analysis, cb, elementParams, element, cbCtx, true);
  bindParamGroup(analysis, cb, wholeParams, element, cbCtx, false);
  if (ts.isBlock(cb.body)) {
    cb.body.statements.forEach((stmt) => {
      analysis.visit(stmt, cbCtx);
    });
    return;
  }
  mergeInto(callbackReturn, analysis.evalExpr(cb.body, cbCtx));
}

function driveIndirect(
  analysis: Evaluator,
  syntax: ts.CallExpression,
  cand: IterationCandidate,
  element: AbstractValue,
  regionStack: string[],
  callbackReturn: AbstractValue,
  frame: EvalContext,
  reducing: boolean,
): void {
  const callbackExpr = cand.callbackExpr;
  if (callbackExpr === undefined) return;
  const fns: ts.Node[] = [];
  analysis.evalExpr(callbackExpr, frame).fns.forEach((fn) => {
    if (analysis.s.fnId.has(fn)) fns.push(fn);
  });
  if (fns.length === 0) return;
  const actuals = shapeActuals(analysis, syntax, cand, element, frame, reducing);
  mergeInto(callbackReturn, applyCallbackFns(analysis, fns, actuals, regionStack, syntax));
}

function shapeActuals(
  analysis: Evaluator,
  syntax: ts.CallExpression,
  cand: IterationCandidate,
  element: AbstractValue,
  frame: EvalContext,
  reducing: boolean,
): AbstractValue[] {
  const semantics = cand.semantics;
  const elementParams = semantics?.elementParams ?? [0];
  const wholeParams = semantics?.wholeParams ?? [2];
  const accParam = semantics?.accumulatorParam;
  let highest = accParam ?? -1;
  elementParams.forEach((index) => {
    if (index > highest) highest = index;
  });
  wholeParams.forEach((index) => {
    if (index > highest) highest = index;
  });
  const actuals: AbstractValue[] = [];
  for (let slot = 0; slot < highest + 1; slot += 1) actuals.push(emptyValue());
  if (reducing) {
    actuals[accParam ?? 0] = readReduceSeed(analysis, syntax.arguments[1], element, cand.order, frame);
  }
  elementParams.forEach((index) => {
    actuals[index] = cloneValue(element);
  });
  wholeParams.forEach((index) => {
    actuals[index] = cloneValue(element);
  });
  return actuals;
}

function readReduceSeed(
  analysis: Evaluator,
  seedArg: ts.Expression | undefined,
  element: AbstractValue,
  order: number,
  frame: EvalContext,
): AbstractValue {
  const chain = analysis.s.reduceAccOf(order);
  const seedPlace = seedArg === undefined ? undefined : analysis.resolvePlace(seedArg);
  if (seedPlace !== undefined) {
    analysis.s.changed = mergeInto(seedPlace, chain) || analysis.s.changed;
    return seedPlace;
  }
  const initial = seedArg === undefined ? element : analysis.evalExpr(seedArg, frame);
  return unionValues(initial, chain);
}

function bindParamGroup(
  analysis: Evaluator,
  cb: ts.FunctionExpression | ts.ArrowFunction,
  slots: readonly number[],
  element: AbstractValue,
  frame: EvalContext,
  shareHead: boolean,
): void {
  slots.forEach((paramIndex, position) => {
    const payload = shareHead && position === 0 ? element : cloneValue(element);
    bindCallbackParam(analysis, cb, paramIndex, payload, frame);
  });
}

// Only element fields flow back. The element's own occurrences stay put.
function pourElementFields(analysis: Evaluator, iterated: ts.Expression, element: AbstractValue): void {
  const collectionPlace = analysis.resolvePlace(iterated);
  if (collectionPlace === undefined) return;
  element.fields.forEach((field) => {
    analysis.s.changed = mergeInto(collectionPlace, collapse(field)) || analysis.s.changed;
  });
}

function bindCallbackParam(
  analysis: Evaluator,
  cb: ts.FunctionExpression | ts.ArrowFunction,
  index: number,
  value: AbstractValue,
  frame: EvalContext,
): void {
  const param = cb.parameters[index];
  if (param === undefined) return;
  analysis.bindPattern(param.name, value, frame);
}

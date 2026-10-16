// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import {
  adoptFields,
  collapse,
  emptyValue,
  mergeInto,
  replayMayAliasMerge,
  type AbstractValue,
} from "./domain.js";
import { mergeIntoRootIdentifier } from "./assign.js";
import type { EvalContext, Evaluator } from "./taint.js";

/** `Object.assign` is a free function: the callee expression is the identifier `Object`. */
export function isObjectAssign(access: ts.PropertyAccessExpression): boolean {
  const owner = access.expression;
  const method = access.name.text;
  return ts.isIdentifier(owner) && owner.text === "Object" && method === "assign";
}

function blank(): AbstractValue {
  return emptyValue();
}

function noteGrowth(machine: Evaluator, grew: boolean): void {
  if (grew) machine.s.changed = true;
}

export function handleHeapMutator(
  machine: Evaluator,
  call: ts.CallExpression,
  access: ts.PropertyAccessExpression,
  frame: EvalContext,
): AbstractValue {
  // `resolvePlace(..., true)` follows the receiver to the shared container, including
  // a nested place (`wrap.items.push`). Map/Set mutators fold arguments the same way.
  const receiver = machine.resolvePlace(access.expression, true);
  // No place: still evaluate the receiver (a facade sink must be visited) and smear
  // each argument into the root identifier instead of dropping it.
  if (receiver === undefined) machine.evalExpr(access.expression, frame);
  for (const argument of call.arguments) {
    const folded = collapse(machine.evalExpr(argument, frame));
    pourArgument(machine, access, receiver, folded);
  }
  return blank();
}

function pourArgument(
  machine: Evaluator,
  access: ts.PropertyAccessExpression,
  receiver: AbstractValue | undefined,
  folded: AbstractValue,
): void {
  if (receiver === undefined) {
    mergeIntoRootIdentifier(machine, access.expression, folded);
    return;
  }
  const direct = mergeInto(receiver, folded);
  const alias = replayMayAliasMerge(receiver, folded);
  noteGrowth(machine, direct || alias);
}

/** `Object.assign(target, ...sources)` merges each source into the target's live value. */
export function handleObjectAssign(
  machine: Evaluator,
  call: ts.CallExpression,
  frame: EvalContext,
): AbstractValue {
  const targetExpr = call.arguments[0];
  if (targetExpr === undefined) return blank();
  const liveTarget = machine.resolvePlace(targetExpr, true);
  const returned = machine.evalExpr(targetExpr, frame);
  for (const sourceExpr of call.arguments.slice(1)) {
    absorbSource(machine, frame, liveTarget, returned, sourceExpr);
  }
  return returned;
}

function absorbSource(
  machine: Evaluator,
  frame: EvalContext,
  liveTarget: AbstractValue | undefined,
  returned: AbstractValue,
  sourceExpr: ts.Expression,
): void {
  // A place source is not re-evaluated. Object fields are adopted by reference so a
  // later write through either side sees the same object; container labels still merge.
  // Growth of the returned value is not a `changed` signal — only the live target is.
  const sourcePlace = machine.resolvePlace(sourceExpr);
  const sourceValue = sourcePlace === undefined ? machine.evalExpr(sourceExpr, frame) : sourcePlace;
  if (liveTarget === undefined) {
    mergeInto(returned, sourceValue);
    return;
  }
  if (sourcePlace !== undefined) noteGrowth(machine, adoptFields(liveTarget, sourcePlace));
  noteGrowth(machine, mergeInto(liveTarget, sourceValue));
  mergeInto(returned, sourceValue);
}

// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import {
  addOcc,
  addPlaceholder,
  bindingPropertyKey,
  collapse,
  emptyValue,
  mergeInto,
  readField,
  type AbstractValue,
} from "./domain.js";
import type { EvalContext, Evaluator } from "./taint.js";

/**
 * Destructuring bind. A live source place aliases statically-known fields, so a later
 * write through the extracted name is visible on the container. Rest elements and
 * non-place sources stay value-level (a collapsed or field-selected copy, no alias).
 */

export function bindPattern(
  ev: Evaluator,
  name: ts.BindingName,
  value: AbstractValue,
  ctx: EvalContext,
  sourcePlace?: AbstractValue,
): void {
  if (ts.isIdentifier(name)) {
    bindIdentifier(ev, name, value);
    return;
  }
  if (ts.isObjectBindingPattern(name)) {
    bindObjectPattern(ev, name, value, ctx, sourcePlace);
    return;
  }
  bindArrayPattern(ev, name, value, ctx, sourcePlace);
}

function bindIdentifier(ev: Evaluator, name: ts.Identifier, value: AbstractValue): void {
  const sym = ev.checker.getSymbolAtLocation(name);
  if (sym === undefined) return;
  ev.s.bindSymbol(sym, value);
}

function bindObjectPattern(
  ev: Evaluator,
  pattern: ts.ObjectBindingPattern,
  value: AbstractValue,
  ctx: EvalContext,
  sourcePlace: AbstractValue | undefined,
): void {
  let index = 0;
  while (index < pattern.elements.length) {
    const element = pattern.elements[index];
    index += 1;
    if (element === undefined) continue;
    if (element.dotDotDotToken !== undefined) {
      bindPattern(ev, element.name, collapse(value), ctx);
      continue;
    }
    const key = bindingPropertyKey(element);
    if (sourcePlace !== undefined && key !== undefined) {
      bindPatternElement(
        ev,
        element.name,
        extractField(ev, sourcePlace, key),
        element.initializer,
        ctx,
      );
      continue;
    }
    const picked = key === undefined ? collapse(value) : selectField(value, key);
    bindPattern(ev, element.name, picked, ctx);
  }
}

function bindArrayPattern(
  ev: Evaluator,
  pattern: ts.ArrayBindingPattern,
  value: AbstractValue,
  ctx: EvalContext,
  sourcePlace: AbstractValue | undefined,
): void {
  let slot = 0;
  let index = 0;
  while (index < pattern.elements.length) {
    const element = pattern.elements[index];
    index += 1;
    if (element === undefined) continue;
    if (ts.isOmittedExpression(element)) {
      slot += 1;
      continue;
    }
    if (element.dotDotDotToken !== undefined) {
      bindPattern(ev, element.name, collapse(value), ctx);
      continue;
    }
    const key = String(slot);
    if (sourcePlace !== undefined) {
      bindPatternElement(
        ev,
        element.name,
        extractField(ev, sourcePlace, key),
        element.initializer,
        ctx,
      );
    } else {
      bindPattern(ev, element.name, selectField(value, key), ctx);
    }
    slot += 1;
  }
}

// A default is weak-merged into the live field: runtime may observe either value.
// The field is both the bound value and the source, so nested patterns keep aliasing.
function bindPatternElement(
  ev: Evaluator,
  name: ts.BindingName,
  field: AbstractValue,
  initializer: ts.Expression | undefined,
  ctx: EvalContext,
): void {
  if (initializer !== undefined) {
    const initVal = ev.evalExpr(initializer, ctx);
    if (mergeInto(field, initVal)) ev.s.changed = true;
  }
  bindPattern(ev, name, field, ctx, field);
}

/**
 * Absent fields are created and seeded with the container's own occurrences and
 * placeholders only — the same labels a collapsed read would have produced — then
 * `changed` is raised. An existing field is returned as-is and is not re-seeded.
 */
export function extractField(ev: Evaluator, container: AbstractValue, key: string): AbstractValue {
  const existing = container.fields.get(key);
  if (existing !== undefined) return existing;
  const field = emptyValue();
  seedLabels(container, field);
  container.fields.set(key, field);
  ev.s.changed = true;
  return field;
}

function seedLabels(container: AbstractValue, field: AbstractValue): void {
  const occs = container.occs.values();
  let occStep = occs.next();
  while (occStep.done !== true) {
    addOcc(field, occStep.value);
    occStep = occs.next();
  }
  const phs = container.phs.values();
  let phStep = phs.next();
  while (phStep.done !== true) {
    addPlaceholder(field, phStep.value);
    phStep = phs.next();
  }
}

export function selectField(value: AbstractValue, key: string): AbstractValue {
  return readField(value, key);
}

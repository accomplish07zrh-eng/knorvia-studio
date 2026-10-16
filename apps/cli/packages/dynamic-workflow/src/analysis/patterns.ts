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

// A pattern is lowered to slots, then one interpreter either aliases a live
// field or copies a value-level read. Rest never advances an array index;
// an omitted hole advances the index and emits no slot.

interface BindEnv {
  readonly ev: Evaluator;
  readonly ctx: EvalContext;
  readonly source: AbstractValue | undefined;
}

type Slot =
  | { readonly tag: "rest"; readonly name: ts.BindingName }
  | {
      readonly tag: "pick";
      readonly name: ts.BindingName;
      readonly key: string | undefined;
      readonly fallback: ts.Expression | undefined;
    };

function elementTag(element: ts.BindingElement): "rest" | "pick" {
  return element.dotDotDotToken === undefined ? "pick" : "rest";
}

function lowerObject(pattern: ts.ObjectBindingPattern): Slot[] {
  return pattern.elements.map((element): Slot => {
    if (elementTag(element) === "rest") return { tag: "rest", name: element.name };
    return {
      tag: "pick",
      name: element.name,
      key: bindingPropertyKey(element),
      fallback: element.initializer,
    };
  });
}

function lowerArray(pattern: ts.ArrayBindingPattern): Slot[] {
  const slots: Slot[] = [];
  pattern.elements.reduce((position, element) => {
    if (element.kind === ts.SyntaxKind.OmittedExpression) return position + 1;
    const binding = element;
    if (elementTag(binding) === "rest") {
      slots.push({ tag: "rest", name: binding.name });
      return position;
    }
    slots.push({
      tag: "pick",
      name: binding.name,
      key: String(position),
      fallback: binding.initializer,
    });
    return position + 1;
  }, 0);
  return slots;
}

function lower(name: ts.BindingName): Slot[] | undefined {
  switch (name.kind) {
    case ts.SyntaxKind.ObjectBindingPattern:
      return lowerObject(name);
    case ts.SyntaxKind.ArrayBindingPattern:
      return lowerArray(name);
    default:
      return undefined;
  }
}

function noteChanged(ev: Evaluator): void {
  ev.s.changed ||= true;
}

function storeIdentifier(env: BindEnv, name: ts.Identifier, value: AbstractValue): void {
  const symbol = env.ev.checker.getSymbolAtLocation(name);
  if (symbol !== undefined) env.ev.s.bindSymbol(symbol, value);
}

function aliasKey(
  slot: Extract<Slot, { tag: "pick" }>,
  source: AbstractValue | undefined,
): string | undefined {
  return source === undefined ? undefined : slot.key;
}

function applyFallback(
  env: BindEnv,
  field: AbstractValue,
  fallback: ts.Expression | undefined,
): void {
  if (fallback === undefined) return;
  const supplied = env.ev.evalExpr(fallback, env.ctx);
  if (mergeInto(field, supplied)) noteChanged(env.ev);
}

function bindPick(env: BindEnv, slot: Extract<Slot, { tag: "pick" }>, value: AbstractValue): void {
  const key = aliasKey(slot, env.source);
  if (key !== undefined && env.source !== undefined) {
    const field = extractField(env.ev, env.source, key);
    applyFallback(env, field, slot.fallback);
    bindPattern(env.ev, slot.name, field, env.ctx, field);
  } else {
    const picked = slot.key === undefined ? collapse(value) : selectField(value, slot.key);
    bindPattern(env.ev, slot.name, picked, env.ctx);
  }
}

function runSlots(env: BindEnv, slots: readonly Slot[], value: AbstractValue): void {
  for (const slot of slots) {
    if (slot.tag === "rest") bindPattern(env.ev, slot.name, collapse(value), env.ctx);
    else bindPick(env, slot, value);
  }
}

export function bindPattern(
  ev: Evaluator,
  name: ts.BindingName,
  value: AbstractValue,
  ctx: EvalContext,
  sourcePlace?: AbstractValue,
): void {
  switch (name.kind) {
    case ts.SyntaxKind.Identifier:
      storeIdentifier({ ev, ctx, source: sourcePlace }, name, value);
      break;
    case ts.SyntaxKind.ObjectBindingPattern:
    case ts.SyntaxKind.ArrayBindingPattern: {
      const slots = lower(name);
      if (slots !== undefined) runSlots({ ev, ctx, source: sourcePlace }, slots, value);
      break;
    }
    default:
      break;
  }
}

function copyLabels(from: AbstractValue, into: AbstractValue): void {
  for (const occ of from.occs.values()) addOcc(into, occ);
  for (const placeholder of from.phs.values()) addPlaceholder(into, placeholder);
}

export function extractField(ev: Evaluator, container: AbstractValue, key: string): AbstractValue {
  const found = container.fields.get(key);
  if (found !== undefined) return found;
  const created = emptyValue();
  copyLabels(container, created);
  container.fields.set(key, created);
  noteChanged(ev);
  return created;
}

export function selectField(value: AbstractValue, key: string): AbstractValue {
  const picked = readField(value, key);
  return picked;
}

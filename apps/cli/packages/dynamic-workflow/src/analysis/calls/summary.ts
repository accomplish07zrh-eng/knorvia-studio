// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import {
  addOcc,
  addPlaceholder,
  clearExact,
  collapse,
  collapseInto,
  emptyValue,
  mergeBound,
  mergeInto,
  VALUE_DEPTH_CAP,
  type AbstractValue,
  type Placeholder,
  type TaintOcc,
} from "../domain.js";
import type { ApplicationVia } from "../state.js";
import type { Evaluator } from "../taint.js";

// Substitute a function summary at a call, and copy the callee's heap effects
// back onto the caller's argument places. Past the depth cap, nested fields and
// the bind prefix are smeared into occurrences instead of walked.

export type CallApp = { site: ts.Node; via: ApplicationVia };

export class SummarySubst {
  constructor(
    private readonly fnId: number,
    private readonly argVals: readonly AbstractValue[],
    private readonly clear: boolean,
  ) {}

  // Past the depth cap, nested fields and the bind prefix are smeared into
  // occurrences instead of walked. A rest formal gathers every actual from its
  // index up; an enclosing function's placeholder is carried through raw.
  apply(summary: AbstractValue, depth = 0): AbstractValue {
    const out = emptyValue();
    summary.occs.forEach((occ) => addOcc(out, this.scrubbed(occ)));
    summary.phs.forEach((ph) => this.rewrite(out, ph));
    summary.fns.forEach((fn) => out.fns.add(fn));
    if (depth >= VALUE_DEPTH_CAP) {
      summary.fields.forEach((field) => collapseInto(out, field));
      (summary.bound ?? []).forEach((part) => collapseInto(out, part));
      return out;
    }
    if (summary.bound !== undefined)
      out.bound = summary.bound.map((part) => this.apply(part, depth + 1));
    summary.fields.forEach((field, key) => out.fields.set(key, this.apply(field, depth + 1)));
    return out;
  }

  private scrubbed(occ: TaintOcc): TaintOcc {
    return { exact: this.clear ? false : occ.exact, port: occ.port, site: occ.site };
  }

  private rewrite(out: AbstractValue, ph: Placeholder): void {
    if (ph.fnId !== this.fnId) {
      addPlaceholder(out, ph);
      return;
    }
    const start = ph.rest === true ? ph.param : ph.param;
    const end = ph.rest === true ? this.argVals.length : ph.param + 1;
    for (let index = start; index < end; index += 1) {
      const actual = this.argVals[index];
      if (actual !== undefined) mergeInto(out, this.clear ? clearExact(actual) : actual);
    }
  }
}

class HeapEcho {
  constructor(
    private readonly target: AbstractValue,
    private readonly source: AbstractValue,
    private readonly ownerId: number,
    private readonly selfParam: number,
    private readonly argVals: readonly AbstractValue[],
  ) {}

  // Copy field writes and sibling placeholders back into the caller's place.
  // The parameter's own placeholder is its identity, not an effect. Other
  // placeholders of this callee substitute to this call's actuals. A bind prefix
  // goes through mergeBound so the length cap still applies on the persistent place.
  apply(): boolean {
    let grew = false;
    this.source.occs.forEach((occ) => {
      grew = addOcc(this.target, occ) || grew;
    });
    this.source.phs.forEach((ph) => {
      grew = this.effect(ph) || grew;
    });
    this.source.fns.forEach((fn) => {
      if (this.target.fns.has(fn)) return;
      this.target.fns.add(fn);
      grew = true;
    });
    this.source.fields.forEach((field, key) => {
      const found = this.target.fields.get(key) ?? this.freshField(key);
      grew = mergeInto(found, field) || grew;
    });
    if (this.source.bound !== undefined)
      grew = mergeBound(this.target, this.source.bound, 0) || grew;
    return grew;
  }

  private freshField(key: string): AbstractValue {
    const created = emptyValue();
    this.target.fields.set(key, created);
    return created;
  }

  private effect(ph: Placeholder): boolean {
    if (ph.fnId !== this.ownerId) return addPlaceholder(this.target, ph);
    if (ph.param === this.selfParam) return false;
    const from = ph.param;
    const until = ph.rest === true ? this.argVals.length : ph.param + 1;
    let grew = false;
    for (let index = from; index < until; index += 1) {
      const actual = this.argVals[index];
      if (actual !== undefined) grew = mergeInto(this.target, collapse(actual)) || grew;
    }
    return grew;
  }
}

export function recordCallEffects(
  analysis: Evaluator,
  id: number,
  regionStack: string[],
  argVals: AbstractValue[],
  argPlaces?: (AbstractValue | undefined)[],
  application?: { site: ts.Node; via: ApplicationVia },
): void {
  analysis.s.markCalled(regionStack, id);
  const fn = application === undefined ? undefined : analysis.s.functions[id];
  if (application !== undefined && fn !== undefined)
    analysis.s.recordApplication(application.site, fn, application.via);
  const params = analysis.s.fnParamSymbols.get(id) ?? [];
  argVals.forEach((argVal, param) => {
    analysis.s.addParamActual(id, param, argVal);
    const psym = params[param];
    if (psym !== undefined && argVal.fns.size > 0) {
      const fnsOnly = emptyValue();
      argVal.fns.forEach((held) => fnsOnly.fns.add(held));
      analysis.s.bindSymbol(psym, fnsOnly);
    }
    const live = argPlaces?.[param];
    const slot = psym === undefined || live === undefined ? undefined : analysis.s.env.get(psym);
    if (slot === undefined || live === undefined || slot === live) return;
    if (new HeapEcho(live, slot, id, param, argVals).apply()) analysis.s.changed = true;
  });
}

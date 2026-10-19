// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import {
  clearExact,
  collapse,
  collapseInto,
  emptyValue,
  isDirectCallee,
  mergeInto,
  type AbstractValue,
} from "../domain.js";
import type { EvalContext, Evaluator } from "../taint.js";
import { recordCallEffects, SummarySubst, type CallApp } from "./summary.js";

// Positional actuals, and applying a script-local function. `call` / `apply` /
// `bind` reshape the receiver; a plain call uses the actuals as written. A bind
// prefix is tried both with and without the prefix, because a merged value cannot
// say which function carried it.

export interface ActualPack {
  explicit: AbstractValue[];
  places?: (AbstractValue | undefined)[];
  tail?: AbstractValue;
}

export function tracked(analysis: Evaluator, value: AbstractValue): ts.Node[] {
  return [...value.fns].filter((fn) => analysis.s.fnId.has(fn));
}

export class ActualList {
  constructor(
    private readonly analysis: Evaluator,
    private readonly args: readonly ts.Expression[],
    private readonly frame: EvalContext,
  ) {}

  // Positional certainty ends at the first spread. That element and everything
  // after it fold into one exactness-cleared tail bound to every later parameter.
  pack(): ActualPack {
    const cut = this.args.findIndex((arg) => ts.isSpreadElement(arg));
    const head = cut < 0 ? this.args : this.args.slice(0, cut);
    const explicit = head.map((arg) => this.analysis.evalExpr(arg, this.frame));
    const places = head.map((arg, index) =>
      this.analysis.argWriteBackPlace(arg, explicit[index] as AbstractValue),
    );
    if (cut < 0) return { explicit, places };
    const tail = emptyValue();
    this.args
      .slice(cut)
      .forEach((arg) => collapseInto(tail, this.analysis.evalExpr(arg, this.frame)));
    return { explicit, places, tail: clearExact(tail) };
  }
}

export class ForwardedCall {
  private static readonly shapes = new Set(["call", "apply", "bind"]);

  constructor(
    private readonly analysis: Evaluator,
    private readonly syntax: ts.CallExpression,
    private readonly access: ts.PropertyAccessExpression,
    private readonly frame: EvalContext,
  ) {}

  // Only a script-local receiver is reshaped. Anything else falls through so
  // function-valued arguments are still applied pessimistically.
  resolve(): AbstractValue | undefined {
    const method = this.access.name.text;
    if (ForwardedCall.shapes.has(method) === false) return undefined;
    const receiver = this.analysis.evalExpr(this.access.expression, this.frame);
    const fns = tracked(this.analysis, receiver);
    if (fns.length === 0) return undefined;
    if (method === "bind") return this.asBind(receiver);
    if (method === "apply") return this.asApply(receiver, fns);
    return this.asCall(receiver, fns);
  }

  // `f.call(thisArg, a, b)` drops thisArg so parameter 0 is `a`, not `null`.
  private asCall(receiver: AbstractValue, fns: ts.Node[]): AbstractValue {
    const exact = fns.length === 1 && isDirectCallee(this.access.expression);
    const pack = new ActualList(this.analysis, this.syntax.arguments.slice(1), this.frame).pack();
    return new FnApply(
      this.analysis,
      fns,
      exact,
      pack,
      this.frame,
      receiver.bound,
      this.syntax,
    ).eval();
  }

  // `f.apply(thisArg, argsArray)` has no positional shape, so the array is an
  // inexact tail on every parameter.
  private asApply(receiver: AbstractValue, fns: ts.Node[]): AbstractValue {
    const argsArray = this.syntax.arguments.at(1);
    const tail =
      argsArray === undefined
        ? emptyValue()
        : clearExact(collapse(this.analysis.evalExpr(argsArray, this.frame)));
    return new FnApply(
      this.analysis,
      fns,
      false,
      { explicit: [], tail },
      this.frame,
      receiver.bound,
      this.syntax,
    ).eval();
  }

  // `f.bind(thisArg, ...prefix)` yields a new function value: the same fns plus
  // a prefix prepended to whatever prefix the receiver already carried.
  private asBind(receiver: AbstractValue): AbstractValue {
    const prefix = this.syntax.arguments
      .slice(1)
      .map((arg) => this.analysis.evalExpr(arg, this.frame));
    const out = emptyValue();
    receiver.fns.forEach((fn) => out.fns.add(fn));
    out.bound = [...(receiver.bound ?? []), ...prefix];
    return out;
  }
}

export class FnApply {
  constructor(
    private readonly analysis: Evaluator,
    private readonly fns: readonly ts.Node[],
    private readonly exact: boolean,
    private readonly pack: ActualPack,
    private readonly frame: EvalContext,
    private readonly bound: AbstractValue[] | undefined,
    private readonly site: ts.Node | undefined,
  ) {}

  // Both alignments are unioned. A bound dispatch is inexact: the prefix is not proven.
  eval(): AbstractValue {
    const result = emptyValue();
    const prefix = this.bound ?? [];
    this.align(prefix.length > 0 ? false : this.exact, this.pack, result);
    if (prefix.length === 0) return result;
    const places = prefix
      .map(() => undefined as AbstractValue | undefined)
      .concat(this.pack.places ?? []);
    this.align(
      false,
      { explicit: prefix.concat(this.pack.explicit), places, tail: this.pack.tail },
      result,
    );
    return result;
  }

  private align(exact: boolean, pack: ActualPack, result: AbstractValue): void {
    this.fns.forEach((fn) => {
      const id = this.analysis.s.fnId.get(fn);
      if (id === undefined) return;
      const arity = (this.analysis.s.fnParamSymbols.get(id) ?? []).length;
      const width =
        pack.tail === undefined ? pack.explicit.length : Math.max(pack.explicit.length, arity);
      const args: AbstractValue[] = [];
      const slots: (AbstractValue | undefined)[] = [];
      for (let index = 0; index < width; index += 1) {
        const positioned = index < pack.explicit.length ? pack.explicit[index] : undefined;
        args.push(positioned ?? (pack.tail as AbstractValue));
        slots.push(positioned === undefined ? undefined : pack.places?.[index]);
      }
      const recorded = exact ? args : args.map((item) => clearExact(item));
      const via: CallApp | undefined =
        this.site === undefined ? undefined : { site: this.site, via: "callee" };
      recordCallEffects(this.analysis, id, this.frame.regionStack, recorded, slots, via);
      mergeInto(
        result,
        new SummarySubst(id, args, exact === false).apply(this.analysis.s.summaryOf(id)),
      );
    });
  }
}

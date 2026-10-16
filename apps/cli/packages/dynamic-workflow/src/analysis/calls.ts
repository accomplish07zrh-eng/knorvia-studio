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
  type TaintOcc,
} from "./domain.js";
import type { EvalContext, Evaluator } from "./taint.js";
import type { ApplicationVia } from "./state.js";
import { applySuperCall } from "./classes.js";
import { handleArrayMethod } from "./array-methods.js";
import { handlePromiseReject, isPromiseReject } from "./promise-ops.js";
import { callbackSemanticsOf, isForeignMember } from "./callbacks.js";
import { handleHeapMutator, handleObjectAssign, isObjectAssign } from "./heap-ops.js";
import { handleAsk, handleJoin, handleWorldRead } from "./relays.js";

// A call is a chain of special transfers (actor, super, facade, member) and
// then a generic apply. Spread arguments after the first `...` share one
// inexact tail. A bind prefix is applied twice — with the prefix and without —
// because a merged value cannot say which function is the bound one. Unknown
// calls drop callables from the callback pot so a function is not applied to itself.

interface ActualPack {
  explicit: AbstractValue[];
  places?: (AbstractValue | undefined)[];
  tail?: AbstractValue;
}

type CallApp = { site: ts.Node; via: ApplicationVia };
type Probe = () => AbstractValue | undefined;

function tracked(analysis: Evaluator, value: AbstractValue): ts.Node[] {
  return [...value.fns].filter((fn) => analysis.s.fnId.has(fn));
}

function firstOf(probes: readonly Probe[]): AbstractValue | undefined {
  for (const probe of probes) {
    const hit = probe();
    if (hit !== undefined) return hit;
  }
  return undefined;
}

class CallDispatch {
  constructor(
    private readonly analysis: Evaluator,
    private readonly syntax: ts.CallExpression,
    private readonly frame: EvalContext,
  ) {}

  eval(): AbstractValue {
    const hit = firstOf([
      () => this.lookup(this.analysis.s.actorByCall, (id) => singleOcc(id, true)),
      () => this.superInvoke(),
      () =>
        this.lookup(this.analysis.s.askByCall, (id) =>
          handleAsk(this.analysis, this.syntax, id, this.frame),
        ),
      () => this.world(),
      () => this.join(),
      () => this.member(),
    ]);
    return hit ?? new GenericCall(this.analysis, this.syntax, this.frame).eval();
  }

  private lookup<V>(
    map: Map<ts.CallExpression, V>,
    use: (value: V) => AbstractValue,
  ): AbstractValue | undefined {
    const value = map.get(this.syntax);
    return value === undefined ? undefined : use(value);
  }

  // `super(args)` applies the base constructor with these actuals. The call
  // itself yields nothing; the base writes land on the shared instance.
  private superInvoke(): AbstractValue | undefined {
    if (this.syntax.expression.kind !== ts.SyntaxKind.SuperKeyword) return undefined;
    applySuperCall(this.analysis, this.syntax, this.frame);
    return emptyValue();
  }

  private world(): AbstractValue | undefined {
    const site = this.analysis.s.worldByCall.get(this.syntax);
    return site === undefined
      ? undefined
      : handleWorldRead(this.analysis, site.id, site.args, this.frame);
  }

  private join(): AbstractValue | undefined {
    const site = this.analysis.s.joinByCall.get(this.syntax);
    return site === undefined
      ? undefined
      : handleJoin(this.analysis, this.syntax, site.id, site.arg, this.frame);
  }

  private member(): AbstractValue | undefined {
    const access = this.syntax.expression;
    if (!ts.isPropertyAccessExpression(access)) return undefined;
    return new MemberCall(this.analysis, this.syntax, access, this.frame).resolve();
  }
}

class MemberCall {
  constructor(
    private readonly analysis: Evaluator,
    private readonly syntax: ts.CallExpression,
    private readonly access: ts.PropertyAccessExpression,
    private readonly frame: EvalContext,
  ) {}

  resolve(): AbstractValue | undefined {
    const named = firstOf([
      () => this.iteration(),
      () => this.stringify(),
      () => this.rejectOrAssign(),
      () => this.mutator(),
    ]);
    if (named !== undefined) return named;
    const forwarded = new ForwardedCall(
      this.analysis,
      this.syntax,
      this.access,
      this.frame,
    ).resolve();
    if (forwarded !== undefined) return forwarded;
    this.noteDeferred();
    return undefined;
  }

  private iteration(): AbstractValue | undefined {
    const cand = this.analysis.s.candByCall.get(this.syntax);
    return cand === undefined
      ? undefined
      : handleArrayMethod(this.analysis, this.syntax, cand, this.frame);
  }

  private stringify(): AbstractValue | undefined {
    if (!isJsonStringify(this.access)) return undefined;
    const payload = this.syntax.arguments.at(0);
    return payload === undefined
      ? emptyValue()
      : collapse(this.analysis.evalExpr(payload, this.frame));
  }

  private rejectOrAssign(): AbstractValue | undefined {
    if (isPromiseReject(this.access))
      return handlePromiseReject(this.analysis, this.syntax, this.frame);
    return isObjectAssign(this.access)
      ? handleObjectAssign(this.analysis, this.syntax, this.frame)
      : undefined;
  }

  // A script method that merely shares a mutator name (`inbox.add`) must still
  // be applied. The receiver smear runs first: a merged value may be either a
  // user object or a native collection, and the smear only adds taint. Native
  // collections carry no tracked functions after a smear-on-read.
  private mutator(): AbstractValue | undefined {
    if (!HEAP_MUTATORS.has(this.access.name.text)) return undefined;
    const smeared = handleHeapMutator(this.analysis, this.syntax, this.access, this.frame);
    const held = tracked(this.analysis, this.analysis.evalExpr(this.access, this.frame));
    return held.length === 0
      ? smeared
      : new GenericCall(this.analysis, this.syntax, this.frame).eval();
  }

  // A deferred continuation settles with the receiver. The key is the member-name
  // token, not the receiver's start: a chain's receivers share one start offset.
  private noteDeferred(): void {
    const semantics = callbackSemanticsOf(
      this.syntax,
      this.analysis.checker,
      this.analysis.s.program,
    );
    if (semantics?.deferred !== true) return;
    const settled = collapse(this.analysis.evalExpr(this.access.expression, this.frame));
    this.analysis.s.mergeSink(
      this.analysis.s.awaitVal,
      this.access.name.getStart(this.analysis.s.scriptFile),
      settled,
    );
  }
}

class ActualList {
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

class ForwardedCall {
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

class GenericCall {
  constructor(
    private readonly analysis: Evaluator,
    private readonly syntax: ts.CallExpression,
    private readonly frame: EvalContext,
  ) {}

  eval(): AbstractValue {
    const pack = new ActualList(this.analysis, this.syntax.arguments, this.frame).pack();
    return applyCall(
      this.analysis,
      this.syntax.expression,
      pack.explicit,
      this.frame,
      pack.places,
      pack.tail,
      this.syntax,
    );
  }
}

class FnApply {
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
      recordCall(this.analysis, id, this.frame.regionStack, recorded, slots, via);
      mergeInto(
        result,
        new SummarySubst(id, args, exact === false).apply(this.analysis.s.summaryOf(id)),
      );
    });
  }
}

class UnknownCall {
  constructor(
    private readonly analysis: Evaluator,
    private readonly calleeExpr: ts.Expression,
    private readonly calleeVal: AbstractValue,
    private readonly argVals: readonly AbstractValue[],
    private readonly frame: EvalContext,
    private readonly tail: AbstractValue | undefined,
    private readonly site: ts.Node | undefined,
  ) {}

  // The result keeps the receiver's and arguments' labels. Every script function
  // among the arguments is then applied with a pot of the sibling data only.
  eval(): AbstractValue {
    const folded = this.foldInputs();
    const out = cloneValue(folded);
    const pot = clearExact(folded);
    pot.fns.clear();
    this.eachArg((arg) =>
      applyPessimistically(this.analysis, arg, pot, this.frame, out, this.site),
    );
    this.captureInvocations(pot);
    return out;
  }

  private foldInputs(): AbstractValue {
    const folded = emptyValue();
    if (ts.isPropertyAccessExpression(this.calleeExpr)) {
      collapseInto(folded, this.analysis.evalExpr(this.calleeExpr.expression, this.frame));
    }
    this.eachArg((arg) => collapseInto(folded, arg));
    return folded;
  }

  // A placeholder argument may be invoked with the pot. A placeholder callee
  // receives the argument pot, not the receiver.
  private captureInvocations(pot: AbstractValue): void {
    this.eachArg((arg) => arg.phs.forEach((ph) => this.analysis.s.recordPhCall(phKey(ph), pot)));
    if (this.calleeVal.phs.size === 0) return;
    const argPot = emptyValue();
    this.argVals.forEach((arg) => collapseInto(argPot, arg));
    if (this.tail !== undefined) collapseInto(argPot, this.tail);
    this.calleeVal.phs.forEach((ph) => this.analysis.s.recordPhCall(phKey(ph), argPot));
  }

  private eachArg(use: (arg: AbstractValue) => void): void {
    this.argVals.forEach(use);
    if (this.tail !== undefined) use(this.tail);
  }
}

class SummarySubst {
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

export function evalCall(
  analysis: Evaluator,
  syntax: ts.CallExpression,
  frame: EvalContext,
): AbstractValue {
  return new CallDispatch(analysis, syntax, frame).eval();
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
  // A library member is not a script function. Callables smeared into the member
  // slot belong to the receiver, not to this callee.
  const foreign =
    ts.isPropertyAccessExpression(calleeExpr) &&
    isForeignMember(calleeExpr.name, analysis.checker, analysis.s.scriptFile);
  const fns = foreign ? [] : tracked(analysis, calleeVal);
  const pack: ActualPack = { explicit: argVals, places: argPlaces, tail };
  if (fns.length === 0)
    return new UnknownCall(analysis, calleeExpr, calleeVal, argVals, frame, tail, site).eval();
  const exact = fns.length === 1 && isDirectCallee(calleeExpr);
  return new FnApply(analysis, fns, exact, pack, frame, calleeVal.bound, site).eval();
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
    const via: CallApp | undefined = site === undefined ? undefined : { site, via: "argument" };
    recordCall(analysis, id, frame.regionStack, actuals, undefined, via);
    mergeInto(out, new SummarySubst(id, actuals, true).apply(analysis.s.summaryOf(id)));
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
    mergeInto(out, new SummarySubst(id, actuals, true).apply(analysis.s.summaryOf(id)));
  });
  return out;
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

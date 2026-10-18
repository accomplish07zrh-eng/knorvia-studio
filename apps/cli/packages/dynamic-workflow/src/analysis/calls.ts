// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import {
  ActualList,
  FnApply,
  ForwardedCall,
  tracked,
  type ActualPack,
} from "./calls/known-apply.js";
import { recordCallEffects, SummarySubst, type CallApp } from "./calls/summary.js";
import {
  clearExact,
  cloneValue,
  collapse,
  collapseInto,
  emptyValue,
  HEAP_MUTATORS,
  isDirectCallee,
  isJsonStringify,
  mergeInto,
  phKey,
  singleOcc,
  type AbstractValue,
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

type Probe = () => AbstractValue | undefined;

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
  recordCallEffects(analysis, id, regionStack, argVals, argPlaces, application);
}

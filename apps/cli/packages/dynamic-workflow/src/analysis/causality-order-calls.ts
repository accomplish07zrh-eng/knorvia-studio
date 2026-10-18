// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import { callbackSemanticsOf, DEFAULT_CALLBACK_SEMANTICS } from "./callbacks.js";
import {
  functionName,
  resolveCallDeclaration,
  type ScriptFunction,
} from "./causality-order-functions.js";
import {
  applicationsAt,
  innermost,
  issue,
  issuesSince,
  jump,
  locOf,
  openRegion,
  type TraceState,
} from "./causality-order-state.js";
import { barrier, settlesAt } from "./causality-order-settle.js";
import {
  closeStrand,
  isAsyncFunction,
  openStrand,
  type StrandRecord,
} from "./causality-order-strands.js";

// Calls inline oracle bodies. The call is classified after its receiver and
// arguments have been walked, then one effect (ask, read, actor, or apply) runs.

type ApplySite = ts.CallExpression | ts.NewExpression | ts.TaggedTemplateExpression;

interface PreparedCall {
  handled: Set<ts.Node>;
  receiverIssues: string[];
}

interface Activation {
  readonly decl: ScriptFunction;
  readonly site: ts.Node;
  readonly label: string | undefined;
  readonly strand: boolean;
  readonly prologue: ((inside: readonly string[]) => void) | undefined;
}

type CallEffect =
  | { readonly tag: "ask" | "read" | "actor"; readonly id: string }
  | { readonly tag: "apply"; readonly prepared: PreparedCall };

function extend(chain: readonly string[], ...ids: string[]): readonly string[] {
  return chain.concat(ids);
}

function named(label: string | undefined): { label: string } | undefined {
  return label === undefined ? undefined : { label };
}

function strandFlag(active: boolean): { strand: true } | undefined {
  return active ? { strand: true } : undefined;
}

function prepareCall(
  trace: TraceState,
  node: ts.CallExpression,
  chain: readonly string[],
): PreparedCall {
  const receiverMark = trace.events.length;
  trace.walk(node.expression, chain);
  const receiverIssues = issuesSince(trace, receiverMark);
  node.arguments.forEach((argument) => {
    trace.walk(argument, chain);
  });
  const handled: Set<ts.Node> = new Set();
  const cand = trace.candByCall.get(node);
  if (cand === undefined) return { handled, receiverIssues };
  const asyncLiteral = cand.callback !== undefined && isAsyncFunction(cand.callback);
  const id = openRegion(trace, "fanout", innermost(trace, chain), {
    entered: false as const,
    label: cand.method,
    loc: cand.loc,
    ...strandFlag(asyncLiteral),
  });
  const inside = extend(chain, id);
  const literal = cand.callback;
  if (literal !== undefined) {
    const record = asyncLiteral ? openStrand(trace, id) : undefined;
    trace.returnTargets.push(id);
    trace.walk(cand.body, inside);
    trace.returnTargets.pop();
    if (record !== undefined) closeStrand(trace, record);
    return { handled, receiverIssues };
  }
  for (const fn of applicationsAt(trace, node, "argument")) {
    handled.add(fn);
    inlineBody(
      trace,
      { decl: fn, site: node, label: undefined, strand: false, prologue: undefined },
      inside,
    );
  }
  return { handled, receiverIssues };
}

function classify(trace: TraceState, node: ts.CallExpression, prepared: PreparedCall): CallEffect {
  const ask = trace.askByCall.get(node);
  if (ask !== undefined) return { tag: "ask", id: ask };
  const read = trace.readByCall.get(node);
  if (read !== undefined) return { tag: "read", id: read };
  const actor = trace.actorByCall.get(node);
  if (actor !== undefined) return { tag: "actor", id: actor };
  return { tag: "apply", prepared };
}

function emitEffect(
  trace: TraceState,
  node: ts.CallExpression,
  chain: readonly string[],
  effect: CallEffect,
): void {
  switch (effect.tag) {
    case "ask":
    case "read":
      issue(trace, effect.id, chain);
      break;
    case "actor":
      trace.events.push({ actor: effect.id, at: "actor", regions: chain });
      break;
    case "apply":
      applyAt(trace, node, chain, effect.prepared.handled, effect.prepared.receiverIssues);
      break;
    default:
      break;
  }
}

export function walkCall(
  trace: TraceState,
  node: ts.CallExpression,
  chain: readonly string[],
): void {
  emitEffect(trace, node, chain, classify(trace, node, prepareCall(trace, node, chain)));
}

function calleeList(
  trace: TraceState,
  node: ApplySite,
  handled: ReadonlySet<ts.Node>,
): ScriptFunction[] {
  const callees = applicationsAt(trace, node, "callee").filter((fn) => !handled.has(fn));
  if (callees.length > 0 || node.kind !== ts.SyntaxKind.CallExpression) return callees;
  const decl = resolveCallDeclaration(node, trace.checker, trace.scriptFile);
  if (decl === undefined) return callees;
  return callees.concat(decl);
}

function inlineChoice(
  trace: TraceState,
  fns: readonly ScriptFunction[],
  chain: readonly string[],
  site: ts.Node,
  exhaustive: boolean,
  activation: Omit<Activation, "decl" | "site"> | undefined,
): void {
  const choice = openRegion(trace, "choice", innermost(trace, chain), {
    entered: true as const,
    loc: locOf(trace, site),
    ...(exhaustive ? { exhaustive: true } : {}),
  });
  for (const fn of fns) {
    const arm = openRegion(trace, "branch", choice, { entered: false, loc: locOf(trace, fn) });
    inlineBody(
      trace,
      {
        decl: fn,
        site,
        label: activation?.label,
        prologue: activation?.prologue,
        strand: activation?.strand === true,
      },
      extend(chain, choice, arm),
    );
  }
}

function receiverPrologue(
  trace: TraceState,
  node: ApplySite,
  receiverIssues: readonly string[],
): ((inside: readonly string[]) => void) | undefined {
  if (node.kind !== ts.SyntaxKind.CallExpression) return undefined;
  const call = node as ts.CallExpression;
  if (call.expression.kind !== ts.SyntaxKind.PropertyAccessExpression) return undefined;
  const access = call.expression as ts.PropertyAccessExpression;
  const semantics = callbackSemanticsOf(call, trace.checker, trace.program);
  if (semantics?.deferred !== true) return undefined;
  return (inside) => {
    const claim = settlesAt(trace, call, access.name.getStart(trace.scriptFile));
    barrier(trace, receiverIssues.concat(claim.certain), claim.maybe, inside);
  };
}

function enteredFlag(
  semantics: { entered?: boolean; deferred?: boolean; label?: string } | undefined,
): boolean {
  if (semantics === undefined || semantics.entered === undefined)
    return DEFAULT_CALLBACK_SEMANTICS.entered;
  return semantics.entered;
}

// One callee inlines directly. Several become exhaustive choice arms. Argument
// callbacks use registry `entered`; deferred ones barrier inside their strand.
export function applyAt(
  trace: TraceState,
  node: ts.CallExpression | ts.NewExpression | ts.TaggedTemplateExpression,
  chain: readonly string[],
  handled: ReadonlySet<ts.Node> = new Set(),
  receiverIssues: readonly string[] = [],
): void {
  const callees = calleeList(trace, node, handled);
  const only = callees.length === 1 ? callees[0] : undefined;
  if (only !== undefined) {
    inlineBody(
      trace,
      { decl: only, site: node, label: undefined, strand: false, prologue: undefined },
      chain,
    );
  } else if (callees.length > 1) {
    inlineChoice(trace, callees, chain, node, true, undefined);
  }

  const callbacks = applicationsAt(trace, node, "argument").filter((fn) => !handled.has(fn));
  if (callbacks.length > 0) {
    const semantics =
      node.kind === ts.SyntaxKind.TaggedTemplateExpression
        ? undefined
        : callbackSemanticsOf(node, trace.checker, trace.program);
    const entered = enteredFlag(semantics);
    const shared = {
      label: semantics === undefined ? undefined : semantics.label,
      prologue:
        semantics?.deferred === true ? receiverPrologue(trace, node, receiverIssues) : undefined,
      strand: semantics?.deferred === true,
    };
    callbacks.forEach((fn) => {
      if (entered) {
        inlineBody(trace, { decl: fn, site: node, ...shared }, chain);
      } else {
        inlineChoice(trace, [fn], chain, node, false, shared);
      }
    });
  }
}

function restoreScc(trace: TraceState, decl: ts.Node, outer: string | undefined): void {
  if (outer === undefined) trace.sccLoopByDecl.delete(decl);
  else trace.sccLoopByDecl.set(decl, outer);
}

function recurIfLooping(
  trace: TraceState,
  decl: ScriptFunction,
  chain: readonly string[],
): boolean {
  if (trace.fnStack.indexOf(decl) < 0) return false;
  const loop = trace.sccLoopByDecl.get(decl);
  if (loop !== undefined) jump(trace, "recur", loop, chain);
  return true;
}

// Re-entry while the decl is on the stack is cut. A recur jump is recorded only
// when this inline opened a loop region. Async and deferred bodies push a frame
// around the prologue and the body.
function inlineBody(trace: TraceState, activation: Activation, chain: readonly string[]): void {
  const { decl, site } = activation;
  if (recurIfLooping(trace, decl, chain)) return;
  const name = functionName(decl) ?? activation.label;
  const asStrand = activation.strand || isAsyncFunction(decl);
  const loopId = trace.recursive.has(decl)
    ? openRegion(trace, "loop", innermost(trace, chain), {
        entered: true as const,
        loc: locOf(trace, decl),
        recursive: true as const,
        ...named(name),
      })
    : undefined;
  let inside = loopId === undefined ? chain : extend(chain, loopId);
  const callId = openRegion(trace, "call", innermost(trace, inside), {
    entered: true as const,
    loc: locOf(trace, site),
    ...named(name),
    ...strandFlag(asStrand),
  });
  inside = extend(inside, callId);
  const record: StrandRecord | undefined = asStrand ? openStrand(trace, callId) : undefined;
  if (activation.prologue !== undefined) activation.prologue(inside);
  trace.fnStack.push(decl);
  trace.walkedFns.add(decl);
  const outerSccLoop = trace.sccLoopByDecl.get(decl);
  if (loopId !== undefined) trace.sccLoopByDecl.set(decl, loopId);
  trace.returnTargets.push(callId);
  trace.walk(decl.body, inside);
  trace.returnTargets.pop();
  restoreScc(trace, decl, outerSccLoop);
  trace.fnStack.pop();
  if (record !== undefined) closeStrand(trace, record);
}

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

// Calls inline oracle bodies instead of walking function nodes where they are written.
// Recursion back into the visitor goes through `trace.walk`.

interface InlineOptions {
  label?: string;
  strand?: true;
  prologue?: (inside: readonly string[]) => void;
}

function extend(chain: readonly string[], ...ids: string[]): string[] {
  const next = chain.slice();
  for (const id of ids) next.push(id);
  return next;
}

function regionLabel(name: string | undefined): { label: string } | undefined {
  if (name === undefined) return undefined;
  return { label: name };
}

function strandMark(active: boolean): { strand: true } | undefined {
  if (!active) return undefined;
  return { strand: true };
}

function walkCallExpression(
  trace: TraceState,
  node: ts.CallExpression,
  chain: readonly string[],
): { handled: Set<ts.Node>; receiverIssues: string[] } {
  const receiverMark = trace.events.length;
  trace.walk(node.expression, chain);
  const receiverIssues = issuesSince(trace, receiverMark);
  for (const argument of node.arguments) trace.walk(argument, chain);
  const handled = new Set<ts.Node>();
  const cand = trace.candByCall.get(node);
  if (cand === undefined) return { handled, receiverIssues };
  const asyncLiteral = cand.callback !== undefined && isAsyncFunction(cand.callback);
  const id = openRegion(trace, "fanout", innermost(trace, chain), {
    entered: false,
    label: cand.method,
    loc: cand.loc,
    ...strandMark(asyncLiteral),
  });
  const inside = extend(chain, id);
  if (cand.callback !== undefined) {
    const record = asyncLiteral ? openStrand(trace, id) : undefined;
    trace.returnTargets.push(id);
    trace.walk(cand.body, inside);
    trace.returnTargets.pop();
    if (record !== undefined) closeStrand(trace, record);
  } else {
    for (const fn of applicationsAt(trace, node, "argument")) {
      handled.add(fn);
      inlineBody(trace, fn, inside, node);
    }
  }
  return { handled, receiverIssues };
}

export function walkCall(
  trace: TraceState,
  node: ts.CallExpression,
  chain: readonly string[],
): void {
  const prepared = walkCallExpression(trace, node, chain);
  const ask = trace.askByCall.get(node);
  if (ask !== undefined) {
    issue(trace, ask, chain);
    return;
  }
  const read = trace.readByCall.get(node);
  if (read !== undefined) {
    issue(trace, read, chain);
    return;
  }
  const actor = trace.actorByCall.get(node);
  if (actor !== undefined) {
    trace.events.push({ actor, at: "actor", regions: chain });
    return;
  }
  applyAt(trace, node, chain, prepared.handled, prepared.receiverIssues);
}

function calleeList(
  trace: TraceState,
  node: ts.CallExpression | ts.NewExpression | ts.TaggedTemplateExpression,
  handled: ReadonlySet<ts.Node>,
): ScriptFunction[] {
  const callees = applicationsAt(trace, node, "callee").filter((fn) => !handled.has(fn));
  if (callees.length > 0 || !ts.isCallExpression(node)) return callees;
  const decl = resolveCallDeclaration(node, trace.checker, trace.scriptFile);
  if (decl !== undefined) callees.push(decl);
  return callees;
}

function inlineChoice(
  trace: TraceState,
  fns: readonly ScriptFunction[],
  chain: readonly string[],
  site: ts.Node,
  exhaustive: boolean,
  options: InlineOptions | undefined,
): void {
  const choice = openRegion(trace, "choice", innermost(trace, chain), {
    entered: true,
    ...(exhaustive ? { exhaustive: true } : {}),
    loc: locOf(trace, site),
  });
  for (const fn of fns) {
    const arm = openRegion(trace, "branch", choice, { entered: false, loc: locOf(trace, fn) });
    inlineBody(trace, fn, extend(chain, choice, arm), site, options);
  }
}

function receiverPrologue(
  trace: TraceState,
  node: ts.CallExpression | ts.NewExpression | ts.TaggedTemplateExpression,
  receiverIssues: readonly string[],
): ((inside: readonly string[]) => void) | undefined {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression))
    return undefined;
  const access = node.expression;
  const semantics = callbackSemanticsOf(node, trace.checker, trace.program);
  if (semantics?.deferred !== true) return undefined;
  return (inside) => {
    const claim = settlesAt(trace, node, access.name.getStart(trace.scriptFile));
    barrier(trace, [...receiverIssues, ...claim.certain], claim.maybe, inside);
  };
}

/**
 * Apply the oracle record at one call, `new`, or tag.
 * One callee inlines directly. Several become exhaustive choice arms. With no
 * callee record, a call falls back to the checker's resolved declaration.
 * Argument callbacks use registry `entered`; deferred ones are strands whose
 * prologue barriers over the receiver inside that strand's frame. `.then`-style
 * callbacks that are not provably entered sit in a one-arm choice.
 */
export function applyAt(
  trace: TraceState,
  node: ts.CallExpression | ts.NewExpression | ts.TaggedTemplateExpression,
  chain: readonly string[],
  handled: ReadonlySet<ts.Node> = new Set(),
  receiverIssues: readonly string[] = [],
): void {
  const callees = calleeList(trace, node, handled);
  if (callees.length === 1) {
    const only = callees[0];
    if (only !== undefined) inlineBody(trace, only, chain, node);
  } else if (callees.length > 1) {
    inlineChoice(trace, callees, chain, node, true, undefined);
  }

  const callbacks = applicationsAt(trace, node, "argument").filter((fn) => !handled.has(fn));
  if (callbacks.length === 0) return;
  const semantics = ts.isTaggedTemplateExpression(node)
    ? undefined
    : callbackSemanticsOf(node, trace.checker, trace.program);
  const entered = semantics?.entered ?? DEFAULT_CALLBACK_SEMANTICS.entered;
  const prologue =
    semantics?.deferred === true ? receiverPrologue(trace, node, receiverIssues) : undefined;
  const options: InlineOptions = {
    label: semantics?.label,
    prologue,
    ...strandMark(semantics?.deferred === true),
  };
  for (const fn of callbacks) {
    if (entered) {
      inlineBody(trace, fn, chain, node, options);
      continue;
    }
    inlineChoice(trace, [fn], chain, node, false, options);
  }
}

function restoreScc(trace: TraceState, decl: ts.Node, outer: string | undefined): void {
  if (outer === undefined) trace.sccLoopByDecl.delete(decl);
  else trace.sccLoopByDecl.set(decl, outer);
}

/**
 * Inline one body at a site. Re-entry while the decl is already on the stack is cut;
 * a `recur` jump is recorded only when this inline opened a loop region. Async and
 * deferred bodies push their own frame around the prologue and the body.
 */
function inlineBody(
  trace: TraceState,
  decl: ScriptFunction,
  chain: readonly string[],
  site: ts.Node,
  options: InlineOptions = {},
): void {
  if (trace.fnStack.includes(decl)) {
    const loop = trace.sccLoopByDecl.get(decl);
    if (loop !== undefined) jump(trace, "recur", loop, chain);
    return;
  }
  const name = functionName(decl) ?? options.label;
  const asStrand = options.strand === true || isAsyncFunction(decl);
  let inside = chain;
  let sccLoop: string | undefined;
  if (trace.recursive.has(decl)) {
    sccLoop = openRegion(trace, "loop", innermost(trace, chain), {
      entered: true,
      loc: locOf(trace, decl),
      recursive: true,
      ...regionLabel(name),
    });
    inside = extend(inside, sccLoop);
  }
  const call = openRegion(trace, "call", innermost(trace, inside), {
    entered: true,
    loc: locOf(trace, site),
    ...regionLabel(name),
    ...strandMark(asStrand),
  });
  inside = extend(inside, call);
  const record: StrandRecord | undefined = asStrand ? openStrand(trace, call) : undefined;
  if (options.prologue !== undefined) options.prologue(inside);
  trace.fnStack.push(decl);
  trace.walkedFns.add(decl);
  const outerSccLoop = trace.sccLoopByDecl.get(decl);
  if (sccLoop !== undefined) trace.sccLoopByDecl.set(decl, sccLoop);
  trace.returnTargets.push(call);
  trace.walk(decl.body, inside);
  trace.returnTargets.pop();
  restoreScc(trace, decl, outerSccLoop);
  trace.fnStack.pop();
  if (record !== undefined) closeStrand(trace, record);
}

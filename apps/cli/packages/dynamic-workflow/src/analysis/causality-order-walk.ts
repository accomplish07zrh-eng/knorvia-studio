// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import { isFunctionLike } from "./sites.js";
import { applyAt, walkCall } from "./causality-order-calls.js";
import { walkLoop } from "./causality-order-loops.js";
import {
  innermost,
  issuesSince,
  jump,
  locOf,
  openRegion,
  phaseIdOf,
  type TraceState,
} from "./causality-order-state.js";
import { barrier, bindSteps, recordControl, settlesAt } from "./causality-order-settle.js";
import { bindStrands, strandMark, strandsSince } from "./causality-order-strands.js";

// Evaluation-order visitor. Function bodies are not walked where they are written;
// call sites inline them. A phase marker's extent is the rest of its statement list.

function extend(chain: readonly string[], id: string): string[] {
  const next = chain.slice();
  next.push(id);
  return next;
}

function armChain(
  trace: TraceState,
  guard: ts.Expression | undefined,
  node: ts.Node,
  chain: readonly string[],
): string[] {
  const id = openRegion(trace, "branch", innermost(trace, chain), {
    entered: false,
    loc: locOf(trace, node),
  });
  if (guard !== undefined) recordControl(trace, guard, id);
  return extend(chain, id);
}

function transferTarget(trace: TraceState, node: ts.BreakOrContinueStatement): string | undefined {
  const label = node.label;
  const breaking = ts.isBreakStatement(node);
  let cursor: ts.Node | undefined = node.parent;
  while (cursor !== undefined && !isFunctionLike(cursor)) {
    if (label !== undefined) {
      if (ts.isLabeledStatement(cursor) && cursor.label.text === label.text) {
        return trace.regionByStatement.get(cursor.statement);
      }
    } else if (ts.isIterationStatement(cursor, false)) {
      return trace.regionByStatement.get(cursor);
    } else if (breaking && ts.isSwitchStatement(cursor)) {
      return trace.regionByStatement.get(cursor);
    }
    cursor = cursor.parent;
  }
  return undefined;
}

function noteComputedKey(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const name = (node as ts.NamedDeclaration).name;
  if (name !== undefined && ts.isComputedPropertyName(name)) trace.walk(name.expression, chain);
}

export function walkStatements(
  trace: TraceState,
  statements: readonly ts.Statement[],
  chain: readonly string[],
): void {
  const saved = trace.currentPhase;
  let cursor = 0;
  while (cursor < statements.length) {
    const statement = statements[cursor];
    cursor += 1;
    if (statement === undefined) continue;
    const marker = trace.markerByStatement.get(statement);
    if (marker !== undefined) {
      const phase = phaseIdOf(trace, marker);
      if (phase !== undefined) {
        trace.currentPhase = phase;
        // Membership stays on later issue events. The mark itself is only a position.
        trace.events.push({ at: "mark", phase, regions: chain });
      }
    }
    trace.walk(statement, chain);
  }
  trace.currentPhase = saved;
}

function visitAwait(trace: TraceState, node: ts.AwaitExpression, chain: readonly string[]): void {
  const mark = trace.events.length;
  const spawned = strandMark(trace);
  trace.walk(node.expression, chain);
  const claim = settlesAt(trace, node, node.getStart(trace.scriptFile));
  barrier(trace, [...issuesSince(trace, mark), ...claim.certain], claim.maybe, chain, {
    mark: spawned,
    operand: node.expression,
  });
}

function visitNew(trace: TraceState, node: ts.NewExpression, chain: readonly string[]): void {
  trace.walk(node.expression, chain);
  const args = node.arguments;
  if (args !== undefined) {
    for (const argument of args) trace.walk(argument, chain);
  }
  applyAt(trace, node, chain);
}

function visitTagged(
  trace: TraceState,
  node: ts.TaggedTemplateExpression,
  chain: readonly string[],
): void {
  trace.walk(node.tag, chain);
  trace.walk(node.template, chain);
  applyAt(trace, node, chain);
}

function visitVariable(
  trace: TraceState,
  node: ts.VariableDeclaration,
  chain: readonly string[],
): void {
  if (node.initializer === undefined) return;
  const mark = trace.events.length;
  const spawned = strandMark(trace);
  trace.walk(node.initializer, chain);
  bindSteps(trace, node.name, issuesSince(trace, mark));
  bindStrands(trace, node.name, strandsSince(trace, spawned));
}

function visitShortCircuit(
  trace: TraceState,
  node: ts.BinaryExpression,
  chain: readonly string[],
): void {
  trace.walk(node.left, chain);
  const choice = openRegion(trace, "choice", innermost(trace, chain), {
    entered: true,
    loc: locOf(trace, node),
  });
  trace.walk(node.right, armChain(trace, node.left, node.right, extend(chain, choice)));
}

function visitAssign(trace: TraceState, node: ts.BinaryExpression, chain: readonly string[]): void {
  const mark = trace.events.length;
  const spawned = strandMark(trace);
  trace.walk(node.right, chain);
  if (ts.isIdentifier(node.left)) {
    bindSteps(trace, node.left, issuesSince(trace, mark));
    bindStrands(trace, node.left, strandsSince(trace, spawned));
  }
  trace.walk(node.left, chain);
}

function visitBinary(trace: TraceState, node: ts.BinaryExpression, chain: readonly string[]): void {
  switch (node.operatorToken.kind) {
    case ts.SyntaxKind.AmpersandAmpersandToken:
    case ts.SyntaxKind.BarBarToken:
    case ts.SyntaxKind.QuestionQuestionToken:
      visitShortCircuit(trace, node, chain);
      return;
    case ts.SyntaxKind.EqualsToken:
      visitAssign(trace, node, chain);
      return;
    default:
      trace.walk(node.left, chain);
      trace.walk(node.right, chain);
  }
}

function visitConditional(
  trace: TraceState,
  node: ts.ConditionalExpression,
  chain: readonly string[],
): void {
  trace.walk(node.condition, chain);
  const choice = openRegion(trace, "choice", innermost(trace, chain), {
    entered: true,
    exhaustive: true,
    loc: locOf(trace, node),
  });
  const around = extend(chain, choice);
  trace.walk(node.whenTrue, armChain(trace, node.condition, node.whenTrue, around));
  trace.walk(node.whenFalse, armChain(trace, node.condition, node.whenFalse, around));
}

function visitIf(trace: TraceState, node: ts.IfStatement, chain: readonly string[]): void {
  trace.walk(node.expression, chain);
  const choice = openRegion(trace, "choice", innermost(trace, chain), {
    entered: true,
    loc: locOf(trace, node),
    ...(node.elseStatement === undefined ? {} : { exhaustive: true }),
  });
  const around = extend(chain, choice);
  trace.walk(node.thenStatement, armChain(trace, node.expression, node.thenStatement, around));
  if (node.elseStatement !== undefined) {
    trace.walk(node.elseStatement, armChain(trace, node.expression, node.elseStatement, around));
  }
}

function visitSwitch(trace: TraceState, node: ts.SwitchStatement, chain: readonly string[]): void {
  trace.walk(node.expression, chain);
  const clauses = node.caseBlock.clauses;
  const hasDefault = clauses.some((clause) => ts.isDefaultClause(clause));
  const id = openRegion(trace, "choice", innermost(trace, chain), {
    entered: true,
    fallthrough: true,
    loc: locOf(trace, node),
    ...(hasDefault ? { exhaustive: true } : {}),
  });
  const around = extend(chain, id);
  trace.regionByStatement.set(node, id);
  for (const clause of clauses) {
    if (ts.isCaseClause(clause)) trace.walk(clause.expression, around);
    const inside = armChain(trace, node.expression, clause, around);
    walkStatements(trace, clause.statements, inside);
  }
  trace.regionByStatement.delete(node);
}

function visitReturn(trace: TraceState, node: ts.ReturnStatement, chain: readonly string[]): void {
  if (node.expression !== undefined) trace.walk(node.expression, chain);
  jump(trace, "return", trace.returnTargets.at(-1) ?? trace.root, chain);
}

function visitThrow(trace: TraceState, node: ts.ThrowStatement, chain: readonly string[]): void {
  trace.walk(node.expression, chain);
  jump(trace, "throw", trace.throwTargets.at(-1) ?? trace.root, chain);
}

function visitBreakContinue(
  trace: TraceState,
  node: ts.BreakOrContinueStatement,
  chain: readonly string[],
): void {
  const target = transferTarget(trace, node);
  if (target === undefined) return;
  jump(trace, ts.isBreakStatement(node) ? "break" : "continue", target, chain);
}

function visitTry(trace: TraceState, node: ts.TryStatement, chain: readonly string[]): void {
  const group = openRegion(trace, "try", innermost(trace, chain), {
    entered: true,
    loc: locOf(trace, node),
  });
  const inGroup = extend(chain, group);
  const attempt = openRegion(trace, "attempt", group, {
    entered: true,
    loc: locOf(trace, node.tryBlock),
  });
  trace.throwTargets.push(attempt);
  trace.walk(node.tryBlock, extend(inGroup, attempt));
  trace.throwTargets.pop();
  const caught = node.catchClause;
  if (caught !== undefined) {
    // Catch is a sibling of attempt, so a throw inside it uses the outer target.
    const id = openRegion(trace, "catch", group, {
      entered: false,
      loc: locOf(trace, caught),
    });
    trace.walk(caught.block, extend(inGroup, id));
  }
  const tail = node.finallyBlock;
  if (tail !== undefined) {
    const id = openRegion(trace, "finally", group, {
      entered: true,
      loc: locOf(trace, tail),
    });
    trace.walk(tail, extend(inGroup, id));
  }
}

/** One evaluation-order step. Bound as `trace.walk`. */
export function walkNode(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  if (isFunctionLike(node)) {
    // The body waits for a call, but a computed member name runs at the definition site.
    noteComputedKey(trace, node, chain);
    return;
  }
  switch (node.kind) {
    case ts.SyntaxKind.Block:
      walkStatements(trace, (node as ts.Block).statements, chain);
      return;
    case ts.SyntaxKind.AwaitExpression:
      visitAwait(trace, node as ts.AwaitExpression, chain);
      return;
    case ts.SyntaxKind.CallExpression:
      walkCall(trace, node as ts.CallExpression, chain);
      return;
    case ts.SyntaxKind.NewExpression:
      visitNew(trace, node as ts.NewExpression, chain);
      return;
    case ts.SyntaxKind.TaggedTemplateExpression:
      visitTagged(trace, node as ts.TaggedTemplateExpression, chain);
      return;
    case ts.SyntaxKind.VariableDeclaration:
      visitVariable(trace, node as ts.VariableDeclaration, chain);
      return;
    case ts.SyntaxKind.BinaryExpression:
      visitBinary(trace, node as ts.BinaryExpression, chain);
      return;
    case ts.SyntaxKind.ConditionalExpression:
      visitConditional(trace, node as ts.ConditionalExpression, chain);
      return;
    case ts.SyntaxKind.IfStatement:
      visitIf(trace, node as ts.IfStatement, chain);
      return;
    case ts.SyntaxKind.SwitchStatement:
      visitSwitch(trace, node as ts.SwitchStatement, chain);
      return;
    case ts.SyntaxKind.ReturnStatement:
      visitReturn(trace, node as ts.ReturnStatement, chain);
      return;
    case ts.SyntaxKind.ThrowStatement:
      visitThrow(trace, node as ts.ThrowStatement, chain);
      return;
    case ts.SyntaxKind.BreakStatement:
    case ts.SyntaxKind.ContinueStatement:
      visitBreakContinue(trace, node as ts.BreakOrContinueStatement, chain);
      return;
    case ts.SyntaxKind.TryStatement:
      visitTry(trace, node as ts.TryStatement, chain);
      return;
    default:
      if (walkLoop(trace, node, chain)) return;
      ts.forEachChild(node, (child) => {
        trace.walk(child, chain);
      });
  }
}

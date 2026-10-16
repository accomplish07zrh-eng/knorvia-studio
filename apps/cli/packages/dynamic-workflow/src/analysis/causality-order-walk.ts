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

type Visit = (trace: TraceState, node: ts.Node, chain: readonly string[]) => void;

function extend(chain: readonly string[], id: string): readonly string[] {
  return chain.concat(id);
}

function openArm(
  trace: TraceState,
  chain: readonly string[],
  guard: ts.Expression | undefined,
  node: ts.Node,
): readonly string[] {
  const id = openRegion(trace, "branch", innermost(trace, chain), {
    entered: false as const,
    loc: locOf(trace, node),
  });
  if (guard !== undefined) recordControl(trace, guard, id);
  return extend(chain, id);
}

function transferTarget(trace: TraceState, node: ts.BreakOrContinueStatement): string | undefined {
  const label = node.label;
  const breaking = node.kind === ts.SyntaxKind.BreakStatement;
  for (let cursor: ts.Node | undefined = node.parent; cursor !== undefined && !isFunctionLike(cursor); cursor = cursor.parent) {
    if (label !== undefined && cursor.kind === ts.SyntaxKind.LabeledStatement) {
      const labeled = cursor as ts.LabeledStatement;
      if (labeled.label.text === label.text) return trace.regionByStatement.get(labeled.statement);
    } else if (label === undefined && ts.isIterationStatement(cursor, false)) {
      return trace.regionByStatement.get(cursor);
    } else if (label === undefined && breaking && cursor.kind === ts.SyntaxKind.SwitchStatement) {
      return trace.regionByStatement.get(cursor);
    }
  }
  return undefined;
}

function noteComputedKey(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const name = (node as ts.NamedDeclaration).name;
  if (name !== undefined && name.kind === ts.SyntaxKind.ComputedPropertyName) {
    trace.walk((name as ts.ComputedPropertyName).expression, chain);
  }
}

export function walkStatements(
  trace: TraceState,
  statements: readonly ts.Statement[],
  chain: readonly string[],
): void {
  const saved = trace.currentPhase;
  for (const statement of statements) {
    const marker = trace.markerByStatement.get(statement);
    if (marker !== undefined) {
      const phase = phaseIdOf(trace, marker);
      if (phase !== undefined) {
        trace.currentPhase = phase;
        trace.events.push({ at: "mark", phase, regions: chain });
      }
    }
    trace.walk(statement, chain);
  }
  trace.currentPhase = saved;
}

// The claim is keyed by the await keyword. The operand is only the value that
// names strands to join; its own start is a different source position.
function settleAwait(trace: TraceState, awaitNode: ts.AwaitExpression, chain: readonly string[]): void {
  const operand = awaitNode.expression;
  const mark = trace.events.length;
  const spawned = strandMark(trace);
  trace.walk(operand, chain);
  const claim = settlesAt(trace, awaitNode, awaitNode.getStart(trace.scriptFile));
  barrier(trace, issuesSince(trace, mark).concat(claim.certain), claim.maybe, chain, {
    mark: spawned,
    operand,
  });
}

function visitAwait(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  settleAwait(trace, node as ts.AwaitExpression, chain);
}

function visitNew(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const created = node as ts.NewExpression;
  trace.walk(created.expression, chain);
  created.arguments?.forEach((argument) => {
    trace.walk(argument, chain);
  });
  applyAt(trace, created, chain);
}

function visitTagged(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const tagged = node as ts.TaggedTemplateExpression;
  trace.walk(tagged.tag, chain);
  trace.walk(tagged.template, chain);
  applyAt(trace, tagged, chain);
}

function visitVariable(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const decl = node as ts.VariableDeclaration;
  if (decl.initializer === undefined) return;
  const mark = trace.events.length;
  const spawned = strandMark(trace);
  trace.walk(decl.initializer, chain);
  bindSteps(trace, decl.name, issuesSince(trace, mark));
  bindStrands(trace, decl.name, strandsSince(trace, spawned));
}

function openChoice(
  trace: TraceState,
  chain: readonly string[],
  anchor: ts.Node,
  flags: { exhaustive?: true; fallthrough?: true },
): { id: string; around: readonly string[] } {
  const id = openRegion(trace, "choice", innermost(trace, chain), {
    entered: true as const,
    loc: locOf(trace, anchor),
    ...(flags.exhaustive === undefined ? {} : { exhaustive: true as const }),
    ...(flags.fallthrough === undefined ? {} : { fallthrough: true as const }),
  });
  return { id, around: extend(chain, id) };
}

function visitShortCircuit(trace: TraceState, node: ts.BinaryExpression, chain: readonly string[]): void {
  trace.walk(node.left, chain);
  const choice = openChoice(trace, chain, node, {});
  trace.walk(node.right, openArm(trace, choice.around, node.left, node.right));
}

function visitAssign(trace: TraceState, node: ts.BinaryExpression, chain: readonly string[]): void {
  const mark = trace.events.length;
  const spawned = strandMark(trace);
  trace.walk(node.right, chain);
  if (node.left.kind === ts.SyntaxKind.Identifier) {
    bindSteps(trace, node.left as ts.Identifier, issuesSince(trace, mark));
    bindStrands(trace, node.left as ts.Identifier, strandsSince(trace, spawned));
  }
  trace.walk(node.left, chain);
}

const SHORT_CIRCUIT: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

function visitBinary(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const binary = node as ts.BinaryExpression;
  const operator = binary.operatorToken.kind;
  if (SHORT_CIRCUIT.has(operator)) {
    visitShortCircuit(trace, binary, chain);
    return;
  }
  if (operator === ts.SyntaxKind.EqualsToken) {
    visitAssign(trace, binary, chain);
    return;
  }
  trace.walk(binary.left, chain);
  trace.walk(binary.right, chain);
}

function visitConditional(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const cond = node as ts.ConditionalExpression;
  trace.walk(cond.condition, chain);
  const choice = openChoice(trace, chain, cond, { exhaustive: true });
  trace.walk(cond.whenTrue, openArm(trace, choice.around, cond.condition, cond.whenTrue));
  trace.walk(cond.whenFalse, openArm(trace, choice.around, cond.condition, cond.whenFalse));
}

function visitIf(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const statement = node as ts.IfStatement;
  trace.walk(statement.expression, chain);
  const choice = openChoice(trace, chain, statement, statement.elseStatement === undefined ? {} : { exhaustive: true });
  trace.walk(statement.thenStatement, openArm(trace, choice.around, statement.expression, statement.thenStatement));
  if (statement.elseStatement !== undefined) {
    trace.walk(statement.elseStatement, openArm(trace, choice.around, statement.expression, statement.elseStatement));
  }
}

function visitSwitch(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const statement = node as ts.SwitchStatement;
  trace.walk(statement.expression, chain);
  const clauses = statement.caseBlock.clauses;
  const choice = openChoice(
    trace,
    chain,
    statement,
    clauses.some((clause) => clause.kind === ts.SyntaxKind.DefaultClause)
      ? { exhaustive: true, fallthrough: true }
      : { fallthrough: true },
  );
  trace.regionByStatement.set(statement, choice.id);
  for (const clause of clauses) {
    if (clause.kind === ts.SyntaxKind.CaseClause) trace.walk((clause as ts.CaseClause).expression, choice.around);
    walkStatements(trace, clause.statements, openArm(trace, choice.around, statement.expression, clause));
  }
  trace.regionByStatement.delete(statement);
}

function visitReturn(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const statement = node as ts.ReturnStatement;
  if (statement.expression !== undefined) trace.walk(statement.expression, chain);
  jump(trace, "return", trace.returnTargets.at(-1) ?? trace.root, chain);
}

function visitThrow(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const statement = node as ts.ThrowStatement;
  trace.walk(statement.expression, chain);
  jump(trace, "throw", trace.throwTargets.at(-1) ?? trace.root, chain);
}

function visitBreakContinue(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const statement = node as ts.BreakOrContinueStatement;
  const target = transferTarget(trace, statement);
  if (target === undefined) return;
  jump(trace, statement.kind === ts.SyntaxKind.BreakStatement ? "break" : "continue", target, chain);
}

function visitTry(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const statement = node as ts.TryStatement;
  const group = openRegion(trace, "try", innermost(trace, chain), {
    entered: true as const,
    loc: locOf(trace, statement),
  });
  const inGroup = extend(chain, group);
  const attempt = openRegion(trace, "attempt", group, {
    entered: true as const,
    loc: locOf(trace, statement.tryBlock),
  });
  trace.throwTargets.push(attempt);
  trace.walk(statement.tryBlock, extend(inGroup, attempt));
  trace.throwTargets.pop();
  const caught = statement.catchClause;
  if (caught !== undefined) {
    // Catch is a sibling of attempt, so a throw inside it uses the outer target.
    const id = openRegion(trace, "catch", group, {
      entered: false as const,
      loc: locOf(trace, caught),
    });
    trace.walk(caught.block, extend(inGroup, id));
  }
  const tail = statement.finallyBlock;
  if (tail !== undefined) {
    const id = openRegion(trace, "finally", group, {
      entered: true as const,
      loc: locOf(trace, tail),
    });
    trace.walk(tail, extend(inGroup, id));
  }
}

function visitBlock(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  walkStatements(trace, (node as ts.Block).statements, chain);
}

function visitCall(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  walkCall(trace, node as ts.CallExpression, chain);
}

const VISITORS: Partial<Record<ts.SyntaxKind, Visit>> = {
  [ts.SyntaxKind.Block]: visitBlock,
  [ts.SyntaxKind.AwaitExpression]: visitAwait,
  [ts.SyntaxKind.CallExpression]: visitCall,
  [ts.SyntaxKind.NewExpression]: visitNew,
  [ts.SyntaxKind.TaggedTemplateExpression]: visitTagged,
  [ts.SyntaxKind.VariableDeclaration]: visitVariable,
  [ts.SyntaxKind.BinaryExpression]: visitBinary,
  [ts.SyntaxKind.ConditionalExpression]: visitConditional,
  [ts.SyntaxKind.IfStatement]: visitIf,
  [ts.SyntaxKind.SwitchStatement]: visitSwitch,
  [ts.SyntaxKind.ReturnStatement]: visitReturn,
  [ts.SyntaxKind.ThrowStatement]: visitThrow,
  [ts.SyntaxKind.BreakStatement]: visitBreakContinue,
  [ts.SyntaxKind.ContinueStatement]: visitBreakContinue,
  [ts.SyntaxKind.TryStatement]: visitTry,
};

/** One evaluation-order step. Bound as `trace.walk`. */
export function walkNode(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  if (isFunctionLike(node)) {
    noteComputedKey(trace, node, chain);
    return;
  }
  const visit = VISITORS[node.kind];
  if (visit !== undefined) {
    visit(trace, node, chain);
    return;
  }
  if (walkLoop(trace, node, chain)) return;
  ts.forEachChild(node, (child) => {
    trace.walk(child, chain);
  });
}

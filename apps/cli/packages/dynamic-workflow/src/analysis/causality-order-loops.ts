// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import {
  innermost,
  issuesSince,
  locOf,
  openRegion,
  type TraceState,
} from "./causality-order-state.js";
import { barrier, recordControl, settlesAt } from "./causality-order-settle.js";
import { strandMark } from "./causality-order-strands.js";

// Loop visitors. A `for` header is walked outside the loop region, in source order.
// `do` is entered and its condition is not a guard. `for await` barriers inside.

interface CountedEntry {
  entered: boolean;
  bound?: number;
}

type LoopWalker = (trace: TraceState, node: ts.Node, chain: readonly string[]) => void;

function withStatementTarget(
  trace: TraceState,
  statement: ts.Node,
  body: ts.Node,
  chain: readonly string[],
): void {
  trace.regionByStatement.set(statement, innermost(trace, chain));
  trace.walk(body, chain);
  trace.regionByStatement.delete(statement);
}

function extend(chain: readonly string[], id: string): readonly string[] {
  return chain.concat(id);
}

function walkIfPresent(trace: TraceState, node: ts.Node | undefined, chain: readonly string[]): void {
  if (node !== undefined) trace.walk(node, chain);
}

function signedLiteral(expr: ts.Expression): number | undefined {
  if (expr.kind === ts.SyntaxKind.NumericLiteral) return Number((expr as ts.NumericLiteral).text);
  if (expr.kind !== ts.SyntaxKind.PrefixUnaryExpression) return undefined;
  const prefix = expr as ts.PrefixUnaryExpression;
  if (prefix.operator !== ts.SyntaxKind.MinusToken) return undefined;
  const inner = signedLiteral(prefix.operand);
  return inner === undefined ? undefined : -inner;
}

function sameName(expr: ts.Expression, name: string): boolean {
  return expr.kind === ts.SyntaxKind.Identifier && (expr as ts.Identifier).text === name;
}

interface CounterStart {
  name: string;
  value: number;
}

function counterStart(initializer: ts.ForInitializer | undefined): CounterStart | undefined {
  if (initializer === undefined || initializer.kind !== ts.SyntaxKind.VariableDeclarationList) {
    return undefined;
  }
  const decl = (initializer as ts.VariableDeclarationList).declarations[0];
  if (decl === undefined || decl.name.kind !== ts.SyntaxKind.Identifier || decl.initializer === undefined) {
    return undefined;
  }
  const value = signedLiteral(decl.initializer);
  if (value === undefined) return undefined;
  return { name: (decl.name as ts.Identifier).text, value };
}

const ROUND_FROM_LIMIT: ReadonlyMap<ts.SyntaxKind, (start: number, limit: number) => number | undefined> =
  new Map([
    [
      ts.SyntaxKind.LessThanToken,
      (start, limit) => (start < limit ? limit - start : undefined),
    ],
    [
      ts.SyntaxKind.LessThanEqualsToken,
      (start, limit) => (start <= limit ? limit - start + 1 : undefined),
    ],
  ]);

function provedRounds(condition: ts.Expression | undefined, start: CounterStart): number | undefined {
  if (condition === undefined || condition.kind !== ts.SyntaxKind.BinaryExpression) return undefined;
  const binary = condition as ts.BinaryExpression;
  if (!sameName(binary.left, start.name)) return undefined;
  const limit = signedLiteral(binary.right);
  if (limit === undefined) return undefined;
  const law = ROUND_FROM_LIMIT.get(binary.operatorToken.kind);
  return law === undefined ? undefined : law(start.value, limit);
}

function bumpsCounter(incrementor: ts.Expression | undefined, name: string): boolean {
  if (incrementor === undefined) return false;
  if (
    incrementor.kind === ts.SyntaxKind.PostfixUnaryExpression ||
    incrementor.kind === ts.SyntaxKind.PrefixUnaryExpression
  ) {
    const unary = incrementor as ts.PrefixUnaryExpression | ts.PostfixUnaryExpression;
    return unary.operator === ts.SyntaxKind.PlusPlusToken && sameName(unary.operand, name);
  }
  if (incrementor.kind !== ts.SyntaxKind.BinaryExpression) return false;
  const binary = incrementor as ts.BinaryExpression;
  return (
    binary.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken &&
    sameName(binary.left, name) &&
    signedLiteral(binary.right) === 1
  );
}

function countedFor(node: ts.ForStatement): CountedEntry {
  const start = counterStart(node.initializer);
  if (start === undefined) return { entered: false };
  const rounds = provedRounds(node.condition, start);
  if (rounds === undefined) return { entered: false };
  if (!bumpsCounter(node.incrementor, start.name)) return { entered: true };
  return { bound: rounds, entered: true };
}

function openLoop(
  trace: TraceState,
  node: ts.Node,
  chain: readonly string[],
  entered: boolean,
  bound?: number,
): { id: string; inside: readonly string[] } {
  const id = openRegion(trace, "loop", innermost(trace, chain), {
    entered,
    loc: locOf(trace, node),
    ...(bound === undefined ? {} : { bound }),
  });
  return { id, inside: extend(chain, id) };
}

function walkFor(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const statement = node as ts.ForStatement;
  walkIfPresent(trace, statement.initializer, chain);
  walkIfPresent(trace, statement.condition, chain);
  walkIfPresent(trace, statement.incrementor, chain);
  const counted = countedFor(statement);
  const opened = openLoop(trace, statement, chain, counted.entered, counted.bound);
  if (statement.condition !== undefined) recordControl(trace, statement.condition, opened.id);
  withStatementTarget(trace, statement, statement.statement, opened.inside);
}

function walkForOfIn(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const statement = node as ts.ForOfStatement | ts.ForInStatement;
  const mark = trace.events.length;
  const spawned = strandMark(trace);
  trace.walk(statement.expression, chain);
  const opened = openLoop(trace, statement, chain, false);
  if (statement.kind === ts.SyntaxKind.ForOfStatement && statement.awaitModifier !== undefined) {
    const claim = settlesAt(trace, statement.expression, statement.expression.getStart(trace.scriptFile));
    barrier(trace, [...issuesSince(trace, mark), ...claim.certain], claim.maybe, opened.inside, {
      mark: spawned,
      operand: statement.expression,
    });
  }
  trace.walk(statement.initializer, opened.inside);
  withStatementTarget(trace, statement, statement.statement, opened.inside);
}

function walkWhile(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const statement = node as ts.WhileStatement;
  trace.walk(statement.expression, chain);
  const opened = openLoop(trace, statement, chain, false);
  recordControl(trace, statement.expression, opened.id);
  withStatementTarget(trace, statement, statement.statement, opened.inside);
}

function walkDo(trace: TraceState, node: ts.Node, chain: readonly string[]): void {
  const statement = node as ts.DoStatement;
  const opened = openLoop(trace, statement, chain, true);
  withStatementTarget(trace, statement, statement.statement, opened.inside);
  trace.walk(statement.expression, opened.inside);
}

const LOOP_WALKERS: ReadonlyMap<ts.SyntaxKind, LoopWalker> = new Map([
  [ts.SyntaxKind.ForStatement, walkFor],
  [ts.SyntaxKind.ForOfStatement, walkForOfIn],
  [ts.SyntaxKind.ForInStatement, walkForOfIn],
  [ts.SyntaxKind.WhileStatement, walkWhile],
  [ts.SyntaxKind.DoStatement, walkDo],
]);

/** Loop cases of the visitor. False when `node` is not a loop. */
export function walkLoop(trace: TraceState, node: ts.Node, chain: readonly string[]): boolean {
  const walker = LOOP_WALKERS.get(node.kind);
  if (walker === undefined) return false;
  walker(trace, node, chain);
  return true;
}

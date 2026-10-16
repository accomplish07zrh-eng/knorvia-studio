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

// Loop visitors. A `for` header is walked outside the loop region, in source order,
// not in the order the incrementor actually runs. `do` is entered and its condition
// is not a guard. `for await` barriers over the iterated expression inside the region.

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

function walkPresent(trace: TraceState, node: ts.Node | undefined, chain: readonly string[]): void {
  if (node !== undefined) trace.walk(node, chain);
}

function extend(chain: readonly string[], id: string): string[] {
  const next = chain.slice();
  next.push(id);
  return next;
}

function numericValue(expr: ts.Expression): number | undefined {
  if (ts.isNumericLiteral(expr)) return Number(expr.text);
  if (!ts.isPrefixUnaryExpression(expr) || expr.operator !== ts.SyntaxKind.MinusToken) {
    return undefined;
  }
  const inner = numericValue(expr.operand);
  if (inner === undefined) return undefined;
  return -inner;
}

function namesCounter(expr: ts.Expression, name: string): boolean {
  return ts.isIdentifier(expr) && expr.text === name;
}

function stepsByOne(incrementor: ts.Expression | undefined, name: string): boolean {
  if (incrementor === undefined) return false;
  if (
    ts.isPostfixUnaryExpression(incrementor) &&
    incrementor.operator === ts.SyntaxKind.PlusPlusToken
  ) {
    return namesCounter(incrementor.operand, name);
  }
  if (
    ts.isPrefixUnaryExpression(incrementor) &&
    incrementor.operator === ts.SyntaxKind.PlusPlusToken
  ) {
    return namesCounter(incrementor.operand, name);
  }
  if (
    !ts.isBinaryExpression(incrementor) ||
    incrementor.operatorToken.kind !== ts.SyntaxKind.PlusEqualsToken ||
    !namesCounter(incrementor.left, name)
  ) {
    return false;
  }
  return numericValue(incrementor.right) === 1;
}

interface CounterStart {
  name: string;
  value: number;
}

function counterStart(initializer: ts.ForInitializer | undefined): CounterStart | undefined {
  if (initializer === undefined || !ts.isVariableDeclarationList(initializer)) return undefined;
  const decl = initializer.declarations[0];
  if (decl === undefined || !ts.isIdentifier(decl.name) || decl.initializer === undefined) {
    return undefined;
  }
  const value = numericValue(decl.initializer);
  if (value === undefined) return undefined;
  return { name: decl.name.text, value };
}

function provedRounds(
  condition: ts.Expression | undefined,
  start: CounterStart,
): number | undefined {
  if (condition === undefined || !ts.isBinaryExpression(condition)) return undefined;
  if (!namesCounter(condition.left, start.name)) return undefined;
  const limit = numericValue(condition.right);
  if (limit === undefined) return undefined;
  const operator = condition.operatorToken.kind;
  if (operator === ts.SyntaxKind.LessThanToken && start.value < limit) return limit - start.value;
  if (operator === ts.SyntaxKind.LessThanEqualsToken && start.value <= limit) {
    return limit - start.value + 1;
  }
  return undefined;
}

function countedFor(node: ts.ForStatement): { entered: boolean; bound?: number } {
  const start = counterStart(node.initializer);
  if (start === undefined) return { entered: false };
  const rounds = provedRounds(node.condition, start);
  if (rounds === undefined) return { entered: false };
  if (!stepsByOne(node.incrementor, start.name)) return { entered: true };
  return { bound: rounds, entered: true };
}

function walkFor(trace: TraceState, node: ts.ForStatement, chain: readonly string[]): void {
  walkPresent(trace, node.initializer, chain);
  walkPresent(trace, node.condition, chain);
  walkPresent(trace, node.incrementor, chain);
  const counted = countedFor(node);
  const id = openRegion(trace, "loop", innermost(trace, chain), {
    entered: counted.entered,
    loc: locOf(trace, node),
    ...(counted.bound === undefined ? {} : { bound: counted.bound }),
  });
  if (node.condition !== undefined) recordControl(trace, node.condition, id);
  withStatementTarget(trace, node, node.statement, extend(chain, id));
}

function walkForOfIn(
  trace: TraceState,
  node: ts.ForOfStatement | ts.ForInStatement,
  chain: readonly string[],
): void {
  const mark = trace.events.length;
  const spawned = strandMark(trace);
  trace.walk(node.expression, chain);
  const id = openRegion(trace, "loop", innermost(trace, chain), {
    entered: false,
    loc: locOf(trace, node),
  });
  const inside = extend(chain, id);
  if (ts.isForOfStatement(node) && node.awaitModifier !== undefined) {
    const claim = settlesAt(trace, node.expression, node.expression.getStart(trace.scriptFile));
    barrier(trace, [...issuesSince(trace, mark), ...claim.certain], claim.maybe, inside, {
      mark: spawned,
      operand: node.expression,
    });
  }
  trace.walk(node.initializer, inside);
  withStatementTarget(trace, node, node.statement, inside);
}

function walkWhile(trace: TraceState, node: ts.WhileStatement, chain: readonly string[]): void {
  trace.walk(node.expression, chain);
  const id = openRegion(trace, "loop", innermost(trace, chain), {
    entered: false,
    loc: locOf(trace, node),
  });
  recordControl(trace, node.expression, id);
  withStatementTarget(trace, node, node.statement, extend(chain, id));
}

function walkDo(trace: TraceState, node: ts.DoStatement, chain: readonly string[]): void {
  const id = openRegion(trace, "loop", innermost(trace, chain), {
    entered: true,
    loc: locOf(trace, node),
  });
  const inside = extend(chain, id);
  withStatementTarget(trace, node, node.statement, inside);
  trace.walk(node.expression, inside);
}

/** Loop cases of the visitor. False when `node` is not a loop. */
export function walkLoop(trace: TraceState, node: ts.Node, chain: readonly string[]): boolean {
  switch (node.kind) {
    case ts.SyntaxKind.ForStatement:
      walkFor(trace, node as ts.ForStatement, chain);
      return true;
    case ts.SyntaxKind.ForOfStatement:
    case ts.SyntaxKind.ForInStatement:
      walkForOfIn(trace, node as ts.ForOfStatement | ts.ForInStatement, chain);
      return true;
    case ts.SyntaxKind.WhileStatement:
      walkWhile(trace, node as ts.WhileStatement, chain);
      return true;
    case ts.SyntaxKind.DoStatement:
      walkDo(trace, node as ts.DoStatement, chain);
      return true;
    default:
      return false;
  }
}

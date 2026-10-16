// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";

const Kind = ts.SyntaxKind;

const WRAPPER_KINDS = new Set<ts.SyntaxKind>([
  Kind.ParenthesizedExpression,
  Kind.AsExpression,
  Kind.SatisfiesExpression,
  Kind.NonNullExpression,
  Kind.TypeAssertionExpression,
]);

const ARRAY_MUTATION_CALLS = new Set<string>([
  "push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin",
]);

const PATTERN_CONTAINER_KINDS = new Set<ts.SyntaxKind>([
  Kind.ArrayLiteralExpression,
  Kind.ObjectLiteralExpression,
  Kind.PropertyAssignment,
  Kind.ShorthandPropertyAssignment,
  Kind.SpreadElement,
]);

function unknown(): undefined {
  return undefined;
}

export function literalCardinality(expression: ts.Expression, types: ts.TypeChecker): number | undefined {
  const peeled = unwrap(expression);
  if (ts.isArrayLiteralExpression(peeled)) return elementCount(peeled);
  if (!ts.isIdentifier(peeled)) return unknown();
  const binding = fixedArray(peeled, types);
  if (binding === undefined) return unknown();
  if (sourceMutates(peeled.getSourceFile(), binding.symbol, types)) return unknown();
  return binding.count;
}

function fixedArray(
  name: ts.Identifier,
  types: ts.TypeChecker,
): { count: number; symbol: ts.Symbol } | undefined {
  const bindingSymbol = types.getSymbolAtLocation(name);
  if (bindingSymbol === undefined) return unknown();
  const decl = bindingSymbol.valueDeclaration;
  if (decl === undefined || !ts.isVariableDeclaration(decl)) return unknown();
  if (!ts.isIdentifier(decl.name)) return unknown();
  const list = decl.parent;
  const isConst = ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0;
  if (!isConst) return unknown();
  const initializer = decl.initializer;
  if (initializer === undefined) return unknown();
  const initial = unwrap(initializer);
  if (!ts.isArrayLiteralExpression(initial)) return unknown();
  const total = elementCount(initial);
  if (total === undefined) return unknown();
  return { count: total, symbol: bindingSymbol };
}

function sourceMutates(root: ts.Node, symbol: ts.Symbol, types: ts.TypeChecker): boolean {
  const visit = (node: ts.Node): boolean => {
    if (ts.isIdentifier(node) && node.parent !== undefined) {
      const located = types.getSymbolAtLocation(node);
      if (located === symbol && mutatesBinding(node)) return true;
    }
    return ts.forEachChild(node, visit) === true;
  };
  return visit(root);
}

function unwrap(expression: ts.Expression): ts.Expression {
  let cursor: ts.Expression = expression;
  while (WRAPPER_KINDS.has(cursor.kind)) {
    cursor = (cursor as ts.AsExpression).expression;
  }
  return cursor;
}

function elementCount(literal: ts.ArrayLiteralExpression): number | undefined {
  let total = 0;
  for (const item of literal.elements) {
    const kind = item.kind;
    if (kind === Kind.SpreadElement || kind === Kind.OmittedExpression) return unknown();
    total += 1;
  }
  if (total === 0) return unknown();
  return total;
}

function patternPiece(node: ts.Node): boolean {
  if (ts.isArrayLiteralExpression(node)) return true;
  if (ts.isPropertyAssignment(node)) return true;
  return ts.isShorthandPropertyAssignment(node);
}

function assignmentSpanHits(written: ts.Expression, start: ts.Node): boolean {
  let cursor: ts.Node = start;
  while (PATTERN_CONTAINER_KINDS.has(cursor.kind)) cursor = cursor.parent;
  if (!ts.isBinaryExpression(cursor)) return false;
  if (cursor.operatorToken.kind !== Kind.EqualsToken) return false;
  const writtenSide = cursor.left;
  if (writtenSide === undefined) return false;
  return written.pos >= writtenSide.pos && written.end <= writtenSide.end;
}

function writesTarget(written: ts.Expression): boolean {
  const parentNode = written.parent;
  if (ts.isBinaryExpression(parentNode)) {
    const token = parentNode.operatorToken.kind;
    return (
      parentNode.left === written && token >= Kind.FirstAssignment && token <= Kind.LastAssignment
    );
  }
  if (ts.isPrefixUnaryExpression(parentNode) || ts.isPostfixUnaryExpression(parentNode)) {
    const operator = parentNode.operator;
    return operator === Kind.PlusPlusToken || operator === Kind.MinusMinusToken;
  }
  if (ts.isDeleteExpression(parentNode)) return true;
  if (!patternPiece(parentNode)) return false;
  return assignmentSpanHits(written, parentNode);
}

function mutatesBinding(name: ts.Identifier): boolean {
  const parentNode = name.parent;
  if (ts.isVariableDeclaration(parentNode) && parentNode.name === name) return false;
  if (ts.isPropertyAccessExpression(parentNode) && parentNode.expression === name) {
    if (parentNode.name.text === "length") return writesTarget(parentNode);
    const called =
      ts.isCallExpression(parentNode.parent) && parentNode.parent.expression === parentNode;
    return ARRAY_MUTATION_CALLS.has(parentNode.name.text) && called;
  }
  if (ts.isElementAccessExpression(parentNode) && parentNode.expression === name) {
    return writesTarget(parentNode);
  }
  return writesTarget(name);
}

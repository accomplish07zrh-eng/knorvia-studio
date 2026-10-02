import ts from "typescript";

/**
 * fan-out 的**字面量基数**：
 * 被迭代的表达式是无展开元素的数组字面量，或一个只初始化一次、从未被写入的 `const`
 * 绑定到这样的字面量时，基数 = 字面量长度；其余一律 `undefined`。
 *
 * 这是**铸造期**（interpret.ts）的工作——它要看 AST 与 checker，而投影不许再看代码。
 * 原则是宁缺毋滥：任何不确定都给缺席，交接图随之画一张 `many` 卡，绝不猜一个数。
 */
export function literalCardinality(
  iterated: ts.Expression,
  checker: ts.TypeChecker,
): number | undefined {
  const input = unwrapInput(iterated);
  if (ts.isArrayLiteralExpression(input)) return arrayCount(input);
  if (!ts.isIdentifier(input)) return undefined;

  const symbol = checker.getSymbolAtLocation(input);
  const declaration = symbol?.valueDeclaration;
  if (symbol === undefined || declaration === undefined || !ts.isVariableDeclaration(declaration))
    return undefined;
  if (!ts.isIdentifier(declaration.name)) return undefined;
  const declarations = declaration.parent;
  if (!ts.isVariableDeclarationList(declarations) || !(declarations.flags & ts.NodeFlags.Const))
    return undefined;
  if (declaration.initializer === undefined) return undefined;
  const initial = unwrapInput(declaration.initializer);
  if (!ts.isArrayLiteralExpression(initial)) return undefined;
  const count = arrayCount(initial);
  if (count === undefined) return undefined;

  // The query returns its decision through the AST walk, without shared traversal state.
  const invalidated = (node: ts.Node): boolean => {
    if (
      ts.isIdentifier(node) &&
      node.parent !== undefined &&
      checker.getSymbolAtLocation(node) === symbol &&
      mutatesBinding(node)
    )
      return true;
    return ts.forEachChild(node, invalidated) === true;
  };
  return invalidated(declaration.getSourceFile()) ? undefined : count;
}

const WRAPPER_KINDS = new Set([
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.AsExpression,
  ts.SyntaxKind.SatisfiesExpression,
  ts.SyntaxKind.NonNullExpression,
  ts.SyntaxKind.TypeAssertionExpression,
]);

function unwrapInput(input: ts.Expression): ts.Expression {
  let value = input;
  while (WRAPPER_KINDS.has(value.kind)) value = (value as ts.AsExpression).expression;
  return value;
}

function arrayCount(array: ts.ArrayLiteralExpression): number | undefined {
  let count = 0;
  for (const element of array.elements) {
    if (
      element.kind === ts.SyntaxKind.SpreadElement ||
      element.kind === ts.SyntaxKind.OmittedExpression
    )
      return undefined;
    count++;
  }
  return count === 0 ? undefined : count;
}

const ARRAY_MUTATION_CALLS = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);
const PATTERN_CONTAINER_KINDS = new Set([
  ts.SyntaxKind.ArrayLiteralExpression,
  ts.SyntaxKind.ObjectLiteralExpression,
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.ShorthandPropertyAssignment,
  ts.SyntaxKind.SpreadElement,
]);

function mutatesBinding(reference: ts.Identifier): boolean {
  const owner = reference.parent;
  if (ts.isVariableDeclaration(owner) && owner.name === reference) return false;
  let target: ts.Expression = reference;
  if (ts.isPropertyAccessExpression(owner) && owner.expression === reference) {
    if (owner.name.text === "length") target = owner;
    else
      return (
        ARRAY_MUTATION_CALLS.has(owner.name.text) &&
        ts.isCallExpression(owner.parent) &&
        owner.parent.expression === owner
      );
  } else if (ts.isElementAccessExpression(owner) && owner.expression === reference) {
    target = owner;
  }

  const use = target.parent;
  if (ts.isBinaryExpression(use)) {
    if (use.left !== target) return false;
    const operator = use.operatorToken.kind;
    return operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment;
  }
  if (ts.isPrefixUnaryExpression(use) || ts.isPostfixUnaryExpression(use))
    return (
      use.operator === ts.SyntaxKind.PlusPlusToken || use.operator === ts.SyntaxKind.MinusMinusToken
    );
  if (ts.isDeleteExpression(use)) return true;

  // Destructuring admission uses its syntactic role and the enclosing assignment's span.
  if (
    !ts.isArrayLiteralExpression(use) &&
    !ts.isPropertyAssignment(use) &&
    !ts.isShorthandPropertyAssignment(use)
  )
    return false;
  let assignment: ts.Node = use;
  while (PATTERN_CONTAINER_KINDS.has(assignment.kind)) assignment = assignment.parent;
  if (
    !ts.isBinaryExpression(assignment) ||
    assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken
  )
    return false;
  const left = assignment.left;
  return left !== undefined && target.pos >= left.pos && target.end <= left.end;
}

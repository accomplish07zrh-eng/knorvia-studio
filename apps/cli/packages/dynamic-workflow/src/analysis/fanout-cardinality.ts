import ts from "typescript";

/**
 * Returns a positive dense array-literal length, directly or through a const initializer.
 * AST and checker evidence are inspected during analysis; uncertain cases return undefined.
 * Writes to the binding or its recognized array operations invalidate the count.
 * Alias escapes and wrapped mutation receivers are not tracked by this syntactic check.
 */
export function literalCardinality(
  iterated: ts.Expression,
  checker: ts.TypeChecker,
): number | undefined {
  const requested = unwrapWrappers(iterated);
  if (ts.isArrayLiteralExpression(requested)) return denseLength(requested);
  if (!ts.isIdentifier(requested)) return undefined;
  const symbol = checker.getSymbolAtLocation(requested);
  const bound = constArrayUnder(symbol);
  if (bound === undefined) return undefined;
  const count = denseLength(bound.literal);
  if (count === undefined) return undefined;
  const scope = bound.declaration.getSourceFile();
  return writtenAnywhere(scope, symbol, checker) ? undefined : count;
}

interface ConstArray {
  declaration: ts.VariableDeclaration;
  literal: ts.ArrayLiteralExpression;
}

type Wrapper = ts.AssertionExpression | ts.NonNullExpression | ts.ParenthesizedExpression;

const WRAPPED_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AsExpression,
  ts.SyntaxKind.NonNullExpression,
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.SatisfiesExpression,
  ts.SyntaxKind.TypeAssertionExpression,
]);

const ARRAY_MUTATION_METHODS = new Set<string>([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
]);

const PATTERN_CONTAINER_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.ArrayLiteralExpression,
  ts.SyntaxKind.ObjectLiteralExpression,
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.ShorthandPropertyAssignment,
  ts.SyntaxKind.SpreadElement,
]);

function unwrapWrappers(input: ts.Expression): ts.Expression {
  if (!WRAPPED_KINDS.has(input.kind)) return input;
  return unwrapWrappers((input as Wrapper).expression);
}

function indeterminateElement(element: ts.Expression): boolean {
  return ts.isSpreadElement(element) || ts.isOmittedExpression(element);
}

function denseLength(literal: ts.ArrayLiteralExpression): number | undefined {
  let counted = 0;
  for (const element of literal.elements) {
    if (indeterminateElement(element)) return undefined;
    counted += 1;
  }
  return counted === 0 ? undefined : counted;
}

function namedDeclaration(symbol: ts.Symbol | undefined): ts.VariableDeclaration | undefined {
  const value = symbol?.valueDeclaration;
  if (value === undefined || !ts.isVariableDeclaration(value)) return undefined;
  return ts.isIdentifier(value.name) ? value : undefined;
}

function declaredConst(declaration: ts.VariableDeclaration): boolean {
  const listed = declaration.parent;
  if (!ts.isVariableDeclarationList(listed)) return false;
  return (listed.flags & ts.NodeFlags.Const) !== 0;
}

function constArrayUnder(symbol: ts.Symbol | undefined): ConstArray | undefined {
  const declaration = namedDeclaration(symbol);
  if (declaration === undefined || !declaredConst(declaration)) return undefined;
  const initial = declaration.initializer;
  if (initial === undefined) return undefined;
  const literal = unwrapWrappers(initial);
  if (!ts.isArrayLiteralExpression(literal)) return undefined;
  return { declaration, literal };
}

// The query returns its decision through the AST walk, without shared traversal state.
function writtenAnywhere(
  scope: ts.SourceFile,
  binding: ts.Symbol,
  checker: ts.TypeChecker,
): boolean {
  const visit = (node: ts.Node): boolean => {
    if (ts.isIdentifier(node) && node.parent !== undefined) {
      if (checker.getSymbolAtLocation(node) === binding && mutatesBinding(node)) return true;
    }
    return ts.forEachChild(node, visit) === true;
  };
  return visit(scope);
}

function mutatesBinding(reference: ts.Identifier): boolean {
  const owner = reference.parent;
  if (ts.isVariableDeclaration(owner) && owner.name === reference) return false;
  if (ts.isPropertyAccessExpression(owner) && owner.expression === reference)
    return owner.name.text === "length" ? written(owner) : emptiedThroughCall(owner);
  if (ts.isElementAccessExpression(owner) && owner.expression === reference) return written(owner);
  return written(reference);
}

function emptiedThroughCall(access: ts.PropertyAccessExpression): boolean {
  if (!ARRAY_MUTATION_METHODS.has(access.name.text)) return false;
  return ts.isCallExpression(access.parent) && access.parent.expression === access;
}

function written(target: ts.Expression): boolean {
  const use = target.parent;
  if (ts.isBinaryExpression(use)) return assignedBy(use, target);
  if (ts.isPrefixUnaryExpression(use) || ts.isPostfixUnaryExpression(use))
    return stepped(use.operator);
  if (ts.isDeleteExpression(use)) return true;
  return patternWrite(target, use);
}

function assignedBy(use: ts.BinaryExpression, target: ts.Expression): boolean {
  if (use.left !== target) return false;
  const kind = use.operatorToken.kind;
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function stepped(operator: ts.SyntaxKind): boolean {
  return operator === ts.SyntaxKind.PlusPlusToken || operator === ts.SyntaxKind.MinusMinusToken;
}

function patternMember(use: ts.Node): boolean {
  return (
    ts.isArrayLiteralExpression(use) ||
    ts.isPropertyAssignment(use) ||
    ts.isShorthandPropertyAssignment(use)
  );
}

// Destructuring admission uses its syntactic role and the enclosing assignment's span.
function patternWrite(target: ts.Expression, use: ts.Node): boolean {
  if (!patternMember(use)) return false;
  const assignment = enclosingEquals(use);
  if (assignment === undefined) return false;
  const left = assignment.left;
  return left !== undefined && enclosedIn(left, target);
}

function enclosingEquals(use: ts.Node): ts.BinaryExpression | undefined {
  let node: ts.Node = use;
  while (PATTERN_CONTAINER_KINDS.has(node.kind)) node = node.parent;
  if (!ts.isBinaryExpression(node)) return undefined;
  return node.operatorToken.kind === ts.SyntaxKind.EqualsToken ? node : undefined;
}

function enclosedIn(left: ts.Node, target: ts.Node): boolean {
  return target.pos >= left.pos && target.end <= left.end;
}

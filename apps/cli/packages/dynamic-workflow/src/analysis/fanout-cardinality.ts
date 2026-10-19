import ts from "typescript";

/**
 * Returns a positive dense array-literal length, directly or through a const initializer.
 * AST and checker evidence are inspected during analysis; uncertain cases return undefined.
 * Writes to the binding or its recognized array operations invalidate the count.
 * Alias escapes and wrapped mutation receivers are not tracked by this syntactic check.
 */
export function literalCardinality(iterated: ts.Expression, checker: ts.TypeChecker) {
  const core = stripWrappers(iterated);
  if (ts.isArrayLiteralExpression(core)) return countedElements(core);
  if (!ts.isIdentifier(core)) return undefined;
  const binding = checker.getSymbolAtLocation(core);
  const seeded = constArrayUnder(binding);
  if (seeded === undefined) return undefined;
  const count = countedElements(seeded.literal);
  if (count === undefined) return undefined;
  return writtenThrough(seeded, checker) ? undefined : count;
}

interface ConstArray {
  binding: ts.Symbol;
  declaration: ts.VariableDeclaration;
  literal: ts.ArrayLiteralExpression;
}

type Wrapper =
  | ts.AsExpression
  | ts.NonNullExpression
  | ts.ParenthesizedExpression
  | ts.SatisfiesExpression
  | ts.TypeAssertion;

const reshapingMethods = ["pop", "push", "shift", "splice", "unshift"];
const reorderingMethods = ["copyWithin", "fill", "reverse", "sort"];
const inplaceMethods = new Set<string>([...reshapingMethods, ...reorderingMethods]);

function stripWrappers(operand: ts.Expression): ts.Expression {
  let peeled = wrappedOperand(operand);
  while (peeled !== undefined) {
    operand = peeled;
    peeled = wrappedOperand(operand);
  }
  return operand;
}

function wrappedOperand(operand: ts.Expression): ts.Expression | undefined {
  switch (operand.kind) {
    case ts.SyntaxKind.AsExpression:
    case ts.SyntaxKind.NonNullExpression:
    case ts.SyntaxKind.ParenthesizedExpression:
    case ts.SyntaxKind.SatisfiesExpression:
    case ts.SyntaxKind.TypeAssertionExpression:
      return (operand as Wrapper).expression;
    default:
      return undefined;
  }
}

function countedElements(literal: ts.ArrayLiteralExpression): number | undefined {
  let counted = 0;
  for (const member of literal.elements) {
    if (ts.isSpreadElement(member) || ts.isOmittedExpression(member)) return undefined;
    counted += 1;
  }
  return counted > 0 ? counted : undefined;
}

function namedConst(binding: ts.Symbol): ts.VariableDeclaration | undefined {
  const declared = binding.valueDeclaration;
  if (declared === undefined || !ts.isVariableDeclaration(declared)) return undefined;
  return ts.isIdentifier(declared.name) ? declared : undefined;
}

function declaredConst(holder: ts.VariableDeclaration): boolean {
  const listing = holder.parent;
  if (!ts.isVariableDeclarationList(listing)) return false;
  return (listing.flags & ts.NodeFlags.Const) !== 0;
}

function constArrayUnder(binding: ts.Symbol | undefined): ConstArray | undefined {
  if (binding === undefined) return undefined;
  const holder = namedConst(binding);
  if (holder === undefined || !declaredConst(holder)) return undefined;
  const opening = holder.initializer;
  if (opening === undefined) return undefined;
  const literal = stripWrappers(opening);
  if (!ts.isArrayLiteralExpression(literal)) return undefined;
  return { binding, declaration: holder, literal };
}

// The query returns its decision through the AST walk, without shared traversal state.
function writtenThrough(seed: ConstArray, checker: ts.TypeChecker): boolean {
  const scan = (node: ts.Node): boolean =>
    wroteBinding(node, seed.binding, checker) || ts.forEachChild(node, scan) === true;
  return scan(seed.declaration.getSourceFile());
}

function wroteBinding(node: ts.Node, binding: ts.Symbol, checker: ts.TypeChecker): boolean {
  if (!ts.isIdentifier(node)) return false;
  return checker.getSymbolAtLocation(node) === binding && writesThrough(node);
}

function writesThrough(reference: ts.Identifier): boolean {
  const holder = reference.parent;
  if (ts.isVariableDeclaration(holder) && holder.name === reference) return false;
  if (ts.isPropertyAccessExpression(holder) && holder.expression === reference)
    return holder.name.text === "length" ? shapeWritten(holder) : emptiedByCall(holder);
  if (ts.isElementAccessExpression(holder) && holder.expression === reference)
    return shapeWritten(holder);
  return shapeWritten(reference);
}

function emptiedByCall(access: ts.PropertyAccessExpression): boolean {
  if (!inplaceMethods.has(access.name.text)) return false;
  const call = access.parent;
  return ts.isCallExpression(call) && call.expression === access;
}

function shapeWritten(subject: ts.Expression): boolean {
  if (assignedTo(subject) || stepped(subject) || erased(subject)) return true;
  return destructured(subject);
}

function assignedTo(subject: ts.Expression): boolean {
  const where = subject.parent;
  if (!ts.isBinaryExpression(where) || where.left !== subject) return false;
  const rank = where.operatorToken.kind;
  return rank >= ts.SyntaxKind.FirstAssignment && rank <= ts.SyntaxKind.LastAssignment;
}

function stepped(subject: ts.Expression): boolean {
  const bump = subject.parent;
  if (!ts.isPrefixUnaryExpression(bump) && !ts.isPostfixUnaryExpression(bump)) return false;
  const marker = bump.operator;
  return marker === ts.SyntaxKind.PlusPlusToken || marker === ts.SyntaxKind.MinusMinusToken;
}

function erased(subject: ts.Expression): boolean {
  return ts.isDeleteExpression(subject.parent);
}

// Destructuring admission uses its syntactic role and the enclosing assignment's span.
function destructured(subject: ts.Expression): boolean {
  const slot = subject.parent;
  if (!patternSlot(slot)) return false;
  const opener = enclosingAssignment(slot);
  return opener !== undefined && covers(opener.left, subject);
}

function patternSlot(node: ts.Node): boolean {
  if (ts.isArrayLiteralExpression(node)) return true;
  return ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node);
}

function containerLayer(node: ts.Node): boolean {
  if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)) return true;
  if (ts.isSpreadElement(node)) return true;
  return patternSlot(node);
}

function enclosingAssignment(slot: ts.Node): ts.BinaryExpression | undefined {
  let climbed: ts.Node = slot;
  while (containerLayer(climbed)) climbed = climbed.parent;
  if (!ts.isBinaryExpression(climbed)) return undefined;
  return climbed.operatorToken.kind === ts.SyntaxKind.EqualsToken ? climbed : undefined;
}

function covers(pattern: ts.Node, subject: ts.Node): boolean {
  return subject.pos >= pattern.pos && subject.end <= pattern.end;
}

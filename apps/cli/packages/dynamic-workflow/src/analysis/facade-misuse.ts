// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import { FACADE_FILE_NAME } from "../facade/dts.js";
import { facadeContainerOf, isSiteProducing, SITE_MEMBER_NAMES } from "../facade/registry.js";
import type { CompileDiagnostic, WorkflowProgram } from "../compiler/compile.js";
import { findWorkflowBody } from "./domain.js";
import { isFacadeDeclared, resolveSymbol, type SiteTable } from "./sites.js";

const FACADE_SITING_CODE = 9001;
const RECURSION_DEPTH_LIMIT = 4;

const ASSIGNMENT_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

function formatReferenceEscapeMessage(fnName: string): string {
  return (
    `facade function '${fnName}' may only be called directly; ` +
    `taking a reference to it defeats site identity (journal and replay key off call sites)`
  );
}

function formatRetypingEscapeMessage(fnName: string): string {
  return (
    `facade function '${fnName}' may only be called directly; retyping a facade value to a ` +
    `structurally-compatible non-facade type escapes site identity ` +
    `(the disguised '.${fnName}(...)' resolves to the local type and runs unsited)`
  );
}

export function collectFacadeMisuse(
  workflow: WorkflowProgram,
  table: SiteTable,
): CompileDiagnostic[] {
  const { program, scriptFile, toScriptLoc } = workflow;
  const typeChecker = program.getTypeChecker();
  const rootBody = findWorkflowBody(scriptFile);
  const gatheredDiagnostics: CompileDiagnostic[] = [];

  const recordDiagnostic = (
    anchorNode: ts.Node,
    memberIdentifier: string,
    isRetype = false,
  ): void => {
    const startLoc = toScriptLoc(anchorNode.getStart(scriptFile));
    gatheredDiagnostics.push({
      code: FACADE_SITING_CODE,
      column: startLoc.column,
      line: startLoc.line,
      message: isRetype
        ? formatRetypingEscapeMessage(memberIdentifier)
        : formatReferenceEscapeMessage(memberIdentifier),
    });
  };

  const isCallableFacadeSymbol = (sym: ts.Symbol | undefined): boolean => {
    if (!sym || !isFacadeDeclared(sym)) return false;
    const callableMask = ts.SymbolFlags.Function | ts.SymbolFlags.Method;
    return (sym.flags & callableMask) !== 0;
  };

  const inspectExtractedProperty = (propNode: ts.Node, sourceContainerType: ts.Type): void => {
    if (!ts.isIdentifier(propNode) && !ts.isStringLiteralLike(propNode)) return;
    const resolvedProp = typeChecker.getPropertyOfType(sourceContainerType, propNode.text);
    if (isCallableFacadeSymbol(resolvedProp)) {
      recordDiagnostic(propNode, propNode.text);
    }
  };

  const isDirectInvocationCallee = (expr: ts.Expression): boolean => {
    const parentExpr = expr.parent;
    return ts.isCallExpression(parentExpr) && parentExpr.expression === expr;
  };

  const isPropAccessIdentifier = (idNode: ts.Identifier): boolean => {
    return ts.isPropertyAccessExpression(idNode.parent) && idNode.parent.name === idNode;
  };

  // Phase 1: Reference scan and destructuring extraction
  const scanReferenceEscapes = (currentNode: ts.Node): void => {
    if (ts.isPropertyAccessExpression(currentNode)) {
      const sym = resolveSymbol(currentNode.name, typeChecker);
      if (isCallableFacadeSymbol(sym) && !isDirectInvocationCallee(currentNode)) {
        recordDiagnostic(currentNode.name, sym!.name);
      }
    } else if (ts.isIdentifier(currentNode) && !isPropAccessIdentifier(currentNode)) {
      const sym = resolveSymbol(currentNode, typeChecker);
      if (isCallableFacadeSymbol(sym) && !isDirectInvocationCallee(currentNode)) {
        recordDiagnostic(currentNode, sym!.name);
      }
    } else if (ts.isBindingElement(currentNode) && ts.isObjectBindingPattern(currentNode.parent)) {
      const patternType = typeChecker.getTypeAtLocation(currentNode.parent);
      inspectExtractedProperty(currentNode.propertyName ?? currentNode.name, patternType);
    } else if (
      ts.isShorthandPropertyAssignment(currentNode) &&
      ts.isBinaryExpression(currentNode.parent.parent)
    ) {
      const binaryExpr = currentNode.parent.parent;
      if (
        binaryExpr.left === currentNode.parent &&
        binaryExpr.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        inspectExtractedProperty(currentNode.name, typeChecker.getTypeAtLocation(binaryExpr.right));
      }
    }
    ts.forEachChild(currentNode, scanReferenceEscapes);
  };

  // Phase 2: Defense in depth for unsited direct invocations
  const registeredSiteCalls = new Set<ts.CallExpression>([
    ...table.asks.map((s) => s.call),
    ...table.actors.map((s) => s.call),
    ...table.worldReads.map((s) => s.call),
    ...table.reports.map((s) => s.call),
    ...table.artifacts.map((s) => s.call),
    ...table.joins.map((s) => s.call),
  ]);

  const scanUnsitedDirectCalls = (currentNode: ts.Node): void => {
    if (ts.isCallExpression(currentNode) && !registeredSiteCalls.has(currentNode)) {
      const signatureDecl = typeChecker.getResolvedSignature(currentNode)?.declaration;
      if (signatureDecl && signatureDecl.getSourceFile().fileName === FACADE_FILE_NAME) {
        const declName = (signatureDecl as ts.FunctionDeclaration | ts.MethodSignature).name;
        if (declName && ts.isIdentifier(declName)) {
          const containerName = facadeContainerOf(signatureDecl);
          if (isSiteProducing(containerName, declName.text)) {
            recordDiagnostic(currentNode.expression, declName.text);
          }
        }
      }
    }
    ts.forEachChild(currentNode, scanUnsitedDirectCalls);
  };

  // Phase 3: Type conversion boundaries
  const discoverFacadeMember = (
    type: ts.Type,
    visited: Set<ts.Type> = new Set(),
    depth = 0,
  ): string | undefined => {
    if (depth > RECURSION_DEPTH_LIMIT || visited.has(type)) return void 0;
    visited.add(type);

    for (const memberKey of SITE_MEMBER_NAMES) {
      if (isFacadeDeclared(type.getProperty(memberKey))) return memberKey;
    }
    if (type.isUnionOrIntersection()) {
      for (const componentType of type.types) {
        const found = discoverFacadeMember(componentType, visited, depth + 1);
        if (found !== undefined) return found;
      }
    }
    if ((type.flags & ts.TypeFlags.Object) !== 0) {
      const objType = type as ts.ObjectType;
      if ((objType.objectFlags & ts.ObjectFlags.Reference) !== 0) {
        const typeArgs = typeChecker.getTypeArguments(type as ts.TypeReference);
        for (const typeArg of typeArgs) {
          const found = discoverFacadeMember(typeArg, visited, depth + 1);
          if (found !== undefined) return found;
        }
      }
    }
    for (const prop of type.getProperties()) {
      if (!prop.valueDeclaration) continue;
      const propType = typeChecker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration);
      const found = discoverFacadeMember(propType, visited, depth + 1);
      if (found !== undefined) return found;
    }
    return void 0;
  };

  const isEvolvingAnySlot = (expr: ts.Expression, currentType: ts.Type): boolean => {
    if ((currentType.flags & ts.TypeFlags.Any) === 0 || !ts.isIdentifier(expr)) return false;
    const valueDecl = typeChecker.getSymbolAtLocation(expr)?.valueDeclaration;
    return Boolean(valueDecl && ts.isVariableDeclaration(valueDecl) && !valueDecl.type);
  };

  const verifyConversionBoundary = (
    srcExpr: ts.Expression,
    targetType: ts.Type | undefined,
  ): void => {
    if (!targetType) return;
    const sourceMember = discoverFacadeMember(typeChecker.getTypeAtLocation(srcExpr));
    if (sourceMember === undefined) return;
    if (discoverFacadeMember(targetType) !== undefined) return;

    const visibleLocalMember = [...SITE_MEMBER_NAMES].find(
      (candidate) => targetType.getProperty(candidate) !== undefined,
    );
    recordDiagnostic(srcExpr, visibleLocalMember ?? sourceMember, true);
  };

  const scanConversionBoundaries = (currentNode: ts.Node): void => {
    if (ts.isAsExpression(currentNode) || ts.isSatisfiesExpression(currentNode)) {
      verifyConversionBoundary(
        currentNode.expression,
        typeChecker.getTypeFromTypeNode(currentNode.type),
      );
    } else if (ts.isCallExpression(currentNode) || ts.isNewExpression(currentNode)) {
      for (const argExpr of currentNode.arguments ?? []) {
        verifyConversionBoundary(argExpr, typeChecker.getContextualType(argExpr));
      }
    } else if (ts.isReturnStatement(currentNode) && currentNode.expression) {
      verifyConversionBoundary(
        currentNode.expression,
        typeChecker.getContextualType(currentNode.expression),
      );
    } else if (ts.isArrowFunction(currentNode) && !ts.isBlock(currentNode.body)) {
      verifyConversionBoundary(currentNode.body, typeChecker.getContextualType(currentNode.body));
    } else if (
      ts.isVariableDeclaration(currentNode) &&
      currentNode.type &&
      currentNode.initializer
    ) {
      verifyConversionBoundary(
        currentNode.initializer,
        typeChecker.getTypeFromTypeNode(currentNode.type),
      );
    } else if (
      ts.isBinaryExpression(currentNode) &&
      ASSIGNMENT_OPERATORS.has(currentNode.operatorToken.kind) &&
      (ts.isIdentifier(currentNode.left) ||
        ts.isPropertyAccessExpression(currentNode.left) ||
        ts.isElementAccessExpression(currentNode.left))
    ) {
      const destinationType = typeChecker.getTypeAtLocation(currentNode.left);
      if (!isEvolvingAnySlot(currentNode.left, destinationType)) {
        verifyConversionBoundary(currentNode.right, destinationType);
      }
    }
    ts.forEachChild(currentNode, scanConversionBoundaries);
  };

  for (const statement of rootBody.statements) scanReferenceEscapes(statement);
  for (const statement of rootBody.statements) scanUnsitedDirectCalls(statement);
  for (const statement of rootBody.statements) scanConversionBoundaries(statement);

  const seenKeys = new Set<string>();
  return gatheredDiagnostics.filter((item) => {
    const key = `${item.line}:${item.column}:${item.message}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

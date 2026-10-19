// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import { FACADE_FILE_NAME } from "../facade/dts.js";
import { isArtifactPresetOp, type ArtifactOp, type WorldReadOp } from "../facade/registry.js";
import { isFacadeDeclared, resolveSymbol, type SiteTable } from "../analysis/sites.js";

// Lowered action descriptors attached to AST CallExpression nodes.
export type SitedAction =
  | { readonly kind: "actor"; readonly siteId: string }
  | { readonly kind: "artifact"; readonly siteId: string; readonly op: ArtifactOp }
  | { readonly kind: "ask"; readonly siteId: string }
  | { readonly kind: "phase"; readonly name?: string }
  | { readonly kind: "report"; readonly siteId: string }
  | { readonly kind: "world-read"; readonly siteId: string; readonly op: WorldReadOp };

class SiteCallRegistry {
  private readonly mapping = new Map<ts.CallExpression, SitedAction>();

  constructor(table: SiteTable) {
    this.ingest(table.actors, (entry) => ({ kind: "actor", siteId: entry.id }));
    this.ingest(table.asks, (entry) => ({ kind: "ask", siteId: entry.id }));
    this.ingest(table.reports, (entry) => ({ kind: "report", siteId: entry.id }));
    this.ingest(table.phases, (entry) => ({ kind: "phase", name: entry.name }));
    this.ingest(table.artifacts, (entry) => ({ kind: "artifact", siteId: entry.id, op: entry.op }));
    this.ingest(table.worldReads, (entry) => ({
      kind: "world-read",
      siteId: entry.id,
      op: entry.op,
    }));
  }

  private ingest<T extends { call: ts.CallExpression }>(
    collection: readonly T[],
    converter: (item: T) => SitedAction,
  ): void {
    for (const element of collection) {
      this.mapping.set(element.call, converter(element));
    }
  }

  public get(node: ts.CallExpression): SitedAction | undefined {
    return this.mapping.get(node);
  }
}

function isDeclarationIdentifier(targetParent: ts.Node, ident: ts.Identifier): boolean {
  if (!("name" in targetParent) || targetParent.name !== ident) {
    return false;
  }
  switch (targetParent.kind) {
    case ts.SyntaxKind.VariableDeclaration:
    case ts.SyntaxKind.Parameter:
    case ts.SyntaxKind.BindingElement:
    case ts.SyntaxKind.FunctionDeclaration:
    case ts.SyntaxKind.ClassDeclaration:
      return true;
    default:
      return false;
  }
}

function isNonValueArgsPosition(ident: ts.Identifier): boolean {
  const p = ident.parent;
  if (!p) {
    return false;
  }
  if (ts.isPropertyAccessExpression(p) && p.name === ident) return true;
  if (ts.isQualifiedName(p) && p.right === ident) return true;
  if (ts.isShorthandPropertyAssignment(p) && p.name === ident) return true;
  if (ts.isPropertyAssignment(p) && p.name === ident) return true;
  if (ts.isPropertySignature(p) && p.name === ident) return true;
  if (ts.isBindingElement(p) && p.propertyName === ident) return true;
  return isDeclarationIdentifier(p, ident);
}

function constructNullishGuard(
  factory: ts.NodeFactory,
  initialExpr: ts.Expression,
  stableVar: ts.Expression,
): ts.BinaryExpression {
  const operator = ts.SyntaxKind.EqualsEqualsEqualsToken;
  const isNull = factory.createBinaryExpression(initialExpr, operator, factory.createNull());
  const isUndefined = factory.createBinaryExpression(
    stableVar,
    operator,
    factory.createIdentifier("undefined"),
  );
  return factory.createBinaryExpression(isNull, ts.SyntaxKind.BarBarToken, isUndefined);
}

// AST transformer that replaces workflow facade primitives with sandboxed host invocations.
export class WorkflowAstRewriter {
  private readonly callRegistry: SiteCallRegistry;

  constructor(
    private readonly checker: ts.TypeChecker,
    table: SiteTable,
    private readonly hostToken: string,
  ) {
    this.callRegistry = new SiteCallRegistry(table);
  }

  public createTransformer(): ts.TransformerFactory<ts.SourceFile> {
    return (context: ts.TransformationContext) => {
      const { factory } = context;

      const hostAccess = (propName: string): ts.PropertyAccessExpression =>
        factory.createPropertyAccessExpression(factory.createIdentifier(this.hostToken), propName);

      const recurseNode = (expression: ts.Expression): ts.Expression =>
        ts.visitNode(expression, visitor) as ts.Expression;

      const visitor: ts.Visitor = (node: ts.Node): ts.Node => {
        if (ts.isIdentifier(node) && node.text === "args") {
          if (!isNonValueArgsPosition(node)) {
            const sym = resolveSymbol(node, this.checker);
            if (isFacadeDeclared(sym)) {
              return hostAccess("args");
            }
          }
        }

        if (ts.isCallExpression(node)) {
          const sited = this.callRegistry.get(node);
          if (sited) {
            return this.rewriteCallNode(node, sited, factory, context, recurseNode);
          }

          if (this.isFacadeLogCall(node)) {
            return factory.createCallExpression(
              hostAccess("log"),
              undefined,
              node.arguments.map(recurseNode),
            );
          }
        }

        return ts.visitEachChild(node, visitor, context);
      };

      return (source: ts.SourceFile) => ts.visitNode(source, visitor) as ts.SourceFile;
    };
  }

  private isFacadeLogCall(call: ts.CallExpression): boolean {
    const sig = this.checker.getResolvedSignature(call);
    const decl = sig?.declaration;
    if (!decl || decl.getSourceFile().fileName !== FACADE_FILE_NAME) {
      return false;
    }
    const declName = (decl as ts.FunctionDeclaration | ts.MethodSignature).name;
    return Boolean(declName && ts.isIdentifier(declName) && declName.text === "log");
  }

  private rewriteCallNode(
    call: ts.CallExpression,
    action: SitedAction,
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
    walk: (expr: ts.Expression) => ts.Expression,
  ): ts.Expression {
    const hostProp = (name: string) =>
      factory.createPropertyAccessExpression(factory.createIdentifier(this.hostToken), name);
    const siteLiteral = (id: string) => factory.createStringLiteral(id);

    switch (action.kind) {
      case "phase": {
        const sanitized = action.name?.trim();
        if (!sanitized) {
          return factory.createVoidZero();
        }
        return factory.createCallExpression(hostProp("enterPhase"), undefined, [
          factory.createStringLiteral(sanitized),
        ]);
      }
      case "actor": {
        return factory.createCallExpression(hostProp("createActor"), undefined, [
          siteLiteral(action.siteId),
          ...call.arguments.map(walk),
        ]);
      }
      case "ask": {
        const propAccess = call.expression as ts.PropertyAccessExpression;
        const targetReceiver = walk(propAccess.expression);

        const emitDirectAsk = (receiverOperand: ts.Expression): ts.Expression =>
          factory.createCallExpression(hostProp("ask"), undefined, [
            siteLiteral(action.siteId),
            receiverOperand,
            ...call.arguments.map(walk),
          ]);

        if (!ts.isOptionalChain(call)) {
          return emitDirectAsk(targetReceiver);
        }

        const isSimpleIdentifier = ts.isIdentifier(targetReceiver);
        const stableReceiver = isSimpleIdentifier
          ? targetReceiver
          : factory.createTempVariable(context.hoistVariableDeclaration);

        const initialEval = isSimpleIdentifier
          ? targetReceiver
          : factory.createAssignment(stableReceiver, targetReceiver);

        const guard = constructNullishGuard(factory, initialEval, stableReceiver);
        return factory.createConditionalExpression(
          guard,
          undefined,
          factory.createIdentifier("undefined"),
          undefined,
          emitDirectAsk(stableReceiver),
        );
      }
      case "artifact": {
        const methodName = isArtifactPresetOp(action.op) ? "declareArtifact" : "publishArtifact";
        return factory.createCallExpression(hostProp(methodName), undefined, [
          siteLiteral(action.siteId),
          factory.createStringLiteral(action.op),
          factory.createArrayLiteralExpression(call.arguments.map(walk)),
        ]);
      }
      case "report": {
        return factory.createCallExpression(hostProp("report"), undefined, [
          siteLiteral(action.siteId),
          ...call.arguments.map(walk),
        ]);
      }
      case "world-read": {
        return factory.createCallExpression(hostProp("worldRead"), undefined, [
          siteLiteral(action.siteId),
          factory.createStringLiteral(action.op),
          factory.createArrayLiteralExpression(call.arguments.map(walk)),
        ]);
      }
    }
  }
}

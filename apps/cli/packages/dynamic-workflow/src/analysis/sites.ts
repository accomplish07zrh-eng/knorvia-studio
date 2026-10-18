// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import {
  artifactRowOfSymbol,
  markerFunctionOfSymbol,
  worldReadOpOfSymbol,
  siteProducingFunctionOfSymbol,
  type ArtifactOp,
  type WorldReadOp,
} from "../facade/registry.js";
import {
  WORKFLOW_FUNCTION_NAME,
  type ScriptLoc,
  type WorkflowProgram,
} from "../compiler/compile.js";
import type { NamePattern } from "./types.js";
import { callbackSemanticsOf, isGlobalLibValue, type CallbackSemantics } from "./callbacks.js";
import {
  actorName,
  actorNamePattern,
  askLabel,
  askLabelPattern,
  Counter,
  eachCandidate,
  forOfCandidate,
  isFacadeDeclared,
  literalText,
  resolveSymbol,
  worldReadLabel,
} from "./sites-labels.js";

export { isFacadeDeclared, resolveSymbol } from "./sites-labels.js";

interface SiteCore {
  readonly id: string;
  readonly order: number;
  readonly loc: ScriptLoc;
  readonly call: ts.CallExpression;
}

export interface AskSite extends SiteCore {
  readonly label: string;
  readonly labelPattern?: NamePattern;
  readonly receiver: ts.Expression;
  readonly instructions: ts.Expression | undefined;
}

export interface ActorSite extends SiteCore {
  readonly name: string | undefined;
  readonly namePattern?: NamePattern;
}

export interface ReportSite extends SiteCore {
  readonly item: ts.Expression | undefined;
  readonly artifactId?: string;
  readonly artifactIdExpr: ts.Expression | undefined;
}

export interface ArtifactSite extends SiteCore {
  readonly op: ArtifactOp;
  readonly artifactId?: string;
  readonly artifactIdExpr: ts.Expression | undefined;
}

export interface PhaseMarkerSite {
  readonly name?: string;
  readonly loc: ScriptLoc;
  readonly call: ts.CallExpression;
  readonly nameExpr: ts.Expression | undefined;
}

export interface WorldReadSite extends SiteCore {
  readonly op: WorldReadOp;
  readonly label: string;
  readonly args: readonly ts.Expression[];
}

export interface JoinSite extends SiteCore {
  readonly method: "all" | "allSettled";
  readonly label: string;
  readonly arg: ts.Expression | undefined;
}

export interface IterationCandidate {
  readonly order: number;
  readonly form: "array-method" | "for-of";
  readonly loc: ScriptLoc;
  readonly method?: string;
  readonly call?: ts.CallExpression;
  readonly semantics?: CallbackSemantics;
  readonly callback?: ts.FunctionExpression | ts.ArrowFunction;
  readonly callbackExpr?: ts.Expression;
  readonly body: ts.Node;
  readonly element: ts.BindingName | undefined;
  readonly iterated: ts.Expression;
}

export interface TopLevelReturn {
  readonly loc: ScriptLoc;
  readonly expression: ts.Expression | undefined;
}

export interface SiteTable {
  readonly asks: AskSite[];
  readonly actors: ActorSite[];
  readonly worldReads: WorldReadSite[];
  readonly reports: ReportSite[];
  readonly artifacts: ArtifactSite[];
  readonly phases: PhaseMarkerSite[];
  readonly joins: JoinSite[];
  readonly iterations: IterationCandidate[];
  readonly topLevelReturns: TopLevelReturn[];
}

function createInitialSiteTable(): SiteTable {
  return {
    asks: [],
    joins: [],
    worldReads: [],
    actors: [],
    artifacts: [],
    reports: [],
    phases: [],
    iterations: [],
    topLevelReturns: [],
  };
}

class SiteCollector {
  private seq = 0;
  private readonly askIds = new Counter();
  private readonly actorIds = new Counter();
  private readonly readIds = new Counter();
  private readonly joinIds = new Counter();
  private readonly reportIds = new Counter();
  private readonly artifactIds = new Counter();

  readonly table: SiteTable = createInitialSiteTable();

  constructor(
    private readonly checker: ts.TypeChecker,
    private readonly program: ts.Program,
    private readonly scriptFile: ts.SourceFile,
    private readonly toLoc: (pos: number) => ScriptLoc,
  ) {}

  private locOf(node: ts.Node): ScriptLoc {
    return this.toLoc(node.getStart(this.scriptFile));
  }

  private handlePropertyAccess(
    call: ts.CallExpression,
    access: ts.PropertyAccessExpression,
  ): boolean {
    const member = access.name.text;
    const sym = this.checker.getSymbolAtLocation(access.name);

    if (sym && isFacadeDeclared(sym)) {
      if (member === "ask") {
        const pattern = askLabelPattern(access.expression, this.checker);
        this.table.asks.push({
          id: `ask#${this.askIds.next()}`,
          order: this.seq++,
          loc: this.locOf(access.name),
          call,
          label: askLabel(access.expression, this.checker),
          receiver: access.expression,
          instructions: call.arguments[0],
          ...(pattern ? { labelPattern: pattern } : {}),
        });
        return true;
      }

      const art = artifactRowOfSymbol(sym);
      if (art !== undefined) {
        const idExpr = call.arguments[0];
        const artId = literalText(idExpr);
        this.table.artifacts.push({
          id: `artifact#${this.artifactIds.next()}`,
          order: this.seq++,
          loc: this.locOf(access.name),
          call,
          op: art.op,
          artifactIdExpr: idExpr,
          ...(artId !== undefined ? { artifactId: artId } : {}),
        });
        return true;
      }

      const readOp = worldReadOpOfSymbol(sym);
      if (readOp !== undefined) {
        this.table.worldReads.push({
          id: `world-read#${this.readIds.next()}`,
          order: this.seq++,
          loc: this.locOf(access.name),
          call,
          op: readOp,
          label: worldReadLabel(readOp, call.arguments[0]),
          args: call.arguments,
        });
        return true;
      }
    }

    if (
      (member === "all" || member === "allSettled") &&
      isGlobalLibValue(access.expression, "Promise", this.checker, this.program)
    ) {
      this.table.joins.push({
        id: `join#${this.joinIds.next()}`,
        order: this.seq++,
        loc: this.locOf(access.name),
        call,
        method: member,
        label: "join",
        arg: call.arguments[0],
      });
      return true;
    }

    const semantics = callbackSemanticsOf(call, this.checker, this.program);
    if (semantics?.multiplicity === "each") {
      const candidate = eachCandidate(call, semantics, this.seq, this.locOf(call));
      if (candidate) {
        this.seq++;
        this.table.iterations.push(candidate);
      }
    }
    return true;
  }

  private handleDirectCall(call: ts.CallExpression): void {
    const calleeSym = resolveSymbol(call.expression, this.checker);
    const siteFn = siteProducingFunctionOfSymbol(calleeSym);

    if (siteFn === "agent") {
      const name = actorName(call);
      const pattern = name === undefined ? actorNamePattern(call) : undefined;
      this.table.actors.push({
        id: `actor#${this.actorIds.next()}`,
        order: this.seq++,
        loc: this.locOf(call),
        call,
        name,
        ...(pattern ? { namePattern: pattern } : {}),
      });
      return;
    }

    if (siteFn === "report") {
      const tagExpr = call.arguments[1];
      const tag = literalText(tagExpr);
      this.table.reports.push({
        id: `report#${this.reportIds.next()}`,
        order: this.seq++,
        loc: this.locOf(call),
        call,
        item: call.arguments[0],
        artifactIdExpr: tagExpr,
        ...(tag !== undefined ? { artifactId: tag } : {}),
      });
      return;
    }

    if (markerFunctionOfSymbol(calleeSym) === "phase") {
      const nameExpr = call.arguments[0];
      const name = literalText(nameExpr);
      this.table.phases.push({
        call,
        loc: this.locOf(call),
        nameExpr,
        ...(name !== undefined ? { name } : {}),
      });
    }
  }

  public collect(body: ts.Block): SiteTable {
    const classify = (node: ts.Node, depth: number): void => {
      if (ts.isReturnStatement(node)) {
        if (depth === 0) {
          this.table.topLevelReturns.push({
            expression: node.expression,
            loc: this.locOf(node),
          });
        }
        return;
      }

      if (ts.isForOfStatement(node)) {
        this.table.iterations.push(forOfCandidate(node, this.seq++, this.locOf(node)));
        return;
      }

      if (ts.isCallExpression(node)) {
        if (ts.isPropertyAccessExpression(node.expression)) {
          this.handlePropertyAccess(node, node.expression);
        } else {
          this.handleDirectCall(node);
        }
      }
    };

    const walk = (node: ts.Node, depth: number): void => {
      classify(node, depth);
      const childDepth = depth + (isFunctionLike(node) ? 1 : 0);
      ts.forEachChild(node, (child) => walk(child, childDepth));
    };

    for (const stmt of body.statements) {
      walk(stmt, 0);
    }
    return this.table;
  }
}

export function collectSites(workflow: WorkflowProgram): SiteTable {
  const body = findWorkflowBody(workflow.scriptFile);
  const collector = new SiteCollector(
    workflow.program.getTypeChecker(),
    workflow.program,
    workflow.scriptFile,
    workflow.toScriptLoc,
  );
  return collector.collect(body);
}

export function findWorkflowBody(scriptFile: ts.SourceFile): ts.Block {
  const wrapper = scriptFile.statements.find(
    (s): s is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(s) && s.name?.text === WORKFLOW_FUNCTION_NAME,
  );
  if (!wrapper || !wrapper.body) {
    throw new Error(`workflow wrapper function ${WORKFLOW_FUNCTION_NAME} not found`);
  }
  return wrapper.body;
}

const FUNCTIONAL_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Constructor,
]);

export function isFunctionLike(node: ts.Node): boolean {
  return FUNCTIONAL_KINDS.has(node.kind);
}

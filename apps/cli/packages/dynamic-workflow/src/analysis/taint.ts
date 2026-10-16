// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import type { WorkflowProgram } from "../compiler/compile.js";
import type { SiteTable } from "./sites.js";
import {
  addPlaceholder,
  cloneValue,
  collapse,
  collapseInto,
  emptyValue,
  isNonArrowFunctionLike,
  liveField,
  mergeInto,
  peelPlace,
  staticIndexKey,
  unionValues,
  type AbstractValue,
} from "./domain.js";
import { applyCall, evalCall } from "./calls.js";
import {
  applyConstructor,
  applyMixinConstructor,
  evalAwait,
  handleNewUnknown,
} from "./promise-ops.js";
import {
  classConstructor,
  classNodeOfSymbol,
  enclosingBaseInstance,
  enclosingClassInstance,
  evalClasses,
  hasUnresolvedHeritage,
  resolveClassNode,
} from "./classes.js";
import { handleForIn, handleForOf, visitForStatement } from "./control-flow.js";
import { evalArrayLiteral, evalObjectLiteral } from "./literals.js";
import { bindPattern, extractField, selectField } from "./patterns.js";
import { TaintState } from "./state.js";
import { evalBinary, evalElementAccess, evalPropertyAccess } from "./operators.js";

// Joins are monotone, so a later statement cannot erase an earlier fact. Hitting
// the cap aborts rather than dropping edges. Region ids feed the call oracle
// ("top", `fn@<id>`).
const CONVERGENCE_LIMIT = 100;
const ROOT_REGION = "top";
const ARGUMENTS_NAME = "arguments";
const THEN_MEMBER = "then";

export interface EvalContext {
  // Innermost region is last. The root id is "top"; a function body is `fn@<id>`.
  regionStack: string[];
  // Accepts values produced by `return` and `yield` in the active region.
  onReturn: (produced: AbstractValue) => void;
}

// Drives the taint fixpoint. After converge(), callers read facts and the
// ordering oracle from `s`. This class does not emit edges itself.
export class Evaluator {
  readonly s: TaintState;
  readonly checker: ts.TypeChecker;

  constructor(program: WorkflowProgram, sites: SiteTable) {
    this.s = new TaintState(program, sites);
    this.checker = this.s.checker;
  }

  converge(): void {
    for (let round = 1; round <= CONVERGENCE_LIMIT; round += 1) {
      this.s.changed = false;
      this.sweepProgram();
      this.s.propagateReachability();
      this.s.recomputePromotion();
      if (!this.s.changed) return;
    }
    throw new Error(`taint analysis failed to converge after ${CONVERGENCE_LIMIT} iterations`);
  }

  private sweepProgram(): void {
    for (const callable of this.s.functions) {
      if (!ts.isFunctionDeclaration(callable) || callable.name === undefined) continue;
      const symbol = this.checker.getSymbolAtLocation(callable.name);
      if (symbol === undefined) continue;
      const held = emptyValue();
      held.fns.add(callable);
      this.s.bindSymbol(symbol, held);
    }
    const rootFrame: EvalContext = {
      onReturn: (produced) => this.s.mergeReturn(collapse(produced)),
      regionStack: [ROOT_REGION],
    };
    this.walkList(this.s.body.statements, rootFrame);
    // Field initializers may read top-level bindings, so classes run after the
    // script body and before callables. Later rounds repair any leftover order.
    evalClasses(this);
    for (const callable of this.s.functions) this.interpretCallable(callable);
  }

  private walkList(statements: readonly ts.Node[], frame: EvalContext): void {
    for (let ordinal = 0; ordinal < statements.length; ordinal += 1) {
      const syntax = statements[ordinal];
      if (syntax !== undefined) this.visit(syntax, frame);
    }
  }

  private interpretCallable(callable: ts.Node): void {
    const fnKey = this.s.fnId.get(callable);
    if (fnKey === undefined) return;
    this.s.bindPlaceholderParams(callable, fnKey);
    const frame: EvalContext = {
      onReturn: (produced) => {
        if (mergeInto(this.s.summaryOf(fnKey), produced)) this.s.changed = true;
      },
      regionStack: [`fn@${fnKey}`],
    };
    const signature = callable as ts.SignatureDeclaration;
    // fnParamSymbols skips binding patterns. Bind them here or the destructured
    // names stay empty and the may-flow disappears.
    const formals = signature.parameters;
    for (let ordinal = 0; ordinal < formals.length; ordinal += 1) {
      const formal = formals[ordinal];
      if (formal === undefined || ts.isIdentifier(formal.name)) continue;
      const held = emptyValue();
      const spread = formal.dotDotDotToken !== undefined;
      addPlaceholder(held, { fnId: fnKey, param: ordinal, ...(spread ? { rest: true } : {}) });
      this.bindPattern(formal.name, held, frame);
    }
    // A missing actual would otherwise leave the default unread (`build(prefix = s)`).
    for (let ordinal = 0; ordinal < formals.length; ordinal += 1) {
      const formal = formals[ordinal];
      const initExpr = formal?.initializer;
      if (formal === undefined || initExpr === undefined) continue;
      this.bindPattern(formal.name, this.evalExpr(initExpr, frame), frame);
    }
    const bodySyntax = (signature as { body?: ts.Node }).body;
    if (bodySyntax === undefined) return;
    if (!ts.isBlock(bodySyntax)) {
      frame.onReturn(this.evalExpr(bodySyntax as ts.Expression, frame));
      return;
    }
    this.walkList(bodySyntax.statements, frame);
  }

  recordGuard(syntax: ts.Expression, carried: AbstractValue): void {
    // Key by the same start offset the ordering walk passes to controllersOf.
    // Stored as a sink only: a condition is outside the data contract.
    this.s.mergeSink(this.s.guardVal, syntax.getStart(this.s.scriptFile), carried);
  }

  visit(syntax: ts.Node, frame: EvalContext): void {
    if (ts.isVariableStatement(syntax)) {
      const bindings = syntax.declarationList.declarations;
      for (let ordinal = 0; ordinal < bindings.length; ordinal += 1) {
        const declared = bindings[ordinal];
        if (declared !== undefined) this.handleDeclaration(declared, frame);
      }
      return;
    }
    if (ts.isExpressionStatement(syntax)) return void this.evalExpr(syntax.expression, frame);
    if (ts.isReturnStatement(syntax)) {
      const produced = syntax.expression;
      frame.onReturn(produced === undefined ? emptyValue() : this.evalExpr(produced, frame));
      return;
    }
    if (ts.isForOfStatement(syntax)) return handleForOf(this, syntax, frame);
    if (ts.isIfStatement(syntax)) {
      const probe = this.evalExpr(syntax.expression, frame);
      this.recordGuard(syntax.expression, probe);
      this.visit(syntax.thenStatement, frame);
      const alternate = syntax.elseStatement;
      if (alternate !== undefined) this.visit(alternate, frame);
      return;
    }
    if (ts.isBlock(syntax)) return this.walkList(syntax.statements, frame);
    if (ts.isForStatement(syntax)) return visitForStatement(this, syntax, frame);
    if (ts.isForInStatement(syntax)) return handleForIn(this, syntax, frame);
    if (ts.isWhileStatement(syntax)) {
      const probe = this.evalExpr(syntax.expression, frame);
      this.recordGuard(syntax.expression, probe);
      this.visit(syntax.statement, frame);
      return;
    }
    if (ts.isDoStatement(syntax)) {
      // The body runs once before the test, so the test is not a guard.
      this.evalExpr(syntax.expression, frame);
      this.visit(syntax.statement, frame);
      return;
    }
    if (ts.isSwitchStatement(syntax)) {
      const probe = this.evalExpr(syntax.expression, frame);
      this.recordGuard(syntax.expression, probe);
      for (const branch of syntax.caseBlock.clauses) {
        if (ts.isCaseClause(branch)) this.evalExpr(branch.expression, frame);
        this.walkList(branch.statements, frame);
      }
      return;
    }
    if (ts.isTryStatement(syntax)) {
      this.visit(syntax.tryBlock, frame);
      const handler = syntax.catchClause;
      if (handler !== undefined) {
        const catchName = handler.variableDeclaration;
        // Clone so the catch name does not alias the script-wide thrown set.
        if (catchName !== undefined)
          this.bindPattern(catchName.name, cloneValue(this.s.thrownVal), frame);
        this.visit(handler.block, frame);
      }
      const cleanup = syntax.finallyBlock;
      if (cleanup !== undefined) this.visit(cleanup, frame);
      return;
    }
    if (ts.isThrowStatement(syntax)) {
      return void this.s.mergeThrown(collapse(this.evalExpr(syntax.expression, frame)));
    }
    if (ts.isLabeledStatement(syntax)) this.visit(syntax.statement, frame);
  }

  handleDeclaration(declared: ts.VariableDeclaration, frame: EvalContext): void {
    const initExpr = declared.initializer;
    if (initExpr === undefined) return;
    const live = this.resolvePlace(initExpr);
    if (!ts.isIdentifier(declared.name)) {
      // A destructured place aliases live fields and still runs effects (join / then).
      if (live !== undefined) {
        this.evalExpr(initExpr, frame);
        this.bindPattern(declared.name, live, frame, live);
        return;
      }
      this.bindPattern(declared.name, this.evalExpr(initExpr, frame), frame);
      return;
    }
    if (live !== undefined) {
      const symbol = this.checker.getSymbolAtLocation(declared.name);
      if (symbol !== undefined) {
        // Effects first: a comma or await wrapped around the place still has sinks.
        this.evalExpr(initExpr, frame);
        this.s.bindSymbol(symbol, live);
        return;
      }
    }
    this.bindPattern(declared.name, this.evalExpr(initExpr, frame), frame);
  }

  resolvePlace(placeExpr: ts.Expression, materialize = false): AbstractValue | undefined {
    const core = peelPlace(placeExpr);
    if (ts.isAwaitExpression(core)) return this.placeAfterAwait(core, materialize);
    if (core.kind === ts.SyntaxKind.ThisKeyword) return enclosingClassInstance(this, core);
    if (core.kind === ts.SyntaxKind.SuperKeyword) return enclosingBaseInstance(this, core);
    if (ts.isIdentifier(core)) return this.placeOfName(core);
    if (ts.isPropertyAccessExpression(core)) {
      return this.placeOfChain(core.expression, core.name.text, materialize);
    }
    if (ts.isElementAccessExpression(core)) {
      const fieldKey = staticIndexKey(core.argumentExpression);
      return fieldKey === undefined ? undefined : this.placeOfChain(core.expression, fieldKey, materialize);
    }
    if (ts.isConditionalExpression(core)) return this.placeOfConditional(core, materialize);
    // Absent until handleJoin records it. A direct site-table read would skip the relay.
    return ts.isCallExpression(core) ? this.s.joinResults.get(core) : undefined;
  }

  // A tracked `then` means the awaited result is not the operand place.
  private placeAfterAwait(syntax: ts.AwaitExpression, materialize: boolean): AbstractValue | undefined {
    const awaited = this.resolvePlace(syntax.expression, materialize);
    if (awaited === undefined) return undefined;
    const continuations = awaited.fields.get(THEN_MEMBER)?.fns;
    if (continuations !== undefined && continuations.size > 0) return undefined;
    return awaited;
  }

  private placeOfName(syntax: ts.Identifier): AbstractValue | undefined {
    const symbol = this.checker.getSymbolAtLocation(syntax);
    if (symbol === undefined) return undefined;
    const classNode = classNodeOfSymbol(this, symbol);
    return classNode === undefined ? this.s.envSlot(symbol) : this.s.instanceOf(classNode);
  }

  // materialize=false must not invent a field: a phantom slot hides container taint.
  private placeOfChain(receiverExpr: ts.Expression, fieldKey: string, materialize: boolean): AbstractValue | undefined {
    const receiver = this.resolvePlace(receiverExpr, materialize);
    if (receiver === undefined) return undefined;
    const stored = receiver.fields.get(fieldKey);
    if (stored !== undefined) return stored;
    return materialize ? liveField(receiver, fieldKey) : undefined;
  }

  // Both arms must be places; otherwise there is no heap node and evalExpr owns the value.
  // condPlaceOf supplies a pass-stable wrapper so mayAlias does not grow forever.
  private placeOfConditional(syntax: ts.ConditionalExpression, materialize: boolean): AbstractValue | undefined {
    const truthyArm = this.resolvePlace(syntax.whenTrue, materialize);
    const falsyArm = this.resolvePlace(syntax.whenFalse, materialize);
    if (truthyArm === undefined || falsyArm === undefined) return undefined;
    const joined = this.s.condPlaceOf(syntax);
    for (const choice of [truthyArm, falsyArm]) {
      const aliases = (joined.mayAlias ??= new Set());
      if (!aliases.has(choice)) {
        aliases.add(choice);
        this.s.changed = true;
      }
      if (mergeInto(joined, choice)) this.s.changed = true;
    }
    return joined;
  }

  argWriteBackPlace(actual: ts.Expression, carried: AbstractValue): AbstractValue | undefined {
    const live = this.resolvePlace(actual);
    if (live !== undefined) return live;
    const core = peelPlace(actual);
    const isFreshLiteral = ts.isObjectLiteralExpression(core) || ts.isArrayLiteralExpression(core);
    return isFreshLiteral ? carried : undefined;
  }

  bindPattern(bindingName: ts.BindingName, carried: AbstractValue, frame: EvalContext, liveSource?: AbstractValue): void {
    bindPattern(this, bindingName, carried, frame, liveSource);
  }

  extractField(host: AbstractValue, fieldKey: string): AbstractValue {
    return extractField(this, host, fieldKey);
  }

  selectField(carried: AbstractValue, fieldKey: string): AbstractValue {
    return selectField(carried, fieldKey);
  }

  evalExpr(syntax: ts.Expression, frame: EvalContext): AbstractValue {
    if (ts.isIdentifier(syntax)) return this.readIdentifier(syntax);
    if (
      ts.isParenthesizedExpression(syntax) ||
      ts.isAsExpression(syntax) ||
      ts.isSatisfiesExpression(syntax) ||
      ts.isNonNullExpression(syntax) ||
      ts.isTypeAssertionExpression(syntax)
    ) {
      return this.evalExpr(syntax.expression, frame);
    }
    if (ts.isAwaitExpression(syntax)) return evalAwait(this, syntax, frame);
    if (ts.isFunctionExpression(syntax) || ts.isArrowFunction(syntax)) {
      const held = emptyValue();
      held.fns.add(syntax);
      return held;
    }
    if (syntax.kind === ts.SyntaxKind.ThisKeyword)
      return this.cloneInstance(enclosingClassInstance(this, syntax));
    if (syntax.kind === ts.SyntaxKind.SuperKeyword)
      return this.cloneInstance(enclosingBaseInstance(this, syntax));
    if (ts.isCallExpression(syntax)) return evalCall(this, syntax, frame);
    if (ts.isPropertyAccessExpression(syntax)) return evalPropertyAccess(this, syntax, frame);
    if (ts.isElementAccessExpression(syntax)) return evalElementAccess(this, syntax, frame);
    if (ts.isBinaryExpression(syntax)) return evalBinary(this, syntax, frame);
    if (ts.isTemplateExpression(syntax)) return this.interpretTemplate(syntax, frame);
    if (ts.isTaggedTemplateExpression(syntax)) return this.interpretTagged(syntax, frame);
    if (ts.isYieldExpression(syntax)) {
      const yielded = syntax.expression;
      if (yielded !== undefined) frame.onReturn(this.evalExpr(yielded, frame));
      return emptyValue();
    }
    if (ts.isConditionalExpression(syntax)) {
      const probe = this.evalExpr(syntax.condition, frame);
      this.recordGuard(syntax.condition, probe);
      return unionValues(this.evalExpr(syntax.whenTrue, frame), this.evalExpr(syntax.whenFalse, frame));
    }
    if (ts.isPrefixUnaryExpression(syntax) || ts.isPostfixUnaryExpression(syntax)) {
      return collapse(this.evalExpr(syntax.operand, frame));
    }
    if (ts.isTypeOfExpression(syntax)) return collapse(this.evalExpr(syntax.expression, frame));
    if (ts.isVoidExpression(syntax) || ts.isDeleteExpression(syntax)) {
      this.evalExpr(syntax.expression, frame);
      return emptyValue();
    }
    if (ts.isArrayLiteralExpression(syntax))
      return this.s.literalPlaceOf(syntax, evalArrayLiteral(this, syntax, frame));
    if (ts.isObjectLiteralExpression(syntax))
      return this.s.literalPlaceOf(syntax, evalObjectLiteral(this, syntax, frame));
    if (ts.isNewExpression(syntax)) return this.interpretNew(syntax, frame);
    if (ts.isSpreadElement(syntax)) return collapse(this.evalExpr(syntax.expression, frame));
    return emptyValue();
  }

  private cloneInstance(classValue: AbstractValue | undefined): AbstractValue {
    return classValue === undefined ? emptyValue() : cloneValue(classValue);
  }

  private interpretTemplate(syntax: ts.TemplateExpression, frame: EvalContext): AbstractValue {
    const joined = emptyValue();
    for (const chunk of syntax.templateSpans) collapseInto(joined, this.evalExpr(chunk.expression, frame));
    return joined;
  }

  private interpretTagged(syntax: ts.TaggedTemplateExpression, frame: EvalContext): AbstractValue {
    const actuals: AbstractValue[] = [emptyValue()];
    const cooked = syntax.template;
    if (ts.isTemplateExpression(cooked)) {
      for (const chunk of cooked.templateSpans) actuals.push(this.evalExpr(chunk.expression, frame));
    }
    return applyCall(this, syntax.tag, actuals, frame, undefined, undefined, syntax);
  }

  private interpretNew(syntax: ts.NewExpression, frame: EvalContext): AbstractValue {
    const classNode = resolveClassNode(this, syntax.expression);
    if (classNode === undefined) return handleNewUnknown(this, syntax, frame);
    const actualNodes = syntax.arguments ?? [];
    const actuals = actualNodes.map((actual) => this.evalExpr(actual, frame));
    const constructorNode = classConstructor(this, classNode);
    const constructorKey =
      constructorNode === undefined ? undefined : this.s.fnId.get(constructorNode);
    if (constructorKey !== undefined) {
      const writebacks = actualNodes.map((actual, position) =>
        this.argWriteBackPlace(actual, actuals[position] as AbstractValue),
      );
      applyConstructor(this, constructorKey, frame, actuals, writebacks, syntax);
    } else if (hasUnresolvedHeritage(this, classNode)) {
      applyMixinConstructor(this, frame, this.s.instanceOf(classNode), actuals);
    }
    return this.s.instanceOf(classNode);
  }

  private readIdentifier(syntax: ts.Identifier): AbstractValue {
    const symbol = this.checker.getSymbolAtLocation(syntax);
    if (symbol !== undefined) {
      const classNode = classNodeOfSymbol(this, symbol);
      if (classNode !== undefined) return cloneValue(this.s.instanceOf(classNode));
      const storedValue = this.s.env.get(symbol);
      if (storedValue !== undefined) return cloneValue(storedValue);
    }
    return this.readArgumentsObject(syntax) ?? emptyValue();
  }

  // Rest-shaped view of every actual on the nearest non-arrow function. Arrows
  // do not own `arguments`, so the ancestor search walks past them.
  private readArgumentsObject(syntax: ts.Identifier): AbstractValue | undefined {
    if (syntax.text !== ARGUMENTS_NAME) return undefined;
    const owner = ts.findAncestor(syntax, isNonArrowFunctionLike);
    const fnKey = owner === undefined ? undefined : this.s.fnId.get(owner);
    if (fnKey === undefined) return undefined;
    const held = emptyValue();
    addPlaceholder(held, { fnId: fnKey, param: 0, rest: true });
    return held;
  }

  receiverSymbol(rootExpr: ts.Expression): ts.Symbol | undefined {
    if (!ts.isIdentifier(rootExpr)) return undefined;
    return this.checker.getSymbolAtLocation(rootExpr);
  }
}

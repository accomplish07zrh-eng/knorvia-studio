// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import {
  classConstructor,
  classNodeOfSymbol,
  enclosingBaseInstance,
  enclosingClassInstance,
  hasUnresolvedHeritage,
  resolveClassNode,
} from "../classes.js";
import { applyCall, evalCall } from "../calls.js";
import {
  addPlaceholder,
  collapse,
  collapseInto,
  emptyValue,
  isNonArrowFunctionLike,
  unionValues,
  cloneValue,
  type AbstractValue,
} from "../domain.js";
import { evalArrayLiteral, evalObjectLiteral } from "../literals.js";
import { evalBinary, evalElementAccess, evalPropertyAccess } from "../operators.js";
import {
  applyConstructor,
  applyMixinConstructor,
  evalAwait,
  handleNewUnknown,
} from "../promise-ops.js";
import type { EvalContext, Evaluator } from "../taint.js";

// What an expression denotes, plus the effects that expression itself performs.
// Statement walking and place resolution stay on Evaluator.

const ARGUMENTS_NAME = "arguments";

export function evaluateExpression(
  analysis: Evaluator,
  syntax: ts.Expression,
  frame: EvalContext,
): AbstractValue {
  if (ts.isIdentifier(syntax)) return readIdentifier(analysis, syntax);
  if (
    ts.isParenthesizedExpression(syntax) ||
    ts.isAsExpression(syntax) ||
    ts.isSatisfiesExpression(syntax) ||
    ts.isNonNullExpression(syntax) ||
    ts.isTypeAssertionExpression(syntax)
  ) {
    return evaluateExpression(analysis, syntax.expression, frame);
  }
  if (ts.isAwaitExpression(syntax)) return evalAwait(analysis, syntax, frame);
  if (ts.isFunctionExpression(syntax) || ts.isArrowFunction(syntax)) {
    const held = emptyValue();
    held.fns.add(syntax);
    return held;
  }
  if (syntax.kind === ts.SyntaxKind.ThisKeyword)
    return cloneInstance(enclosingClassInstance(analysis, syntax));
  if (syntax.kind === ts.SyntaxKind.SuperKeyword)
    return cloneInstance(enclosingBaseInstance(analysis, syntax));
  if (ts.isCallExpression(syntax)) return evalCall(analysis, syntax, frame);
  if (ts.isPropertyAccessExpression(syntax)) return evalPropertyAccess(analysis, syntax, frame);
  if (ts.isElementAccessExpression(syntax)) return evalElementAccess(analysis, syntax, frame);
  if (ts.isBinaryExpression(syntax)) return evalBinary(analysis, syntax, frame);
  if (ts.isTemplateExpression(syntax)) return interpretTemplate(analysis, syntax, frame);
  if (ts.isTaggedTemplateExpression(syntax)) return interpretTagged(analysis, syntax, frame);
  if (ts.isYieldExpression(syntax)) {
    const yielded = syntax.expression;
    if (yielded !== undefined) frame.onReturn(evaluateExpression(analysis, yielded, frame));
    return emptyValue();
  }
  if (ts.isConditionalExpression(syntax)) {
    const probe = evaluateExpression(analysis, syntax.condition, frame);
    analysis.recordGuard(syntax.condition, probe);
    return unionValues(
      evaluateExpression(analysis, syntax.whenTrue, frame),
      evaluateExpression(analysis, syntax.whenFalse, frame),
    );
  }
  if (ts.isPrefixUnaryExpression(syntax) || ts.isPostfixUnaryExpression(syntax)) {
    return collapse(evaluateExpression(analysis, syntax.operand, frame));
  }
  if (ts.isTypeOfExpression(syntax))
    return collapse(evaluateExpression(analysis, syntax.expression, frame));
  if (ts.isVoidExpression(syntax) || ts.isDeleteExpression(syntax)) {
    evaluateExpression(analysis, syntax.expression, frame);
    return emptyValue();
  }
  if (ts.isArrayLiteralExpression(syntax))
    return analysis.s.literalPlaceOf(syntax, evalArrayLiteral(analysis, syntax, frame));
  if (ts.isObjectLiteralExpression(syntax))
    return analysis.s.literalPlaceOf(syntax, evalObjectLiteral(analysis, syntax, frame));
  if (ts.isNewExpression(syntax)) return interpretNew(analysis, syntax, frame);
  if (ts.isSpreadElement(syntax))
    return collapse(evaluateExpression(analysis, syntax.expression, frame));
  return emptyValue();
}

function cloneInstance(classValue: AbstractValue | undefined): AbstractValue {
  return classValue === undefined ? emptyValue() : cloneValue(classValue);
}

function interpretTemplate(
  analysis: Evaluator,
  syntax: ts.TemplateExpression,
  frame: EvalContext,
): AbstractValue {
  const joined = emptyValue();
  for (const chunk of syntax.templateSpans)
    collapseInto(joined, evaluateExpression(analysis, chunk.expression, frame));
  return joined;
}

function interpretTagged(
  analysis: Evaluator,
  syntax: ts.TaggedTemplateExpression,
  frame: EvalContext,
): AbstractValue {
  const actuals: AbstractValue[] = [emptyValue()];
  const cooked = syntax.template;
  if (ts.isTemplateExpression(cooked)) {
    for (const chunk of cooked.templateSpans)
      actuals.push(evaluateExpression(analysis, chunk.expression, frame));
  }
  return applyCall(analysis, syntax.tag, actuals, frame, undefined, undefined, syntax);
}

function interpretNew(
  analysis: Evaluator,
  syntax: ts.NewExpression,
  frame: EvalContext,
): AbstractValue {
  const classNode = resolveClassNode(analysis, syntax.expression);
  if (classNode === undefined) return handleNewUnknown(analysis, syntax, frame);
  const actualNodes = syntax.arguments ?? [];
  const actuals = actualNodes.map((actual) => evaluateExpression(analysis, actual, frame));
  const constructorNode = classConstructor(analysis, classNode);
  const constructorKey =
    constructorNode === undefined ? undefined : analysis.s.fnId.get(constructorNode);
  if (constructorKey !== undefined) {
    const writebacks = actualNodes.map((actual, position) =>
      analysis.argWriteBackPlace(actual, actuals[position] as AbstractValue),
    );
    applyConstructor(analysis, constructorKey, frame, actuals, writebacks, syntax);
  } else if (hasUnresolvedHeritage(analysis, classNode)) {
    applyMixinConstructor(analysis, frame, analysis.s.instanceOf(classNode), actuals);
  }
  return analysis.s.instanceOf(classNode);
}

function readIdentifier(analysis: Evaluator, syntax: ts.Identifier): AbstractValue {
  const symbol = analysis.checker.getSymbolAtLocation(syntax);
  if (symbol !== undefined) {
    const classNode = classNodeOfSymbol(analysis, symbol);
    if (classNode !== undefined) return cloneValue(analysis.s.instanceOf(classNode));
    const storedValue = analysis.s.env.get(symbol);
    if (storedValue !== undefined) return cloneValue(storedValue);
  }
  return readArgumentsObject(analysis, syntax) ?? emptyValue();
}

// Rest-shaped view of every actual on the nearest non-arrow function. Arrows
// do not own `arguments`, so the ancestor search walks past them.
function readArgumentsObject(
  analysis: Evaluator,
  syntax: ts.Identifier,
): AbstractValue | undefined {
  if (syntax.text !== ARGUMENTS_NAME) return undefined;
  const owner = ts.findAncestor(syntax, isNonArrowFunctionLike);
  const fnKey = owner === undefined ? undefined : analysis.s.fnId.get(owner);
  if (fnKey === undefined) return undefined;
  const held = emptyValue();
  addPlaceholder(held, { fnId: fnKey, param: 0, rest: true });
  return held;
}

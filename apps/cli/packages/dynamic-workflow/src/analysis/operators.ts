import ts from "typescript";
import {
  clearExact,
  collapse,
  COMPOUND_ASSIGNMENT_OPS,
  readField,
  staticIndexKey,
  unionValues,
  type AbstractValue,
} from "./domain.js";
import { handleAssignment, handleCompoundAssignment } from "./assign.js";
import type { EvalContext, Evaluator } from "./taint.js";

// 二元运算与属性读取的转移规则，从 taint.ts 拆出（拆分原因：oxlint max-lines 上限 400 行），
// 与 patterns.ts 相同，以 Evaluator 为首参调用。

export function evalBinary(
  ev: Evaluator,
  node: ts.BinaryExpression,
  ctx: EvalContext,
): AbstractValue {
  const op = node.operatorToken.kind;
  if (op === ts.SyntaxKind.EqualsToken) return handleAssignment(ev, node, ctx);
  if (COMPOUND_ASSIGNMENT_OPS.has(op)) return handleCompoundAssignment(ev, node, ctx);
  if (op === ts.SyntaxKind.CommaToken) {
    // The comma (sequence) operator evaluates its left operand for effect (facade sinks
    // inside it must be visited) and yields the RIGHT operand's value UNCOLLAPSED — the
    // sequence's result IS the right operand, so its field structure is preserved (a
    // later `(f(), box).note` read and comma-aliasing both need that). Previously the
    // comma fell through to the value-producing default, which collapsed the result
    // and unioned the discarded left operand's taint into it.
    ev.evalExpr(node.left, ctx);
    return ev.evalExpr(node.right, ctx);
  }
  if (
    op === ts.SyntaxKind.AmpersandAmpersandToken ||
    op === ts.SyntaxKind.BarBarToken ||
    op === ts.SyntaxKind.QuestionQuestionToken
  ) {
    // Short-circuit: the LEFT operand decides whether the right one evaluates, so it is
    // a guard sink — the ordering walk opens a `branch` region over the right operand
    // and reads its controllers off this same node.
    const left = ev.evalExpr(node.left, ctx);
    ev.recordGuard(node.left, left);
    return unionValues(left, ev.evalExpr(node.right, ctx));
  }
  // Value-producing operators (concat, arithmetic, comparison): union of operand
  // taints, fields dropped — the result is a primitive.
  return unionValues(collapse(ev.evalExpr(node.left, ctx)), collapse(ev.evalExpr(node.right, ctx)));
}

export function evalPropertyAccess(
  ev: Evaluator,
  node: ts.PropertyAccessExpression,
  ctx: EvalContext,
): AbstractValue {
  const receiver = ev.evalExpr(node.expression, ctx);
  // Field-sensitive read with smear-on-read (readField unions the container's own
  // container-level occurrences); unknown field folds to the whole-value read.
  return readField(receiver, node.name.text);
}

export function evalElementAccess(
  ev: Evaluator,
  node: ts.ElementAccessExpression,
  ctx: EvalContext,
): AbstractValue {
  const receiver = ev.evalExpr(node.expression, ctx);
  const literalKey = staticIndexKey(node.argumentExpression);
  if (literalKey !== undefined) return readField(receiver, literalKey);
  // Computed index: evaluate the key for effect (a facade sink can sit in it, e.g.
  // `o[await ask()]`); its taint is NOT joined into the read value — the value stored at a
  // key does not textually contain the key, same convention as a ternary condition. THE
  // widening rule: whole-container read, exactness cleared.
  ev.evalExpr(node.argumentExpression, ctx);
  return clearExact(collapse(receiver));
}

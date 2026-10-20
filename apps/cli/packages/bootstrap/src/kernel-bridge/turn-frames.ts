// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02：回合事件 → v4 帧的派生规则（合同 behavior.md B11/B12）。
//
// 边界（规格「对话正文的唯一所有者是 DSH 会话日志」）：
//   本模块**只做纯派生**——输入一条 DSH 会话事件，输出「该产出哪些 v4 行操作」，
//   不持有状态、不写日志、不碰网络。真正的投递由 `kernel-bridge-01` 的
//   `ProjectionLayer` 负责，帧结构与序号规则也在那里（本包不改）。
//
// 为什么单独成模块：回合事件的种类（assistant 文本、工具调用、工具结果、回合边界）
// 与「降维成 v4 行」的规则集中在这里，比散在 projection 里更容易对着合同逐条核。

/** v4 行操作的种类；与 `packages/shared/src/protocol-v4/delta.ts` 的 `op` 一致。 */
export type TurnRowOperationKind = "row.appended" | "row.upserted";

/** 一条由回合事件派生出的行操作。 */
export interface TurnDerivedRow {
  readonly op: TurnRowOperationKind;
  /**
   * 该行属于哪个回合。取消与失败时用它判断「终止帧是否已经在同一回合内」——
   * 这是 B12「序号单调不回退」在派生层的落点。
   */
  readonly turnId: string;
  /** v4 行的种类标签；与 `rows.ts` 的 `kind` 对应。 */
  readonly rowKind: "assistantText" | "toolCall" | "turnHeader";
}

/** 派生结果：行操作 + 是否到此回合结束。 */
export interface TurnDerivedFrame {
  readonly rows: readonly TurnDerivedRow[];
  /** 该事件是否标记了回合结束（对应 v4 的 TurnComplete）。 */
  readonly concludesTurn: boolean;
  /** 回合结束的原因；`concludesTurn` 为 false 时缺席。 */
  readonly conclusionReason?: "completed" | "cancelled" | "failed";
}

/** DSH 侧与本模块相关的会话事件种类（只取派生需要的判别字段）。 */
export interface TurnEventShape {
  /** 事件类型（DSH 会话事件的 `type`）。 */
  readonly type: string;
  /** assistant 文本增量。 */
  readonly textDelta?: string;
  /** 工具调用信息。 */
  readonly toolCall?: { readonly id: string; readonly name: string };
  /** 工具结果是否失败。 */
  readonly toolFailed?: boolean;
  /** 回合边界上的原因。 */
  readonly stopReason?: string;
}

/**
 * 把一条 DSH 回合事件派生成 v4 行操作。
 *
 * 规则（与合同 B11 一一对应）：
 *   - assistant 文本增量 → `assistantText` 行（`row.appended`；同回合内后续增量
 *     由投影层决定追加还是合并，本层只给操作种类）；
 *   - 工具调用 → `toolCall` 行；
 *   - 回合边界 → 不产出行，只标 `concludesTurn` 与原因。
 *
 * 其余事件（会话元数据、压缩检查点、目标、子 Agent 目录等）**不由本模块派生**：
 * 它们归 `kernel-bridge-01` 的既有投影规则，本包不重复造。
 *
 * @param event - 一条 DSH 会话事件的判别形状。
 * @param turnId - 该事件所属回合的标识。
 * @returns 派生结果；与本包无关的事件返回空行集。
 */
export function deriveTurnFrame(event: TurnEventShape, turnId: string): TurnDerivedFrame {
  // assistant 文本：有正文增量才产行，空增量不产（避免空行污染序号）。
  if (event.type === "assistant/delta" || event.type === "assistant/text") {
    if (event.textDelta === undefined || event.textDelta.length === 0) {
      return { rows: [], concludesTurn: false };
    }
    return {
      rows: [{ op: "row.appended", turnId, rowKind: "assistantText" }],
      concludesTurn: false,
    };
  }
  // 工具调用：产 toolCall 行。结果回填由投影层按 tool/result 事件处理，
  // 本层不在这里制造第二条「结果行」。
  if (event.type === "tool/call" || event.type === "tools/call") {
    return {
      rows: [{ op: "row.appended", turnId, rowKind: "toolCall" }],
      concludesTurn: false,
    };
  }
  // 回合边界：只标结束，不产行（TurnComplete 不是「行」）。
  if (event.type === "turn/end" || event.type === "turn/complete") {
    return { rows: [], concludesTurn: true, conclusionReason: conclusionOf(event.stopReason) };
  }
  return { rows: [], concludesTurn: false };
}

/**
 * 把 DSH 的停止原因翻成 v4 的回合结束原因。
 *
 * 只认三类（完成/取消/失败）；其余一律按 `completed`——
 * 那是「DSH 说这一回合结束了，但没有异常」的保守归属，不会把成功误标成失败。
 *
 * @param stopReason - DSH 事件上的原始原因。
 * @returns v4 的回合结束原因。
 */
function conclusionOf(stopReason: string | undefined): "completed" | "cancelled" | "failed" {
  if (stopReason === undefined) return "completed";
  const normalized = stopReason.toLowerCase();
  if (normalized.includes("abort") || normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("error") || normalized.includes("fail")) return "failed";
  return "completed";
}

/**
 * 判断一组派生行是否全部属于同一回合。
 *
 * B12 的派生层落点：序号单调依赖「同一帧里的行不跨回合」，跨回合的行必须拆成两帧。
 *
 * @param rows - 待检查的行。
 * @returns 是否同属一个回合；空集视为 true。
 */
export function rowsShareOneTurn(rows: readonly TurnDerivedRow[]): boolean {
  if (rows.length <= 1) return true;
  const [first] = rows;
  return rows.every((row) => row.turnId === first.turnId);
}

// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-03 B 组：队列操作 5 条命令（B6–B11）。
//
// 这是本包**风险最高**的一组，因为它要在两层之间保持原子一致：
//   - **身份层** `QueueLedger`：`queueItemId`（v4 对外身份）↔ `MessageId`（DSH 内部）
//   - **内容层** DSH `Inbox` 原语：`replace` / `remove` / `splice` / `prepend` / `clear`
//
// 三条不变量（合同 known-differences.md §五）：
//   1. `replace` / `remove` 的**布尔返回值是唯一权威**——返回 `false` 说明该项已被
//      drain 掉，映射必须跟着收敛，且命令按拒绝处理（不能静默成功）；
//   2. `order.queuePosition` 只数 `nextTurn`（U1 结论：`nextStep` 是 steer 通道，不进 order）；
//   3. `sendQueuedNow` 必须 `keepInbox: true`（否则 DSH 会丢弃**其余**排队项），
//      且必须**显式等 `agent/status` 变 idle**（DSH 的 cancel 不等待结算）。

import type { QueueEntry, QueueLedger } from "./queue-ledger.js";

/** 队列命令的失败原因（每种对应一个稳定 reasonCode）。 */
export const QUEUE_REASON = {
  /** 该项已不在队列（已被 drain 或删除）。 */
  notQueued: "guard.queueItemNotEditable",
  /** 该项已被提升流程占用（重复 `sendQueuedNow`）。 */
  reserved: "guard.queueItemReserved",
  /** 提升已开始但提交新回合失败：必须显式失败，不能谎报成功。 */
  promotionCommitFailed: "fault.command.queuePromotionCommitFailed",
  /** 提升所需的正文已不可得（投影里查不到）。 */
  textUnavailable: "fault.command.queueItemTextUnavailable",
} as const;

/** 队列命令的执行层终态。 */
export interface QueueOperationOutcome {
  readonly ok: boolean;
  readonly reasonCode?: string;
  readonly message?: string;
  /** 操作后的队列位次（1-based）；不在队里时为 0。 */
  readonly queuePosition?: number;
}

/**
 * 队列操作的宿主接口。
 *
 * 把 DSH 原语与「提升为新回合」的能力注入进来，让本模块**不直接依赖 DSH 类型**，
 * 也便于测试用替身验证「返回值权威」这条不变量。
 */
export interface QueueOperationHost {
  /** 取该会话的 DSH 收件箱原语；会话不在时 undefined。 */
  inboxFor(sessionId: string): QueueOperationHarness | undefined;
  /** 把一条队列项提升为立即执行的新回合输入（`sendQueuedNow` 用）。 */
  promoteToTurn?(sessionId: string, text: string): Promise<void>;
  /** 取消当前回合并等到真正 idle（`sendQueuedNow` 用）。 */
  cancelAndWaitIdle?(sessionId: string): Promise<void>;
}

/** DSH 原语的最小集合（与 `queue-ledger.ts` 的 `InboxPrimitives` 一致）。 */
export interface QueueOperationHarness {
  remove(messageId: string): boolean;
  replace(messageId: string, newMessage: unknown): boolean;
  splice(
    target: "next-turn" | "next-step",
    start: number,
    deleteCount: number,
    inserted: unknown[],
  ): unknown[];
  readonly nextTurn: readonly unknown[];
  readonly nextStep: readonly unknown[];
}

/**
 * `editQueueItem`：原位改文案（B6）。
 *
 * 关键：**位次不变**（原位替换，不是重新入队）；`replace` 返回 `false` → 拒绝。
 *
 * @param ledger - 该会话的身份账本。
 * @param host - 原语宿主。
 * @param sessionId - 会话标识。
 * @param queueItemId - 要改的队列项。
 * @param newText - 新文案。
 * @returns 操作结果。
 */
export function editQueueItem(
  ledger: QueueLedger,
  host: QueueOperationHost,
  sessionId: string,
  queueItemId: string,
  newText: string,
): QueueOperationOutcome {
  const entry = ledger.get(queueItemId);
  const harness = host.inboxFor(sessionId);
  if (entry === undefined || harness === undefined) {
    return { ok: false, reasonCode: QUEUE_REASON.notQueued };
  }
  const replaced = harness.replace(entry.messageId, newText);
  if (!replaced) {
    // DSH 说「已不在队列」→ 映射必须跟着收敛，命令按拒绝处理。
    // 这是「返回值是唯一权威」的落点：不能因为映射还在就报告成功。
    ledger.forget(queueItemId);
    return { ok: false, reasonCode: QUEUE_REASON.notQueued };
  }
  return { ok: true, queuePosition: ledger.positionOf(queueItemId) };
}

/**
 * `deleteQueueItem`：移除一项（B7）。
 *
 * 其余项的**相对位次不变**（`remove` 只删一个）。
 *
 * @param ledger - 身份账本。
 * @param host - 原语宿主。
 * @param sessionId - 会话标识。
 * @param queueItemId - 要删的项。
 * @returns 操作结果。
 */
export function deleteQueueItem(
  ledger: QueueLedger,
  host: QueueOperationHost,
  sessionId: string,
  queueItemId: string,
): QueueOperationOutcome {
  const entry = ledger.get(queueItemId);
  const harness = host.inboxFor(sessionId);
  if (entry === undefined || harness === undefined) {
    return { ok: false, reasonCode: QUEUE_REASON.notQueued };
  }
  const removed = harness.remove(entry.messageId);
  // 无论 DSH 说成功还是失败，映射都要收敛：那一项确实不在队里了。
  ledger.forget(queueItemId);
  return removed ? { ok: true } : { ok: false, reasonCode: QUEUE_REASON.notQueued };
}

/**
 * `reorderQueueItem`：调整位次（B8）。
 *
 * 实现为「先 remove 再 splice 到目标位次」；`beforeQueueItemId === null` → 队尾。
 * **要么全成功要么全不动**：目标项不在队里、或锚点项不在队里，都不做任何变更。
 *
 * @param ledger - 身份账本。
 * @param host - 原语宿主。
 * @param sessionId - 会话标识。
 * @param queueItemId - 要移动的项。
 * @param beforeQueueItemId - 移到该项之前；`null` 表示队尾。
 * @returns 操作结果。
 */
export function reorderQueueItem(
  ledger: QueueLedger,
  host: QueueOperationHost,
  sessionId: string,
  queueItemId: string,
  beforeQueueItemId: string | null,
): QueueOperationOutcome {
  const moving = ledger.get(queueItemId);
  const harness = host.inboxFor(sessionId);
  if (moving === undefined || harness === undefined) {
    return { ok: false, reasonCode: QUEUE_REASON.notQueued };
  }
  // 锚点必须存在（`null` = 队尾，是合法锚点）。
  if (beforeQueueItemId !== null && ledger.get(beforeQueueItemId) === undefined) {
    return { ok: false, reasonCode: QUEUE_REASON.notQueued };
  }
  // **取出原消息对象**：只有拿到它才能在 splice 时重新插回去。
  // 先前版本用空数组做 splice，等价于「只删不插」——项会消失，这是个真实缺陷。
  const list = harness[moving.target === "next-turn" ? "nextTurn" : "nextStep"];
  const index = list.findIndex((item) => messageIdOf(item) === moving.messageId);
  if (index < 0) {
    ledger.forget(queueItemId);
    return { ok: false, reasonCode: QUEUE_REASON.notQueued };
  }
  const [message] = list.slice(index, index + 1);
  // 计算插入位置：数 `nextTurn` 里排在锚点之前的项数；`null` → 队尾。
  const insertAt =
    beforeQueueItemId === null ? Number.MAX_SAFE_INTEGER : anchorIndex(ledger, beforeQueueItemId);
  // 先移除；失败就直接拒绝，**不做后续 splice**（保证「要么全动要么全不动」）。
  if (!harness.remove(moving.messageId)) {
    ledger.forget(queueItemId);
    return { ok: false, reasonCode: QUEUE_REASON.notQueued };
  }
  // 再插回：`splice(target, start, 0, [message])`。
  harness.splice(moving.target, insertAt === Number.MAX_SAFE_INTEGER ? -1 : insertAt, 0, [message]);
  return { ok: true, queuePosition: ledger.positionOf(queueItemId) };
}

/**
 * 从 DSH 队列里的一个元素取它的消息 id。
 *
 * DSH 的 `UserMessage` 有 `id` 字段；这里兼容「消息本身」与「带 message 包装」两种形态，
 * 避免因为调用方包装差异而取不到 id。
 *
 * @param item - 队列里的一个元素。
 * @returns 消息 id；取不到时返回空串（调用方会按「不在队里」处理）。
 */
function messageIdOf(item: unknown): string {
  if (typeof item !== "object" || item === null) return "";
  const direct = (item as { id?: unknown }).id;
  if (typeof direct === "string") return direct;
  const nested = (item as { message?: { id?: unknown } }).message?.id;
  return typeof nested === "string" ? nested : "";
}

/**
 * 数「`nextTurn` 里排在锚点之前的项数」，作为 splice 的插入位置。
 *
 * @param ledger - 身份账本。
 * @param anchorId - 锚点项。
 * @returns 0-based 插入位置；锚点不在时返回队尾。
 */
function anchorIndex(ledger: QueueLedger, anchorId: string): number {
  const position = ledger.positionOf(anchorId);
  return position === 0 ? Number.MAX_SAFE_INTEGER : position - 1;
}

/**
 * `sendQueuedNow`：立即发送队列项（B9）。
 *
 * **顺序与失败语义**（合同 known-differences.md §5.3 R5 + B9 的第 5/6 条）：
 * 1. 取该项与它的正文；正文不可得 → 拒绝；
 * 2. 标 reserved（防重复提升）；
 * 3. `cancelAndWaitIdle` —— **必须 `keepInbox: true` 并等 `agent/status` idle**；
 * 4. 从队列移除；
 * 5. 提交为新回合输入；
 * 6. 任何一步失败都要**显式失败**，不能谎报成功。
 *
 * @param ledger - 身份账本。
 * @param host - 原语宿主。
 * @param sessionId - 会话标识。
 * @param queueItemId - 要提升的项。
 * @param textOf - 从投影里查该队列项的正文；查不到返回 undefined。
 * @returns 操作结果。
 */
export async function sendQueuedNow(
  ledger: QueueLedger,
  host: QueueOperationHost,
  sessionId: string,
  queueItemId: string,
  textOf: (entry: QueueEntry) => string | undefined,
): Promise<QueueOperationOutcome> {
  const entry = ledger.get(queueItemId);
  const harness = host.inboxFor(sessionId);
  if (entry === undefined || harness === undefined) {
    return { ok: false, reasonCode: QUEUE_REASON.notQueued };
  }
  const text = textOf(entry);
  if (text === undefined) {
    // 正文不可得（已被 drain 或投影里查不到）→ 拒绝，不去猜内容。
    return { ok: false, reasonCode: QUEUE_REASON.textUnavailable };
  }
  if (host.cancelAndWaitIdle === undefined || host.promoteToTurn === undefined) {
    return {
      ok: false,
      reasonCode: QUEUE_REASON.promotionCommitFailed,
      message: "promotion not wired",
    };
  }
  // 取消当前回合并**等到真正 idle**：DSH 的 cancel 不等待结算，
  // 不等就会出现「新旧回合交错」（新输入在旧回合还没结束时提交）。
  await host.cancelAndWaitIdle(sessionId);
  const removed = harness.remove(entry.messageId);
  if (!removed) {
    ledger.forget(queueItemId);
    return { ok: false, reasonCode: QUEUE_REASON.notQueued };
  }
  try {
    await host.promoteToTurn(sessionId, text);
  } catch (error) {
    // **已移除但未提交成功**：这是「提升失败」而非「什么都没发生」，
    // 必须显式失败并写明原因（legacy 用 V4QueuePromotionCommitError 表达同一件事）。
    ledger.forget(queueItemId);
    return {
      ok: false,
      reasonCode: QUEUE_REASON.promotionCommitFailed,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  ledger.forget(queueItemId);
  return { ok: true };
}

/**
 * `setAutoDrain`：设置自动出队（B10）。
 *
 * DSH **没有** autoDrain 概念（实测零命中），所以这是**纯 v4 侧调度策略**，
 * 由身份层持有；不写进 DSH，也不改变任何排队项。
 *
 * @param state - 该会话的调度态（本模块不持有它，由调用方保存）。
 * @param autoDrain - 目标值。
 * @returns 新的调度态。
 */
export function setAutoDrain(
  state: { autoDrain: boolean },
  autoDrain: boolean,
): { autoDrain: boolean } {
  state.autoDrain = autoDrain;
  return state;
}

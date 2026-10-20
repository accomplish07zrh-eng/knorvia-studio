// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-03：**队列身份层**（v4 `queueItemId` ↔ DSH `MessageId`）。
//
// 为什么需要这一层（合同 known-differences.md §五 的结论）：
//   - DSH 的 `Inbox` **确实**暴露 `replace` / `remove` / `splice` / `prepend`，
//     所以它本来就是可编辑队列；但它是 **`nextTurn` + `nextStep` 两个列表**；
//   - v4 的队列是**一个线性序列**（`admissionSeq` + `queuePosition`，`queueItemId` 是身份）；
//   - 因此必须有权威映射，否则客户端看到的队列视图与 DSH 真实状态会分叉。
//
// **身份所有者**：`queueItemId` 只由本模块发号；DSH 的 `MessageId` 是**映射目标**，
// 不是对外身份。队列内容的实际变更调 DSH 的公开原语——不是「绕过 DSH」，
// 而是「DSH 提供原语、本层提供身份与顺序」。
//
// **`order` 只映射 `nextTurn`**（U1 结论）：`nextStep` 是 steer 通道（02 的 `guide` 用它，
// 语义是「并入当前回合」），不属于「排队等新回合」。

/** 队列项在 DSH 侧的目标列表。 */
export type QueueTarget = "next-turn" | "next-step";

/**
 * 一条队列项的权威记账。
 *
 * 它是**唯一的身份来源**：v4 的所有队列命令都用 `queueItemId` 寻址，
 * 而实际变更要落到 DSH 的 `messageId` 上。
 */
export interface QueueEntry {
  /** 对外身份（v4 `queueItemId`）。 */
  readonly queueItemId: string;
  /** DSH 侧目标列表。 */
  readonly target: QueueTarget;
  /** DSH 侧消息身份（`Inbox.replace` / `remove` 的入参）。 */
  readonly messageId: string;
}

/**
 * DSH `Inbox` 里本模块用到的原语（只声明**实际用到**的那部分）。
 *
 * 不直接 import DSH 类型是为了保持「只依赖公开形状」的边界。
 * 注意这里**没有列 `clear`**：身份层不整箱清空（那是 `sendQueuedNow`/关闭会话的职责，
 * 由执行器直接调 DSH 原语），所以接口只保留身份层真正调用的四个变更原语。
 */
export interface InboxPrimitives {
  readonly nextTurn: readonly { readonly id: string }[];
  readonly nextStep: readonly { readonly id: string }[];
  remove(messageId: string): boolean;
  replace(messageId: string, newMessage: unknown): boolean;
  prepend(target: QueueTarget, message: unknown): void;
  append(target: QueueTarget, message: unknown): void;
  splice(target: QueueTarget, start: number, deleteCount: number, inserted: unknown[]): unknown[];
}

/**
 * 每个会话的队列身份账本。
 *
 * 会话销毁时整本丢弃——不跨会话复用 `queueItemId`，避免「旧 id 命中新会话」。
 */
export class QueueLedger {
  private entries: Map<string, QueueEntry> = new Map();
  /** 发号器：单调递增，**不回收**（回收会让旧 id 被复用）。 */
  private nextSequence = 1;

  /**
   * 登记一条新入队的项。
   *
   * @param target - DSH 侧目标列表。
   * @param messageId - DSH 消息身份。
   * @returns 新发号的 v4 `queueItemId`。
   */
  register(target: QueueTarget, messageId: string): string {
    const queueItemId = `q${this.nextSequence}`;
    this.nextSequence += 1;
    this.entries.set(queueItemId, { queueItemId, target, messageId });
    return queueItemId;
  }

  /**
   * 按 v4 身份取记账号。
   *
   * @param queueItemId - v4 队列项身份。
   * @returns 记账号；不在队里时 undefined（= 已被 drain/删除）。
   */
  get(queueItemId: string): QueueEntry | undefined {
    return this.entries.get(queueItemId);
  }

  /**
   * 移除一条（drain/删除后调用）。
   *
   * @param queueItemId - v4 队列项身份。
   * @returns 被移除的记账号；不存在时 undefined。
   */
  forget(queueItemId: string): QueueEntry | undefined {
    const entry = this.entries.get(queueItemId);
    if (entry === undefined) return undefined;
    this.entries.delete(queueItemId);
    return entry;
  }

  /**
   * 当前队列的 `nextTurn` 位次（1-based）。
   *
   * **这是 v4 `order.queuePosition` 的唯一来源**：按登记顺序数，
   * 不读 DSH 的数组下标（那会把 `nextStep` 也算进来，与 U1 结论冲突）。
   *
   * @param queueItemId - v4 队列项身份。
   * @returns 1-based 位次；不在 `nextTurn` 里时 0。
   */
  positionOf(queueItemId: string): number {
    const turnItems = [...this.entries.values()].filter((entry) => entry.target === "next-turn");
    const index = turnItems.findIndex((entry) => entry.queueItemId === queueItemId);
    return index < 0 ? 0 : index + 1;
  }

  /** 当前 `nextTurn` 的项数（供断言与诊断）。 */
  get queueSize(): number {
    return [...this.entries.values()].filter((entry) => entry.target === "next-turn").length;
  }

  /**
   * 丢弃整本账（会话销毁时调用）。
   *
   * 为什么整本丢弃而不是逐项删：`queueItemId` 是**会话内**身份，会话没了身份就没有意义；
   * 逐项删会留下一个「空但还在」的账本，反而容易在会话 id 复用时串味。
   *
   * 用**重新赋值**而不是逐条删：一次性丢弃整本语义词更清楚，
   * 也避免「删到一半抛错留下半本」。
   */
  discardAll(): void {
    this.entries = new Map();
  }
}

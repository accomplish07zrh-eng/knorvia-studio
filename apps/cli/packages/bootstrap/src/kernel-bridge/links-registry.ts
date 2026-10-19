// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-01: 客户端链路注册与流控（合同 B12–B15）
//
// 职责：
// - 管理 desktop-continuous 与 web-remote-replayable 双客户端链路订阅。
// - 校验 clientMode 白名单（非法值拒绝）。
// - 追踪各订阅者的 delivery 水位与帧序号连续性。
// - 实施 connection flow 控制（saturated 暂停投递并在内存排队，drained 原序补发，不跳号不丢帧）。
//
// 桥不继承旧运行时的请求错误类型：协议边界只承诺「有错误码的 Error」，
// 由段 A 在出口把它编码成 NDJSON 的 {code,message,data}。桥自带的错误类型让
// 两个方向的代码都不再依赖 protocol 目录的实现细节。

import type {
  ConversationDelta,
  ConversationSnapshot,
  ConversationTopicWireFrame,
  SubscribeAck,
  TopicFrameDeliveryKind,
} from "@knorvia/shared/protocol-v4";
import type { BridgeClientMode, BridgeFlowState } from "./interface.js";

/**
 * 桥内协议错误。
 *
 * `code` 是桥自己的稳定字符串码（不是 wire 上的 JSON-RPC 数字码）：段 A 在 NDJSON
 * 出口把它映射成既有协议错误的数字码与 data，wire 上不出现新 code。用字符串是为了
 * 让桥的两个分段都不依赖 protocol 目录的枚举，也不会把数字码当业务分支。
 */
export class BridgeProtocolError extends Error {
  readonly code: string;
  readonly data?: unknown;

  constructor(code: string, message: string, data?: unknown) {
    super(message);
    this.name = "BridgeProtocolError";
    this.code = code;
    this.data = data;
  }
}

/** 参数边界错误（topic/clientMode/flow state 非法）：映射为既有 invalid params。 */
export const BRIDGE_INVALID_PARAMS = "proto.invalidParams";
/** 会话不在投影层注册：映射为既有 sessionNotFound。 */
export const BRIDGE_SESSION_NOT_FOUND = "proto.sessionNotFound";
/** 订阅不属于该 topic/connection：映射为既有 subscription notOwned。 */
export const BRIDGE_SUBSCRIPTION_NOT_OWNED = "fault.subscription.notOwned";

/** clientMode 是订阅期唯一的链路选择；非法值必须在建立任何订阅状态之前拒绝。 */
export function assertValidClientMode(mode: unknown): asserts mode is BridgeClientMode {
  if (mode !== "desktop-continuous" && mode !== "web-remote-replayable") {
    throw new BridgeProtocolError(BRIDGE_INVALID_PARAMS, `Invalid clientMode: ${String(mode)}`);
  }
}

export interface BridgeSubscription {
  readonly subscriptionId: string;
  readonly connectionId: string;
  readonly topic: string;
  readonly clientMode: BridgeClientMode;
  sentSeq: number;
  nextOrdinal: number;
}

export class LinksRegistry {
  private readonly subscriptions = new Map<string, BridgeSubscription>();
  private readonly subscriptionIdByConnection = new Map<string, string>();
  private readonly pausedConnections = new Set<string>();
  private readonly bufferedFrames = new Map<string, ConversationTopicWireFrame[]>();
  private nextSerial = 1;

  /**
   * 注册新订阅。
   *
   * clientMode 是订阅期唯一的链路选择，必须在建订阅前裁决：先落订阅再校验
   * 会在拒绝路径上留下半成品（连接被占、旧订阅被挤掉），客户端重试也拿不回旧链路。
   */
  registerSubscription(params: {
    readonly topic: string;
    readonly connectionId: string;
    readonly clientMode: BridgeClientMode;
    readonly logEpoch: string;
    readonly currentSeq: number;
    readonly isResumable: (baseSeq: number) => boolean;
    readonly base?: { readonly logEpoch: string; readonly seq: number };
  }): {
    readonly subscription: BridgeSubscription;
    readonly ack: SubscribeAck;
    readonly isResume: boolean;
  } {
    assertValidClientMode(params.clientMode);

    const previousId = this.subscriptionIdByConnection.get(params.connectionId);
    if (previousId !== undefined) {
      this.subscriptions.delete(previousId);
      // 旧订阅已被替换，它压在背压队列里的帧不能再补发：那属于一个已经不存在的
      // subscriptionId，客户端收到只会当成未知订阅丢弃，还会打乱新订阅的区间。
      this.dropBufferedFrames(previousId);
    }

    const subscriptionId = `sub-${params.logEpoch}-${this.nextSerial++}`;
    const base = params.base;
    const isResume =
      base !== undefined &&
      base.logEpoch === params.logEpoch &&
      params.isResumable(base.seq);

    const subscription: BridgeSubscription = {
      subscriptionId,
      connectionId: params.connectionId,
      topic: params.topic,
      clientMode: params.clientMode,
      sentSeq: isResume ? (base?.seq ?? 0) : 0,
      nextOrdinal: 1,
    };

    this.subscriptions.set(subscriptionId, subscription);
    this.subscriptionIdByConnection.set(params.connectionId, subscriptionId);

    const ack: SubscribeAck = {
      subscriptionId,
      mode: isResume ? "resume" : "snapshot",
      logEpoch: params.logEpoch,
    };

    return { subscription, ack, isResume };
  }

  /**
   * 获取指定订阅对象。
   */
  getSubscription(subscriptionId: string): BridgeSubscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * 获取某 topic 下的所有活跃订阅。
   */
  getSubscriptionsForTopic(topic: string): BridgeSubscription[] {
    const list: BridgeSubscription[] = [];
    for (const sub of this.subscriptions.values()) {
      if (sub.topic === topic) {
        list.push(sub);
      }
    }
    return list;
  }

  /**
   * 取消订阅（只释放该订阅，不影响同连接或同 topic 的其他订阅）。
   */
  removeSubscription(subscriptionId: string, connectionId?: string): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;
    if (connectionId !== undefined && sub.connectionId !== connectionId) {
      return false;
    }
    this.subscriptions.delete(subscriptionId);
    if (this.subscriptionIdByConnection.get(sub.connectionId) === subscriptionId) {
      this.subscriptionIdByConnection.delete(sub.connectionId);
    }
    this.dropBufferedFrames(subscriptionId);
    return true;
  }

  /**
   * 丢弃某订阅尚未投递的缓冲帧。
   *
   * resync 会按客户端 base 重建该订阅的交付起点，缓冲里那些旧帧属于被作废的
   * 区间；补发它们会让客户端看到重复或回退的序号。
   */
  discardBufferedFrames(subscriptionId: string): void {
    this.dropBufferedFrames(subscriptionId);
  }

  /** 释放全部订阅与背压缓冲；只在投影层 dispose 时调用。 */
  clear(): void {
    this.subscriptions.clear();
    this.subscriptionIdByConnection.clear();
    this.pausedConnections.clear();
    this.bufferedFrames.clear();
  }

  /** 从背压队列中剔除指定订阅的帧；队列空了就连 key 一起删。 */
  private dropBufferedFrames(subscriptionId: string): void {
    for (const [connectionId, queue] of this.bufferedFrames) {
      const remaining = queue.filter((wireFrame) => wireFrame.subscriptionId !== subscriptionId);
      if (remaining.length === 0) {
        this.bufferedFrames.delete(connectionId);
      } else if (remaining.length !== queue.length) {
        this.bufferedFrames.set(connectionId, remaining);
      }
    }
  }

  /**
   * 判断某个连接是否已被背压暂停。
   */
  isConnectionPaused(connectionId: string): boolean {
    return this.pausedConnections.has(connectionId);
  }

  /**
   * 将暂缓投递的 wire 帧排入该连接的 FIFO 缓冲区。
   */
  bufferFrame(connectionId: string, frame: ConversationTopicWireFrame): void {
    let queue = this.bufferedFrames.get(connectionId);
    if (!queue) {
      queue = [];
      this.bufferedFrames.set(connectionId, queue);
    }
    queue.push(frame);
  }

  /**
   * 设置链路 flow 背压状态。
   * - saturated: 标记暂停。
   * - drained: 解除暂停并返回排队等待发送的所有帧（原序）。
   * - closed: 解除暂停并清空缓冲区（既有语义：连接已断开，队列无处可去）。
   */
  setFlowState(
    connectionId: string,
    state: BridgeFlowState,
  ): ConversationTopicWireFrame[] | undefined {
    if (state === "saturated") {
      this.pausedConnections.add(connectionId);
      return undefined;
    }
    if (state === "drained") {
      this.pausedConnections.delete(connectionId);
      const queue = this.bufferedFrames.get(connectionId);
      this.bufferedFrames.delete(connectionId);
      return queue ?? [];
    }
    if (state === "closed") {
      this.pausedConnections.delete(connectionId);
      this.bufferedFrames.delete(connectionId);
      return undefined;
    }
    return undefined;
  }

  /**
   * 分配并自增 subscription 的下一逻辑帧序号与 frameId。
   */
  nextLogicalFrame(subscription: BridgeSubscription): {
    readonly logicalFrameId: string;
    readonly ordinal: number;
  } {
    const ordinal = subscription.nextOrdinal++;
    const logicalFrameId = `lframe-${subscription.subscriptionId}-${ordinal}`;
    return { logicalFrameId, ordinal };
  }

  /**
   * 构造物理 wire 帧（wireVersion=3, kind=complete）。
   *
   * 帧身份（logicalFrameId / ordinal）由本注册表分配，所以装配也放这里：
   * 两个 clientMode 必须产出逐字段相同的帧，装配只此一处，避免调用方各自拼装。
   */
  createWireFrame(
    subscription: BridgeSubscription,
    deliveryKind: TopicFrameDeliveryKind,
    frame: {
      readonly fromSeq: number;
      readonly toSeq: number;
      readonly payload:
        | { readonly kind: "snapshot"; readonly snapshot: ConversationSnapshot }
        | { readonly kind: "deltas"; readonly deltas: ConversationDelta[] };
    },
    sentAt: number,
  ): ConversationTopicWireFrame {
    const { logicalFrameId, ordinal } = this.nextLogicalFrame(subscription);
    return {
      wireVersion: 3,
      kind: "complete",
      deliveryKind,
      logicalFrameId,
      logicalFrameOrdinal: ordinal,
      topic: subscription.topic,
      subscriptionId: subscription.subscriptionId,
      frame: {
        topic: subscription.topic,
        subscriptionId: subscription.subscriptionId,
        fromSeq: frame.fromSeq,
        toSeq: frame.toSeq,
        sentAt,
        payload: frame.payload,
      },
    };
  }
}

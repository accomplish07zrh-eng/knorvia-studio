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

import type { RoutedTopicWireFrame, SubscribeAck } from "@knorvia/shared/protocol-v4";
import type { BridgeClientMode, BridgeFlowState } from "./interface.js";

/** JSON-RPC 风格的桥内错误：code 走协议错误码词表，data 只放可序列化的结构化细节。 */
export class BridgeProtocolError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "BridgeProtocolError";
    this.code = code;
    this.data = data;
  }
}

/** 桥在参数边界统一使用的内部错误码；与旧 v4 入口逐字一致，客户端无需新分支。 */
export const BRIDGE_INTERNAL_ERROR_CODE = -32603;

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
  private readonly bufferedFrames = new Map<string, RoutedTopicWireFrame[]>();
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
    if (
      params.clientMode !== "desktop-continuous" &&
      params.clientMode !== "web-remote-replayable"
    ) {
      throw new BridgeProtocolError(
        BRIDGE_INTERNAL_ERROR_CODE,
        `Invalid clientMode: ${String(params.clientMode)}`,
      );
    }

    const previousId = this.subscriptionIdByConnection.get(params.connectionId);
    if (previousId !== undefined) {
      this.subscriptions.delete(previousId);
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
    const queue = this.bufferedFrames.get(sub.connectionId);
    if (queue !== undefined) {
      const remaining = queue.filter(
        (wireFrame) => wireFrame.subscriptionId !== subscriptionId,
      );
      if (remaining.length === 0) {
        this.bufferedFrames.delete(sub.connectionId);
      } else {
        this.bufferedFrames.set(sub.connectionId, remaining);
      }
    }
    return true;
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
  bufferFrame(connectionId: string, frame: RoutedTopicWireFrame): void {
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
  ): RoutedTopicWireFrame[] | undefined {
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
}

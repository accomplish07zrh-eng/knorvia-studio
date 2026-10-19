/* eslint-disable max-lines -- 序号分配、revision 推进、订阅首帧与闸门投递必须在同一处原子演进：拆开后 (fromSeq,toSeq] 的连续性与 revision 单点推进就无法在类型层面互相约束。 */
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-01: 事件投影层编排（合同 B8–B15）
//
// 本文件只持有会话身份与序号水位，不描述状态形状：
// - seq：每个被投影的源事件占一个（0 delta 也占位），帧区间恒为 (fromSeq, toSeq]；
// - revision：只在用户可见状态真的变了才 +1，作为命令 CAS 的基准；
// - 双链路：两个 clientMode 共用同一份快照与同一批帧，差异只在投递与背压。
// 快照/配置/DSH 事件到 v4 行的翻译在 snapshot-materializer，订阅与缓冲在 links-registry。

import type {
  ConversationDelta,
  ConversationSnapshot,
  ConversationTopicWireFrame,
  StatePatch,
} from "@knorvia/shared/protocol-v4";
import {
  applyConversationDeltas,
  coalesceConversationDeltas,
  PROTOCOL_V4_LIMITS,
} from "@knorvia/shared/protocol-v4";
import type {
  BridgeConfigMutationInput,
  BridgeDeliveryKind,
  BridgeEventProjectionLayer,
  BridgeFlowControlRequest,
  BridgeIngestDshEventInput,
  BridgeInitSessionParams,
  BridgeProjectionLayerOptions,
  BridgeProjectionResult,
  BridgeResyncRequest,
  BridgeResyncResult,
  BridgeSessionState,
  BridgeSubscribeRequest,
  BridgeSubscribeResult,
  BridgeUnsubscribeRequest,
  BridgeWireFrameSink,
} from "./interface.js";
import {
  assertValidClientMode,
  bridgeInvalidParams,
  bridgeSessionNotFound,
  bridgeSubscriptionNotOwned,
  LinksRegistry,
  type BridgeSubscription,
} from "./links-registry.js";
import { SequenceWatermark } from "./sequence-watermark.js";
import {
  deriveAvailability,
  deriveInputRouting,
  DshEventProjector,
  SnapshotMaterializer,
  type EventProjection,
  type ProjectionCursor,
} from "./snapshot-materializer.js";

const SESSION_TOPIC_PREFIX = "conversation/";
/** 行窗口只保留尾部：客户端靠冷快照 + 增量重建，服务端不留全量历史。 */
const ROW_WINDOW_LIMIT = PROTOCOL_V4_LIMITS.snapshotTailWindowRows;

interface ManagedSession extends ProjectionCursor {
  readonly sessionId: string;
  /**
   * 日志纪元只生成一次。provisional 表示它来自「事件/订阅先到」的隐式建会话，
   * 段 A 随后用 initSession 给出的显式纪元可以覆盖它（此时还没有任何续传依赖它）。
   */
  logEpoch: string;
  provisionalEpoch: boolean;
  readonly watermark: SequenceWatermark;
  snapshot: ConversationSnapshot;
  revision: number;
  readonly usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
}

/**
 * 响应行必须先于 initial/resume 帧（合同 L7）：订阅/重连期间产生的帧先挂在闸门里，
 * 等段 A 写完响应、事件循环进入下一轮后再按原序下沉。
 */
type DeliveryGates = Map<string, ConversationTopicWireFrame[]>;

export class BridgeProjectionLayer implements BridgeEventProjectionLayer {
  private wireFrameSink: BridgeWireFrameSink | null = null;
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly links = new LinksRegistry();
  private readonly gates: DeliveryGates = new Map();
  private readonly createLogEpochFn: (sessionId: string) => string;
  private readonly nowFn: () => number;

  constructor(options?: BridgeProjectionLayerOptions) {
    this.wireFrameSink = options?.wireFrameSink ?? null;
    this.createLogEpochFn = options?.createLogEpoch ?? defaultLogEpoch;
    this.nowFn = options?.now ?? Date.now;
  }

  setWireFrameSink(sink: BridgeWireFrameSink): void {
    this.wireFrameSink = sink;
  }

  initSession(params: BridgeInitSessionParams): BridgeSessionState {
    const existing = this.sessions.get(params.sessionId);
    if (existing) {
      // 隐式建会话（事件/订阅先到）只能拿到临时纪元；initSession 带来的才是跨重启
      // 稳定的权威纪元，必须采纳，否则 A 持久化的纪元与 B 的永远对不上。
      // 若某客户端已经用临时纪元完成过订阅，它下次续传会 base 失配而回落 snapshot——
      // 合同 B10 允许这种降级，比纪元永久错接安全。
      if (existing.provisionalEpoch && params.logEpoch !== undefined) {
        existing.logEpoch = params.logEpoch;
        existing.provisionalEpoch = false;
        existing.snapshot = { ...existing.snapshot, logEpoch: params.logEpoch };
      }
      // 幂等：重复初始化不得重置日志纪元或清空已投影的行（重连/重放会重复调它）。
      return this.toSessionState(existing);
    }
    const session = this.createSession(params.sessionId, params.logEpoch, params.initialConfig);
    this.sessions.set(params.sessionId, session);
    return this.toSessionState(session);
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  getSessionState(sessionId: string): BridgeSessionState | undefined {
    const session = this.sessions.get(sessionId);
    return session ? this.toSessionState(session) : undefined;
  }

  getSnapshot(sessionId: string): ConversationSnapshot | undefined {
    const session = this.sessions.get(sessionId);
    return session ? this.currentSnapshot(session) : undefined;
  }

  ingestDshEvent(input: BridgeIngestDshEventInput): BridgeProjectionResult {
    const session = this.getOrCreateSession(input.sessionId);
    const { fromSeq, toSeq } = session.watermark.allocateNextRange();
    const projection = DshEventProjector.project(session.snapshot, session, input.event, toSeq);
    return this.publish(session, projection, fromSeq, toSeq);
  }

  applyConfigMutation(input: BridgeConfigMutationInput): BridgeProjectionResult {
    // 配置命令按定义作用于既有会话：为未知 id 造一个空会话会让后续事件挂到错误身份上。
    const session = this.requireSession(input.sessionId);
    const { fromSeq, toSeq } = session.watermark.allocateNextRange();
    const outcome = SnapshotMaterializer.applyConfigMutation(
      session.snapshot,
      input.mutation,
      session.revision,
    );
    // revision 只由 publishDeltas 推进：这里先落 config，避免两处各加一次。
    session.snapshot = {
      ...session.snapshot,
      config: outcome.nextConfig,
      inputRouting: deriveInputRouting(
        session.snapshot.control.phase,
        outcome.nextConfig.followupMode,
      ),
      seq: toSeq,
    };
    return this.publishDeltas(session, [...outcome.deltas], fromSeq, toSeq);
  }

  subscribe(request: BridgeSubscribeRequest): Promise<BridgeSubscribeResult> {
    // 校验必须先于任何订阅状态：非法 clientMode 不能挤掉同连接上的旧链路。
    assertValidClientMode(request.clientMode);
    // 订阅允许先于 initSession（段 A 的冷恢复可能先建链路再重放事件）：
    // 建一个草稿投影，A 随后 initSession 会复用同一份状态而不是覆盖它。
    const session = this.getOrCreateSession(this.parseSessionIdFromTopic(request.topic));
    const { subscription, ack, isResume } = this.links.registerSubscription({
      topic: request.topic,
      connectionId: request.connectionId,
      clientMode: request.clientMode,
      logEpoch: session.logEpoch,
      currentSeq: session.watermark.currentSeq,
      isResumable: (baseSeq) => session.watermark.isResumable(baseSeq),
      base: request.base,
    });

    // 同连接重订阅会替换旧订阅：旧闸门里的帧属于已作废的 subscriptionId，先丢掉。
    for (const gateId of this.gates.keys()) {
      if (!this.links.getSubscription(gateId)) this.gates.delete(gateId);
    }
    // 闸门要在建帧之前打开，否则首帧会抢在响应行前面写 stdout。
    this.gates.set(subscription.subscriptionId, []);
    this.sendSubscriptionFrames(session, subscription, isResume, request.base?.seq);
    this.releaseGateAfterResponse(subscription);
    return Promise.resolve({ ack });
  }

  resync(request: BridgeResyncRequest): Promise<BridgeResyncResult> {
    // resync 只对已建立的链路有意义：没有订阅就没有可重建的投递起点。
    const session = this.requireSession(this.parseSessionIdFromTopic(request.topic));
    const subscription = this.links.getSubscription(request.subscriptionId);
    if (
      !subscription ||
      subscription.topic !== request.topic ||
      subscription.connectionId !== request.connectionId
    ) {
      // 裸 subscriptionId 会跨 topic/connection 碰撞：三元组必须同时命中。
      throw bridgeSubscriptionNotOwned(request.subscriptionId);
    }

    const toSeq = session.watermark.currentSeq;
    // B11 把 resync 定义为「同一订阅上重建快照」，ack.mode 也只有 snapshot：
    // 这里不做 base 续传的捷径，否则客户端按 ack 替换状态却只收到增量。
    // 闸门与背压队列里可能还压着旧帧，先丢掉再按新水位对齐。
    this.gates.set(subscription.subscriptionId, []);
    this.links.discardBufferedFrames(subscription.subscriptionId);
    subscription.sentSeq = toSeq;
    this.emitWireFrame(subscription, "recovery", 0, toSeq, {
      kind: "snapshot",
      snapshot: this.wireSnapshot(session, toSeq),
    });
    this.releaseGateAfterResponse(subscription);

    return Promise.resolve({
      ack: { subscriptionId: request.subscriptionId, mode: "snapshot", logEpoch: session.logEpoch },
    });
  }

  unsubscribe(request: BridgeUnsubscribeRequest): void {
    // 退订是幂等清理：订阅已不存在（重复退订、断线后清理）不报错，
    // 但三元组不匹配时必须拒绝，否则会误删同 id 的其他会话链路。
    const subscription = this.links.getSubscription(request.subscriptionId);
    if (subscription) {
      if (subscription.topic !== request.topic) {
        throw bridgeSubscriptionNotOwned(request.subscriptionId);
      }
      if (subscription.connectionId !== request.connectionId) {
        throw bridgeSubscriptionNotOwned(request.subscriptionId);
      }
    }
    this.gates.delete(request.subscriptionId);
    this.links.removeSubscription(request.subscriptionId, request.connectionId);
  }

  setFlowControl(request: BridgeFlowControlRequest): void {
    const state = request.state;
    if (state !== "saturated" && state !== "drained" && state !== "closed") {
      throw bridgeInvalidParams(`Invalid flow state: ${String(state)}`);
    }
    const replayed = this.links.setFlowState(request.connectionId, state);
    if (!replayed) return;
    for (const wireFrame of replayed) {
      // 补发绕过闸门：这些帧本来就已产生，只是当时连接被暂停。
      this.wireFrameSink?.(wireFrame);
    }
  }

  disposeSession(sessionId: string): void {
    if (!this.sessions.delete(sessionId)) return;
    for (const subscription of this.links.getSubscriptionsForTopic(
      `${SESSION_TOPIC_PREFIX}${sessionId}`,
    )) {
      this.gates.delete(subscription.subscriptionId);
      this.links.removeSubscription(subscription.subscriptionId, subscription.connectionId);
    }
  }

  dispose(): void {
    this.sessions.clear();
    this.gates.clear();
    this.links.clear();
  }

  private createSession(
    sessionId: string,
    logEpoch: string | undefined,
    initialConfig: BridgeInitSessionParams["initialConfig"],
  ): ManagedSession {
    const epoch = logEpoch ?? this.createLogEpochFn(sessionId);
    return {
      sessionId,
      logEpoch: epoch,
      provisionalEpoch: logEpoch === undefined,
      watermark: new SequenceWatermark(sessionId),
      snapshot: SnapshotMaterializer.createDraftSnapshot(sessionId, epoch, initialConfig),
      revision: 0,
      nextRowId: 1,
      turn: null,
      toolRowIdByCallId: new Map(),
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  }

  /**
   * 事件是会话存在的证据：先到事件、后到 initSession 的顺序（冷恢复重放）不能丢事件，
   * 因此这里允许隐式建会话。logEpoch 只生成一次，之后 initSession 复用同一个值。
   */
  private getOrCreateSession(sessionId: string): ManagedSession {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const created = this.createSession(sessionId, undefined, undefined);
    this.sessions.set(sessionId, created);
    return created;
  }

  /**
   * resync 与配置命令必须命中已注册会话：resync 的语义是「在既有订阅上重建」，
   * 凭空造会话只会给客户端一份与真实状态无关的 logEpoch 和空行窗口。
   */
  private requireSession(sessionId: string): ManagedSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw bridgeSessionNotFound(sessionId);
    }
    return session;
  }

  private parseSessionIdFromTopic(topic: string): string {
    if (!topic.startsWith(SESSION_TOPIC_PREFIX) || topic.length === SESSION_TOPIC_PREFIX.length) {
      throw bridgeInvalidParams(`Invalid conversation topic: ${topic}`);
    }
    return topic.slice(SESSION_TOPIC_PREFIX.length);
  }

  private toSessionState(session: ManagedSession): BridgeSessionState {
    return {
      sessionId: session.sessionId,
      logEpoch: session.logEpoch,
      seq: session.watermark.currentSeq,
      revision: session.revision,
      phase: session.snapshot.control.phase,
      config: session.snapshot.config,
    };
  }

  private currentSnapshot(session: ManagedSession): ConversationSnapshot {
    return {
      ...session.snapshot,
      seq: session.watermark.currentSeq,
      revision: session.revision,
    };
  }

  private wireSnapshot(session: ManagedSession, toSeq: number): ConversationSnapshot {
    return SnapshotMaterializer.getWireSnapshot({
      ...session.snapshot,
      seq: toSeq,
      revision: session.revision,
    });
  }

  /** 订阅首帧：resume 补增量，其余一律发整份快照；两者都从调用方给的起点算区间。 */
  private sendSubscriptionFrames(
    session: ManagedSession,
    subscription: BridgeSubscription,
    isResume: boolean,
    baseSeq: number | undefined,
  ): void {
    const currentSeq = session.watermark.currentSeq;
    subscription.sentSeq = currentSeq;
    if (isResume && baseSeq !== undefined) {
      // base 正好等于水位时没有任何可补的增量：只回 resume ack，不发空帧。
      if (baseSeq >= currentSeq) return;
      // 续传帧是该订阅收到的第一帧，交付类别按首帧记 initial（与旧运行时一致）；
      // 它补的是 (base.seq, current] 的历史增量，不是「刚刚发生」的在线事件。
      this.emitWireFrame(subscription, "initial", baseSeq, currentSeq, {
        kind: "deltas",
        deltas: session.watermark.getReplayDeltas(baseSeq),
      });
      return;
    }
    this.emitWireFrame(subscription, "initial", 0, currentSeq, {
      kind: "snapshot",
      snapshot: this.wireSnapshot(session, currentSeq),
    });
  }

  /** 事件投影 → 完整 delta 列表（行增量 + state.updated），再交给统一的落账点。 */
  private publish(
    session: ManagedSession,
    projection: EventProjection,
    fromSeq: number,
    toSeq: number,
  ): BridgeProjectionResult {
    const deltas: ConversationDelta[] = [...projection.rowDeltas];
    const patch: StatePatch = { ...projection.patch };

    if (projection.control) {
      patch.control = projection.control;
      // 能力与输入路由都由控制面派生，随同一个 patch 下发，客户端不会读到半更新状态。
      patch.availability = deriveAvailability(
        projection.control.phase,
        // 同一批里刚追加的行也算进能力判定：turn/start 让会话第一次拥有行，
        // fork 必须立刻从「不可用」变为「可用」，不能等下一次事件。
        session.snapshot.rows.totalCount + countAppendedRows(projection.rowDeltas),
      );
      patch.inputRouting = deriveInputRouting(
        projection.control.phase,
        session.snapshot.config.followupMode,
      );
    }
    if (projection.usage) {
      session.usage.inputTokens += projection.usage.inputTokens;
      session.usage.outputTokens += projection.usage.outputTokens;
      session.usage.cacheReadTokens += projection.usage.cacheRead;
      session.usage.cacheWriteTokens += projection.usage.cacheWrite;
      patch.usage = {
        contextWindow: session.snapshot.usage.contextWindow,
        cumulative: { ...session.usage },
      };
    }
    if (Object.keys(patch).length > 0) deltas.push({ op: "state.updated", patch });
    return this.publishDeltas(session, deltas, fromSeq, toSeq);
  }

  /**
   * revision 的唯一推进点：只有真的产生 delta 才 +1；no-op 保持原值但仍占一个 seq。
   * 快照通过共享的 apply 函数归约，避免本文件再手写一份行窗口/总数逻辑。
   */
  private publishDeltas(
    session: ManagedSession,
    deltas: ConversationDelta[],
    fromSeq: number,
    toSeq: number,
  ): BridgeProjectionResult {
    if (deltas.length > 0) {
      session.revision += 1;
      // revision 是 CAS 基准，只挂在 state.updated 上；纯行增量补一个只带 revision 的 patch。
      const last = deltas[deltas.length - 1];
      if (last?.op === "state.updated") {
        deltas[deltas.length - 1] = {
          op: "state.updated",
          patch: { ...last.patch, revision: session.revision },
        };
      } else {
        deltas.push({ op: "state.updated", patch: { revision: session.revision } });
      }
    }

    const applied = applyConversationDeltas({ ...session.snapshot, seq: toSeq }, deltas);
    const window = applied.rows.window;
    session.snapshot = {
      ...applied,
      rows:
        window.length > ROW_WINDOW_LIMIT
          ? { ...applied.rows, window: window.slice(window.length - ROW_WINDOW_LIMIT) }
          : applied.rows,
      seq: toSeq,
      revision: session.revision,
    };
    session.watermark.recordDeltas(toSeq, deltas);
    this.broadcastDeltas(session, fromSeq, toSeq, deltas);
    return { sessionId: session.sessionId, fromSeq, toSeq, revision: session.revision, deltas };
  }

  private broadcastDeltas(
    session: ManagedSession,
    fromSeq: number,
    toSeq: number,
    deltas: readonly ConversationDelta[],
  ): void {
    const topic = `${SESSION_TOPIC_PREFIX}${session.sessionId}`;
    const subscriptions = this.links.getSubscriptionsForTopic(topic);
    if (subscriptions.length === 0) return;
    // 合并只在相邻 state.updated 之间发生；两个 profile 拿到的字节完全一致。
    const payload = deltas.length > 1 ? coalesceConversationDeltas([...deltas]) : [...deltas];
    for (const subscription of subscriptions) {
      const subFromSeq = subscription.sentSeq;
      subscription.sentSeq = toSeq;
      // 0 delta 事件也要发帧：客户端靠 (fromSeq,toSeq] 判断「这段没有可见变化」，
      // 少发一帧会让后续帧的起点对不上水位。
      this.emitWireFrame(subscription, "online", subFromSeq, toSeq, {
        kind: "deltas",
        deltas: payload,
      });
    }
  }

  private emitWireFrame(
    subscription: BridgeSubscription,
    deliveryKind: BridgeDeliveryKind,
    fromSeq: number,
    toSeq: number,
    payload:
      | { kind: "snapshot"; snapshot: ConversationSnapshot }
      | { kind: "deltas"; deltas: ConversationDelta[] },
  ): void {
    this.deliver(
      subscription,
      this.links.createWireFrame(
        subscription,
        deliveryKind,
        { fromSeq, toSeq, payload },
        this.nowFn(),
      ),
    );
  }

  /** 投递唯一出口：闸门 → 背压缓冲 → sink。顺序不能换，否则首帧会早于响应行。 */
  private deliver(subscription: BridgeSubscription, wireFrame: ConversationTopicWireFrame): void {
    const gate = this.gates.get(subscription.subscriptionId);
    if (gate) {
      gate.push(wireFrame);
      return;
    }
    if (this.links.isConnectionPaused(subscription.connectionId)) {
      this.links.bufferFrame(subscription.connectionId, wireFrame);
      return;
    }
    this.wireFrameSink?.(wireFrame);
  }

  /**
   * 响应行先于首帧：段 A 在 Promise 落定后写响应，因此帧要排到下一轮事件循环。
   * 用 setImmediate 而不是微任务，避免与同一 tick 里的响应写竞争。
   */
  private releaseGateAfterResponse(subscription: BridgeSubscription): void {
    const gate = this.gates.get(subscription.subscriptionId);
    setImmediate(() => {
      // 期间又发生一次 subscribe/resync：闸门已被新的一次替换，本次不再负责投递，
      // 否则会把新链路的帧提前放出去，抢在它自己的响应行之前。
      if (this.gates.get(subscription.subscriptionId) !== gate) return;
      this.gates.delete(subscription.subscriptionId);
      if (!gate || gate.length === 0) return;
      // 帧在闸门期间被 unsubscribe/dispose：直接丢弃，不能复活已删除的订阅。
      if (!this.links.getSubscription(subscription.subscriptionId)) return;
      for (const wireFrame of gate) this.deliver(subscription, wireFrame);
    });
  }
}

function countAppendedRows(deltas: readonly ConversationDelta[]): number {
  let count = 0;
  for (const delta of deltas) {
    if (delta.op === "row.appended") count += 1;
  }
  return count;
}

function defaultLogEpoch(sessionId: string): string {
  return `epoch_${sessionId}_${Date.now().toString(36)}`;
}

export function createBridgeEventProjectionLayer(
  options?: BridgeProjectionLayerOptions,
): BridgeEventProjectionLayer {
  return new BridgeProjectionLayer(options);
}

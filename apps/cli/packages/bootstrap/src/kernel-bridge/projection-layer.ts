// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-01: 事件投影层实现（合同 B8–B15）
//
// 职责：
// - 实现 BridgeEventProjectionLayer 接口，向段 A 提供会话生命周期与配置变更操作。
// - 统一协调 SequenceWatermark（序号水位）、SnapshotMaterializer（快照与 revision）与 LinksRegistry（双链路订阅与背压）。
// - 把 DSH 会话事件翻译成 v4 delta 词表，生成标准 v4 物理 wire 帧（wireVersion=3, complete），经 BridgeWireFrameSink 下发。
//
// 序号与 revision 是两套独立账本（L4/L5）：
// - seq 每个被投影的源事件 +1，即使投影结果是 0 个 delta（同值配置命令、log-only 事件）。
// - revision 只在用户可见状态真的变了才 +1，作为命令 CAS 的基准。

import type {
  ConversationDelta,
  ConversationSnapshot,
  RoutedTopicWireFrame,
  SessionConfigState,
  StatePatch,
  TopicFrameDeliveryKind,
} from "@knorvia/shared/protocol-v4";
import {
  applyConversationDeltas,
  coalesceConversationDeltas,
  PROTOCOL_V4_LIMITS,
} from "@knorvia/shared/protocol-v4";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import type {
  BridgeConfigMutationInput,
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
  BRIDGE_INTERNAL_ERROR_CODE,
  BridgeProtocolError,
  LinksRegistry,
  assertValidClientMode,
  type BridgeSubscription,
} from "./links-registry.js";
import { SequenceWatermark } from "./sequence-watermark.js";
import { SnapshotMaterializer } from "./snapshot-materializer.js";

const SESSION_TOPIC_PREFIX = "conversation/";
const TURN_ROW_ORIGIN = "userInput";
const STREAM_WINDOW_LIMIT = PROTOCOL_V4_LIMITS.snapshotTailWindowRows;

interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

interface ManagedSession {
  readonly sessionId: string;
  readonly logEpoch: string;
  readonly watermark: SequenceWatermark;
  snapshot: ConversationSnapshot;
  revision: number;
  nextRowId: number;
  currentTurnRowId: number | null;
  currentTurnId: string | null;
  currentTurnStartedAt: number | null;
  toolRowIdByCallId: Map<string, number>;
  usage: UsageTotals;
}

/** 单个事件投影出的可见变更：行增量 + 需要整体替换的 A 区字段。 */
interface EventProjection {
  readonly rowDeltas: ConversationDelta[];
  readonly patch: StatePatch;
}

function emptyProjection(): EventProjection {
  return { rowDeltas: [], patch: {} };
}

function hasVisibleChange(projection: EventProjection): boolean {
  return projection.rowDeltas.length > 0 || Object.keys(projection.patch).length > 0;
}

function textOfContent(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter((block): block is { type: string; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export class BridgeProjectionLayer implements BridgeEventProjectionLayer {
  private wireFrameSink: BridgeWireFrameSink | null = null;
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly links = new LinksRegistry();
  private readonly createLogEpochFn: (sessionId: string) => string;
  private readonly nowFn: () => number;
  /** 响应行必须先于 initial/resume 帧：订阅期间产生的帧先进闸门，响应写完后按序放行。 */
  private readonly deliveryGates = new Map<string, RoutedTopicWireFrame[]>();

  constructor(options?: BridgeProjectionLayerOptions) {
    if (options?.wireFrameSink) {
      this.wireFrameSink = options.wireFrameSink;
    }
    this.createLogEpochFn =
      options?.createLogEpoch ??
      ((sessionId: string) =>
        `epoch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
    this.nowFn = options?.now ?? Date.now;
  }

  setWireFrameSink(sink: BridgeWireFrameSink): void {
    this.wireFrameSink = sink;
  }

  initSession(params: BridgeInitSessionParams): BridgeSessionState {
    const existing = this.sessions.get(params.sessionId);
    if (existing) {
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
    if (!session) return undefined;
    return {
      ...session.snapshot,
      seq: session.watermark.currentSeq,
      revision: session.revision,
    };
  }

  ingestDshEvent(input: BridgeIngestDshEventInput): BridgeProjectionResult {
    const session = this.getOrCreateSession(input.sessionId);
    const { fromSeq, toSeq } = session.watermark.allocateNextRange();

    const projection = this.projectDshEvent(session, input.event, toSeq);
    const deltas = this.commitProjection(session, projection, toSeq);

    session.watermark.recordDeltas(toSeq, deltas);
    this.broadcastDeltas(session, fromSeq, toSeq, deltas);
    return { sessionId: input.sessionId, fromSeq, toSeq, revision: session.revision, deltas };
  }

  applyConfigMutation(input: BridgeConfigMutationInput): BridgeProjectionResult {
    const session = this.getOrCreateSession(input.sessionId);
    const { fromSeq, toSeq } = session.watermark.allocateNextRange();

    const outcome = SnapshotMaterializer.applyConfigMutation(
      session.snapshot,
      input.mutation,
      session.revision,
    );
    session.revision = outcome.revision;
    session.snapshot = {
      ...session.snapshot,
      config: outcome.nextConfig,
      seq: toSeq,
      revision: session.revision,
    };

    const deltas = [...outcome.deltas];
    session.watermark.recordDeltas(toSeq, deltas);
    this.broadcastDeltas(session, fromSeq, toSeq, deltas);
    return { sessionId: input.sessionId, fromSeq, toSeq, revision: session.revision, deltas };
  }

  subscribe(request: BridgeSubscribeRequest): Promise<BridgeSubscribeResult> {
    assertValidClientMode(request.clientMode);
    const sessionId = this.parseSessionIdFromTopic(request.topic);
    const session = this.getOrCreateSession(sessionId);

    const { subscription, ack, isResume } = this.links.registerSubscription({
      topic: request.topic,
      connectionId: request.connectionId,
      clientMode: request.clientMode,
      logEpoch: session.logEpoch,
      currentSeq: session.watermark.currentSeq,
      isResumable: (baseSeq) => session.watermark.isResumable(baseSeq),
      base: request.base,
    });

    // 闸门必须在建帧前打开：订阅调用期间产生的任何帧都要等响应行落盘后再发。
    this.deliveryGates.set(subscription.subscriptionId, []);
    this.sendSubscriptionFrames(session, subscription, isResume, request.base?.seq);
    this.releaseGateAfterResponse(subscription);
    return Promise.resolve({ ack });
  }

  resync(request: BridgeResyncRequest): Promise<BridgeResyncResult> {
    const session = this.sessions.get(this.parseSessionIdFromTopic(request.topic));
    if (!session) {
      throw new BridgeProtocolError(
        BRIDGE_INTERNAL_ERROR_CODE,
        `Session not found for resync: ${request.topic}`,
      );
    }

    const subscription = this.links.getSubscription(request.subscriptionId);
    if (
      !subscription ||
      subscription.topic !== request.topic ||
      subscription.connectionId !== request.connectionId
    ) {
      // 裸 subscriptionId 会跨 topic/connection 碰撞：必须三元组同时命中，否则会改到别人的链路。
      throw new BridgeProtocolError(
        BRIDGE_INTERNAL_ERROR_CODE,
        `Subscription not owned by topic/connection: ${request.subscriptionId}`,
      );
    }

    const base = request.base;
    const canResume =
      !request.forceSnapshot &&
      base !== undefined &&
      base.logEpoch === session.logEpoch &&
      session.watermark.isResumable(base.seq);

    this.deliveryGates.set(subscription.subscriptionId, []);
    if (canResume && base) {
      const toSeq = session.watermark.currentSeq;
      const replayDeltas =
        base.seq === toSeq ? [] : session.watermark.getReplayDeltas(base.seq);
      subscription.sentSeq = toSeq;
      if (base.seq !== toSeq) {
        this.emitWireFrame(subscription, "recovery", base.seq, toSeq, {
          kind: "deltas",
          deltas: replayDeltas,
        });
      }
    } else {
      const toSeq = session.watermark.currentSeq;
      subscription.sentSeq = toSeq;
      this.emitWireFrame(subscription, "recovery", 0, toSeq, {
        kind: "snapshot",
        snapshot: this.wireSnapshot(session, toSeq),
      });
    }
    this.releaseGateAfterResponse(subscription);

    return Promise.resolve({
      ack: {
        subscriptionId: request.subscriptionId,
        mode: "snapshot",
        logEpoch: session.logEpoch,
      },
    });
  }

  unsubscribe(request: BridgeUnsubscribeRequest): void {
    this.deliveryGates.delete(request.subscriptionId);
    this.links.removeSubscription(request.subscriptionId, request.connectionId);
  }

  setFlowControl(request: BridgeFlowControlRequest): void {
    const state = request.state;
    if (state !== "saturated" && state !== "drained" && state !== "closed") {
      throw new BridgeProtocolError(
        BRIDGE_INTERNAL_ERROR_CODE,
        `Invalid flow state: ${String(state)}`,
      );
    }
    const drainedFrames = this.links.setFlowState(request.connectionId, state);
    if (!drainedFrames || drainedFrames.length === 0) return;
    for (const wireFrame of drainedFrames) {
      // 补发走同一出口：连接可能已 closed，这里不再依赖 gate 状态。
      this.wireFrameSink?.(wireFrame);
    }
  }

  disposeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    if (!session) return;
    const topic = `${SESSION_TOPIC_PREFIX}${sessionId}`;
    for (const subscription of this.links.getSubscriptionsForTopic(topic)) {
      this.deliveryGates.delete(subscription.subscriptionId);
      this.links.removeSubscription(subscription.subscriptionId, subscription.connectionId);
    }
  }

  dispose(): void {
    this.sessions.clear();
    this.deliveryGates.clear();
  }

  private createSession(
    sessionId: string,
    logEpoch: string | undefined,
    initialConfig?: Partial<SessionConfigState>,
  ): ManagedSession {
    const epoch = logEpoch ?? this.createLogEpochFn(sessionId);
    return {
      sessionId,
      logEpoch: epoch,
      watermark: new SequenceWatermark(sessionId),
      snapshot: SnapshotMaterializer.createDraftSnapshot(sessionId, epoch, initialConfig),
      revision: 0,
      nextRowId: 1,
      currentTurnRowId: null,
      currentTurnId: null,
      currentTurnStartedAt: null,
      toolRowIdByCallId: new Map(),
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  }

  private getOrCreateSession(sessionId: string): ManagedSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createSession(sessionId, undefined);
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  private parseSessionIdFromTopic(topic: string): string {
    if (!topic.startsWith(SESSION_TOPIC_PREFIX) || topic.length <= SESSION_TOPIC_PREFIX.length) {
      throw new BridgeProtocolError(
        BRIDGE_INTERNAL_ERROR_CODE,
        `Invalid conversation topic: ${topic}`,
      );
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

  private wireSnapshot(session: ManagedSession, toSeq: number): ConversationSnapshot {
    return SnapshotMaterializer.getWireSnapshot({
      ...session.snapshot,
      seq: toSeq,
      revision: session.revision,
    });
  }

  private sendSubscriptionFrames(
    session: ManagedSession,
    subscription: BridgeSubscription,
    isResume: boolean,
    baseSeq: number | undefined,
  ): void {
    const currentSeq = session.watermark.currentSeq;
    if (isResume && baseSeq !== undefined) {
      if (baseSeq >= currentSeq) {
        subscription.sentSeq = currentSeq;
        return;
      }
      subscription.sentSeq = currentSeq;
      this.emitWireFrame(subscription, "initial", baseSeq, currentSeq, {
        kind: "deltas",
        deltas: session.watermark.getReplayDeltas(baseSeq),
      });
      return;
    }

    subscription.sentSeq = currentSeq;
    this.emitWireFrame(subscription, "initial", 0, currentSeq, {
      kind: "snapshot",
      snapshot: this.wireSnapshot(session, currentSeq),
    });
  }

  private broadcastDeltas(
    session: ManagedSession,
    fromSeq: number,
    toSeq: number,
    deltas: readonly ConversationDelta[],
  ): void {
    const topic = `${SESSION_TOPIC_PREFIX}${session.sessionId}`;
    for (const subscription of this.links.getSubscriptionsForTopic(topic)) {
      const subFromSeq = subscription.sentSeq;
      subscription.sentSeq = toSeq;
      // 空 delta 事件也要发帧：客户端靠 (fromSeq,toSeq] 判断「这一段没有可见变化」，
      // 少发一帧会让后续帧的起点对不上水位。
      this.emitWireFrame(subscription, "online", subFromSeq, toSeq, {
        kind: "deltas",
        deltas: coalesceConversationDeltas([...deltas]),
      });
    }
  }

  private emitWireFrame(
    subscription: BridgeSubscription,
    deliveryKind: TopicFrameDeliveryKind,
    fromSeq: number,
    toSeq: number,
    payload:
      | { readonly kind: "snapshot"; readonly snapshot: ConversationSnapshot }
      | { readonly kind: "deltas"; readonly deltas: ConversationDelta[] },
  ): void {
    const { logicalFrameId, ordinal } = this.links.nextLogicalFrame(subscription);
    const wireFrame: RoutedTopicWireFrame = {
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
        fromSeq,
        toSeq,
        sentAt: this.nowFn(),
        payload,
      },
    };
    this.deliver(subscription, wireFrame);
  }

  private deliver(subscription: BridgeSubscription, wireFrame: RoutedTopicWireFrame): void {
    const gate = this.deliveryGates.get(subscription.subscriptionId);
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
   * 响应行先于首帧是合同 L7 的硬约束。subscribe/resync 的 Promise 在返回后段 A 才写响应，
   * 因此帧必须晚于该微任务队列放行：用 setImmediate 保证响应已落 stdout。
   */
  private releaseGateAfterResponse(subscription: BridgeSubscription): void {
    setImmediate(() => {
      const frames = this.deliveryGates.get(subscription.subscriptionId);
      this.deliveryGates.delete(subscription.subscriptionId);
      if (!frames || frames.length === 0) return;
      if (!this.links.getSubscription(subscription.subscriptionId)) return;
      for (const wireFrame of frames) {
        this.deliver(subscription, wireFrame);
      }
    });
  }

  private commitProjection(
    session: ManagedSession,
    projection: EventProjection,
    toSeq: number,
  ): ConversationDelta[] {
    const deltas = [...projection.rowDeltas];
    if (hasVisibleChange(projection)) {
      session.revision += 1;
      deltas.push({
        op: "state.updated",
        patch: { ...projection.patch, revision: session.revision },
      });
    }
    session.snapshot = this.applyToSnapshot(session, deltas, toSeq);
    session.snapshot = {
      ...session.snapshot,
      seq: toSeq,
      revision: session.revision,
      usage: { ...session.snapshot.usage, cumulative: { ...session.usage } },
    };
    return deltas;
  }

  private applyToSnapshot(
    session: ManagedSession,
    deltas: readonly ConversationDelta[],
    toSeq: number,
  ): ConversationSnapshot {
    const applied = applyConversationDeltas({ ...session.snapshot, seq: toSeq }, deltas);
    const window = applied.rows.window;
    if (window.length <= STREAM_WINDOW_LIMIT) return applied;
    return {
      ...applied,
      rows: { ...applied.rows, window: window.slice(window.length - STREAM_WINDOW_LIMIT) },
    };
  }

  private appendRow(
    session: ManagedSession,
    toSeq: number,
    row: ConversationSnapshot["rows"]["window"][number],
  ): ConversationDelta {
    session.nextRowId += 1;
    return { op: "row.appended", row };
  }

  private nextRowId(session: ManagedSession): number {
    return session.nextRowId;
  }
}

export function createBridgeEventProjectionLayer(
  options?: BridgeProjectionLayerOptions,
): BridgeEventProjectionLayer {
  return new BridgeProjectionLayer(options);
}

// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-01 段 A / 段 B 协作接口定义（类型声明）
//
// 段 A（入口、wiring、CommandInbox、进程生命周期）
// 段 B（DSH 事件投影、序号、revision、快照、双链路订阅与背压）

import type { SessionEvent } from "@deepseek-ai/dsh-session";
import type {
  ConversationDelta,
  ConversationSnapshot,
  RoutedTopicWireFrame,
  SessionConfigState,
  SessionPhase,
  SubscribeAck,
} from "@knorvia/shared/protocol-v4";

/** 客户端链路类型 */
export type BridgeClientMode = "desktop-continuous" | "web-remote-replayable";

/** 链路流量背压状态 */
export type BridgeFlowState = "saturated" | "drained" | "closed";

/** 交付帧类型 */
export type BridgeDeliveryKind = "initial" | "online" | "recovery";

/**
 * 投影层维护的会话核心状态（供段 A 读取用于 CommandInbox CAS / base 校验）。
 */
export interface BridgeSessionState {
  readonly sessionId: string;
  readonly logEpoch: string;
  readonly seq: number;
  readonly revision: number;
  readonly phase: SessionPhase;
  readonly config: SessionConfigState;
}

/**
 * 段 A 初始化会话时传入投影层的参数。
 */
export interface BridgeInitSessionParams {
  readonly sessionId: string;
  readonly logEpoch?: string;
  readonly workspacePath?: string;
  readonly initialConfig?: Partial<SessionConfigState>;
}

/**
 * 段 A 将从 DSH session/event 监听到的事件输入投影层。
 */
export interface BridgeIngestDshEventInput {
  readonly sessionId: string;
  readonly event: SessionEvent;
}

/**
 * 段 A 将已通过 CommandInbox 校验的配置变更输入投影层。
 */
export interface BridgeConfigMutationInput {
  readonly sessionId: string;
  readonly commandId: string;
  readonly type: string;
  readonly mutation: {
    readonly followupMode?: "queue" | "guide";
    readonly planEnabled?: boolean;
    readonly mode?: string;
  };
  readonly baseRevision: number;
}

/**
 * v4/conversation/subscribe 请求参数。
 */
export interface BridgeSubscribeRequest {
  readonly topic: string;
  readonly connectionId: string;
  readonly clientMode: BridgeClientMode;
  readonly base?: {
    readonly logEpoch: string;
    readonly seq: number;
  };
  readonly workspace?: {
    readonly workspacePath: string;
    readonly workspaceKey?: string;
  };
  readonly visibility?: "foreground" | "background";
  readonly legacyTaskIds?: readonly string[];
  readonly resumeThoughtLevel?: string;
}

/**
 * v4/conversation/subscribe 处理结果。
 */
export interface BridgeSubscribeResult {
  readonly ack: SubscribeAck;
}

/**
 * v4/conversation/resync 请求参数。
 */
export interface BridgeResyncRequest {
  readonly topic: string;
  readonly connectionId: string;
  readonly subscriptionId: string;
  readonly base?: {
    readonly logEpoch: string;
    readonly seq: number;
  };
  readonly forceSnapshot?: boolean;
}

/**
 * v4/conversation/resync 处理结果。
 */
export interface BridgeResyncResult {
  readonly ack: {
    readonly subscriptionId: string;
    readonly mode: "snapshot";
    readonly logEpoch: string;
  };
}

/**
 * v4/conversation/unsubscribe 请求参数。
 */
export interface BridgeUnsubscribeRequest {
  readonly topic: string;
  readonly connectionId: string;
  readonly subscriptionId: string;
}

/**
 * v4/connection/flow 请求参数。
 */
export interface BridgeFlowControlRequest {
  readonly connectionId: string;
  readonly state: BridgeFlowState;
}

/**
 * 投影层生成 v4 物理 wire 帧后的下行回调汇（由段 A 注入并负责写回 transport / stdio）。
 */
export type BridgeWireFrameSink = (wireFrame: RoutedTopicWireFrame) => void;

/**
 * 事件投影结果。
 */
export interface BridgeProjectionResult {
  readonly sessionId: string;
  readonly fromSeq: number;
  readonly toSeq: number;
  readonly revision: number;
  readonly deltas: readonly ConversationDelta[];
}

/**
 * 投影层构造选项。
 */
export interface BridgeProjectionLayerOptions {
  readonly wireFrameSink?: BridgeWireFrameSink;
  readonly createLogEpoch?: (sessionId: string) => string;
  readonly now?: () => number;
}

/**
 * 事件投影层主接口（由段 B 实现，段 A 调用）。
 */
export interface BridgeEventProjectionLayer {
  /** 注册下行 wire 帧消费出口（stdio notification 输出） */
  setWireFrameSink(sink: BridgeWireFrameSink): void;

  /** 初始化一个新会话的投影状态（草稿形态：seq=0, revision=0, phase='draft'） */
  initSession(params: BridgeInitSessionParams): BridgeSessionState;

  /** 会话是否已在投影层注册 */
  hasSession(sessionId: string): boolean;

  /** 获取会话当前投影状态（用于 CAS revision 与 logEpoch 校验） */
  getSessionState(sessionId: string): BridgeSessionState | undefined;

  /** 获取会话当前快照 */
  getSnapshot(sessionId: string): ConversationSnapshot | undefined;

  /**
   * 摄入 DSH 产生的会话事件。
   * 为每个被投影的源事件分配单调连续 seq（+1）；
   * 投影为 0..N 个 delta；若可见状态变更则递增 revision；
   * 通过 sink 广播 online wire 帧给该会话的所有活跃订阅。
   */
  ingestDshEvent(input: BridgeIngestDshEventInput): BridgeProjectionResult;

  /**
   * 摄入配置变更命令（setFollowupMode / switchCollaborationMode 等）。
   * 占 1 个事件序号 seq；
   * 有效变更：递增 revision 并产生 delta；
   * 无效/同值变更（no-op）：保持 revision 不变，产生空 deltas 帧（占位 1 序号）；
   * 通过 sink 广播 online wire 帧。
   */
  applyConfigMutation(input: BridgeConfigMutationInput): BridgeProjectionResult;

  /**
   * 处理 v4/conversation/subscribe。
   * 校验 clientMode；
   * base 匹配则 mode='resume' 并发 resume 增量；否则 mode='snapshot' 并发 initial 快照帧；
   * 返回 SubscribeAck（帧在响应发出后投递）。
   */
  subscribe(request: BridgeSubscribeRequest): Promise<BridgeSubscribeResult>;

  /**
   * 处理 v4/conversation/resync。
   * forceSnapshot=true 或 base 失配时回落 snapshot 并在同一订阅上发送 recovery 快照帧。
   */
  resync(request: BridgeResyncRequest): Promise<BridgeResyncResult>;

  /**
   * 处理 v4/conversation/unsubscribe。
   * 取消指定订阅，不影响其他活跃链路。
   */
  unsubscribe(request: BridgeUnsubscribeRequest): void;

  /**
   * 处理 v4/connection/flow 背压控制。
   * saturated: 暂停该连接的帧投递并排队缓存；
   * drained: 按原始序号不丢帧补发；
   * closed: 释放该连接。
   */
  setFlowControl(request: BridgeFlowControlRequest): void;

  /** 销毁会话资源 */
  disposeSession?(sessionId: string): void;

  /** 销毁整个投影层 */
  dispose?(): Promise<void> | void;
}

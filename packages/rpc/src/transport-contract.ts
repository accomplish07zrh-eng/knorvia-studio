// SPDX-License-Identifier: Apache-2.0
// 传输层的接口声明面。
//
// 这些形状由 interface.md 冻结（`IMessagePassingProtocol`、`ISocket`、
// `ConnectionFlowControl`、`MessagePortLike` 等），签名逐字不可改。
// 单独成模块的理由：它们是「跨进程契约」而非本进程实现，
// 与 protocol.ts 里会演进的分帧/流控实现分开，改动边界更清楚。
import type { VSBuffer } from "./buffer.js";
import type { Event, IDisposable } from "./foundation.js";

/** 一条双向消息通道的最小面：发一帧、订阅收到的帧。 */
export interface IMessagePassingProtocol {
  send(payload: VSBuffer): void;
  readonly onMessage: Event<VSBuffer>;
  drain?(): Promise<void>;
}

/** 连接级流控状态：未确认字节数与饱和/排空事件。 */
export interface ConnectionFlowControl {
  readonly unacknowledgedBytes: number;
  readonly onSaturated: Event<void>;
  readonly onDrained: Event<void>;
}

/**
 * 流控状态的两个取值。
 *
 * 用「常量数组 + 派生联合」而不是直接写字面量联合：运行期需要一份可遍历的取值集合
 * 来校验控制对象（`FLOW_VALUES`），从同一份来源派生类型就不会出现「类型与校验表不一致」。
 */
export const FLOW_STATES = ["saturated", "drained"] as const;

export type MessagePortFlowState = (typeof FLOW_STATES)[number];

/**
 * MessagePort 上用于表达流控的控制对象。
 *
 * 恰好两个键：判别键与状态。多一个键就会被对端当成普通业务载荷，
 * 这是协议约定，不能扩展。
 */
export interface MessagePortFlowControl {
  __knorviaRpcControl: "connection-flow-v1";
  state: MessagePortFlowState;
}

/** MessagePort 上可能出现的两种载荷：业务字节或流控控制对象。 */
export type MessagePortPayload = MessagePortFlowControl | Uint8Array;

/** 底层 socket：数据/关闭/结束三种事件，加上背压与优雅关闭。 */
export interface ISocket extends IDisposable {
  onData: Event<VSBuffer>;
  onClose: Event<void>;
  onEnd: Event<void>;
  write(chunk: VSBuffer): void;
  end(): void;
  drain(): Promise<void>;
}

/** 结构化克隆的 MessagePort 最小面（浏览器与 worker_threads 共用）。 */
export interface MessagePortLike {
  addEventListener(type: "message", listener: (e: { data: MessagePortPayload }) => void): void;
  removeEventListener(type: "message", listener: (e: { data: MessagePortPayload }) => void): void;
  postMessage(message: MessagePortPayload): void;
  start(): void;
  close(): void;
}

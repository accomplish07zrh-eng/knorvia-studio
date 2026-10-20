// SPDX-License-Identifier: Apache-2.0
// 观测记录的对外形状与 sink 装配点。
//
// sink 是**模块级唯一可变状态**：整个进程只允许存在一个接收方（装配期设置一次）。
// 发出时读取当前 sink，而不是在构造中间件时捕获——这样后设置的 sink
// 对已经构造好的中间件同样生效（契约 B18 明确要求这一点）。
export type NetworkTransportKind = "http" | "websocket" | "rpc";

/** 一条网络观测记录；字段全部只读，sink 不应修改它。 */
export interface NetworkObservation {
  transport: NetworkTransportKind;
  interface: string;
  durationMs: number;
  ok: boolean;
  statusCode?: number;
  errorKind?: string;
  attempt?: number;
  dnsMs?: number;
  tcpMs?: number;
  tlsMs?: number;
  ttfbMs?: number;
  downloadMs?: number;
}

export type NetworkTelemetrySink = (observation: NetworkObservation) => void;

/** 当前 sink；`null` 表示未装配（此时记录被丢弃，不缓存）。 */
let activeSink: NetworkTelemetrySink | null = null;

/** 装配 sink；传 `null` 表示摘除。重复调用以后者为准。 */
export function setNetworkTelemetrySink(sink: NetworkTelemetrySink | null): void {
  activeSink = sink;
}

/**
 * 把一条记录交给当前 sink。
 *
 * 未装配时静默丢弃：观测是旁路能力，不该因为没有接收方而影响调用路径，
 * 也不该排队等接收方出现。
 */
export function emitNetworkTelemetryObservation(observation: NetworkObservation): void {
  activeSink?.(observation);
}

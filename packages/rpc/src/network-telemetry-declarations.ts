// SPDX-License-Identifier: Apache-2.0
// 网络观测的记录形状与 sink 类型（**纯类型声明，无运行期代码**）。
//
// 这些形状由 interface.md 冻结（`NetworkObservation` / `NetworkTelemetrySink` /
// `NetworkTransportKind` 属一级导出面），字段名与类型逐字不可改。
// 单独成文件是安全的：`network-telemetry-middleware.ts` 只以 `import type` 引用，
// type-only 导入会被打包器擦除，不触发 `middleware-owner-safety` 的依赖白名单断言。
//
// 依据：计划书 L580「兼容声明块集中放声明文件，运行时文件不内嵌大段兼容声明」。
export type NetworkTransportKind = "http" | "websocket" | "rpc";

/**
 * 一条网络观测记录；字段只读，sink 不应修改它。
 *
 * `errorKind` 在成功时**存在且为 `undefined`**（而不是省略该键）：
 * 订阅方按「键是否存在」区分「没有错误」与「字段未提供」时的行为不同。
 */
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

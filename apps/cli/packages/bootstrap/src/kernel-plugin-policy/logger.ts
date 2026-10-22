// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-policy：日志接口与空实现。
//
// 契约依据：specs/contracts/kernel-plugin-policy/interface.md §七、behavior.md B11
//
// 为什么自带一个最小接口而不是直接用 DSH 的 logger：本包需要能被纯离线测试装配，
// 而测试不该依赖 DSH 的日志设施。组合根把真实 logger 注入即可；缺省用 NOOP。

export interface KnorviaLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/** 缺省日志器：丢弃一切输出。测试与非交互装配用它。 */
export const NOOP_LOGGER: KnorviaLogger = Object.freeze({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

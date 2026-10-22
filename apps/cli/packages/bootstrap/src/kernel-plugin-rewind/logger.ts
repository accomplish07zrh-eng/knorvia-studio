// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind：日志接口与空实现。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/interface.md §一、behavior.md B1
//
// 与 kernel-plugin-policy 同形态：自带最小接口，便于纯离线测试装配；
// 组合根把真实 logger 注入即可，缺省用 NOOP。

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

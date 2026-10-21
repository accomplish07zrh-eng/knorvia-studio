// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-credentials：日志面（与内核 logger 同形）。
//
// 独立一层的原因：本包要注入到 provider 与请求模块，而这两处不该直接依赖
// `bootstrap/src/kernel/**`（那是 `kernel-dsh-builtins` 的范围，B8 反向断言会红）。
// 因此这里只声明**最小形状**，具体实现由插件入口从 `ctx.logger` 适配。
//
// 安全红线（S2/S3）：任何调用点都不得把凭据值放进 fields。

/** 最小日志面。字段值不得包含凭据。 */
export interface KnorviaLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/** 无操作 logger（测试与未注入时使用）。 */
export const NOOP_LOGGER: KnorviaLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

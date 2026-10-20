// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：日志适配。
//
// 两套日志面必须对上：
//   - 内核侧是 `KernelLogger`（`debug/info/warn/error(msg, fields?)`，只写 stderr）；
//   - 领域模块（plugins/skills/workflows）要的是 `@knorvia/contracts` 的 `Logger`
//     （多一个 `child(context)`，且 `error(msg, error?, context?)` 形态不同）。
// 这里是唯一转换点，避免在每个处理器里重复拼装。

import type { Logger, LogContext } from "@knorvia/contracts";
import { callKernelLogger, type KernelLogger } from "../../kernel/logger.js";

/** 把内核 logger 适配成领域模块认的 Logger。 */
export function domainLoggerOf(logger: KernelLogger, context: LogContext = {}): Logger {
  const scoped = { module: "bootstrap.kernel_bridge.legacy", ...context };
  return {
    debug: (message, fields) =>
      callKernelLogger(logger, "debug", message, { ...scoped, ...fields }),
    info: (message, fields) => callKernelLogger(logger, "info", message, { ...scoped, ...fields }),
    warn: (message, fields) => callKernelLogger(logger, "warn", message, { ...scoped, ...fields }),
    error: (message, error, fields) =>
      callKernelLogger(logger, "error", message, {
        ...scoped,
        ...fields,
        ...(error !== undefined ? { error: error.message } : {}),
      }),
    child: (childContext) => domainLoggerOf(logger, { ...scoped, ...childContext }),
  };
}

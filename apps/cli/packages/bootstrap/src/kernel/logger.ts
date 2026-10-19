// SPDX-License-Identifier: Apache-2.0
// 宿主 logger 端口与默认 stderr 实现；所有调用都经过安全边界，日志失败不影响内核。

export interface KernelLogger {
  debug(message: string, fields?: Readonly<Record<string, unknown>>): void;
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: string, fields?: Readonly<Record<string, unknown>>): void;
}

export type KernelLogLevel = keyof KernelLogger;

export function createStderrKernelLogger(stderr: NodeJS.WritableStream): KernelLogger {
  const write = (
    level: KernelLogLevel,
    message: string,
    fields?: Readonly<Record<string, unknown>>,
  ): void => {
    let suffix = "";
    if (fields !== undefined) {
      try {
        suffix = ` ${JSON.stringify(fields)}`;
      } catch {
        suffix = "";
      }
    }
    try {
      stderr.write(`[knorvia-kernel] ${level} ${message}${suffix}\n`);
    } catch {
      // 流已关闭时静默；日志不是内核的运行条件。
    }
  };

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}

export function callKernelLogger(
  logger: KernelLogger,
  level: KernelLogLevel,
  message: string,
  fields?: Readonly<Record<string, unknown>>,
): void {
  try {
    logger[level](message, fields);
  } catch {
    // B19：宿主 logger 抛错不得中断启动或关闭。
  }
}

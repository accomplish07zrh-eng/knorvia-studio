// SPDX-License-Identifier: Apache-2.0
// 宿主 logger 端口与默认 stderr 实现；所有调用都经过安全边界，日志失败不影响内核。

export interface KernelLogger {
  debug(msg: string, fields?: Readonly<Record<string, unknown>>): void;
  info(msg: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(msg: string, fields?: Readonly<Record<string, unknown>>): void;
  error(msg: string, fields?: Readonly<Record<string, unknown>>): void;
}

type KernelLogLevel = keyof KernelLogger;

function ignoreFailure(action: () => void): void {
  try {
    action();
  } catch {
    // 调用方已判定失败可忽略；这里不记录异常内容。
  }
}

function formatFields(fields: Readonly<Record<string, unknown>> | undefined): string {
  if (fields === undefined) return "";
  let rendered = "";
  ignoreFailure(() => {
    rendered = ` ${JSON.stringify(fields)}`;
  });
  return rendered;
}

export function createStderrKernelLogger(stderr: NodeJS.WritableStream): KernelLogger {
  const emit = (
    level: KernelLogLevel,
    msg: string,
    fields?: Readonly<Record<string, unknown>>,
  ): void => {
    const line = `[knorvia-kernel] ${level} ${msg}${formatFields(fields)}\n`;
    ignoreFailure(() => stderr.write(line));
  };
  const logger: KernelLogger = {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  };
  return logger;
}

export function callKernelLogger(
  logger: KernelLogger,
  level: KernelLogLevel,
  msg: string,
  fields?: Readonly<Record<string, unknown>>,
): void {
  // B19：宿主 logger 抛错不得中断启动或关闭。
  ignoreFailure(() => logger[level](msg, fields));
}

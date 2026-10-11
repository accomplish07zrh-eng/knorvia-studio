// SPDX-License-Identifier: Apache-2.0
// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。
// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。

export class DefaultLogRedactor {
  constructor(..._args: never[]) {
    throw new Error("not implemented: apps-cli-packages-01");
  }
}

export function stripReservedContext(context: LogContext): Record<string, unknown> | undefined {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function toSerializableEntry(entry: LogEntry, redactor: LogRedactor): SerializableLogEntry {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function formatConsoleLine(entry: LogEntry): string {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function isLogStatus(value: unknown): value is LogEntry["status"] {
  throw new Error("not implemented: apps-cli-packages-01");
}

export function serializeLogError(
  error: unknown,
  includeStack: boolean,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): SerializedLogError {
  throw new Error("not implemented: apps-cli-packages-01");
}

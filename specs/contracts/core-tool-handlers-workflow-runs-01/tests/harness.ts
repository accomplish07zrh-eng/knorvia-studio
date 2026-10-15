// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-workflow-runs-01 测试共享件：端口替身（事件序列记录 + gate 握手）。
// 时序断言用微任务握手（deferred），无 sleep、无固定超时；所有断言对象是契约形状。
import assert from "node:assert/strict";

/** gate 握手：让端口替身在被调用后、返回前可被测试挂起/放行（微任务级，无 sleep）。 */
export function gate(): { open: () => void; opened: Promise<void> } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

export interface CallRecord {
  method: string;
  args: unknown[];
}

export interface PortRecorder {
  calls: CallRecord[];
  port: Record<string, unknown>;
}

/** 构造带调用记录的端口替身；methods 里每个键是一个端口方法的实现。 */
export function makePort(methods: Record<string, (...args: unknown[]) => unknown>): PortRecorder {
  const calls: CallRecord[] = [];
  const port: Record<string, unknown> = {};
  for (const [method, impl] of Object.entries(methods)) {
    port[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return impl(...args);
    };
  }
  return { calls, port };
}

export function callsOf(recorder: PortRecorder, method: string): CallRecord[] {
  return recorder.calls.filter((call) => call.method === method);
}

export function makeContext(port: Record<string, unknown> | undefined, workingDirectory = "/proj") {
  return { dynamicWorkflowRunPort: port, workingDirectory } as never;
}

export function assertCallSequence(recorder: PortRecorder, expected: string[]): void {
  assert.deepEqual(
    recorder.calls.map((call) => call.method),
    expected,
    "port call sequence",
  );
}

export function failureMessage(result: unknown): string {
  return String((result as { message?: unknown }).message ?? "");
}

export function failureCode(result: unknown): number {
  return Number((result as { errorCode?: unknown }).errorCode ?? -1);
}

export function isFailure(result: unknown): boolean {
  return (result as { result?: unknown }).result === false;
}

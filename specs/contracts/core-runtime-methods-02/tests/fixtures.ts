// SPDX-License-Identifier: Apache-2.0
// 测试底盘：journal 记录 + gate 握手的 fake runtime。事件序列断言（S1–S5）以 journal 顺序为真值，
// 推进全靠 gate 握手（不 sleep、不设固定超时）。时间取样走可注入 clock，金样录制时符号化。
import assert from "node:assert/strict";
import { createMessageId, TurnMachineImpl } from "../../../../apps/cli/packages/core/src/deps.js";
import type {
  SessionEvent,
  TraceContext,
  TurnId,
} from "../../../../apps/cli/packages/core/src/deps.js";

/** 日志记号。 */
export type JournalMark = { kind: string; [key: string]: unknown };

/** 可注入时钟（金样符号化用：`t0/t1/...` 记号）。 */
export interface FakeClock {
  /** 当前毫秒。 */
  now(): number;
  /** 推进毫秒。 */
  advance(ms: number): void;
}

export const createFakeClock = (start = 1000): FakeClock => {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
};

/** gate：一拍一放行；断言方在下游 await 放行前检查 journal。 */
export interface Gate {
  /** 等待放行。 */
  wait(): Promise<void>;
  /** 放行下一拍。 */
  open(): void;
  /** 当前拍号。 */
  readonly tick: number;
}

export const createGate = (): Gate => {
  const state = { tick: 0 };
  const pending: Array<() => void> = [];
  const gate: Gate = {
    get tick() {
      return state.tick;
    },
    wait: () =>
      new Promise<void>((resolve) => {
        pending.push(resolve);
      }),
    open: () => {
      state.tick += 1;
      pending.shift()?.();
    },
  };
  return gate;
};

/** journal：有序记录全部观察（事件 append、分部、账本、日志、machine 接纳）。 */
export class Journal {
  readonly marks: JournalMark[] = [];
  /** 记一条。 */
  add(mark: JournalMark): void {
    this.marks.push(mark);
  }
  /** 取某 kind 的记号序列。 */
  ofKind(kind: string): JournalMark[] {
    return this.marks.filter((mark) => mark.kind === kind);
  }
  /** 当前记号种类序列（断言次序用）。 */
  kinds(): string[] {
    return this.marks.map((mark) => mark.kind);
  }
  /** 断言某次序是 journal kinds 的子序列。 */
  assertSubsequence(expected: readonly string[]): void {
    const actual = this.kinds();
    let cursor = 0;
    for (const want of expected) {
      const found = actual.indexOf(want, cursor);
      assert.ok(found >= 0, `journal 缺少次序记号 ${want}（已过 ${cursor}）`);
      cursor = found + 1;
    }
  }
}

/** fake runtime 端口面（只声明 slice 用到的成员）。 */
export interface FakeRuntimePorts {
  sessionId: string;
  turnNumber: number;
  config: Record<string, unknown>;
  logger?: { debug: (m: string, f: Record<string, unknown>) => void; info: (m: string, f: Record<string, unknown>) => void; warn: (m: string, f: Record<string, unknown>) => void };
  events?: unknown[];
  journal: Journal;
  clock: FakeClock;
  [key: string]: unknown;
}

/** 构造 fake runtime：slice 面全覆盖，journal 全记。 */
export const createFakeRuntime = (options: {
  clock: FakeClock;
  journal: Journal;
  config?: Record<string, unknown>;
}): FakeRuntimePorts => {
  const { clock, journal } = options;
  const runtime: FakeRuntimePorts = {
    sessionId: "session_test",
    turnNumber: 1,
    config: {
      taskType: "interactive",
      agentName: "agent",
      mode: "build",
      modelContextBudgetStrategy: "reserve_output",
      modelAnomalyGuard: {},
      compact: { enabled: true },
      ...options.config,
    },
    journal,
    clock,
    logger: {
      debug: (message, fields) => journal.add({ kind: "log.debug", message, ...fields }),
      info: (message, fields) => journal.add({ kind: "log.info", message, ...fields }),
      warn: (message, fields) => journal.add({ kind: "log.warn", message, ...fields }),
    },
    createEvent: (type: unknown, payload: unknown) => {
      journal.add({ kind: "create.event", type, payload });
      return {
        id: `event_${journal.marks.length}`,
        type,
        payload,
        timestamp: new Date(clock.now()),
        sessionId: "session_test",
      };
    },
    appendEvent: async (event: unknown) => {
      journal.add({ kind: "append.event", type: (event as SessionEvent).type });
    },
    persistAssistantMessage: async (messageId: unknown) => {
      journal.add({ kind: "persist.assistant", messageId });
    },
    persistPart: async (part: unknown) => {
      journal.add({ kind: "persist.part", part });
    },
  };
  return runtime;
};

/** 建 trace（合成、无真实数据）。 */
export const fakeTrace = (turnId = "turn_test"): TraceContext =>
  ({
    traceId: "trace_test",
    turnId: turnId as TurnId,
    spanId: "span_test",
    queryId: "query_test",
  }) as unknown as TraceContext;

/** 建消息 id。 */
export const newMessageId = () => createMessageId();

/** 初始 machine。 */
export const initialMachine = (state: unknown) =>
  new TurnMachineImpl(TurnMachineImpl.create("session_test", 1, state, "trace_test", "turn_test" as TurnId).start());

/** 断言 journal 中的账本状态序（tool_call_closed → tool_queued → tool_started →
 * tool_result_committed）；gate 握手样式，无 sleep。 */
export function assertLedgerStatusOrder(journal: Journal, toolCallId: string): void {
  const statuses = journal
    .ofKind("ledger")
    .filter((mark) => mark.toolCallId === toolCallId)
    .map((mark) => mark.status);
  const expected = ["tool_call_closed", "tool_queued", "tool_started", "tool_result_committed"];
  assert.deepEqual(statuses, expected, `工具 ${toolCallId} 账本状态序不符`);
}

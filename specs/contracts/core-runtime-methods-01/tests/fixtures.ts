// SPDX-License-Identifier: Apache-2.0
// core-runtime-methods-01 契约测试夹具：内存化的运行时端口面（事件、分部持久化、工具调度/执行、
// 注册表、日志器）。所有端口调用按发生顺序记入 journal，事件序列断言直接比对 journal；
// 并发交错用 deferred gate 握手制造，没有 sleep、没有固定超时。夹具里没有真实用户数据、
// 凭据与内部地址。
import { fileURLToPath } from "node:url";

export const methodsRepoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

type LogRecord = { context: unknown[]; level: string; message: string };

export type Logger = {
  records: LogRecord[];
} & Record<string, (...args: unknown[]) => void>;

/** 收集全部日志调用，按调用顺序返回。 */
export function createLogger(): Logger {
  const records: LogRecord[] = [];
  const logger = { records } as Logger;
  for (const level of ["debug", "info", "warn", "error"] as const) {
    logger[level] = (message: string, ...rest: unknown[]) => {
      records.push({ context: rest, level, message: String(message) });
    };
  }
  return logger;
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

/** 显式放行的握手点：测试决定何时 resolve，从而制造可控交错。 */
export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Journal = string[];
type EventLike = { payload?: Record<string, unknown>; type: string };
type PartLike = {
  state?: { status?: string };
  text?: string;
  type: string;
};

export type RegistryEntry = {
  metadata: {
    concurrentSafe: boolean;
    destructive: boolean;
    needsApproval: boolean;
    readOnly: boolean;
    requiresUserInteraction?: boolean;
    sideEffectScope: string;
    mcpPresentation?: unknown;
  };
  permission?: { sideEffectScope?: string };
  requiresUserInteraction?: boolean;
};

export type ToolResultLike = {
  completedAt: Date;
  durationMs: number;
  error?: { message: string; type: string };
  modelContent?: string;
  output: unknown;
  startedAt: Date;
  success: boolean;
  toolCallId: string;
  toolName: string;
};

export type ExecutionGate = {
  close(): void;
  /** 执行已挂起在该 gate 上时放行（确定性交错的前提）。 */
  reached: Promise<void>;
};

export type FakeMethodsRuntime = {
  appended: EventLike[];
  assistantMessages: { args: unknown[] }[];
  executionGates: Map<string, { reached: Deferred<void>; release: Deferred<void> }>;
  journal: Journal;
  logger: Logger;
  parts: PartLike[];
  registryEntries: Map<string, RegistryEntry>;
  runtime: Record<string, (...args: never[]) => unknown>;
  scheduledBatches: string[][];
  /** 让下一次 appendEvent 挂起，用于观察并发进入/完成顺序。 */
  gateNextAppend(): { close(): void };
  /** 挂起某个工具调用的 executeTools 返回，制造完成顺序交错。 */
  gateExecution(toolCallId: string): ExecutionGate;
  /** 让下一次 appendEvent 以给定原因失败（错误冒泡断言用）。 */
  failNextAppend(reason?: unknown): void;
  /** 让下一次 executeTools 以给定原因失败（流中执行降级断言用）。 */
  failNextExecution(reason?: unknown): void;
};

/**
 * 最小运行时端口面：createEvent 只做包装；appendEvent / persistPart / persistAssistantMessage /
 * scheduleTools / executeTools 都按调用顺序写 journal，返回值可被 gate 控制。
 */
export function createMethodsRuntime(): FakeMethodsRuntime {
  const journal: Journal = [];
  const appended: EventLike[] = [];
  const parts: PartLike[] = [];
  const assistantMessages: { args: unknown[] }[] = [];
  const scheduledBatches: string[][] = [];
  const executionGates = new Map<string, { reached: Deferred<void>; release: Deferred<void> }>();
  const logger = createLogger();
  const registryEntries = new Map<string, RegistryEntry>();
  let appendGate: { promise: Promise<void>; close(): void } | undefined;
  let appendFailure: unknown;
  let executionFailure: unknown;

  const label = (event: EventLike): string => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const detail =
      typeof payload.status === "string"
        ? payload.status
        : typeof payload.kind === "string"
          ? payload.kind
          : typeof payload.error === "object" && payload.error !== null
            ? String((payload.error as { type?: string }).type ?? "error")
            : String(payload.toolCallId ?? "");
    return `${String(event.type)}${detail ? `:${detail}` : ""}`;
  };

  const runtime = {
    appendEvent(event: EventLike) {
      const name = label(event);
      journal.push(`enter:${name}`);
      if (appendFailure !== undefined) {
        const reason = appendFailure;
        appendFailure = undefined;
        journal.push(`failed:${name}`);
        return Promise.reject(reason);
      }
      const pending = appendGate;
      appendGate = undefined;
      const finish = () => {
        appended.push(event);
        journal.push(`exit:${name}`);
        return event;
      };
      return pending ? pending.promise.then(finish) : Promise.resolve(finish());
    },
    async emitFileMutationCheckpoint() {
      journal.push("fileMutationCheckpoint");
      return undefined;
    },
    async emitToolScheduledEvents(tools: { id: string }[]) {
      const ids = tools.map((tool) => tool.id).join(",");
      journal.push(`toolScheduled:${ids}`);
      return [];
    },
    async executeTools(
      tools: { id: string; name: string }[],
      _schedule: unknown,
      options: { onBatchStart?: (ids: string[]) => Promise<void> | void },
    ) {
      const ids = tools.map((tool) => tool.id).join(",");
      journal.push(`enter:executeTools:${ids}`);
      if (executionFailure !== undefined) {
        const reason = executionFailure;
        executionFailure = undefined;
        journal.push(`failed:executeTools:${ids}`);
        throw reason;
      }
      await options.onBatchStart?.(tools.map((tool) => tool.id));
      const results: ToolResultLike[] = [];
      for (const tool of tools) {
        const gate = executionGates.get(tool.id);
        if (gate) {
          gate.reached.resolve();
          await gate.release.promise;
        }
        const now = new Date();
        results.push({
          completedAt: now,
          durationMs: 1,
          output: `output:${tool.name}`,
          startedAt: now,
          success: true,
          toolCallId: tool.id,
          toolName: tool.name,
        });
      }
      journal.push(`exit:executeTools:${ids}`);
      return { events: [], results };
    },
    messageHistory: {
      addEntries(entries: unknown[]) {
        journal.push(`historyEntries:${entries.length}`);
      },
      getMessageCount() {
        return 0;
      },
    },
    async persistAssistantMessage(...args: unknown[]) {
      assistantMessages.push({ args });
      journal.push("persistAssistantMessage");
      return undefined;
    },
    async persistPart(part: PartLike) {
      parts.push(part);
      const detail = part.state?.status ?? (part.text ? "text" : "content");
      journal.push(`persist:${part.type}:${detail}`);
      return undefined;
    },
    registry: {
      get(name: string) {
        return registryEntries.get(name);
      },
      getMetadata(name: string) {
        return registryEntries.get(name)?.metadata;
      },
    },
    async scheduleTools(tools: { id: string; name: string }[]) {
      const ids = tools.map((tool) => tool.id).join(",");
      scheduledBatches.push(tools.map((tool) => tool.id));
      journal.push(`scheduleTools:${ids}`);
      return { ids };
    },
    sessionId: "session-contract-0001",
    toScheduleState(schedule: unknown) {
      return schedule;
    },
    createEvent(type: string, payload: unknown) {
      return { payload: payload as Record<string, unknown>, type };
    },
    config: {
      modelStreaming: "on",
      streamingToolExecution: undefined as string | undefined,
    },
    logger,
  };

  return {
    appended,
    assistantMessages,
    executionGates,
    journal,
    logger,
    parts,
    registryEntries,
    runtime: runtime as unknown as Record<string, (...args: never[]) => unknown>,
    scheduledBatches,
    gateNextAppend() {
      let close = () => undefined;
      const promise = new Promise<void>((done) => {
        close = () => done();
      });
      appendGate = { close, promise };
      return { close };
    },
    gateExecution(toolCallId: string) {
      const release = deferred();
      const reached = deferred();
      executionGates.set(toolCallId, { reached, release });
      return { close: () => release.resolve(), reached: reached.promise };
    },
    failNextAppend(reason?: unknown) {
      appendFailure = reason ?? new Error("contract-injected append failure");
    },
    failNextExecution(reason?: unknown) {
      executionFailure = reason ?? new Error("contract-injected execution failure");
    },
  };
}

/** 把 journal 压成只看事件进入/完成的序列（事件序列断言用）。 */
export function eventSequence(
  fake: FakeMethodsRuntime,
  phase: "enter" | "exit" | "both" = "enter",
) {
  return fake.journal
    .filter((line) => phase === "both" || line.startsWith(`${phase}:`))
    .map((line) => line.replace(/^(enter|exit):/, ""));
}

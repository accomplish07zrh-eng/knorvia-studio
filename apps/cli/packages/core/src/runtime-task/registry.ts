import type {
  AgentOutput,
  ModelUsage,
  SessionId,
  SubagentTaskSnapshot,
  TraceContext,
  TurnId,
} from "@knorvia/contracts";
import { TaskWaitSubscriptions } from "./registry-waits.js";

export type RuntimeTaskType =
  | "local_agent"
  | "local_bash"
  | "local_workflow"
  | "local_dynamic_workflow"
  | "monitor_mcp";

export interface RuntimeTaskUsageSnapshot {
  durationMs?: number;
  modelUsage?: ModelUsage;
  toolUseCount?: number;
  totalTokens?: number;
}

export interface RuntimeTaskPendingMessage {
  id: string;
  isMeta?: boolean;
  message: string;
  origin?: { kind: "coordinator"; toolCallId?: string };
  queuedAt: Date;
  summary?: string;
  traceContext?: TraceContext;
}

export interface RuntimeTaskMessageSink {
  send(message: RuntimeTaskPendingMessage): Promise<"queued" | "steered">;
}

export interface RuntimeTaskSnapshot extends SubagentTaskSnapshot {
  branchGeneration?: number;
  exitCode?: number;
  type: RuntimeTaskType;
  isBackgrounded?: boolean;
  messageSink?: RuntimeTaskMessageSink;
  output?: AgentOutput;
  parentSessionId?: SessionId;
  pendingMessages?: RuntimeTaskPendingMessage[];
  prompt?: string;
  resultText?: string;
  stopInitiator?: "user" | "model";
  taskType?: RuntimeTaskType;
  traceContext?: TraceContext;
  turnId?: TurnId;
  usage?: RuntimeTaskUsageSnapshot;
}

export interface RuntimeTaskRegistry {
  all(): Record<string, RuntimeTaskSnapshot>;
  get(id: string): RuntimeTaskSnapshot | undefined;
  drainMessages(id: string): RuntimeTaskPendingMessage[];
  queueMessage(id: string, message: RuntimeTaskPendingMessage): RuntimeTaskSnapshot | undefined;
  register(task: RuntimeTaskSnapshot): void;
  remove(id: string): void;
  requestBackground(id: string): boolean;
  setActiveBranchGeneration?(generation: number): void;
  update(
    id: string,
    patcher: (task: RuntimeTaskSnapshot) => RuntimeTaskSnapshot,
  ): RuntimeTaskSnapshot | undefined;
  waitForBackgroundRequest(
    id: string,
    options?: { signal?: AbortSignal },
  ): Promise<RuntimeTaskSnapshot | undefined>;
  waitForTerminal(
    id: string,
    options?: { signal?: AbortSignal },
  ): Promise<RuntimeTaskSnapshot | undefined>;
}

const INITIAL_BRANCH_GENERATION = 0;
const TERMINAL_STATUSES = new Set<string>([
  "completed",
  "failed",
  "cancelled",
  "killed",
  "stopped",
  "lost",
]);

export class InMemoryRuntimeTaskRegistry implements RuntimeTaskRegistry {
  private readonly snapshots = new Map<string, RuntimeTaskSnapshot>();
  private readonly subscriptions = new TaskWaitSubscriptions<RuntimeTaskSnapshot>();
  private activeBranchGeneration = INITIAL_BRANCH_GENERATION;

  register(task: RuntimeTaskSnapshot): void {
    const stored = {
      ...task,
      branchGeneration: task.branchGeneration ?? this.activeBranchGeneration,
    };
    this.snapshots.set(stored.taskId, stored);
    this.publish(stored.taskId, stored);
  }

  setActiveBranchGeneration(generation: number): void {
    this.activeBranchGeneration = generation;
  }

  update(
    id: string,
    patcher: (task: RuntimeTaskSnapshot) => RuntimeTaskSnapshot,
  ): RuntimeTaskSnapshot | undefined {
    const previous = this.snapshots.get(id);
    if (!previous) return undefined;
    const next = patcher(previous);
    this.snapshots.set(id, next);
    this.publish(id, next);
    return next;
  }

  requestBackground(id: string): boolean {
    const previous = this.snapshots.get(id);
    if (!previous || isTerminalRuntimeTask(previous)) return false;
    const next = { ...previous, isBackgrounded: true };
    this.snapshots.set(id, next);
    this.subscriptions.publish(id, "background", next);
    return true;
  }

  remove(id: string): void {
    this.snapshots.delete(id);
    this.subscriptions.publish(id, "terminal", undefined);
    this.subscriptions.publish(id, "background", undefined);
  }

  get(id: string): RuntimeTaskSnapshot | undefined {
    return this.snapshots.get(id);
  }

  all(): Record<string, RuntimeTaskSnapshot> {
    return Object.fromEntries(this.snapshots);
  }

  queueMessage(id: string, message: RuntimeTaskPendingMessage): RuntimeTaskSnapshot | undefined {
    return this.update(id, (task) => ({
      ...task,
      pendingMessages: [...(task.pendingMessages ?? []), message],
    }));
  }

  drainMessages(id: string): RuntimeTaskPendingMessage[] {
    const task = this.snapshots.get(id);
    if (!task || !task.pendingMessages || task.pendingMessages.length === 0) return [];
    const messages = task.pendingMessages;
    this.snapshots.set(id, { ...task, pendingMessages: [] });
    return messages;
  }

  waitForBackgroundRequest(
    id: string,
    options?: { signal?: AbortSignal },
  ): Promise<RuntimeTaskSnapshot | undefined> {
    const task = this.snapshots.get(id);
    if (!task) return Promise.resolve(undefined);
    if (task.isBackgrounded || isTerminalRuntimeTask(task)) {
      return Promise.resolve(task.isBackgrounded ? task : undefined);
    }
    return this.subscriptions.subscribe(id, "background", options?.signal);
  }

  waitForTerminal(
    id: string,
    options?: { signal?: AbortSignal },
  ): Promise<RuntimeTaskSnapshot | undefined> {
    const task = this.snapshots.get(id);
    if (!task || isTerminalRuntimeTask(task)) return Promise.resolve(task);
    return this.subscriptions.subscribe(id, "terminal", options?.signal);
  }

  private publish(id: string, task: RuntimeTaskSnapshot): void {
    if (isTerminalRuntimeTask(task)) {
      this.subscriptions.publish(id, "terminal", task);
      this.subscriptions.publish(id, "background", undefined);
    }
    if (task.isBackgrounded) this.subscriptions.publish(id, "background", task);
  }
}

export function isTerminalRuntimeTask(task: Pick<RuntimeTaskSnapshot, "status">): boolean {
  return TERMINAL_STATUSES.has(task.status);
}

export function hasRunningBackgroundRuntimeTask(registry: RuntimeTaskRegistry): boolean {
  const tasks = Object.values(registry.all());
  for (const task of tasks) {
    if (task.isBackgrounded === true && task.status === "running") return true;
  }
  return false;
}

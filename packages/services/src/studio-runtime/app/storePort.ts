import type { StudioKernelAnswer, StudioKernelId } from "../kernelTypes.js";
import type { StudioInteraction, StudioRun } from "../types.js";

export interface StoredRun extends StudioRun {
  owner?: string;
  taskMode?: boolean;
  workspaceGeneration?: string;
}
export interface StoredInteraction extends StudioInteraction {
  answer?: StudioKernelAnswer;
  owner?: string;
}
export interface StoredSession {
  id: string;
  nativeSessionId: string;
  workspacePath: string;
}
export interface StoredWorkspace {
  runId: string;
  stepId: string;
  path: string;
  sourcePath: string;
  remoteKernelId?: StudioKernelId;
}
export interface StudioListOptions {
  scope?: string;
  limit?: number;
  before?: number;
  pendingInteractionsOnly?: boolean;
  pendingSteeringOnly?: boolean;
  unresolvedRunsOnly?: boolean;
  oldestFirst?: boolean;
  /**
   * 返回全部记录；只用于数量由用户创建、需要完整列出的定义（会话、群聊、工作流）。
   * overview 曾使用默认 1000 条上限，超过后最早的会话会从列表中静默消失。
   */
  all?: boolean;
}
/** All mutations execute synchronously in one transaction; callbacks must never await. */
export interface StudioRepository {
  read<T>(kind: string, id: string): T | undefined;
  list<T>(kind: string, options?: StudioListOptions): T[];
  queuedRuns(): StoredRun[];
  write<T>(kind: string, id: string, value: T, scope?: string): void;
  remove(kind: string, id: string): void;
  transaction<T>(operation: () => T): T;
  revision(): number;
  claim(owner: string, now: number): "owner" | "acquired" | "busy";
  owns(owner: string, now: number): boolean;
  release(owner: string): void;
  close(): void;
}
export interface StudioClock {
  now(): number;
  id(): string;
  delay(milliseconds: number, signal?: AbortSignal): Promise<void>;
}

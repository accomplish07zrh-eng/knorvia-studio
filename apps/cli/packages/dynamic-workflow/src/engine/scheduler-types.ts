// SPDX-License-Identifier: Apache-2.0
// Knorvia 工作流调度器核心数据结构与契约定义。
// 提供调度器内部节点状态、执行者运行时状态以及引擎宿主注入面。

import type { ImportedActorState } from "./imported-cache.js";
import type {
  ActorId,
  ActorRef,
  AskSpec,
  AskStats,
  Caps,
  InstanceRef,
  PersonaSpec,
  RunEvent,
  SessionRef,
  ValidateFn,
  WorkflowDriver,
  WorkflowError,
} from "./types.js";

// 外部可主动兑现或拒绝的延迟 Promise 句柄
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

// 构造一个延迟 Promise 句柄
export function defer<T>(): Deferred<T> {
  let res!: (value: T) => void;
  let rej!: (reason: unknown) => void;
  const p = new Promise<T>((resolveCb, rejectCb) => {
    res = resolveCb;
    rej = rejectCb;
  });
  return { promise: p, resolve: res, reject: rej };
}

// 执行引擎注入给调度器的操作与状态依赖接口
export interface SchedulerHost {
  readonly runId: string;
  readonly caps: Caps;
  readonly driver: WorkflowDriver;
  readonly validate: ValidateFn;
  nextOrdinal(siteId: string): number;
  record(event: RunEvent): void;
  isRunSettled(): boolean;
  runError(): WorkflowError;
  failRun(error: WorkflowError): void;
  importCacheClosed(): boolean;
  wasLiveBeforeResume(instance: InstanceRef): boolean;
}

// 调度器管控中的活跃 ask 节点执行状态
export interface AskNode {
  instance: InstanceRef;
  actor: Actor;
  actorSeq: number;
  instructions: string;
  hash: string;
  spec: AskSpec;
  deferred: Deferred<unknown>;
  repairsRemaining: number;
  nudgesRemaining: number;
  settled: boolean;
  dispatched: boolean;
  lastStats?: AskStats;
}

// 调度器维护的单一 actor 运行时调度上下文
export interface Actor {
  ref: ActorRef;
  id: ActorId;
  persona: PersonaSpec;
  name?: string;
  recordedCount: number;
  nextAdmitSeq: number;
  pendingRecorded: Map<number, () => void>;
  pendingLive: Array<() => void>;
  liveQueue: AskNode[];
  current?: AskNode;
  sessionPromise?: Promise<SessionRef>;
  session?: SessionRef;
  imported?: ImportedActorState;
}

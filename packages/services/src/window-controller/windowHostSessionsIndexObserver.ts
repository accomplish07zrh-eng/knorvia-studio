// SPDX-License-Identifier: Apache-2.0
// Window Host 的被动 sessions-index 观察者。
//
// 它把 workspace 级列表帧折成一份完整 `SessionSummary[]` 交给 Controller 投影，自己
// 不持久化任何东西，也不启动 Agent：订阅一律走 `existing-only`，缺少 runtime 时停在
// dormant，等生命周期通知再试。物理帧在 ACK 之前有界暂存，因为 CLI 的初始快照
// 常常早于 subscribe 的 RPC response 抵达。
import { resolveWorkspaceKey } from "@knorvia/shared";
import {
  TopicWireFrameAssembler,
  sessionsIndexTopic,
  sessionsIndexTopicFrameSchema,
  type SessionSummary,
  type SessionsIndexTopicFrame,
  type SessionsIndexTopicWireCandidate,
  type TopicWireAssemblyEvent,
} from "@knorvia/shared/protocol-v4";
import {
  KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE,
  type IKnorviaAgentService,
} from "../agent/agent.js";

/** 观察者只依赖 sessions-index 通道面；不要在这里扩面。 */
type SessionsIndexChannel = Pick<
  IKnorviaAgentService,
  | "subscribeSessionsIndexV4"
  | "resyncSessionsIndexV4"
  | "unsubscribeSessionsIndexV4"
  | "onDynamicSessionsIndexFrame"
  | "onAgentRuntimeRestarted"
>;

/** 生命周期是可选面：旧 service 没有它时退回到 `onAgentRuntimeRestarted`。 */
type SessionsIndexAgentService = SessionsIndexChannel &
  Partial<Pick<IKnorviaAgentService, "onAgentRuntimeLifecycle">>;

export interface WindowHostSessionsIndexObserver {
  start(): Promise<void>;
  dispose(): void;
}

/**
 * 订阅者作用域后缀。CLI 侧按 (connectionId, topic) 替换重订阅，host 进程内多个消费者
 * （task-index syncer、侧栏、本观察者）订阅同一 topic 时必须各自命名，否则会互相顶掉
 * 对方的订阅代际。
 */
const SUBSCRIBER_SCOPE = "window-host-sessions-index";

/**
 * ACK 之前最多暂存这么多条物理帧。越界不能「保留前 N 条」——那会得到一个看似可用、
 * 实际缺片的初始批次，只能整批作废并重新订阅。
 */
const MAX_STAGED_WIRES = 1_024;

/** 与 `IDisposable` 结构相同的本地别名，避免为一处释放句柄引入额外依赖。 */
interface Disposable {
  dispose(): void;
}

/** 已确认的订阅水位。没有 base 时不允许把增量帧直接套到列表上。 */
interface Cursor {
  subscriptionId: string;
  logEpoch: string;
  seq: number;
  hasBase: boolean;
}

/** ACK 窗口内的暂存批次；overflow 一旦置位，整批不再接收。 */
interface StagedBatch {
  wires: SessionsIndexTopicWireCandidate[];
  overflow: boolean;
}

/**
 * 观察者的全部可变所有权集中在一处：订阅水位、ACK 暂存、runtime 代际与事件句柄。
 * 分散成十几个顶层 `let` 时，`dispose()` 很难证明「每个句柄都被释放」。
 */
interface ObserverState {
  cursor: Cursor | null;
  batch: StagedBatch | null;
  dormant: boolean;
  disposed: boolean;
  generation: number;
  opening: boolean;
  queued: boolean;
  resync: object | null;
  runtimeGeneration: number | null;
  frames: Disposable | null;
  lifecycle: Disposable | null;
  restarts: Disposable | null;
}

/** 从任意抛出物上读协议错误码；非对象一律当作无码。 */
function codeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null
    ? (error as { code?: unknown }).code
    : undefined;
}

export function createWindowHostSessionsIndexObserver(options: {
  agentService: SessionsIndexAgentService;
  target: { workspacePath: string; workspaceIdentity?: string };
  onSessionsChange: (sessions: SessionSummary[]) => void;
  onError?: (error: unknown) => void;
}): WindowHostSessionsIndexObserver {
  const { agentService, target, onSessionsChange, onError } = options;
  const workspaceKey = resolveWorkspaceKey(target);
  const topic = sessionsIndexTopic(workspaceKey);
  const assembler = new TopicWireFrameAssembler<SessionsIndexTopicFrame>(
    sessionsIndexTopicFrameSchema,
  );
  // 列表本体：每次变更整体交给 Controller 做行级 diff，观察者自己不做增量记账。
  const summaries = new Map<string, SessionSummary>();
  const state: ObserverState = {
    cursor: null,
    batch: null,
    dormant: false,
    disposed: false,
    generation: 0,
    opening: false,
    queued: false,
    resync: null,
    runtimeGeneration: null,
    frames: null,
    lifecycle: null,
    restarts: null,
  };

  function report(error: unknown): void {
    try {
      onError?.(error);
    } catch {
      // 已经处在失败路径上，错误回调自己再抛不能反向打断状态机。
    }
  }

  function publish(): void {
    try {
      onSessionsChange([...summaries.values()]);
    } catch (error) {
      report(error);
    }
  }

  /** 退订只做尽力而为：runtime 换代后 route 已不存在，清理失败不能反向影响本地状态。 */
  function releaseRemote(subscriptionId: string | null): void {
    if (subscriptionId === null) return;
    try {
      void agentService
        .unsubscribeSessionsIndexV4({
          ...target,
          subscriptionId,
          runtimePolicy: "existing-only",
        })
        .catch(() => undefined);
    } catch {
      // 同步抛错同样是清理失败，交给下一次订阅覆盖。
    }
  }

  /** 丢掉本地订阅所有权；不发布、不清空已经展示的列表。 */
  function release(): string | null {
    const previous = state.cursor?.subscriptionId ?? null;
    state.cursor = null;
    state.batch = null;
    state.resync = null;
    assembler.clear();
    return previous;
  }

  function recycle(): void {
    if (state.disposed) return;
    releaseRemote(release());
    void start();
  }

  function acceptFrame(frame: SessionsIndexTopicFrame): void {
    const active = state.cursor;
    if (active === null || frame.subscriptionId !== active.subscriptionId) return;
    const payload = frame.payload;
    if (payload.kind === "snapshot") {
      summaries.clear();
      for (const summary of payload.snapshot.sessions) summaries.set(summary.sessionId, summary);
      state.cursor = {
        subscriptionId: active.subscriptionId,
        logEpoch: payload.snapshot.logEpoch,
        seq: frame.toSeq,
        hasBase: true,
      };
      publish();
      return;
    }
    if (!active.hasBase) {
      // 增量先于快照到达是允许的时序；没有 base 只能向 CLI 要一次补帧。
      requestResync();
      return;
    }
    if (frame.toSeq <= active.seq) return;
    if (frame.fromSeq !== active.seq) {
      requestResync();
      return;
    }
    for (const delta of payload.deltas) {
      if (delta.op === "session.upserted") summaries.set(delta.session.sessionId, delta.session);
      else summaries.delete(delta.sessionId);
    }
    state.cursor = { ...active, seq: frame.toSeq };
    publish();
  }

  function handleAssembly(events: TopicWireAssemblyEvent<SessionsIndexTopicFrame>[]): void {
    for (const event of events) {
      if (event.kind === "complete") {
        acceptFrame(event.frame);
        continue;
      }
      report(new Error(`sessions-index 物理帧装配失败 reason=${event.fault.reasonCode}`));
      // 该 route 已 fail-closed：继续等同一 subscriptionId 只会永久等不到，换新订阅取快照。
      recycle();
      return;
    }
  }

  function receive(wire: SessionsIndexTopicWireCandidate): void {
    if (state.disposed || wire.topic !== topic) return;
    const pending = state.batch;
    if (pending !== null) {
      if (pending.overflow) return;
      if (pending.wires.length >= MAX_STAGED_WIRES) {
        pending.wires.length = 0;
        pending.overflow = true;
        return;
      }
      pending.wires.push(wire);
      return;
    }
    const active = state.cursor;
    if (active === null || wire.subscriptionId !== active.subscriptionId) return;
    // assembler.accept 会顺带回收已超时的半成品，因此这里不需要单独的到期定时器。
    handleAssembly(assembler.accept(wire));
  }

  /**
   * same-subscription 补帧：base 可信时从水位续传，否则强制要快照。ACK 只代表 CLI
   * 受理，真正的补帧随后按同一 subscriptionId 到达，因此这里不改本地水位。
   */
  function requestResync(): void {
    const active = state.cursor;
    if (state.disposed || active === null || state.resync !== null) return;
    const token = {};
    state.resync = token;
    const base = active.hasBase ? { logEpoch: active.logEpoch, seq: active.seq } : null;
    void agentService
      .resyncSessionsIndexV4({
        ...target,
        subscriptionId: active.subscriptionId,
        base,
        ...(base === null ? { forceSnapshot: true } : {}),
        runtimePolicy: "existing-only",
      })
      .then((result) => {
        if (state.disposed || state.cursor !== active) return;
        // ACK 指向别的代际时，本地水位已经对不上，只能重新订阅。
        if (result.ack.subscriptionId !== active.subscriptionId) recycle();
      })
      .catch((error) => {
        if (state.disposed || state.cursor !== active) return;
        if (codeOf(error) === KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE) {
          state.dormant = true;
          releaseRemote(release());
          return;
        }
        report(error);
        // 续传本身失败时同一订阅没有别的补救手段，回到「新订阅拿快照」。
        recycle();
      })
      .finally(() => {
        if (state.resync === token) state.resync = null;
      });
  }

  /**
   * 一轮订阅。失败不在这里重试：Controller 每次列表刷新都会再调 `start()`，
   * 而 `cursor` 仍为 null，天然构成下一次尝试的入口。
   */
  async function subscribeOnce(generation: number): Promise<void> {
    const pending: StagedBatch = { wires: [], overflow: false };
    state.batch = pending;
    try {
      const result = await agentService.subscribeSessionsIndexV4({
        ...target,
        visibility: "background",
        subscriberScope: SUBSCRIBER_SCOPE,
        runtimePolicy: "existing-only",
      });
      if (state.disposed || generation !== state.generation) {
        // 迟到 ACK：本地不登记，顺手退订，避免 CLI 侧留下无主订阅。
        releaseRemote(result.ack.subscriptionId);
        return;
      }
      state.batch = null;
      if (pending.overflow) {
        releaseRemote(result.ack.subscriptionId);
        report(new Error("sessions-index 初始帧暂存越界，已放弃该订阅"));
        return;
      }
      state.cursor = {
        subscriptionId: result.ack.subscriptionId,
        logEpoch: result.ack.logEpoch,
        seq: 0,
        hasBase: false,
      };
      assembler.clear();
      // 只回放属于本次 ACK 的帧；同 topic 的旧代际帧在这里被丢掉。
      for (const wire of pending.wires) receive(wire);
    } catch (error) {
      state.batch = null;
      if (state.disposed || generation !== state.generation) return;
      if (codeOf(error) === KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE) {
        // existing-only 的预期结果：没有 runtime 就不订阅，等生命周期通知再试。
        state.dormant = true;
        return;
      }
      report(error);
    }
  }

  async function start(): Promise<void> {
    if (state.disposed) return;
    ensureWired();
    if (state.dormant || state.cursor !== null) return;
    if (state.opening) {
      // 在途订阅结束前不发第二条 RPC，但要让本轮结束后立刻重来。
      state.queued = true;
      return;
    }
    state.opening = true;
    try {
      do {
        state.queued = false;
        await subscribeOnce(++state.generation);
      } while (state.queued && !state.disposed && !state.dormant && state.cursor === null);
    } finally {
      state.opening = false;
    }
  }

  function ensureWired(): void {
    state.frames ??= agentService.onDynamicSessionsIndexFrame(target)((wire) => {
      receive(wire);
    });
    if (state.lifecycle !== null || state.restarts !== null) return;
    const onLifecycle = agentService.onAgentRuntimeLifecycle;
    if (onLifecycle !== undefined) {
      state.lifecycle = onLifecycle((event) => {
        if (state.disposed || event.workspaceKey !== workspaceKey) return;
        if (event.state === "unavailable") {
          // runtime 已退出：本地订阅随之失效，停在 dormant 等下一次 available。
          state.dormant = true;
          state.runtimeGeneration = null;
          releaseRemote(release());
          return;
        }
        const next = event.runtimeIdentity.generation;
        // available 不是「旧 ownership 失效」的信号：冷启动时它会在 ACK 之前到达，
        // 只有 generation 真的换了才必须重建订阅。
        const changed = state.runtimeGeneration !== null && state.runtimeGeneration !== next;
        state.runtimeGeneration = next;
        state.dormant = false;
        if (changed) recycle();
        else void start();
      });
      return;
    }
    // 没有生命周期面时，进程换代是唯一可观测的重建点。
    state.restarts = agentService.onAgentRuntimeRestarted((event) => {
      if (state.disposed || event.workspaceKey !== workspaceKey) return;
      state.dormant = false;
      recycle();
    });
  }

  function dispose(): void {
    if (state.disposed) return;
    state.disposed = true;
    // 推进代际，让在途的 subscribe/resync 回调直接作废。
    state.generation += 1;
    releaseRemote(release());
    state.frames?.dispose();
    state.frames = null;
    state.lifecycle?.dispose();
    state.lifecycle = null;
    state.restarts?.dispose();
    state.restarts = null;
    summaries.clear();
  }

  return { start, dispose };
}

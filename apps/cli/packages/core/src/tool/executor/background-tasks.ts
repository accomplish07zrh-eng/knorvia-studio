// 后台任务追踪器：把已经后台化的工具调用接到「快照轮询 + 一次性等待者」两条收口通道上。
//
// 兼容面只有 BackgroundTaskTracker.trackBackgroundTask（见 interface.md）。内部按三段组织：
// 受理段过滤并登记任务 id、广播 started（失败原样回滚）；观察段按快照形态分派——缺席、
// 运行中、子代理已通知、其余终态四路；结算段是终态共用的收口尾（登记更新 → 通知入队 →
// completed 事件 → 停表交还 id）。可变状态全部集中在 RunClock，日志统一走 scribe 合成。
import {
  SessionEventType,
  traceContextToLogContext,
  type LogContext,
  type TraceContext,
  type TurnId,
} from "@knorvia/contracts";
import { isSubagentDispatchToolName } from "../compat.js";
import type { ExecutableToolCall } from "../types.js";
import {
  registerRuntimeBackgroundTask,
  removeRuntimeBackgroundTask,
  updateRuntimeBackgroundTask,
} from "./background-task-registry.js";
import { enqueueTerminalNotification } from "./background-tracker-notification.js";
import {
  emitBackgroundTaskEvent,
  taskPayload,
  errorMessage,
  hasDirectWaiter,
  hasSnapshotProvider,
  readTaskSnapshot,
  runningSignature,
  waitForTaskSnapshot,
  type TaskSnapshot,
} from "./background-tracker-projection.js";
import type { ToolExecutorDeps } from "./types.js";
import { isRecord } from "./utils.js";

/** 日志通道：三条可选级别共用一个写入口。 */
type Scribe = "debug" | "info" | "warn";
/** 快照读取的松散形状：只按字段在场性取值，不假设上游结构。 */
type Launch = Record<string, unknown>;

/** 一次追踪的不可变上下文：受理段装配一次，观察与结算段只读地共用。 */
interface TrackJob {
  readonly call: ExecutableToolCall;
  readonly id: string;
  readonly launch: Launch;
  readonly trace: TraceContext;
  readonly turn: TurnId | undefined;
  readonly live: boolean;
}

/** 单次追踪的可变运行时钟：两个定时器 + 三个闸位，收口时统一停表。 */
interface RunClock {
  stopped: boolean;
  settling: boolean;
  busy: boolean;
  stamp: string;
  ticker: ReturnType<typeof setInterval> | undefined;
  cancel: ReturnType<typeof setTimeout> | undefined;
}

const MODULE_TAG = "core.tool.executor";
const POLL_INTERVAL_MS = 1000;
const BASH_TOOL_NAME = "Bash";
const SUBAGENT_SCOPE = "subagent";

// 广播与入队的本地接缝：调用点保持单行/紧凑形状，参数一律走本方法内的别名。
const broadcast = emitBackgroundTaskEvent;
const notifyTerminal = enqueueTerminalNotification;
const STARTED_EVENT = SessionEventType.BackgroundTaskStarted;
const RUNNING_EVENT = SessionEventType.BackgroundTaskUpdated;
const FINISHED_EVENT = SessionEventType.BackgroundTaskCompleted;

/** 新建一个未武装的运行时钟；定时器字段留空，用到时才挂。 */
function freshClock(): RunClock {
  const clock = {} as RunClock;
  clock.stopped = false;
  clock.settling = false;
  clock.busy = false;
  clock.stamp = "";
  clock.ticker = undefined;
  clock.cancel = undefined;
  return clock;
}

/** 任务 id 只认字符串：backgroundTaskId 优先，它不适用时才回落 agentId。 */
function pickTaskId(launch: Launch): string | undefined {
  const direct = typeof launch.backgroundTaskId === "string" ? launch.backgroundTaskId : undefined;
  const inherited = typeof launch.agentId === "string" ? launch.agentId : undefined;
  return direct ?? inherited;
}

/** 子代理在本地 agent 快照上自带 notified 标记：那种终态不再重复通知。 */
function subagentHandled(call: ExecutableToolCall, view: TaskSnapshot): boolean {
  if (!isSubagentDispatchToolName(call.name)) return false;
  const loose = view as unknown as LogContext;
  if (loose.type !== "local_agent") return false;
  return loose.notified === true;
}

/** 只有子代理作用域里的后台 Bash 有最长运行上限；返回 undefined 表示不设防。 */
function cancelDeadline(call: ExecutableToolCall, deps: ToolExecutorDeps): number | undefined {
  if (call.name !== BASH_TOOL_NAME) return undefined;
  if (deps.runtimeScope !== SUBAGENT_SCOPE) return undefined;
  const span = deps.subagentBackgroundBashMaxMs;
  if (span === undefined) return undefined;
  if (!deps.executionPort?.cancelBackgroundTask) return undefined;
  return span;
}

export class BackgroundTaskTracker {
  private readonly trackedTaskIds = new Set<string>();

  constructor(private readonly deps: ToolExecutorDeps) {}

  // 受理段：过滤 → 登记 → started 广播（失败回滚）→ 能力探测 → 装配观察或直接结算。
  async trackBackgroundTask(
    toolCall: ExecutableToolCall,
    output: unknown,
    traceContext: TraceContext,
    turnId: TurnId | undefined,
  ): Promise<void> {
    const ports = this.deps;
    const call = toolCall;
    const trace = traceContext;
    const turn = turnId;
    const launch = isRecord(output) ? output : undefined;
    if (launch === undefined) return;
    const addressable =
      launch.status === "backgrounded" ||
      (isSubagentDispatchToolName(call.name) && launch.status === "async_launched");
    if (!addressable) return;
    const id = pickTaskId(launch);
    if (!id || this.trackedTaskIds.has(id)) return;

    this.trackedTaskIds.add(id);
    registerRuntimeBackgroundTask(ports, call, id, launch, turn);
    try {
      await broadcast(
        ports,
        STARTED_EVENT,
        taskPayload(ports, call, id, "running", launch),
        trace,
        turn,
      );
    } catch (failure) {
      this.trackedTaskIds.delete(id);
      removeRuntimeBackgroundTask(ports, call, id);
      throw failure;
    }

    const live = hasSnapshotProvider(ports, call.name);
    const waiting = hasDirectWaiter(ports, call.name);
    const opened: LogContext = {};
    opened.event = "background_task.tracking.started";
    opened.hasDirectWaiter = waiting;
    opened.hasSnapshotProvider = live;
    opened.taskId = id;
    opened.toolName = call.name;
    this.scribe("info", trace, "Background task tracking started", opened);

    const job: TrackJob = { call, id, launch, trace, turn, live };
    const clock = freshClock();
    if (!live && !waiting) {
      // 两条收口通道都没有：登记与事件照发，但立即以丢失态收口。
      const orphaned: LogContext = {};
      orphaned.event = "background_task.tracking.lost";
      orphaned.reason = "missing_snapshot_source";
      orphaned.taskId = id;
      orphaned.toolName = call.name;
      this.scribe("info", trace, "Background task tracking lost without snapshot source", orphaned);
      await this.settle(clock, job);
    } else {
      const sweep = async (): Promise<void> => {
        if (clock.busy || clock.stopped || !job.live) return;
        clock.busy = true;
        try {
          const view = await readTaskSnapshot(ports, call.name, id);
          if (view === undefined || view.status !== "running") {
            await this.observe(clock, job, view);
          } else {
            await this.report(clock, job, view);
          }
        } catch (failure) {
          const slip: LogContext = {};
          slip.errorMessage = errorMessage(failure);
          slip.taskId = id;
          this.scribe("warn", trace, "Background task polling failed", slip);
        } finally {
          clock.busy = false;
        }
      };

      const deadline = cancelDeadline(call, ports);
      if (deadline !== undefined) {
        clock.cancel = setTimeout(() => {
          const overrun: LogContext = {};
          overrun.event = "background_task.subagent_bash.max_runtime_exceeded";
          overrun.taskId = job.id;
          overrun.toolName = job.call.name;
          this.scribe(
            "warn",
            trace,
            "Subagent background Bash exceeded max runtime; cancelling",
            overrun,
          );
          Promise.resolve(ports.executionPort?.cancelBackgroundTask?.(job.id)).catch((failure) => {
            const refusal: LogContext = {};
            refusal.errorMessage = errorMessage(failure);
            refusal.event = "background_task.subagent_bash.cancel_failed";
            refusal.taskId = job.id;
            refusal.toolName = job.call.name;
            this.scribe("warn", trace, "Subagent background Bash cancellation failed", refusal);
          });
        }, deadline);
      }

      if (live) {
        clock.ticker = setInterval(() => {
          void sweep();
        }, POLL_INTERVAL_MS);
        (clock.ticker as unknown as { unref?: () => void }).unref?.();
        await sweep();
      }
      if (waiting && !clock.stopped) void this.awaitOutcome(clock, job);
    }
  }

  // 观察段的四路分派：快照缺席 → 丢失收口；running → 运行中上报；
  // 子代理已通知 → 静默停表；其余形态交结算段收终态。
  private async observe(clock: RunClock, job: TrackJob, view?: TaskSnapshot): Promise<void> {
    if (clock.stopped || clock.settling) return;
    clock.settling = true;
    try {
      if (view === undefined) {
        const vanished: LogContext = {};
        vanished.event = "background_task.tracking.lost";
        vanished.reason = "snapshot_missing";
        vanished.taskId = job.id;
        vanished.toolName = job.call.name;
        this.scribe("info", job.trace, "Background task terminal snapshot missing", vanished);
        await this.settle(clock, job);
      } else if (view.status === "running") {
        updateRuntimeBackgroundTask(this.deps, job.call, job.id, "running", view);
        await this.report(clock, job, view);
        if (!job.live) {
          clock.stopped = true;
          this.cleanup(clock, job.id);
        }
      } else if (subagentHandled(job.call, view)) {
        const quieted: LogContext = {};
        quieted.event = "background_task.tracking.notification_already_handled";
        quieted.taskId = job.id;
        quieted.toolName = job.call.name;
        this.scribe(
          "debug",
          job.trace,
          "Background task terminal notification already handled by subagent",
          quieted,
        );
        clock.stopped = true;
        this.cleanup(clock, job.id);
      } else {
        const wrapped: LogContext = {};
        wrapped.event = "background_task.tracking.terminal";
        wrapped.taskId = job.id;
        wrapped.taskStatus = view.status;
        wrapped.toolName = job.call.name;
        this.scribe("info", job.trace, "Background task terminal snapshot observed", wrapped);
        await this.settle(clock, job, view);
      }
    } finally {
      clock.settling = false;
    }
  }

  // 结算段：终态共用的收口尾。状态取自快照，快照缺席即丢失态；
  // 通知的 launch 回落只在没有快照时生效，与「先看快照再看启动输出」的取值顺序一致。
  private async settle(clock: RunClock, job: TrackJob, view?: TaskSnapshot): Promise<void> {
    const ports = this.deps;
    const status = view?.status ?? "lost";
    updateRuntimeBackgroundTask(ports, job.call, job.id, status, view);
    notifyTerminal(
      ports,
      job.call,
      job.id,
      status,
      job.trace,
      view,
      view === undefined ? job.launch : undefined,
    );
    await broadcast(
      ports,
      FINISHED_EVENT,
      taskPayload(ports, job.call, job.id, status, job.launch, view),
      job.trace,
      job.turn,
    );
    clock.stopped = true;
    this.cleanup(clock, job.id);
  }

  // 运行中上报：同一签名只发一次；签名变化才更新登记并广播 updated。
  private async report(clock: RunClock, job: TrackJob, view: TaskSnapshot): Promise<void> {
    const ports = this.deps;
    const stamp = runningSignature(view);
    if (stamp === clock.stamp) return;
    clock.stamp = stamp;
    updateRuntimeBackgroundTask(ports, job.call, job.id, "running", view);
    await broadcast(
      ports,
      RUNNING_EVENT,
      taskPayload(ports, job.call, job.id, "running", job.launch, view),
      job.trace,
      job.turn,
    );
  }

  // 一次性等待者通道：等到的形态交给观察段同一套分派；失败只写 warn，
  // 有快照源时轮询继续接管，没有快照源时就地收口。
  private async awaitOutcome(clock: RunClock, job: TrackJob): Promise<void> {
    try {
      const view = await waitForTaskSnapshot(this.deps, job.call.name, job.id);
      await this.observe(clock, job, view);
    } catch (failure) {
      const stalled: LogContext = {};
      stalled.errorMessage = errorMessage(failure);
      stalled.taskId = job.id;
      this.scribe("warn", job.trace, "Background task wait failed", stalled);
      if (!job.live) {
        clock.stopped = true;
        this.cleanup(clock, job.id);
      }
    }
  }

  // 停表：撤掉轮询与最长运行两个定时器，并把 id 交还给受理段的重入判定。
  private cleanup(clock: RunClock, id: string): void {
    if (clock.ticker) clearInterval(clock.ticker);
    clock.ticker = undefined;
    if (clock.cancel) clearTimeout(clock.cancel);
    clock.cancel = undefined;
    this.trackedTaskIds.delete(id);
  }

  // 唯一的日志出口：trace 字段与固定 module 打底，调用方只补本次事件的差异字段。
  private scribe(level: Scribe, trace: TraceContext, prose: string, fields: LogContext): void {
    const logger = this.deps.logger;
    if (!logger) return;
    const journal: LogContext = {
      ...traceContextToLogContext(trace),
      module: MODULE_TAG,
      ...fields,
    };
    logger[level]?.(prose, journal);
  }
}

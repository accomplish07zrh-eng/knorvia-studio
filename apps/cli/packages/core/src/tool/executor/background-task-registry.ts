import {
  AMEND_WORKFLOW_TOOL_NAME,
  CREATE_WORKFLOW_TOOL_NAME,
  RESUME_WORKFLOW_RUN_TOOL_NAME,
} from "@knorvia/contracts";
import type {
  ExecutionPort,
  DynamicWorkflowRunSnapshot,
  SubagentTaskSnapshot,
  WorkflowTaskSnapshot,
} from "@knorvia/contracts";
import {
  isTerminalRuntimeTask,
  type RuntimeTaskSnapshot,
  type RuntimeTaskType,
} from "../../runtime-task/registry.js";
import type { ExecutableToolCall } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
import { isRecord } from "./utils.js";
import { backgroundTaskOutputMetadata } from "./background-task-output.js";
import { serializeWorkflowArtifact } from "./workflow-artifact.js";

type BackgroundTaskSnapshot =
  | NonNullable<Awaited<ReturnType<NonNullable<ExecutionPort["getBackgroundTask"]>>>>
  | SubagentTaskSnapshot
  | WorkflowTaskSnapshot
  // workflow run 这一支借用 WorkflowTaskSnapshot 的字段布局，但 output 放宽为 unknown
  // （产物取决于脚本的顶层返回值），因此它在类型上不是 WorkflowTaskSnapshot 的子类型，得单独列一支。
  | DynamicWorkflowRunSnapshot;

/**
 * dwf run 的分派名谓词。CreateWorkflow 负责新启动、ResumeWorkflowRun 负责恢复，
 * 二者是同一 run 生命周期的两个入口，快照 / 等待 / 取消 / 通知 / registry 五条路径完全同构。
 *
 * 注意：CreateWorkflow 确认窗里的 Refine 特判（product-projection.ts 与 turn-control.ts）
 * 刻意没有改用本谓词。ResumeWorkflowRun 的确认窗既没有 causalityGraph 也没有图精炼，
 * 只能走默认 ask；一旦把这两个名字塞进那些特判，确认窗就会多出一个无图可精炼的 Refine 选项。
 */
/** dwf 的三个分派名：新启动、修订、恢复，三者共用同一套生命周期路径。 */
const DWF_DISPATCH_TOOL_NAMES: readonly string[] = [
  CREATE_WORKFLOW_TOOL_NAME,
  AMEND_WORKFLOW_TOOL_NAME,
  RESUME_WORKFLOW_RUN_TOOL_NAME,
];

type Deps = ToolExecutorDeps;
type ToolCall = ExecutableToolCall;
type TaskId = string;

export function isDynamicWorkflowRunDispatchToolName(name: string): boolean {
  return DWF_DISPATCH_TOOL_NAMES.includes(name);
}

export function registerRuntimeBackgroundTask(
  deps: Deps,
  toolCall: ToolCall,
  taskId: TaskId,
  output: Record<string, unknown>,
  turnId?: RuntimeTaskSnapshot["turnId"],
): void {
  const taskType = runtimeTaskTypeForToolCall(toolCall);
  if (taskType === undefined) return;
  const registry = deps.runtimeTaskRegistry;
  if (registry === undefined) return;

  const existing = registry.get(taskId);
  const description =
    runtimeTaskDescription(toolCall, output) ?? defaultRuntimeTaskDescription(taskType);
  const outputFile = backgroundTaskOutputMetadata(output).outputFile;
  // 场景：同进程 cancel 出终态后未重启就 resume（即 dwf 的重臂；v4 命令路径与工具路径
  // 在 trackBackgroundTask 汇合，两处同病）。此时既有条目带着上一轮 claim 留下的
  // notified:true，若重建时原样保留，claimRuntimeBackgroundTaskNotification 会据此拒收，
  // 恢复 run 的终态模型通知就被吞掉。同族的 error / completedAt / resultText 残留也会让
  // running 期条目顺着 updateRuntimeBackgroundTask 的 `?? current.*` 链挂着旧的失败、
  // 完成时间与产物。
  // 所以重臂时整体复位**结算面**（notified / completedAt / error / exitCode / resultText / pid），
  // 而**身份面**仍按 existing ?? new 保留（agentId / agentType / parentToolCallId / turnId /
  // description / startedAt）：parentToolCallId 是「工具卡 → 详情页」这条链路跨 resume 存活的锚点，
  // 换成本次重臂的描述子 id 会把 join 打断。
  //
  // 复位以**重臂**为界。只有 dwf 分派名会在终态条目上复用同一 runId 再启一段生命周期
  // （这才是重臂），上一轮的 notified 属于旧生命周期、必须作废。Bash / Agent 这类单生命周期
  // 任务的 task id 用完即弃，但 tracker 晚挂载时 register 同样会撞上已认领（notified:true）的
  // 终态条目——那是**同一**生命周期的认领令牌，无差别复位会让同一终态的模型通知二次入队。
  // 「与缺陷名字无关」说的是可达路径（v4 命令路径同样经 CreateWorkflow 名重臂），
  // 而不是「任何 register 都该复位」。
  //
  // outputFile 有意**不**跟着结算面复位：workflow run 从不写它，existing 兜底只是为了给产物
  // 外部化留一条透传；外部化真正落地时应按它的语义重新裁决（既别顺手清空，也别顺手扩大语义）。
  const rearm = isDynamicWorkflowRunDispatchToolName(toolCall.name);
  // 新生命指在**终态**条目上重臂，必须走 register() 而不是 update()：register 会用当前
  // activeBranchGeneration 重新盖 branchGeneration，而 update 的 {...existing} 会把上一段
  // 生命周期的分支代带进新生命——cancel → rewind（分支代 +1）→ resume 这条路上，新生命的
  // 任务事件会被 runtime-command-generation 的 stale-branch fencing 当成旧分支残留整体丢弃，
  // 终态通知于是再次失踪。仍在 running 的既有条目不属于新生命，继续用 update 的合并语义，
  // 保留它自己的分支代。
  const newLife = rearm && existing !== undefined && isTerminalRuntimeTask(existing);
  const next = { ...existing } as RuntimeTaskSnapshot;
  // 身份面：既有条目优先，缺席时用本次登记的事实补齐。
  next.agentId = existing?.agentId ?? taskId;
  next.agentType = existing?.agentType ?? taskType;
  next.description = existing?.description ?? description;
  next.parentToolCallId = existing?.parentToolCallId ?? toolCall.id;
  next.startedAt = existing?.startedAt ?? new Date();
  next.turnId = existing?.turnId ?? turnId;
  next.taskId = taskId;
  next.taskType = taskType;
  next.type = taskType;
  next.isBackgrounded = true;
  next.status = RUNNING_STATUS;
  next.outputFile = outputFile ?? existing?.outputFile;

  // 结算面：仅重臂复位（重臂等于开启新的一轮生命周期）；非重臂的重挂载保留既有结算面。
  next.notified = rearm ? false : (existing?.notified ?? false);
  next.completedAt = settledAfterRearm(rearm, existing?.completedAt);
  next.error = settledAfterRearm(rearm, existing?.error);
  next.exitCode = settledAfterRearm(rearm, existing?.exitCode);
  next.resultText = settledAfterRearm(rearm, existing?.resultText);
  next.pid = settledAfterRearm(rearm, existing?.pid);
  // 上一轮由谁停止，与新生命无关，一并清掉。
  next.stopInitiator = settledAfterRearm(rearm, existing?.stopInitiator);

  if (existing !== undefined && !newLife) {
    registry.update(taskId, () => next);
    return;
  }
  // 首次登记或新生命：先剥掉继承来的 branchGeneration，再由 register 按当前 active 分支盖章。
  const { branchGeneration: _previousLife, ...fresh } = next;
  registry.register(fresh);
}

export function updateRuntimeBackgroundTask(
  deps: Deps,
  toolCall: ToolCall,
  taskId: TaskId,
  status: string,
  snapshot?: BackgroundTaskSnapshot,
): void {
  const taskType = runtimeTaskTypeForToolCall(toolCall);
  if (taskType === undefined) return;
  const registry = deps.runtimeTaskRegistry;
  if (registry === undefined) return;

  registry.update(taskId, (current) => {
    // 已结算的条目不再改写：终态事实比后到的 running 快照更权威。
    if (isTerminalRuntimeTask(current)) return { ...current } as RuntimeTaskSnapshot;

    const merged = { ...current } as RuntimeTaskSnapshot;
    // 每个字段都遵循「新值缺席就保留旧值」：`?? current.x` 是这里的统一写法。
    merged.completedAt = runtimeTaskCompletedAt(status, snapshot) ?? current.completedAt;
    merged.description =
      runtimeTaskDescription(toolCall, undefined, snapshot) ?? current.description;
    merged.error = runtimeTaskError(snapshot) ?? current.error;
    merged.exitCode = runtimeTaskExitCode(snapshot) ?? current.exitCode;
    merged.outputFile = backgroundTaskOutputMetadata(snapshot).outputFile ?? current.outputFile;
    merged.pid = runtimeTaskPid(snapshot) ?? current.pid;
    // resultText 用 `?? current.resultText`：undefined 绝不允许清掉已经存下的产物——中途的
    // running 快照与产物缺席的终态都会走到这一行。
    merged.resultText = runtimeTaskResultText(toolCall, status, snapshot) ?? current.resultText;
    merged.status = normalizeRuntimeTaskStatus(status);
    merged.isBackgrounded = true;
    merged.taskType = taskType;
    merged.type = taskType;
    return merged;
  });
}

/**
 * 取 workflow run 的产物文本，只认 dwf 分派名（CreateWorkflow / ResumeWorkflowRun）的**终态**快照：
 * TaskOutput 的投影只能读到 registry 条目（dwf 从不写 outputFile），产物若没进条目，
 * 重启之后就彻底不可达了。
 *
 * legacy 的 `Workflow` 刻意不参与：它的结果走 `output.response` 的既有通知路径，契约保持不变。
 */
function runtimeTaskResultText(
  toolCall: ToolCall,
  status: string,
  snapshot: TaskSnapshotSource,
): string | undefined {
  if (!isDynamicWorkflowRunDispatchToolName(toolCall.name)) return undefined;
  if (status === RUNTIME_STATUS_RUNNING) return undefined;
  if (snapshot === undefined) return undefined;
  if (!("output" in snapshot)) return undefined;
  return serializeWorkflowArtifact(snapshot.output);
}

export function claimRuntimeBackgroundTaskNotification(
  deps: Deps,
  toolCall: ToolCall,
  taskId: TaskId,
): boolean {
  if (runtimeTaskTypeForToolCall(toolCall) === undefined) return true;
  const registry = deps.runtimeTaskRegistry;
  if (registry === undefined) return true;

  // 认领令牌：同一个终态只允许入队一次，因此第一个调用方得到 true、其余得到 false。
  let claimed = false;
  const task = registry.update(taskId, (current) => {
    if (current.notified) return current;
    claimed = true;
    const next = { ...current } as RuntimeTaskSnapshot;
    next.notified = true;
    return next;
  });
  // 条目不存在等于「没有可通知的终态」，按无需认领处理。
  return task === undefined ? true : claimed;
}

export function releaseRuntimeBackgroundTaskNotification(
  deps: Deps,
  toolCall: ToolCall,
  taskId: TaskId,
): void {
  if (runtimeTaskTypeForToolCall(toolCall) === undefined) return;
  const registry = deps.runtimeTaskRegistry;
  if (registry === undefined) return;

  registry.update(taskId, (current) => {
    // 没有认领过就没有可释放的令牌，原样返回。
    if (!current.notified) return current;
    const released = { ...current } as RuntimeTaskSnapshot;
    released.notified = false;
    return released;
  });
}

export function removeRuntimeBackgroundTask(deps: Deps, toolCall: ToolCall, taskId: TaskId): void {
  if (runtimeTaskTypeForToolCall(toolCall) === undefined) return;
  const registry = deps.runtimeTaskRegistry;
  if (registry === undefined) return;

  registry.remove(taskId);
}

/** 固定名字 → 任务种类的对照表；表外名字再交给 dwf 谓词判断。 */
const TASK_TYPE_BY_TOOL_NAME: readonly (readonly [toolName: string, taskType: RuntimeTaskType])[] =
  [
    ["Bash", "local_bash"],
    ["Workflow", "local_workflow"],
  ];

const RUNNING_STATUS: RuntimeTaskSnapshot["status"] = "running";

// 结算面的复位规则：重臂时整段清空（上一轮的结算事实属于旧生命周期），否则沿用既有值。
function settledAfterRearm<T>(rearm: boolean, current: T | undefined): T | undefined {
  return rearm ? undefined : current;
}

function runtimeTaskTypeForToolCall(toolCall: ExecutableToolCall): RuntimeTaskType | undefined {
  const named = TASK_TYPE_BY_TOOL_NAME.find(([toolName]) => toolName === toolCall.name);
  if (named !== undefined) return named[1];
  // dwf 的两个入口（CreateWorkflow / ResumeWorkflowRun）共用同一个 taskType；一旦缺席，
  // registerRuntimeBackgroundTask 会直接 return，会话回收护栏与 TaskOutput 可见性同时失效。
  return isDynamicWorkflowRunDispatchToolName(toolCall.name) ? "local_dynamic_workflow" : undefined;
}

/** 各类任务的默认描述；调用方自己给了描述时不用这张表。 */
const DEFAULT_TASK_DESCRIPTION: Readonly<Record<RuntimeTaskType, string>> = {
  local_bash: "Bash background command",
  local_workflow: "Workflow background task",
  local_dynamic_workflow: "Dynamic workflow run",
  local_agent: "Agent background task",
  monitor_mcp: "Monitor background task",
};

function defaultRuntimeTaskDescription(taskType: RuntimeTaskType): string {
  return DEFAULT_TASK_DESCRIPTION[taskType];
}

/** 状态归一表：cancelled 与 timed_out 都归到 killed，其余同名，表外一律 failed。 */
const RUNTIME_STATUS_ALIASES: Readonly<Record<string, RuntimeTaskSnapshot["status"]>> = {
  running: "running",
  completed: "completed",
  cancelled: "killed",
  timed_out: "killed",
  lost: "lost",
};

function normalizeRuntimeTaskStatus(status: string): RuntimeTaskSnapshot["status"] {
  return RUNTIME_STATUS_ALIASES[status] ?? "failed";
}

/** 依次尝试各候选来源，返回第一个真正给出的文本。 */
function firstText(...candidates: readonly OptionalText[]): OptionalText {
  for (const candidate of candidates) {
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

// 快照上的文本字段：缺键与非字符串都按「没有」处理。
function snapshotText(snapshot: TaskSnapshotSource, key: string): OptionalText {
  if (snapshot === undefined || !(key in snapshot)) return undefined;
  const value = (snapshot as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

// 描述来源按优先级排列：快照描述 → 快照名 → 启动输出名 → 入参描述 → 命令 → 名 → 脚本路径。
function runtimeTaskDescription(
  toolCall: ToolCall,
  output?: Record<string, unknown>,
  snapshot?: TaskSnapshotSource,
): OptionalText {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  return firstText(
    snapshotText(snapshot, "description"),
    snapshotText(snapshot, "name"),
    typeof output?.name === "string" ? output.name : undefined,
    typeof input.description === "string" ? input.description : undefined,
    typeof input.command === "string" ? input.command : undefined,
    typeof input.name === "string" ? input.name : undefined,
    typeof input.scriptPath === "string" ? input.scriptPath : undefined,
  );
}

/** 四个读取器共用的快照入参类型。 */
type TaskSnapshotSource = BackgroundTaskSnapshot | undefined;
/** 可缺省的文本值。 */
type OptionalText = string | undefined;

const RUNTIME_STATUS_RUNNING = "running";

function runtimeTaskCompletedAt(status: string, snapshot: TaskSnapshotSource): Date | undefined {
  if (status === RUNTIME_STATUS_RUNNING) return undefined;
  return snapshot?.completedAt ?? new Date();
}

function runtimeTaskError(snapshot: BackgroundTaskSnapshot | undefined): string | undefined {
  if (snapshot === undefined) return undefined;
  if (!("error" in snapshot)) return undefined;
  const error = snapshot.error;
  return typeof error === "string" ? error : error?.message;
}

function runtimeTaskExitCode(snapshot: BackgroundTaskSnapshot | undefined): number | undefined {
  if (snapshot === undefined) return undefined;
  if (!("result" in snapshot)) return undefined;
  return snapshot.result?.exitCode;
}

function runtimeTaskPid(snapshot: BackgroundTaskSnapshot | undefined): number | undefined {
  if (snapshot === undefined) return undefined;
  if (!("pid" in snapshot)) return undefined;
  return snapshot.pid;
}

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
export function isDynamicWorkflowRunDispatchToolName(name: string): boolean {
  return (
    name === CREATE_WORKFLOW_TOOL_NAME ||
    name === AMEND_WORKFLOW_TOOL_NAME ||
    name === RESUME_WORKFLOW_RUN_TOOL_NAME
  );
}

export function registerRuntimeBackgroundTask(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
  output: Record<string, unknown>,
  turnId?: RuntimeTaskSnapshot["turnId"],
): void {
  const taskType = runtimeTaskTypeForToolCall(toolCall);
  if (!taskType || !deps.runtimeTaskRegistry) return;
  const existing = deps.runtimeTaskRegistry.get(taskId);
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
  const next: RuntimeTaskSnapshot = {
    ...existing,
    agentId: existing?.agentId ?? taskId,
    agentType: existing?.agentType ?? taskType,
    description: existing?.description ?? description,
    isBackgrounded: true,
    outputFile: outputFile ?? existing?.outputFile,
    parentToolCallId: existing?.parentToolCallId ?? toolCall.id,
    startedAt: existing?.startedAt ?? new Date(),
    status: "running",
    taskId,
    taskType,
    type: taskType,
    turnId: existing?.turnId ?? turnId,
    // 结算面复位：仅限重臂（等于开启新的一轮生命周期）；非重臂的重挂载保留既有结算面。
    notified: rearm ? false : (existing?.notified ?? false),
    completedAt: rearm ? undefined : existing?.completedAt,
    error: rearm ? undefined : existing?.error,
    exitCode: rearm ? undefined : existing?.exitCode,
    resultText: rearm ? undefined : existing?.resultText,
    pid: rearm ? undefined : existing?.pid,
    // 上一轮由谁停止，与新生命无关，一并清掉。
    stopInitiator: rearm ? undefined : existing?.stopInitiator,
  };
  if (existing && !newLife) {
    deps.runtimeTaskRegistry.update(taskId, () => next);
    return;
  }
  // 首次登记或新生命：先剥掉继承来的 branchGeneration，再由 register 按当前 active 分支盖章。
  const { branchGeneration: _previousLife, ...fresh } = next;
  deps.runtimeTaskRegistry.register(fresh);
}

export function updateRuntimeBackgroundTask(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
  status: string,
  snapshot?: BackgroundTaskSnapshot,
): void {
  const taskType = runtimeTaskTypeForToolCall(toolCall);
  if (!taskType || !deps.runtimeTaskRegistry) return;
  deps.runtimeTaskRegistry.update(taskId, (current) => ({
    ...(isTerminalRuntimeTask(current)
      ? current
      : {
          ...current,
          completedAt: runtimeTaskCompletedAt(status, snapshot) ?? current.completedAt,
          description: runtimeTaskDescription(toolCall, undefined, snapshot) ?? current.description,
          error: runtimeTaskError(snapshot) ?? current.error,
          exitCode: runtimeTaskExitCode(snapshot) ?? current.exitCode,
          isBackgrounded: true,
          outputFile: backgroundTaskOutputMetadata(snapshot).outputFile ?? current.outputFile,
          pid: runtimeTaskPid(snapshot) ?? current.pid,
          // 用 `?? current.resultText`：undefined 绝不允许清掉已经存下的产物——中途的 running
          // 快照与产物缺席的终态都会走到这一行。
          resultText: runtimeTaskResultText(toolCall, status, snapshot) ?? current.resultText,
          status: normalizeRuntimeTaskStatus(status),
          taskType,
          type: taskType,
        }),
  }));
}

/**
 * 取 workflow run 的产物文本，只认 dwf 分派名（CreateWorkflow / ResumeWorkflowRun）的**终态**快照：
 * TaskOutput 的投影只能读到 registry 条目（dwf 从不写 outputFile），产物若没进条目，
 * 重启之后就彻底不可达了。
 *
 * legacy 的 `Workflow` 刻意不参与：它的结果走 `output.response` 的既有通知路径，契约保持不变。
 */
function runtimeTaskResultText(
  toolCall: ExecutableToolCall,
  status: string,
  snapshot: BackgroundTaskSnapshot | undefined,
): string | undefined {
  if (!isDynamicWorkflowRunDispatchToolName(toolCall.name)) return undefined;
  if (status === "running") return undefined;
  if (!snapshot || !("output" in snapshot)) return undefined;
  return serializeWorkflowArtifact(snapshot.output);
}

export function claimRuntimeBackgroundTaskNotification(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
): boolean {
  if (!runtimeTaskTypeForToolCall(toolCall) || !deps.runtimeTaskRegistry) return true;
  let claimed = false;
  const task = deps.runtimeTaskRegistry.update(taskId, (current) => {
    if (current.notified) return current;
    claimed = true;
    return { ...current, notified: true };
  });
  return task === undefined ? true : claimed;
}

export function releaseRuntimeBackgroundTaskNotification(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
): void {
  if (!runtimeTaskTypeForToolCall(toolCall) || !deps.runtimeTaskRegistry) return;
  deps.runtimeTaskRegistry.update(taskId, (current) =>
    current.notified ? { ...current, notified: false } : current,
  );
}

export function removeRuntimeBackgroundTask(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
): void {
  if (!runtimeTaskTypeForToolCall(toolCall) || !deps.runtimeTaskRegistry) return;
  deps.runtimeTaskRegistry.remove(taskId);
}

/** 固定名字 → 任务种类的对照表；表外名字再交给 dwf 谓词判断。 */
const TASK_TYPE_BY_TOOL_NAME: readonly (readonly [toolName: string, taskType: RuntimeTaskType])[] =
  [
    ["Bash", "local_bash"],
    ["Workflow", "local_workflow"],
  ];

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

function normalizeRuntimeTaskStatus(status: string): RuntimeTaskSnapshot["status"] {
  switch (status) {
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "cancelled":
    case "timed_out":
      return "killed";
    case "lost":
      return "lost";
    default:
      return "failed";
  }
}

function runtimeTaskDescription(
  toolCall: ExecutableToolCall,
  output?: Record<string, unknown>,
  snapshot?: BackgroundTaskSnapshot,
): string | undefined {
  const input = isRecord(toolCall.input) ? toolCall.input : {};
  if (snapshot && "description" in snapshot && typeof snapshot.description === "string") {
    return snapshot.description;
  }
  if (snapshot && "name" in snapshot && typeof snapshot.name === "string") return snapshot.name;
  if (output && typeof output.name === "string") return output.name;
  if (typeof input.description === "string") return input.description;
  if (typeof input.command === "string") return input.command;
  if (typeof input.name === "string") return input.name;
  if (typeof input.scriptPath === "string") return input.scriptPath;
  return undefined;
}

function runtimeTaskCompletedAt(
  status: string,
  snapshot: BackgroundTaskSnapshot | undefined,
): Date | undefined {
  if (status === "running") return undefined;
  return snapshot?.completedAt ?? new Date();
}

function runtimeTaskError(snapshot: BackgroundTaskSnapshot | undefined): string | undefined {
  if (!snapshot || !("error" in snapshot)) return undefined;
  const error = snapshot.error;
  return typeof error === "string" ? error : error?.message;
}

function runtimeTaskExitCode(snapshot: BackgroundTaskSnapshot | undefined): number | undefined {
  if (!snapshot || !("result" in snapshot)) return undefined;
  return snapshot.result?.exitCode;
}

function runtimeTaskPid(snapshot: BackgroundTaskSnapshot | undefined): number | undefined {
  if (!snapshot || !("pid" in snapshot)) return undefined;
  return snapshot.pid;
}

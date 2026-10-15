// SPDX-License-Identifier: Apache-2.0
// 项目记忆抽取的调度与排空（B46）。调度前置条件：运行时未关闭、抽取未被显式关闭、记忆根
// 存在、非远程工作区、会话与文件系统端口齐备；满足后捕获快照，异步解析「截止到边界消息的
// 持久化活跃分支」交给惰性创建的抽取调度器。执行体：扫描记忆清单 → 构造提示 → 组装请求
// 消息与执行器 → 跑记忆代理循环（最多 5 轮），全程挂遥测（成功/失败/取消三种收尾）。排空：
// null 直接等，否则与超时计时竞速，先到即返回并在 finally 清理计时器。
import { selectActiveConversationBranch, type TraceContext } from "../../deps.js";
import {
  buildMemoryExtractionPrompt,
  createMemoryExtractionScheduler,
  type MemoryExtractionScheduler,
  type MemoryExtractionSnapshot,
} from "../../../memory/extraction.js";
import { runMemoryAgentLoop } from "../../../memory/memory-agent-loop.js";
import { scanMemoryManifest } from "../../../memory/recall/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import {
  buildProjectMemoryAgentProviderMessages,
  captureProjectMemoryAgentContext,
  createProjectMemoryAgentToolExecutor,
  type ProjectMemoryAgentContext,
} from "./memory-agent-context.js";
import { resolveEnabledProjectMemoryRoot } from "./project-memory-root.js";

// 抽取任务的完整快照：调度快照与代理上下文的交集。
export type ProjectMemoryExtractionSnapshot = MemoryExtractionSnapshot & ProjectMemoryAgentContext;

// 快照调度器的内部别名（导出名保持冻结面不变）。
type SnapshotScheduler = MemoryExtractionScheduler<ProjectMemoryExtractionSnapshot>;

// 抽取调度器别名（快照类型绑定到本包的快照形状）。
export type ProjectMemoryExtractionScheduler = SnapshotScheduler;

// 调度器交付给执行体的一次抽取任务。
interface ExtractionTask {
  abortSignal: AbortSignal; // 任务级中止信号
  messageCount: number; // 参与抽取的消息条数
  snapshot: ProjectMemoryExtractionSnapshot; // 任务快照
}

// 调度一次抽取的输入。
export interface ExtractionScheduleInput {
  model: ProjectMemoryAgentContext["model"]; // 抽取用模型
  traceContext: TraceContext; // 链路追踪上下文
}

// 抽取收尾状态（遥测收尾三态）。
type ExtractionOutcome = "success" | "error" | "aborted";

// 记忆代理循环的工具调用参数形状（从循环入口签名反推）。
type MemoryLoopRequest = Parameters<typeof runMemoryAgentLoop>[0];
type MemoryToolCall = Parameters<MemoryLoopRequest["executeTool"]>[0];
type MemoryToolCallOptions = Parameters<MemoryLoopRequest["executeTool"]>[1];

// 抽取代理循环的轮数上限与默认排空超时。
const MAX_AGENT_TURNS = 5; // 记忆代理最多跑 5 轮
const DRAIN_WAIT_MS = 60_000; // 排空默认等 60 秒

// 抽取操作的固定标识（遥测契约字段）。
const EXTRACTION_OPERATION = "project_memory_extract";
const EXTRACTION_TARGET_KIND = "project_memory";
const EXTRACTION_EXECUTION_KIND = "background";
const EXTRACTION_TRIGGER = "scheduler";
const ABORT_REASON = "abort_signal";

// 边界消息缺失时的固定错误正文（值逐字冻结，按句拼接）。
const BOUNDARY_MISSING_MESSAGE = [
  "Extraction boundary is missing",
  "from the scheduled active branch",
].join(" ");

// 判定当前运行时是否启用项目记忆（按运行时 this 取配置与工作区根）。
export function isProjectMemoryEnabled(this: AgentRuntimeInternal): boolean {
  const memoryBase = resolveEnabledProjectMemoryRoot(this.config, this.workspaceRoot);
  return memoryBase !== undefined;
}

// 唤醒抽取执行体：扫描清单、构造提示、跑记忆代理循环，全程挂遥测。
const execute = (
  agentRuntime: AgentRuntimeInternal,
  task: ExtractionTask,
): Promise<ExtractionOutcome> => {
  const telemetry = agentRuntime.agentTelemetry.detached({
    causation: task.snapshot.causation,
    executionKind: EXTRACTION_EXECUTION_KIND,
    operation: EXTRACTION_OPERATION,
    targetKind: EXTRACTION_TARGET_KIND,
    traceContext: task.snapshot.traceContext,
    trigger: EXTRACTION_TRIGGER,
  });

  return telemetry.run(async (): Promise<ExtractionOutcome> => {
    try {
      // 扫描与循环的失败统一走 catch 收尾。
      const inventory = await scanMemoryManifest({
        fileSystem: agentRuntime.fileSystemPort!,
        rootDir: task.snapshot.memoryRoot,
        signal: task.abortSignal,
      });
      if (task.abortSignal.aborted) {
        telemetry.finishCancelled(ABORT_REASON);
        return "aborted"; // 扫描后立即中止
      }

      const extractionPrompt = buildMemoryExtractionPrompt({
        manifest: inventory,
        messageCount: task.messageCount,
      });
      const requestMessages = buildProjectMemoryAgentProviderMessages(
        agentRuntime,
        task.snapshot,
        extractionPrompt,
      );
      const executor = createProjectMemoryAgentToolExecutor(agentRuntime, task.snapshot);
      const loopBindings = {
        executeTool: (pendingCall: MemoryToolCall, callOptions: MemoryToolCallOptions) =>
          executor.execute(pendingCall, {
            signal: callOptions.abortSignal,
            traceContext: task.snapshot.traceContext,
          }),
        maxTurns: MAX_AGENT_TURNS,
        messages: requestMessages,
        model: task.snapshot.model,
        rootDir: task.snapshot.memoryRoot,
        tools: task.snapshot.tools,
        workingDirectory: task.snapshot.workingDirectory,
        workspaceRoot: task.snapshot.workspaceRoot,
      };
      await runMemoryAgentLoop({
        // 记忆代理循环入口：绑定执行器与快照上下文。
        abortSignal: task.abortSignal,
        ...loopBindings,
      });
      telemetry.finishCompleted(); // 成功收尾
      return "success";
    } catch (error) {
      const aborted =
        task.abortSignal.aborted || (error instanceof DOMException && error.name === "AbortError");
      if (aborted) {
        telemetry.finishCancelled(ABORT_REASON);
        return "aborted"; // 中止收尾
      }
      telemetry.finishFailed("execute", "internal", error); // 失败收尾
      return "error";
    }
  });
};

// 调度一次记忆抽取：前置条件任一不满足即空操作。
export const scheduleProjectMemoryExtraction = (
  agentRuntime: AgentRuntimeInternal,
  scheduleInput: ExtractionScheduleInput,
): void => {
  if (agentRuntime.shuttingDown) return;
  if (agentRuntime.config.memory?.extractionEnabled === false) return;

  const memoryBase = resolveEnabledProjectMemoryRoot(
    agentRuntime.config,
    agentRuntime.workspaceRoot,
  );
  if (!memoryBase) return;
  if (agentRuntime.isRemoteWorkspace()) return;
  if (!agentRuntime.sessionStore || !agentRuntime.fileSystemPort) return;

  const capturedBase = captureProjectMemoryAgentContext(agentRuntime, {
    memoryRoot: memoryBase,
    model: scheduleInput.model,
    operation: EXTRACTION_OPERATION,
    traceContext: scheduleInput.traceContext,
  });
  const edgeMessageId = agentRuntime.latestConversationMessageId;
  if (!edgeMessageId) return;

  const pendingMessages = agentRuntime.sessionStore.messages({
    sessionID: agentRuntime.sessionId,
  });
  const sessionLookup = agentRuntime.sessionStore.getSession(agentRuntime.sessionId);
  const pendingSnapshot = Promise.all([pendingMessages, sessionLookup]).then(
    ([storedMessages, sessionRecord]): ProjectMemoryExtractionSnapshot => {
      const branch = selectActiveConversationBranch(storedMessages, {
        branchCutAfterMessageId: sessionRecord?.revert?.branchCutAfterMessageID,
        rewindCreatedMessageId: sessionRecord?.revert?.createdMessageID,
        rewindKeptMessageIds: sessionRecord?.revert?.keptMessageIDs,
        rewindTargetMessageId: sessionRecord?.revert?.targetMessageID,
      });
      const edgeIndex = branch.findIndex((entry) => entry.info.id === edgeMessageId);
      if (edgeIndex < 0) throw new Error(BOUNDARY_MISSING_MESSAGE);
      return {
        ...capturedBase,
        boundaryMessageId: edgeMessageId,
        durableMessages: branch.slice(0, edgeIndex + 1),
      };
    },
  );

  // 调度器惰性创建，随运行时实例存活。
  agentRuntime.memoryExtractionScheduler ??=
    createMemoryExtractionScheduler<ProjectMemoryExtractionSnapshot>((task) =>
      execute(agentRuntime, task),
    );
  agentRuntime.memoryExtractionScheduler.schedule(pendingSnapshot);
};

// 排空抽取队列：null 直接等完；否则与超时计时竞速，超时只返回不打断任务。
export async function drainMemoryExtractions(
  // 从运行时 this 取调度器（与旧实现同口径）。
  this: AgentRuntimeInternal,
  waitMs: number | null = DRAIN_WAIT_MS,
): Promise<void> {
  // 先到即返回，计时器在 finally 清理。
  const queue = this.memoryExtractionScheduler;
  if (!queue) return;
  if (waitMs === null) {
    await queue.drain();
    return; // null 超时直接等完
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      // 排空与计时竞速。
      queue.drain(),
      new Promise<void>((settle) => {
        timer = setTimeout(settle, waitMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    // 超时只是返回，任务继续在后台跑。
    if (timer) clearTimeout(timer);
  }
}

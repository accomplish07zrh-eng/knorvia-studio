import type { StudioKernelEvent, StudioKernelId, StudioKernelTurnResult } from "../kernelTypes.js";
import { redactDiagnosticText } from "@knorvia/shared";
import type { StudioConversation, StudioMessage } from "../types.js";
import type {
  StudioGroupDefinition,
  StudioStepResult,
  StudioWorkflowDefinition,
} from "../workflowTypes.js";
import type {
  StudioAgentStep,
  StudioKernelRegistry,
  StudioStepInput,
  StudioWorkspacePort,
} from "./ports.js";
import type { ICreationService } from "../../creation/contract.js";
import type { StoredRun, StoredSession, StudioClock, StudioRepository } from "./storePort.js";
import { requiredRun } from "./commandAdmission.js";
import { waitStudioInteraction } from "./runtimeInteractions.js";
import { readStudioStep, saveStudioStep } from "./checkpointStorage.js";
import { pendingStudioSteering } from "./pendingInbox.js";
import { parseRemoteStudioKernelId } from "../domain/remoteAgentIdentity.js";
import { saveTurnEvent as writeTurnEvent } from "./turnEvents.js";
import { produceStudioStepOutputs } from "./stepOutputProduction.js";

export interface StudioTurnDependencies {
  db: StudioRepository;
  clock: StudioClock;
  kernels: StudioKernelRegistry;
  workspaces: StudioWorkspacePort;
  creation?: ICreationService;
  owner: string;
  config(kernel: StudioKernelId): {
    executablePath: string;
    permission: "read-only" | "ask" | "full-access";
    model?: string;
    reasoningEffort?: string;
  };
  acquire(key: string, signal: AbortSignal): Promise<() => void>;
}

export function assertStudioRunOwned(
  deps: Pick<StudioTurnDependencies, "db" | "clock" | "owner">,
  runId: string,
  allowCancellationSettlement = false,
): StoredRun {
  const run = requiredRun(deps.db, runId);
  if (
    !deps.db.owns(deps.owner, deps.clock.now()) ||
    run.owner !== deps.owner ||
    !["running", "waiting"].includes(run.state) ||
    (run.cancelRequested && !allowCancellationSettlement)
  )
    throw new Error("任务执行权已失效");
  return run;
}

export async function executeStudioTurn(
  deps: StudioTurnDependencies,
  runId: string,
  step: StudioAgentStep,
  runSignal: AbortSignal,
): Promise<StudioStepResult> {
  const { db, clock } = deps;
  const signal = step.signal ? AbortSignal.any([runSignal, step.signal]) : runSignal;
  signal.throwIfAborted();
  let run = assertStudioRunOwned(deps, runId);
  const cached = readStudioStep(db, run, step.id);
  if (cached) return cached;
  const member = step.memberId ?? step.kernel;
  const generation =
    run.kind === "group" && run.workspaceGeneration ? `:workspace:${run.workspaceGeneration}` : "";
  const key = `${run.kind}:${run.targetId}:${member}${generation}`;
  const release = await deps.acquire(key, signal);
  let result: StudioKernelTurnResult;
  let turnId = "";
  let workspacePath: string | undefined;
  let changesSummary: string | undefined;
  let dispatched = false;
  // 工作区身份要在 try 之外可见：命名输出的文件引用记录的是文件所在工作区的身份。
  let workspaceRunId = run.kind === "group" ? `group-${run.targetId}${generation}` : runId;
  let workspaceStepId = run.kind === "group" ? member : step.id;
  const remoteMember = parseRemoteStudioKernelId(step.kernel) !== null;
  try {
    signal.throwIfAborted();
    run = assertStudioRunOwned(deps, runId);
    if (
      run.kind === "group" &&
      step.id.startsWith("group:round:") &&
      pendingStudioSteering(db, runId).length
    )
      return {
        status: "skipped",
        text: "用户补充了任务说明，等待主持人重新安排。",
        resultKnown: true,
      };
    // A sibling may have completed this id while this request was queued.
    const completed = readStudioStep(db, run, step.id);
    if (completed) return completed;
    const conversation =
      run.kind === "chat" ? db.read<StudioConversation>("conversation", run.targetId) : undefined;
    const definition = run.definition as
      | StudioGroupDefinition
      | StudioWorkflowDefinition
      | undefined;
    const sourcePath = conversation?.workspacePath ?? definition?.workspacePath;
    if (!sourcePath) throw new Error("请先选择项目");
    workspaceRunId = run.kind === "group" ? `group-${run.targetId}${generation}` : runId;
    workspaceStepId = run.kind === "group" ? member : step.id;
    workspacePath =
      run.kind === "chat" || remoteMember
        ? sourcePath
        : await deps.workspaces.prepare({
            runId: workspaceRunId,
            stepId: workspaceStepId,
            sourcePath,
            mode: definition?.workspaceMode ?? "isolated",
          });
    signal.throwIfAborted();
    // 跨隔离输入：上游工作区里有这个相对路径，不代表下游工作区也有这份文件。
    // 由 Host 按「运行/步骤/输出身份」从上游工作区取到副本，放进本次工作区的**同一相对路径**，
    // 因此提示词里的相对路径在下游依然有效；源文件始终只读，通用 importFile 的内部存储限制不变。
    await importStudioStepInputs(deps, {
      runId: workspaceRunId,
      stepId: workspaceStepId,
      inputs: step.inputs ?? [],
      isolated: run.kind !== "chat" && !remoteMember,
    });
    const resolvedWorkspace = workspacePath;
    const sessionKey = `${key}:${workspacePath}`;
    const session = db.read<StoredSession>("session", sessionKey);
    const config =
      run.kind === "chat" && run.kernelConfig ? run.kernelConfig : deps.config(step.kernel);
    turnId = clock.id();
    db.transaction(() => {
      assertStudioRunOwned(deps, runId);
      db.write(
        "turn",
        turnId,
        {
          id: turnId,
          runId,
          stepId: step.id,
          state: "running",
          attempt: run.attempt,
          ...(run.kind === "group" ? { memberId: step.memberId ?? step.kernel } : {}),
          startedAt: clock.now(),
        },
        runId,
      );
      db.write(
        "workspace",
        `${runId}:${step.id}`,
        {
          runId: workspaceRunId,
          stepId: workspaceStepId,
          path: workspacePath,
          sourcePath,
          ...(remoteMember ? { remoteKernelId: step.kernel } : {}),
        },
        runId,
      );
      if (run.kind !== "chat")
        db.write(
          "workspace-head",
          `${runId}:${workspaceStepId}`,
          { stepId: step.id, path: workspacePath },
          runId,
        );
    });
    dispatched = true;
    result = await deps.kernels.adapter(step.kernel).run(
      {
        runId,
        turnId,
        dispatchId: `${runId}:${step.id}:${run.attempt}`,
        conversationId: key,
        kernel: step.kernel,
        workspacePath,
        ...(remoteMember && run.kind !== "chat"
          ? {
              workspaceMode: definition?.workspaceMode ?? "isolated",
              workspaceRunId,
              workspaceStepId,
            }
          : {}),
        nativeSessionId: session?.nativeSessionId,
        executablePath: config.executablePath || undefined,
        model: config.model,
        reasoningEffort: config.reasoningEffort,
        permission: step.permission ?? config.permission,
        text: step.prompt,
      },
      {
        emit: async (event) => {
          // 停止后的尾帧只丢弃；抛异常会把原生正常取消误判为传输失联。
          if (signal.aborted) return;
          db.transaction(() => {
            const current = requiredRun(db, runId);
            if (
              !db.owns(deps.owner, clock.now()) ||
              current.owner !== deps.owner ||
              current.cancelRequested ||
              !["running", "waiting"].includes(current.state)
            )
              return;
            if (event.type === "session") {
              db.write<StoredSession>("session", sessionKey, {
                id: sessionKey,
                nativeSessionId: event.sessionId,
                workspacePath: resolvedWorkspace,
              });
              if (conversation)
                db.write("conversation", conversation.id, {
                  // 会话选择可能已由后来排队的消息更新；原生回执只合并自身拥有的字段。
                  ...db.read<StudioConversation>("conversation", conversation.id),
                  nativeSessionId: event.sessionId,
                  updatedAt: clock.now(),
                });
            } else saveTurnEvent(deps, current, turnId, step.kernel, event, step.id);
          });
        },
        ask: (interaction, interactionSignal) =>
          waitStudioInteraction({
            ...deps,
            runId,
            turnId,
            kernel: step.kernel,
            interaction,
            signal: interactionSignal ? AbortSignal.any([signal, interactionSignal]) : signal,
            assertOwned: () => {
              signal.throwIfAborted();
              assertStudioRunOwned(deps, runId);
            },
          }),
      },
      signal,
    );
    if (remoteMember && result.workspacePath) {
      workspacePath = result.workspacePath;
      db.transaction(() => {
        const saved = db.read<Record<string, unknown>>("workspace", `${runId}:${step.id}`);
        if (saved)
          db.write(
            "workspace",
            `${runId}:${step.id}`,
            { ...saved, path: result.workspacePath },
            runId,
          );
      });
    }
    if (result.nativeSessionId && !signal.aborted)
      db.transaction(() => {
        assertStudioRunOwned(deps, runId);
        db.write<StoredSession>("session", sessionKey, {
          id: sessionKey,
          nativeSessionId: result.nativeSessionId!,
          workspacePath: resolvedWorkspace,
        });
      });
    if (remoteMember) changesSummary = result.changesSummary;
    else if (run.kind !== "chat" && !signal.aborted) {
      if (definition?.workspaceMode === "shared") {
        changesSummary = "共享项目模式：需检查当前项目文件，不能从成员的回复推断文件已正确修改。";
      } else {
        try {
          const changes = await deps.workspaces.changes(workspaceRunId, workspaceStepId);
          changesSummary = changes.length
            ? `${changes.length} 个文件有实际变化（相对于成员隔离基线）：\n` +
              changes
                .slice(0, 100)
                .map(
                  (change) =>
                    `${change.kind}: ${change.path}${change.conflict ? "（目标项目已有不同修改）" : ""}`,
                )
                .join("\n") +
              (changes.length > 100 ? "\n其余文件请在工作目录检查。" : "")
            : "成员隔离目录相对于基线没有文件变化。文本类结果可在回复中；文件类交付不能据此视为完成。";
        } catch (error) {
          changesSummary = `无法核实文件变化，请复核目录后再判断完成：${redactDiagnosticText(error instanceof Error ? error.message : String(error))}`;
        }
      }
    }
  } catch (error) {
    result = {
      status: signal.aborted ? "cancelled" : dispatched ? "interrupted" : "failed",
      text: "",
      resultKnown: !dispatched,
      error: redactDiagnosticText(error instanceof Error ? error.message : String(error)),
    };
  } finally {
    release();
  }
  const outcome: StudioStepResult = {
    status: result.status,
    text: redactDiagnosticText(result.text),
    error: result.error ? redactDiagnosticText(result.error) : result.error,
    resultKnown: result.resultKnown,
    retryable: result.retryable,
    workspacePath,
    changesSummary,
  };
  // 命名输出由真实 Agent 结果生产（见 stepOutputProduction.ts 与 output contract spec）。
  await produceStudioStepOutputs({
    step,
    outcome,
    workspaces: deps.workspaces,
    workspaceRunId,
    workspaceStepId,
  });
  if (db.owns(deps.owner, clock.now()))
    db.transaction(() => {
      const current = requiredRun(db, runId);
      if (current.owner !== deps.owner || !["running", "waiting"].includes(current.state)) return;
      if (turnId) {
        const turn = db.read<import("../types.js").StudioTurnSnapshot>("turn", turnId);
        db.write(
          "turn",
          turnId,
          {
            ...turn,
            id: turnId,
            runId,
            stepId: step.id,
            state: outcome.status,
            attempt: current.attempt,
            ...(run.kind === "group" ? { memberId: step.memberId ?? step.kernel } : {}),
            endedAt: clock.now(),
          },
          runId,
        );
        const existing = db.read<StudioMessage>("message", `${turnId}:text`);
        if (!existing && result.text)
          saveTurnEvent(
            deps,
            current,
            turnId,
            step.kernel,
            { type: "text", text: redactDiagnosticText(result.text) },
            step.id,
          );
        const hostMessage = db.read<StudioMessage>("message", `${turnId}:text`);
        if (hostMessage?.kind === "tool")
          db.write(
            "message",
            hostMessage.id,
            { ...hostMessage, state: outcome.status, updatedAt: clock.now() },
            current.targetId,
          );
      }
      saveStudioStep(db, current, step.id, outcome);
      current.updatedAt = clock.now();
      db.write("run", current.id, current, current.targetId);
    });
  return outcome;
}

/**
 * 把已核验的上游文件输出导入本次运行的隔离工作区。
 *
 * 只对隔离工作区生效（共享项目模式下游直接看同一个项目，不需要复制）；
 * 宿主没有实现窄范围导入能力时**失败关闭**，不退化为让下游去读上游路径。
 */
async function importStudioStepInputs(
  deps: StudioTurnDependencies,
  params: {
    runId: string;
    stepId: string;
    inputs: readonly StudioStepInput[];
    isolated: boolean;
  },
): Promise<void> {
  if (!params.inputs.length || !params.isolated) return;
  const importReference = deps.workspaces.importReference?.bind(deps.workspaces);
  if (!importReference) throw new Error("宿主不支持跨隔离输入导入，无法把上游输出交给下游步骤。");
  for (const input of params.inputs)
    await importReference({
      runId: params.runId,
      stepId: params.stepId,
      sourceRunId: input.sourceRunId,
      sourceStepId: input.sourceStepId,
      relativePath: input.relativePath,
      ...(input.sha256 ? { expectedSha256: input.sha256 } : {}),
    });
}

function saveTurnEvent(
  deps: StudioTurnDependencies,
  run: StoredRun,
  turnId: string,
  kernel: StudioKernelId,
  event: Exclude<StudioKernelEvent, { type: "session" }>,
  stepId: string,
): void {
  return writeTurnEvent(deps.db, deps.clock, run, turnId, kernel, event, stepId);
}

import { createHash } from "node:crypto";
import type { IStudioRuntimeService } from "../../contract.js";
import type {
  StudioKernelAdapter,
  StudioKernelEvent,
  StudioKernelId,
  StudioKernelTurnResult,
} from "../../kernelTypes.js";
import { parseRemoteStudioKernelId } from "../../domain/remoteAgentIdentity.js";
import { remoteStudioKernelId } from "./remoteAgentIdentity.js";

export interface RemoteStudioEnvironment {
  workspaceIdentity: string;
  workspacePath: string;
  label: string;
  service: Pick<
    IStudioRuntimeService,
    | "command"
    | "timeline"
    | "overview"
    | "inspectKernels"
    | "kernelOptions"
    | "prepareAgentWorkspace"
    | "agentWorkspaceChanges"
    | "applyAgentWorkspaceChanges"
  >;
}

function requestId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 40)}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function pause(signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, 250);
    const stop = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/** Route one Studio turn through the already authenticated SSH Host's Studio runtime. */
export function createRemoteKernelAdapter(
  kernelId: StudioKernelId,
  environments: () => RemoteStudioEnvironment[],
): StudioKernelAdapter {
  return {
    async run(turn, sink, signal): Promise<StudioKernelTurnResult> {
      const parsed = parseRemoteStudioKernelId(kernelId);
      if (!parsed || turn.kernel !== kernelId)
        return { status: "failed", text: "", resultKnown: true, error: "远程 Agent 身份无效" };
      const environment = environments().find(
        (item) => remoteStudioKernelId(item.workspaceIdentity, parsed.kernel) === kernelId,
      );
      if (!environment)
        return {
          status: "failed",
          text: "",
          resultKnown: true,
          error: "远程 Agent 连接不可用，请恢复对应 SSH 工作区后重试",
        };
      const { service } = environment;
      const conversationId = requestId("remote_conv", `${kernelId}:${turn.conversationId}`);
      const dispatchId = requestId("remote_send", `${kernelId}:${turn.dispatchId ?? turn.turnId}`);
      const seen = new Map<string, { text: string; state?: string }>();
      const handledInteractions = new Set<string>();
      let remoteRunId: string | undefined;
      let dispatched = false;
      let cancelIssued = false;
      let cancelDeadline = 0;
      try {
        signal.throwIfAborted();
        const remoteWorkspacePath =
          turn.workspaceRunId && turn.workspaceStepId
            ? await service.prepareAgentWorkspace({
                runId: turn.workspaceRunId,
                stepId: turn.workspaceStepId,
                sourcePath: environment.workspacePath,
                mode: turn.workspaceMode ?? "isolated",
              })
            : environment.workspacePath;
        await service.command({
          type: "create-conversation",
          commandId: requestId("remote_create", conversationId),
          id: conversationId,
          kernel: parsed.kernel,
          workspacePath: remoteWorkspacePath,
        });
        signal.throwIfAborted();
        // Once the send RPC begins, a transport error cannot prove the remote CLI did not run.
        dispatched = true;
        remoteRunId = (
          await service.command({
            type: "send",
            commandId: dispatchId,
            kind: "chat",
            targetId: conversationId,
            text: turn.text,
            kernelConfig: {
              executablePath: turn.executablePath ?? "",
              permission: turn.permission,
              model: turn.model,
              reasoningEffort: turn.reasoningEffort,
            },
          })
        ).id;
        while (true) {
          if (signal.aborted && !cancelIssued) {
            cancelIssued = true;
            cancelDeadline = Date.now() + 5000;
            await service.command({
              type: "cancel",
              commandId: requestId("remote_cancel", dispatchId),
              runId: remoteRunId,
            });
          }
          const timeline = await service.timeline(conversationId);
          for (const message of timeline.messages) {
            if (
              message.runId !== remoteRunId ||
              message.sender === "user" ||
              message.sender === "system"
            )
              continue;
            const prior = seen.get(message.id);
            if (message.kind === "tool") {
              if (prior?.text !== message.text || prior?.state !== message.state)
                await sink.emit({
                  type: "tool",
                  id: message.id,
                  name: message.name ?? "tool",
                  state:
                    message.state === "succeeded" || message.state === "failed"
                      ? message.state
                      : "running",
                  output: message.text,
                });
            } else if (["text", "reasoning", "progress"].includes(message.kind)) {
              const delta = message.text.startsWith(prior?.text ?? "")
                ? message.text.slice(prior?.text.length ?? 0)
                : message.text;
              if (delta) await sink.emit({ type: message.kind, text: delta } as StudioKernelEvent);
            }
            seen.set(message.id, { text: message.text, state: message.state });
          }
          if (timeline.usage?.runId === remoteRunId) {
            const { runId: _runId, turnId: _turnId, ...usage } = timeline.usage;
            await sink.emit({ type: "usage", ...usage });
          }
          for (const interaction of timeline.interactions) {
            if (
              interaction.runId !== remoteRunId ||
              interaction.status !== "pending" ||
              handledInteractions.has(interaction.id)
            )
              continue;
            handledInteractions.add(interaction.id);
            const answer = await sink.ask(interaction, signal);
            await service.command({
              type: "answer",
              commandId: requestId("remote_answer", `${dispatchId}:${interaction.id}`),
              interactionId: interaction.id,
              answer,
            });
          }
          const run = timeline.runs.find((item) => item.id === remoteRunId);
          if (run && !["queued", "running", "waiting"].includes(run.state)) {
            const text = timeline.messages
              .filter((message) => message.runId === remoteRunId && message.kind === "text")
              .map((message) => message.text)
              .join("\n");
            let changesSummary: string | undefined;
            if (turn.workspaceRunId && turn.workspaceStepId) {
              if (turn.workspaceMode === "shared")
                changesSummary = `远端 ${environment.label} 使用共享目录 ${environment.workspacePath}；请直接检查远端文件。`;
              else {
                try {
                  const changes = await service.agentWorkspaceChanges({
                    runId: turn.workspaceRunId,
                    stepId: turn.workspaceStepId,
                  });
                  changesSummary = `远端 ${environment.label} 的隔离目录有 ${changes.length} 个文件变化；请在修改面板检查后应用到该服务器项目。`;
                } catch (error) {
                  changesSummary = `远端 ${environment.label} 的文件变化暂无法核实：${errorText(error)}`;
                }
              }
            }
            return {
              status:
                run.state === "succeeded"
                  ? "succeeded"
                  : run.state === "cancelled"
                    ? "cancelled"
                    : run.state === "interrupted"
                      ? "interrupted"
                      : "failed",
              text,
              error: run.error,
              resultKnown: run.resultKnown !== false,
              workspacePath: remoteWorkspacePath,
              changesSummary,
            };
          }
          if (cancelIssued && Date.now() >= cancelDeadline)
            return {
              status: "interrupted",
              text: "",
              resultKnown: false,
              error: "远端已收到停止请求，但未在确认期限内返回终态；请检查远端任务。",
              workspacePath: remoteWorkspacePath,
            };
          await pause(cancelIssued ? undefined : signal);
        }
      } catch (error) {
        if (signal.aborted && remoteRunId && !cancelIssued) {
          try {
            await service.command({
              type: "cancel",
              commandId: requestId("remote_cancel", dispatchId),
              runId: remoteRunId,
            });
          } catch {
            // Transport failure leaves the result uncertain; do not claim cancellation.
          }
        }
        return {
          status: dispatched ? "interrupted" : "failed",
          text: "",
          resultKnown: !dispatched,
          error: dispatched
            ? `远端派发结果不确定：${errorText(error)}。请恢复 SSH 连接并检查远端任务。`
            : errorText(error),
          workspacePath: environment.workspacePath,
        };
      }
    },
  };
}

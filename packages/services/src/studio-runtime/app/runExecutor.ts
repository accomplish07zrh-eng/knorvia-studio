import type { StudioExecutionPort } from "./ports.js";
import { redactDiagnosticText } from "@knorvia/shared";
import { createHash } from "node:crypto";
import { readCreationReference } from "../../creation/node.js";
import type {
  StudioGroupDefinition,
  StudioStepResult,
  StudioWorkflowDefinition,
} from "../workflowTypes.js";
import type { StudioConversation, StudioMessage } from "../types.js";
import type { StoredRun } from "./storePort.js";
import { requiredRun } from "./commandAdmission.js";
import { executeStudioGroup } from "./groupExecutor.js";
import { executeStudioWorkflow } from "./workflowExecutor.js";
import { StudioInteractionCancelledError, waitStudioInteraction } from "./runtimeInteractions.js";
import { executionCheckpoint, saveStudioValues } from "./checkpointStorage.js";
import { pendingStudioInteractions, pendingStudioSteering } from "./pendingInbox.js";
import {
  assertStudioRunOwned,
  executeStudioTurn,
  type StudioTurnDependencies,
} from "./turnExecutor.js";

export async function executeStudioRun(
  deps: StudioTurnDependencies,
  runId: string,
  signal: AbortSignal,
): Promise<void> {
  const { db, clock } = deps;
  const run = requiredRun(db, runId);
  const port: StudioExecutionPort = {
    attempt: run.attempt,
    signal,
    steering: () => pendingStudioSteering(db, runId),
    async ackSteering(ids) {
      db.transaction(() => {
        assertStudioRunOwned(deps, runId);
        for (const id of ids) {
          const item = db.read<{ id: string; runId: string; text: string; state: string }>(
            "steering",
            id,
          );
          if (item?.runId === runId && item.state === "pending")
            db.write("steering", id, { ...item, state: "consumed" }, runId);
        }
      });
    },
    get checkpoint() {
      return executionCheckpoint(db, requiredRun(db, runId));
    },
    async saveCheckpoint(update) {
      db.transaction(() => {
        // The current owner may settle checkpoint outcomes while cancellation drains its nodes.
        const current = assertStudioRunOwned(deps, runId, true);
        if (current.attempt !== run.attempt) throw new Error("任务轮次已失效");
        saveStudioValues(db, current, update.values);
        current.checkpoint = {
          ...current.checkpoint,
          ...update,
          values: current.checkpoint.values,
        };
        db.write("run", runId, current, current.targetId);
      });
    },
    agent: (step) => executeStudioTurn(deps, runId, step, signal),
    async createMedia(request) {
      const creation = deps.creation;
      if (!creation)
        return { status: "failed", text: "", resultKnown: true, error: "创作服务不可用" };
      assertStudioRunOwned(deps, runId);
      const model = (await creation.listModels()).find((item) => item.id === request.modelId);
      if (!model || !model.enabled || !model.configured)
        return { status: "failed", text: "", resultKnown: true, error: "创作模型未配置或已停用" };
      if (!request.prompt.trim() || request.prompt.length > 8000)
        return {
          status: "failed",
          text: "",
          resultKnown: true,
          error: "创作提示词需在 1–8000 字符之间",
        };
      if (request.referencePath && model.kind !== "image")
        return { status: "failed", text: "", resultKnown: true, error: "视频模型不能使用参考图" };
      let reference: Awaited<ReturnType<typeof readCreationReference>> | undefined;
      if (request.referencePath) {
        try {
          reference = await readCreationReference(
            request.referencePath,
            (run.definition as StudioWorkflowDefinition).workspacePath ?? "",
            creation,
          );
        } catch (error) {
          return {
            status: "failed",
            text: "",
            resultKnown: true,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
      const requestId = createHash("sha256")
        .update(JSON.stringify([runId, run.attempt, request.nodeId]))
        .digest("hex");
      const created = await creation.createJob({
        requestId,
        kind: model.kind,
        modelId: model.id,
        prompt: request.prompt,
        ...(reference ? { reference } : {}),
      });
      await port.progress(`${model.name}：创作任务已开始`);
      try {
        for (;;) {
          const job = await creation.getJob(created.id);
          if (!job) throw new Error("创作任务记录丢失");
          if (job.status === "succeeded")
            return {
              status: "succeeded",
              text: job.outputs.map((item) => item.path).join("\n"),
              resultKnown: true,
            };
          if (job.status === "failed")
            return {
              status: "failed",
              text: "",
              error: job.error ?? "生成失败",
              resultKnown: true,
            };
          if (job.status === "interrupted" || job.status === "cancelled")
            return {
              status: "interrupted",
              text: "",
              error: job.error ?? "生成结果未知",
              resultKnown: false,
            };
          await clock.delay(1000, request.signal);
        }
      } catch (error) {
        if (request.signal.aborted) await creation.cancelJob(created.id).catch(() => undefined);
        throw error;
      }
    },
    async confirm(id, title, localSignal) {
      const answer = await waitStudioInteraction({
        ...deps,
        runId,
        turnId: `${runId}:attempt:${run.attempt}:confirm:${id}`,
        interaction: { id, kind: "approval", title },
        signal: localSignal ? AbortSignal.any([signal, localSignal]) : signal,
        assertOwned: () => {
          // Stop can be persisted before the scheduler delivers its abort signal.
          // Validate the real lease first: losing ownership is never a known cancellation.
          const current = assertStudioRunOwned(deps, runId, true);
          if (current.cancelRequested) throw new StudioInteractionCancelledError();
        },
      });
      return answer.decision === "allow-once" || answer.decision === "allow-session";
    },
    async progress(text) {
      db.transaction(() => {
        assertStudioRunOwned(deps, runId);
        const id = clock.id();
        const now = clock.now();
        db.write<StudioMessage>(
          "message",
          id,
          {
            id,
            targetId: run.targetId,
            runId,
            sender: "system",
            kind: "progress",
            text,
            createdAt: now,
            updatedAt: now,
          },
          run.targetId,
        );
      });
    },
    now: () => clock.now(),
    delay: (milliseconds, localSignal) =>
      clock.delay(milliseconds, localSignal ? AbortSignal.any([signal, localSignal]) : signal),
  };
  let result: StudioStepResult;
  try {
    if (run.kind === "chat") {
      const conversation = db.read<StudioConversation>("conversation", run.targetId);
      if (!conversation) throw new Error("会话不存在");
      result = await port.agent({ id: "reply", kernel: conversation.kernel, prompt: run.input });
    } else if (run.kind === "group") {
      const history = db
        .list<StudioMessage>("message", { scope: run.targetId, limit: 150 })
        .reverse()
        .filter((message) => message.runId !== run.id && message.kind === "text")
        .map((message) => `${message.sender}: ${message.text}`)
        .join("\n")
        .slice(-48000);
      result = await executeStudioGroup(
        run.definition as StudioGroupDefinition,
        run.input,
        run.taskMode === true,
        history,
        port,
      );
    } else
      result = await executeStudioWorkflow(
        run.definition as StudioWorkflowDefinition,
        run.input,
        port,
      );
  } catch (error) {
    result = {
      status: signal.aborted ? "cancelled" : "interrupted",
      text: "",
      resultKnown: false,
      error: redactDiagnosticText(error instanceof Error ? error.message : String(error)),
    };
  }
  if (!db.owns(deps.owner, clock.now())) return;
  db.transaction(() => {
    const current = requiredRun(db, runId);
    if (current.owner !== deps.owner || !["running", "waiting"].includes(current.state)) return;
    // 接收插话与最终完成都在同一数据库事务排序，防止最后一条补充落在完成检查后被漏掉。
    if (
      current.kind === "group" &&
      current.taskMode &&
      !current.cancelRequested &&
      result.status === "succeeded" &&
      pendingStudioSteering(db, runId).length
    ) {
      current.state = "queued";
      current.owner = undefined;
      current.updatedAt = clock.now();
      db.write("run", runId, current, current.targetId);
      return;
    }
    current.state =
      !result.resultKnown && result.status !== "succeeded"
        ? "interrupted"
        : current.cancelRequested
          ? "cancelled"
          : result.status === "skipped"
            ? "succeeded"
            : result.status;
    current.error = result.error ? redactDiagnosticText(result.error) : result.error;
    current.resultKnown = result.resultKnown;
    current.updatedAt = clock.now();
    if (
      current.kind === "group" &&
      current.taskMode &&
      current.state === "succeeded" &&
      result.text
    ) {
      const id = `${runId}:summary`;
      db.write<StudioMessage>(
        "message",
        id,
        {
          id,
          targetId: current.targetId,
          runId,
          sender: (current.definition as StudioGroupDefinition).host,
          kind: "text",
          text: redactDiagnosticText(result.text),
          createdAt: clock.now(),
          updatedAt: clock.now(),
        },
        current.targetId,
      );
    }
    db.write("run", runId, current, current.targetId);
    db.remove("active", runId);
    expireRunInteractions(db, current);
  });
}

export function expireRunInteractions(db: StudioTurnDependencies["db"], run: StoredRun): void {
  for (const item of pendingStudioInteractions(db, run.targetId)) {
    if (item.runId === run.id)
      db.write("interaction", item.id, { ...item, status: "expired" }, run.targetId);
  }
}

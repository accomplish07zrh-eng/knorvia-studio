import { redactDiagnosticText, redactDiagnosticValue } from "@knorvia/shared";
import type {
  StudioAgentEvent,
  StudioAgentFullResult,
  StudioAgentResultRef,
  StudioAgentTools,
} from "../agentToolTypes.js";
import {
  studioAgentState,
  studioAgentTaskState,
  studioAgentToolSchemas,
  studioAgentToolOutputSchemas,
  type StudioAgentToolName,
} from "../domain/agentToolPolicy.js";
import { canonicalStudioValue } from "../domain/canonicalValue.js";
import type { StudioStepResult } from "../workflowTypes.js";
import type { StoredInteraction, StoredRun } from "./storePort.js";
import { admitStudioCommandReceipt } from "./commandReceipts.js";
import { applyStudioCommand } from "./commandAdmission.js";
import {
  dispatchStudioAgent,
  messageStudioAgent,
  studioAgentKernelCatalog,
} from "./agentDispatch.js";
import { receiveStudioAgentEvents } from "./agentOutbox.js";
import {
  assertStudioAgentCaller,
  ownedStudioAgentTask,
  studioAgentScope,
  type StudioAgentCaller,
  type StudioAgentToolDependencies,
} from "./agentToolContext.js";

interface OperationReceipt {
  payload: string;
  result: unknown;
}
export class StudioAgentToolRuntime {
  private readonly mutations = new Map<string, Promise<unknown>>();
  constructor(private readonly deps: StudioAgentToolDependencies) {}
  bind(caller: StudioAgentCaller): StudioAgentTools {
    return {
      call: async (name, input) => {
        if (!Object.hasOwn(studioAgentToolSchemas, name))
          throw new Error("未知的 Studio Agent 工具");
        const tool = name as StudioAgentToolName;
        const parsed = studioAgentToolSchemas[tool].parse(input);
        const scope = studioAgentScope(this.deps, caller);
        if (!("commandId" in parsed))
          return studioAgentToolOutputSchemas[tool].parse(
            redactDiagnosticValue(await this.read(caller, tool, parsed)),
          );
        const previous = this.mutations.get(scope) ?? Promise.resolve();
        const operation = previous
          .catch(() => undefined)
          .then(() => this.mutate(caller, tool, parsed));
        this.mutations.set(scope, operation);
        try {
          return studioAgentToolOutputSchemas[tool].parse(redactDiagnosticValue(await operation));
        } finally {
          if (this.mutations.get(scope) === operation) this.mutations.delete(scope);
        }
      },
    };
  }

  private async read(
    caller: StudioAgentCaller,
    tool: StudioAgentToolName,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const { db, clock, policy } = this.deps;
    const scope = studioAgentScope(this.deps, caller);
    if (tool === "list_kernels") return studioAgentKernelCatalog(this.deps, caller);
    if (tool === "get_events") return receiveStudioAgentEvents(db, clock, scope, policy);
    if (tool === "ack_event")
      return db.transaction(() => {
        assertStudioAgentCaller(this.deps, caller);
        const event = db.read<StudioAgentEvent>("agent-event", String(input.eventId));
        if (!event) throw new Error("找不到所属事件");
        ownedStudioAgentTask(this.deps, caller, event.taskId);
        if (event.delivery !== "acked")
          db.write("agent-event", event.id, { ...event, delivery: "acked" }, scope);
        return { eventId: event.id, delivery: "acked" };
      });
    const task = ownedStudioAgentTask(this.deps, caller, String(input.taskId));
    if (tool === "get_task") {
      const runs = db.list<StoredRun>("run", { scope: task.targetId, all: true });
      const current = db.read<StoredRun>("run", task.runId);
      return {
        taskId: task.id,
        runId: task.runId,
        state: current ? studioAgentTaskState(runs, current) : "sent",
        kernel: task.kernel,
        permission: current?.kernelConfig?.permission ?? task.permission,
        runs: runs.map((run) => ({
          runId: run.id,
          attempt: run.attempt,
          state: studioAgentState(run),
        })),
        interactions: db
          .list<StoredInteraction>("interaction", { scope: task.targetId, all: true })
          .map(({ id, kind, title, status }) => ({ id, kind, title, status })),
        events: db
          .list<StudioAgentEvent>("agent-event", { scope, all: true })
          .filter((event) => event.taskId === task.id),
      };
    }
    if (tool !== "get_result") throw new Error("未知的只读 Studio Agent 工具");
    const ref = db.read<StudioAgentResultRef>("agent-result", String(input.resultId));
    if (!ref || ref.taskId !== task.id) throw new Error("找不到所属结果");
    const result: StudioAgentFullResult = {
      ...ref,
      results: ref.steps.map(({ stepId, resultId }) => {
        const saved = db.read<StudioStepResult>("agent-result-step", resultId);
        if (!saved) throw new Error("完整结果记录不可用");
        return { stepId, result: saved };
      }),
    };
    const chunked =
      input.stepId !== undefined ||
      input.artifactOffset !== undefined ||
      input.artifactLimit !== undefined;
    if ((input.offset !== undefined || input.length !== undefined) && input.stepId === undefined)
      throw new Error("文本分段需要步骤编号");
    if (!chunked) return result;
    const step = result.results.find((entry) => entry.stepId === input.stepId);
    if (input.stepId !== undefined && !step) throw new Error("找不到所属结果步骤");
    const offset = Number(input.offset ?? 0);
    const text = step?.result.text.slice(offset, offset + Number(input.length ?? 4000));
    const artifactOffset = Number(input.artifactOffset ?? 0);
    const artifacts = result.artifacts.slice(
      artifactOffset,
      artifactOffset + Number(input.artifactLimit ?? 100),
    );
    return {
      ...result,
      artifacts,
      results: step ? [{ stepId: step.stepId, result: { ...step.result, text } }] : [],
      textPage: step
        ? {
            offset,
            nextOffset: offset + text!.length,
            total: step.result.text.length,
            done: offset + text!.length >= step.result.text.length,
          }
        : undefined,
      artifactPage: {
        offset: artifactOffset,
        nextOffset: artifactOffset + artifacts.length,
        total: result.artifacts.length,
        done: artifactOffset + artifacts.length >= result.artifacts.length,
      },
    };
  }

  private async mutate(
    caller: StudioAgentCaller,
    tool: StudioAgentToolName,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const { db, clock } = this.deps;
    const scope = studioAgentScope(this.deps, caller);
    const key = `${scope}:${String(input.commandId)}`;
    const payload = redactDiagnosticText(canonicalStudioValue({ tool, input }));
    const previous = db.read<OperationReceipt>("agent-operation", key);
    if (previous) {
      if (previous.payload !== payload) throw new Error("同一请求编号不能提交不同操作");
      return previous.result;
    }
    db.transaction(() => {
      assertStudioAgentCaller(this.deps, caller);
      db.write<OperationReceipt>(
        "agent-operation",
        key,
        { payload, result: { state: "sent", needsUserPolicy: true } },
        scope,
      );
    });
    const complete = (result: unknown) => {
      db.write<OperationReceipt>("agent-operation", key, { payload, result }, scope);
      return result;
    };
    try {
      if (tool === "dispatch_task")
        return await dispatchStudioAgent(
          this.deps,
          caller,
          studioAgentToolSchemas.dispatch_task.parse(input),
          complete,
        );
      if (tool === "message_task")
        return await messageStudioAgent(
          this.deps,
          caller,
          studioAgentToolSchemas.message_task.parse(input),
          complete,
        );
      if (tool === "cancel_task") {
        const task = ownedStudioAgentTask(this.deps, caller, String(input.taskId));
        return db.transaction(() => {
          ownedStudioAgentTask(this.deps, caller, task.id);
          for (const run of db.list<StoredRun>("run", { scope: task.targetId, all: true })) {
            if (!["queued", "running", "waiting"].includes(run.state)) continue;
            admitStudioCommandReceipt(
              db,
              clock,
              { commandId: clock.id(), type: "cancel", runId: run.id },
              applyStudioCommand,
            );
          }
          const current = db.read<StoredRun>("run", task.runId)!;
          return complete({
            taskId: task.id,
            runId: current.id,
            state: studioAgentTaskState(
              db.list<StoredRun>("run", { scope: task.targetId, all: true }),
              current,
            ),
          });
        });
      }
      if (tool !== "request_permission") throw new Error("未知的 Studio Agent 变更工具");
      const answer = await caller.sink.ask(
        {
          id: `agent-permission:${String(input.commandId)}`,
          kind: "approval",
          title: redactDiagnosticText(String(input.title)),
          detail: redactDiagnosticText(String(input.detail)),
          choices: ["allow-once", "deny"],
        },
        caller.signal,
      );
      return db.transaction(() => {
        assertStudioAgentCaller(this.deps, caller);
        return complete({ decision: answer.decision ?? "deny", observed: true });
      });
    } catch (error) {
      // 已发送回执保留不确定性；不能把重放变成另一次外部执行。
      const current = db.read<OperationReceipt>("agent-operation", key);
      if (current && (current.result as { state?: string })?.state === "sent")
        db.transaction(() =>
          complete({
            state: "failed",
            error: redactDiagnosticText(error instanceof Error ? error.message : String(error)),
          }),
        );
      throw error;
    }
  }
}

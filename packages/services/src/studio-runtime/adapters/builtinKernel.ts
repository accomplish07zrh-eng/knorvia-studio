import type { IKnorviaTaskService } from "../../session/contract.js";
import type { IDisposable } from "@knorvia/rpc";
import type { KnorviaAgentMcpServer, KnorviaStreamEvent } from "@knorvia/shared";
import type {
  StudioKernelAdapter,
  StudioKernelSink,
  StudioKernelTurn,
  StudioKernelTurnResult,
} from "../kernelTypes.js";
import {
  builtinOutput,
  builtinPermissionChoices,
  builtinPermissionOption,
  builtinQuestion,
  builtinQuestionContent,
} from "./builtinEvents.js";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Knorvia keeps its native session and admission owner; Studio only observes one turn. */
export function createBuiltinStudioKernel(taskService: IKnorviaTaskService): StudioKernelAdapter {
  const active = new Set<string>();
  return {
    async run(turn, sink, signal) {
      const key = `${turn.workspacePath}\0${turn.nativeSessionId ?? turn.conversationId}`;
      if (active.has(key))
        throw new Error("This Knorvia session already has an active Studio turn.");
      if (turn.kernel !== "knorvia") throw new Error("Expected the Knorvia kernel.");
      // plan 模式仍放行部分 MCP 副作用，不能以 plan 冒充强制只读。
      if (turn.permission === "read-only")
        return {
          status: "failed",
          text: "",
          error:
            "Knorvia cannot enforce Studio read-only mode yet. Choose ask, or another kernel that supports read-only.",
          resultKnown: true,
          retryable: false,
        };
      if (signal.aborted)
        return {
          status: "cancelled",
          text: "",
          nativeSessionId: turn.nativeSessionId,
          resultKnown: true,
        };
      active.add(key);
      let nativeSessionId = turn.nativeSessionId;
      let nativeKey: string | undefined;
      try {
        const mode = turn.permission === "full-access" ? "yolo" : "build";
        const mcpServers: KnorviaAgentMcpServer[] | undefined = turn.sharedMcpServers?.map(
          (server) =>
            server.type === "stdio"
              ? {
                  name: server.name,
                  command: server.command,
                  args: server.args,
                  env: Object.entries(server.env).map(([name, value]) => ({ name, value })),
                }
              : {
                  name: server.name,
                  type: server.type,
                  url: server.url,
                  headers: Object.entries(server.headers).map(([name, value]) => ({ name, value })),
                },
        );
        const task = nativeSessionId
          ? await taskService.resumeTask({
              taskId: nativeSessionId,
              workspacePath: turn.workspacePath,
              model: turn.model,
              ...(mcpServers ? { mcpServers } : {}),
            })
          : await taskService.createTask({
              workspacePath: turn.workspacePath,
              mode,
              model: turn.model,
              ...(mcpServers ? { mcpServers } : {}),
              deferPersistenceUntilFirstPrompt: true,
            });
        nativeSessionId = task.taskId;
        const candidateNativeKey = `${turn.workspacePath}\0${nativeSessionId}`;
        if (candidateNativeKey !== key && active.has(candidateNativeKey))
          throw new Error("This Knorvia native session is already active.");
        nativeKey = candidateNativeKey;
        active.add(nativeKey);
        await sink.emit({ type: "session", sessionId: nativeSessionId });
        // resumeTask 的 mode 参数没有传到 runtime；必须显式设置，防止沿用上轮 yolo。
        await taskService.setMode({ taskId: nativeSessionId, mode });
        if (signal.aborted)
          return { status: "cancelled", text: "", nativeSessionId, resultKnown: true };
        return await executeTurn(taskService, turn, nativeSessionId, sink, signal);
      } catch (error) {
        return {
          status: signal.aborted ? "cancelled" : "failed",
          text: "",
          nativeSessionId,
          error: message(error),
          resultKnown: true,
          retryable: false,
        };
      } finally {
        active.delete(key);
        if (nativeKey) active.delete(nativeKey);
      }
    },
  };
}

async function executeTurn(
  service: IKnorviaTaskService,
  turn: StudioKernelTurn,
  taskId: string,
  sink: StudioKernelSink,
  signal: AbortSignal,
): Promise<StudioKernelTurnResult> {
  const subscriptions: IDisposable[] = [];
  const asked = new Set<string>();
  let text = "";
  let errorText: string | undefined;
  let terminal: { outcome: "succeeded" | "failed" | "stopped"; error?: string } | undefined;
  let ready = false;
  let submitted = false;
  let settled = false;
  let output = Promise.resolve();
  let stopInFlight: Promise<void> | undefined;
  let stopDeadline: ReturnType<typeof setTimeout> | undefined;
  let resolve!: (result: StudioKernelTurnResult) => void;
  const completion = new Promise<StudioKernelTurnResult>((done) => {
    resolve = done;
  });
  const target = { taskId, workspacePath: turn.workspacePath, runId: turn.turnId };
  const finish = (result: Omit<StudioKernelTurnResult, "text" | "nativeSessionId">) => {
    if (settled) return;
    settled = true;
    void output.then(
      () => resolve({ ...result, text, nativeSessionId: taskId }),
      (error) =>
        resolve({
          status: "interrupted",
          text,
          nativeSessionId: taskId,
          resultKnown: false,
          error: message(error),
        }),
    );
  };
  const check = () => {
    if (!terminal || !ready) return;
    finish({
      status: signal.aborted
        ? "cancelled"
        : errorText || terminal.outcome === "failed"
          ? "failed"
          : terminal.outcome === "stopped"
            ? "cancelled"
            : "succeeded",
      error: terminal.error ?? errorText,
      resultKnown: true,
      retryable: terminal.outcome === "failed",
    });
  };
  const requestStop = () => {
    if (stopInFlight || settled || !submitted) return;
    // 停止 ACK 不等于就绪；等待真实 terminal + ready。失联按结果未知收口。
    stopDeadline = setTimeout(
      () =>
        finish({
          status: "interrupted",
          resultKnown: false,
          error: "Knorvia did not confirm cancellation before the shutdown deadline.",
        }),
      2500,
    );
    stopInFlight = service
      .stopGeneration(target)
      .catch((error) =>
        finish({ status: "interrupted", resultKnown: false, error: message(error) }),
      );
  };
  const interaction = async (
    event: Extract<KnorviaStreamEvent, { type: "permission_request" | "elicitation_request" }>,
  ) => {
    if (asked.has(event.requestId)) return;
    asked.add(event.requestId);
    if (event.type === "permission_request") {
      const answer = await sink.ask({
        id: event.requestId,
        kind: "approval",
        title: event.title ?? event.description,
        detail: event.description,
        choices: builtinPermissionChoices(event.options),
      });
      if (settled || signal.aborted || terminal) return;
      const option = builtinPermissionOption(event.options, answer);
      await service.respondPermission({
        ...target,
        requestId: event.requestId,
        optionId: option.optionId,
        response: option.response,
      });
    } else {
      const answer = await sink.ask(builtinQuestion(event));
      if (settled || signal.aborted || terminal) return;
      await service.respondElicitation({
        ...target,
        requestId: event.requestId,
        action: answer.decision === "deny" ? "decline" : "accept",
        content: builtinQuestionContent(event, answer),
      });
    }
  };
  const receive = (event: KnorviaStreamEvent) => {
    if (
      settled ||
      !submitted ||
      event.taskId !== taskId ||
      (event.inputId && event.inputId !== turn.turnId)
    )
      return;
    if (event.type === "permission_request" || event.type === "elicitation_request") {
      void interaction(event).catch((error) => {
        errorText = message(error);
        requestStop();
      });
      return;
    }
    if (event.type === "task_error") errorText = event.error;
    const mapped = builtinOutput(event);
    if (mapped) {
      if (mapped.type === "text") text += mapped.text;
      output = output.then(() => sink.emit(mapped));
      void output.catch((error) => {
        errorText = message(error);
        requestStop();
      });
    }
  };
  try {
    subscriptions.push(
      service.onDynamicTaskEvent({
        workspacePath: turn.workspacePath,
        taskId,
        deliveryKind: "continuous",
      })(receive),
    );
    subscriptions.push(
      service.onDynamicTaskTerminalOutcome(taskId)((event) => {
        if (!submitted || settled || (event.inputId && event.inputId !== turn.turnId)) return;
        terminal = event;
        check();
      }),
    );
    subscriptions.push(
      service.onDynamicTaskReady(taskId)(() => {
        if (submitted && !settled) {
          ready = true;
          check();
        }
      }),
    );
    subscriptions.push(
      service.onError((error) => {
        if (error.taskId === taskId && (!error.traceId || error.traceId === turn.turnId))
          finish({ status: "interrupted", resultKnown: false, error: error.message });
      }),
    );
    signal.addEventListener("abort", requestStop, { once: true });
    submitted = true;
    if (signal.aborted) finish({ status: "cancelled", resultKnown: true });
    else {
      // 注册全部监听后才提交，处理内核在 sendPromise 返回前同步发出终态的情况。
      void service
        .sendPrompt({ taskId, traceId: turn.turnId, content: turn.text })
        .catch((error) =>
          finish({ status: "interrupted", resultKnown: false, error: message(error) }),
        );
    }
    return await completion;
  } finally {
    settled = true;
    signal.removeEventListener("abort", requestStop);
    if (stopDeadline) clearTimeout(stopDeadline);
    for (const subscription of subscriptions) subscription.dispose();
  }
}

import { list, number, record, safeDetail, text } from "../../domain/kernelPolicy.js";
import type { StudioSharedMcpServer } from "../../kernelTypes.js";
import type { KernelRun } from "./kernelRun.js";
import { assertReasoningOption, readCodexModelOptions } from "./modelOptions.js";

const toolOutputs = new WeakMap<KernelRun, Map<string, string>>();
const activeTurnIds = new WeakMap<KernelRun, { id: string }>();

export function codexArgs(): string[] {
  return ["app-server", "--listen", "stdio://"];
}

export async function startCodex(run: KernelRun): Promise<void> {
  const rpc = run.process;
  await rpc.request("initialize", {
    clientInfo: { name: "knorvia_studio", title: "Knorvia Studio", version: "0.1.0" },
    capabilities: { experimentalApi: true },
  });
  rpc.notify("initialized", {});
  const turn = run.turn;
  const reset =
    !!turn.nativeSessionId && (turn.model === undefined || turn.reasoningEffort === undefined);
  const inspected =
    reset || turn.reasoningEffort !== undefined
      ? await readCodexModelOptions(rpc, turn.workspacePath)
      : undefined;
  const options = inspected?.options;
  const model = turn.model ?? (reset ? options?.defaultModel : undefined);
  const listedModel = options?.models.find((item) => item.id === model);
  const configuredEffort =
    model === inspected?.configuredDefault?.model
      ? inspected?.configuredDefault?.reasoningEffort
      : undefined;
  const effort =
    turn.reasoningEffort ??
    (reset ? (listedModel?.defaultReasoning ?? configuredEffort) : undefined);
  // 原生配置可以指定目录外的自定义模型；仅恢复其真实配置值，不给用户伪造选项。
  const configuredReset =
    reset && !listedModel && turn.reasoningEffort === undefined && configuredEffort !== undefined;
  if (
    reset &&
    !configuredReset &&
    (!listedModel || (listedModel.reasoning.length > 0 && effort === undefined))
  )
    throw new Error("无法确认 Codex 的原生默认模型或思考档位，请明确选择后重试");
  const sharedMcpServers = run.turn.sharedMcpServers;
  const configuration = {
    cwd: turn.workspacePath,
    ...(model ? { model, allowProviderModelFallback: false } : {}),
    approvalPolicy:
      turn.permission === "full-access" || turn.permission === "read-only" ? "never" : "on-request",
    sandbox: turn.permission === "full-access" ? "danger-full-access" : "read-only",
    approvalsReviewer: "user",
    // Studio MCP 只覆盖这一条线程；不写用户现有的 Codex 配置。
    ...(sharedMcpServers ? { config: codexStudioMcpConfig(sharedMcpServers) } : {}),
  };
  const started = await rpc.request(turn.nativeSessionId ? "thread/resume" : "thread/start", {
    ...configuration,
    ...(turn.nativeSessionId ? { threadId: turn.nativeSessionId } : {}),
  });
  const id = text(record(started.thread).id);
  if (!id) throw new Error("Codex 没有返回会话 ID");
  if (turn.nativeSessionId && id !== turn.nativeSessionId)
    throw new Error("Codex 恢复到了不同会话");
  if (model && (started.model || configuredReset) && started.model !== model)
    throw new Error("Codex 未采用指定模型，已停止执行");
  if (
    turn.permission !== "full-access" &&
    started.sandbox &&
    record(started.sandbox).type !== "readOnly"
  )
    throw new Error("Codex 返回了不符合请求的沙箱权限，已停止执行");
  run.setSession(id);
  if (effort !== undefined && options && !configuredReset) {
    // 恢复会话的实际模型由原生响应确定，不能拿目录默认模型代替。
    assertReasoningOption(options, model || text(started.model), effort);
  }
  const activeTurn = { id: "" };
  activeTurnIds.set(run, activeTurn);
  run.interrupt = async () => {
    if (activeTurn.id)
      await rpc.request("turn/interrupt", { threadId: id, turnId: activeTurn.id }, 2000);
  };
  if (run.cancelled.signal.aborted) return run.finish("cancelled");
  if (turn.text.trim() === "/status") {
    const response = await rpc.request("thread/read", { threadId: id, includeTurns: false });
    const thread = record(response.thread);
    run.delta(
      "status",
      [
        `Codex 会话：${text(thread.id) || id}`,
        `项目：${text(thread.cwd) || turn.workspacePath}`,
        `状态：${text(record(thread.status).type) || text(thread.status) || "可用"}`,
      ].join("\n"),
    );
    return run.finish("succeeded");
  }
  if (turn.text.trim() === "/compact") {
    run.submitted = true;
    await rpc.request("thread/compact/start", { threadId: id });
    return;
  }
  run.submitted = true;
  const startedTurn = await rpc.request("turn/start", {
    threadId: id,
    input: [{ type: "text", text: turn.text }],
    ...(model ? { model } : {}),
    ...(effort !== undefined ? { effort } : {}),
  });
  activeTurn.id = text(record(startedTurn.turn).id);
  if (run.cancelled.signal.aborted) await run.interrupt();
}

export function codexStudioMcpConfig(servers: StudioSharedMcpServer[]): {
  mcp_servers: Record<string, Record<string, unknown>>;
} {
  const mcp_servers: Record<string, Record<string, unknown>> = Object.create(null) as Record<
    string,
    Record<string, unknown>
  >;
  for (const server of servers) {
    if (server.type === "sse")
      throw new Error(`Codex 不支持 Studio MCP「${server.name}」的 SSE 传输`);
    mcp_servers[server.name] =
      server.type === "stdio"
        ? { command: server.command, args: server.args, env: server.env }
        : { url: server.url, http_headers: server.headers };
  }
  return { mcp_servers };
}

export async function codexMessage(
  run: KernelRun,
  message: Record<string, unknown>,
): Promise<void> {
  const method = text(message.method);
  const params = record(message.params);
  if (params.threadId && params.threadId !== run.sessionId) return;
  if (message.id !== undefined && method) return codexRequest(run, message.id, method, params);
  if (method === "serverRequest/resolved") {
    run.invalidate(String(params.requestId));
    return;
  }
  if (method === "item/agentMessage/delta") run.delta(text(params.itemId), text(params.delta));
  if (method === "item/commandExecution/outputDelta") {
    let outputs = toolOutputs.get(run);
    if (!outputs) {
      outputs = new Map();
      toolOutputs.set(run, outputs);
    }
    const id = text(params.itemId);
    const output = ((outputs.get(id) ?? "") + text(params.delta)).slice(-100_000);
    outputs.set(id, output);
    run.emit({
      type: "tool",
      id,
      name: "commandExecution",
      state: "running",
      output: safeDetail(output),
    });
  }
  if (
    (method.includes("reasoning") && method.endsWith("Delta")) ||
    (method.startsWith("item/reasoning/") && method.endsWith("delta"))
  )
    run.emit({ type: "reasoning", text: text(params.delta) });
  if (method === "thread/tokenUsage/updated") {
    const tokenUsage = record(params.tokenUsage);
    const usage = record(tokenUsage.last);
    run.emit({
      type: "usage",
      scope: "request",
      inputTokens: number(usage.inputTokens),
      outputTokens: number(usage.outputTokens),
      cacheReadTokens: number(usage.cachedInputTokens),
      contextUsedTokens: number(usage.totalTokens),
      contextMaxTokens: number(tokenUsage.modelContextWindow),
    });
  }
  if (method === "turn/started") {
    const id = text(record(params.turn).id);
    const active = activeTurnIds.get(run);
    if (active && id) active.id = id;
  }
  if (method === "item/started" || method === "item/completed") {
    const item = record(params.item);
    const type = text(item.type);
    const id = text(item.id);
    if (type === "agentMessage" && method === "item/completed") run.whole(id, text(item.text));
    if (
      ["commandExecution", "fileChange", "mcpToolCall", "webSearch", "dynamicToolCall"].includes(
        type,
      )
    ) {
      run.emit({
        type: "tool",
        id,
        name: text(item.tool) || type,
        state:
          method === "item/started"
            ? "running"
            : ["failed", "declined"].includes(text(item.status))
              ? "failed"
              : "succeeded",
        input: safeDetail(item.command ?? item.arguments ?? item.changes),
        output: safeDetail(item.aggregatedOutput ?? item.result ?? item.error ?? ""),
      });
    }
  }
  if (method === "turn/completed") {
    const turn = record(params.turn);
    const status = text(turn.status);
    if (status === "completed") run.finish("succeeded");
    else if (status === "interrupted") run.finish("cancelled");
    else run.finish("failed", text(record(turn.error).message) || "Codex 调用失败");
  }
}

async function codexRequest(
  run: KernelRun,
  id: unknown,
  method: string,
  params: Record<string, unknown>,
): Promise<void> {
  const rpc = run.process;
  if (method === "item/permissions/requestApproval") {
    if (run.turn.permission === "read-only")
      return rpc.respond(id, { permissions: {}, scope: "turn" });
    try {
      const answer = await run.ask({
        id: String(id),
        kind: "approval",
        title: "Codex 请求额外文件或网络权限",
        detail: safeDetail(params),
        choices: ["allow-once", "allow-session", "deny"],
      });
      rpc.respond(id, {
        permissions:
          answer.decision === "allow-once" || answer.decision === "allow-session"
            ? record(params.permissions)
            : {},
        scope: answer.decision === "allow-session" ? "session" : "turn",
      });
    } catch {
      try {
        rpc.respond(id, { permissions: {}, scope: "turn" });
      } catch {
        /* Process already closed. */
      }
    }
    return;
  }
  if (method === "item/tool/requestUserInput") {
    const questions = list(params.questions).map((value) => {
      const q = record(value);
      return {
        id: text(q.id),
        title: text(q.question),
        options: list(q.options).map((option) => text(record(option).label)),
      };
    });
    try {
      const answer = await run.ask({
        id: String(id),
        kind: "question",
        title: questions[0]?.title || "Codex 需要补充信息",
        questions,
      });
      rpc.respond(id, {
        answers: Object.fromEntries(
          questions.map((q) => [q.id, { answers: answer.answers?.[q.id] ?? [] }]),
        ),
      });
    } catch {
      if (!run.cancelled.signal.aborted) rpc.respond(id, { answers: {} });
    }
    return;
  }
  if (
    ["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(method)
  ) {
    if (run.turn.permission === "read-only") return rpc.respond(id, { decision: "decline" });
    try {
      const choices = list(params.availableDecisions).filter(
        (value): value is string => typeof value === "string",
      );
      const answer = await run.ask({
        id: String(id),
        kind: "approval",
        title: method.includes("commandExecution") ? "Codex 请求执行命令" : "Codex 请求修改文件",
        detail: safeDetail(params.command ?? params.reason ?? params),
        choices: [
          "allow-once",
          ...(choices.length === 0 || choices.includes("acceptForSession")
            ? ["allow-session"]
            : []),
          "deny",
        ],
      });
      const decision =
        answer.decision === "allow-session"
          ? "acceptForSession"
          : answer.decision === "allow-once"
            ? "accept"
            : "decline";
      if (choices.length && !choices.includes(decision)) rpc.respond(id, { decision: "decline" });
      else rpc.respond(id, { decision });
    } catch {
      try {
        rpc.respond(id, { decision: "cancel" });
      } catch {
        /* Process already closed. */
      }
    }
    return;
  }
  rpc.reject(id, `Studio 尚不支持此 Codex 交互：${method}`);
}

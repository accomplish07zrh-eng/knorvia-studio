import { list, number, record, safeDetail, text } from "../../domain/kernelPolicy.js";
import type { KernelRun } from "./kernelRun.js";
import { acpModelOptions, configOption, selectAcpOption } from "./acpOptions.js";
import { projectAcpMcpServers } from "./acpMcp.js";

const replaying = new WeakSet<KernelRun>();

export async function initializeAcp(
  rpc: KernelRun["process"],
  timeoutMs = 25_000,
): Promise<Record<string, unknown>> {
  const initialized = await rpc.request(
    "initialize",
    {
      protocolVersion: 1,
      clientInfo: { name: "knorvia-studio", version: "0.1.0" },
      clientCapabilities: {},
    },
    timeoutMs,
  );
  if (initialized.protocolVersion !== 1) throw new Error("CLI 未通过 ACP v1 握手");
  return initialized;
}

function permissionMode(state: Record<string, unknown>, permission: string): string | undefined {
  const mode = configOption(state, "mode");
  if (!mode) return;
  const available = list(mode.options)
    .map(record)
    .map((item) => text(item.value));
  const choices =
    permission === "read-only"
      ? ["plan", "read-only", "readonly"]
      : ["bypassPermissions", "bypass_permissions", "yolo", "full-access"];
  return choices.find((item) => available.includes(item));
}

export async function startAcp(run: KernelRun): Promise<void> {
  const rpc = run.process;
  const initialized = await initializeAcp(rpc);
  const sharedMcp = await projectAcpMcpServers(run.turn.sharedMcpServers, initialized);
  const native = record(initialized.agentCapabilities);
  const canResume = !!record(native.sessionCapabilities).resume;
  const canLoad = native.loadSession === true;
  if (run.turn.nativeSessionId && !canResume && !canLoad)
    throw new Error("此 CLI 未声明支持冷恢复，不能续接原生会话");
  let opened: Record<string, unknown>;
  const method = run.turn.nativeSessionId
    ? canResume
      ? "session/resume"
      : "session/load"
    : "session/new";
  if (method === "session/load") replaying.add(run);
  try {
    opened = await rpc.request(method, {
      cwd: run.turn.workspacePath,
      mcpServers: sharedMcp,
      ...(run.turn.nativeSessionId ? { sessionId: run.turn.nativeSessionId } : {}),
    });
  } finally {
    replaying.delete(run);
  }
  const id = text(opened.sessionId) || run.turn.nativeSessionId;
  if (!id) throw new Error("ACP CLI 没有返回会话 ID");
  if (run.turn.nativeSessionId && id !== run.turn.nativeSessionId)
    throw new Error("ACP CLI 恢复了其他会话");
  run.setSession(id);
  let state = opened;
  if (run.turn.permission !== "ask") {
    const selected = permissionMode(state, run.turn.permission);
    if (!selected)
      throw new Error(
        `此 CLI 未提供可核验的${run.turn.permission === "read-only" ? "只读" : "完全访问"}模式`,
      );
    state = await selectAcpOption(rpc, id, state, "mode", selected);
  }
  if (run.turn.model) state = await selectAcpOption(rpc, id, state, "model", run.turn.model);
  if (run.turn.reasoningEffort) {
    const model =
      text(configOption(state, "model")?.currentValue) || text(record(state.models).currentModelId);
    const options = acpModelOptions(state);
    const selected = options.models.find((item) => item.id === model);
    if (!selected?.reasoning.some((item) => item.id === run.turn.reasoningEffort))
      throw new Error(`模型 ${model || "默认模型"} 不支持思考档位 ${run.turn.reasoningEffort}`);
    state = await selectAcpOption(rpc, id, state, "thought_level", run.turn.reasoningEffort);
    const after =
      text(configOption(state, "model")?.currentValue) || text(record(state.models).currentModelId);
    if (after !== model) throw new Error("设置思考档位后 CLI 切换了模型，已停止执行");
  }
  run.interrupt = () => rpc.notify("session/cancel", { sessionId: id });
  if (run.cancelled.signal.aborted) return run.finish("cancelled");
  run.submitted = true;
  const result = await rpc.request(
    "session/prompt",
    {
      sessionId: id,
      prompt: [{ type: "text", text: run.turn.text }],
    },
    0,
  );
  const reason = text(result.stopReason);
  if (reason === "end_turn") run.finish("succeeded");
  else if (reason === "cancelled") run.finish("cancelled");
  else run.finish("failed", text(result.error) || `ACP CLI 停止：${reason || "未知结果"}`);
}

export async function acpMessage(run: KernelRun, message: Record<string, unknown>): Promise<void> {
  const method = text(message.method);
  const params = record(message.params);
  if (message.id !== undefined && method) return acpRequest(run, message.id, method, params);
  if (replaying.has(run) || (params.sessionId && params.sessionId !== run.sessionId)) return;
  if (method !== "session/update") return;
  const update = record(params.update);
  const kind = text(update.sessionUpdate);
  const content = record(update.content);
  if (kind === "agent_message_chunk")
    run.delta(text(update.messageId) || "answer", text(content.text));
  else if (kind === "agent_thought_chunk")
    run.emit({ type: "reasoning", text: text(content.text) });
  else if (kind === "tool_call" || kind === "tool_call_update")
    run.emit({
      type: "tool",
      id: text(update.toolCallId),
      name: text(update.title) || text(update.kind) || "tool",
      state:
        update.status === "completed"
          ? "succeeded"
          : update.status === "failed"
            ? "failed"
            : "running",
      input: safeDetail(update.rawInput ?? ""),
      output: safeDetail(update.rawOutput ?? update.content ?? ""),
    });
  else if (kind === "usage_update")
    run.emit({
      type: "usage",
      scope: "reported",
      inputTokens: number(update.inputTokens),
      outputTokens: number(update.outputTokens),
      // ACP 的 used/size 是上下文快照，不能当作累计输入/输出计费。
      contextUsedTokens: number(update.used),
      contextMaxTokens: number(update.size),
    });
}

async function acpRequest(
  run: KernelRun,
  id: unknown,
  method: string,
  params: Record<string, unknown>,
): Promise<void> {
  const rpc = run.process;
  if (params.sessionId && params.sessionId !== run.sessionId)
    return rpc.reject(id, "不是当前会话的交互");
  if (replaying.has(run)) return rpc.reject(id, "历史会话不能重新授权");
  if (method !== "session/request_permission")
    return rpc.reject(id, `Studio 尚不支持此 ACP 客户端请求：${method}`);
  try {
    const choices = list(params.options).map(record);
    const answer = await run.ask({
      id: String(id),
      kind: "approval",
      title: text(record(params.toolCall).title) || "CLI 请求执行工具",
      detail: safeDetail(params.toolCall),
      choices: ["allow-once", "deny"],
    });
    const expected = answer.decision === "allow-once" ? "allow_once" : "reject_once";
    const option = choices.find((item) => item.kind === expected);
    rpc.respond(id, {
      outcome: option
        ? { outcome: "selected", optionId: option.optionId }
        : { outcome: "cancelled" },
    });
  } catch {
    try {
      rpc.respond(id, { outcome: { outcome: "cancelled" } });
    } catch {
      /* Process already stopped. */
    }
  }
}

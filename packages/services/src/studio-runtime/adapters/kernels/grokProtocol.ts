import { list, number, record, safeDetail, text } from "../../domain/kernelPolicy.js";
import type { StudioKernelTurn } from "../../kernelTypes.js";
import type { KernelRun } from "./kernelRun.js";
import { assertReasoningOption, grokModelOptions } from "./modelOptions.js";
import { projectAcpMcpServers } from "./acpMcp.js";
import { authenticateGrok } from "./grokAuth.js";

const replaying = new WeakSet<KernelRun>();
export function grokArgs(turn: StudioKernelTurn): string[] {
  return [
    "--permission-mode",
    turn.permission === "full-access" ? "bypassPermissions" : "default",
    "agent",
    "--no-leader",
    ...(turn.model ? ["--model", turn.model] : []),
    "stdio",
  ];
}
export async function startGrok(run: KernelRun): Promise<void> {
  const rpc = run.process;
  const initialized = await rpc.request("initialize", {
    protocolVersion: 1,
    clientInfo: { name: "knorvia-studio", version: "0.1.0" },
    clientCapabilities: {},
  });
  if (initialized.protocolVersion !== 1) throw new Error("Grok ACP 版本不兼容");
  const options = grokModelOptions(initialized);
  const reset =
    !!run.turn.nativeSessionId &&
    (run.turn.model === undefined || run.turn.reasoningEffort === undefined);
  const model = run.turn.model ?? (reset ? options.defaultModel : undefined);
  const listedModel = options.models.find((item) => item.id === model);
  const effort = run.turn.reasoningEffort ?? (reset ? listedModel?.defaultReasoning : undefined);
  if (reset && (!listedModel || (listedModel.reasoning.length > 0 && effort === undefined)))
    throw new Error("无法确认 Grok 的原生默认模型或思考档位，请明确选择后重试");
  await authenticateGrok(rpc, initialized);
  if (run.turn.nativeSessionId && record(initialized.agentCapabilities).loadSession !== true)
    throw new Error("此 Grok 版本不支持恢复会话");
  if (run.turn.nativeSessionId) replaying.add(run);
  const sharedMcpServers = run.turn.sharedMcpServers;
  let opened: Record<string, unknown>;
  try {
    opened = await rpc.request(run.turn.nativeSessionId ? "session/load" : "session/new", {
      cwd: run.turn.workspacePath,
      mcpServers: await projectAcpMcpServers(sharedMcpServers ?? [], initialized),
      ...(run.turn.nativeSessionId ? { sessionId: run.turn.nativeSessionId } : {}),
    });
  } finally {
    replaying.delete(run);
  }
  const id = text(opened.sessionId) || run.turn.nativeSessionId;
  if (!id) throw new Error("Grok 没有返回会话 ID");
  if (run.turn.nativeSessionId && id !== run.turn.nativeSessionId)
    throw new Error("Grok 恢复了其他会话");
  run.setSession(id);
  if (model) {
    await rpc.request("session/set_model", { sessionId: id, modelId: model });
  }
  if (effort !== undefined) {
    const modelOption = list(opened.configOptions)
      .map(record)
      .find((option) => option.id === "model");
    const selectedModel =
      model || text(modelOption?.currentValue) || text(record(opened.models).currentModelId);
    assertReasoningOption(options, selectedModel, effort);
    const configured = await rpc.request("session/set_config_option", {
      sessionId: id,
      configId: "reasoning_effort",
      value: effort,
    });
    const config = list(configured.configOptions).map(record);
    // ACP 支持按档位路由模型，必须核对回显，避免表面选低档实际换模。
    if (config.find((option) => option.id === "reasoning_effort")?.currentValue !== effort)
      throw new Error("Grok 未采用指定思考档位，已停止执行");
    if (config.find((option) => option.id === "model")?.currentValue !== selectedModel)
      throw new Error("Grok 设置思考档位后切换了模型，已停止执行");
  }
  run.interrupt = () => rpc.notify("session/cancel", { sessionId: id });
  if (run.cancelled.signal.aborted) return run.finish("cancelled");
  run.submitted = true;
  const result = await rpc.request(
    "session/prompt",
    { sessionId: id, prompt: [{ type: "text", text: run.turn.text }] },
    0,
  );
  completeGrok(run, result);
}
function completeGrok(run: KernelRun, result: Record<string, unknown>): void {
  const reason = text(result.stopReason);
  if (reason === "cancelled") run.finish("cancelled");
  else if (reason === "end_turn") run.finish("succeeded");
  else run.finish("failed", text(result.error) || `Grok 停止：${reason || "未知结果"}`);
}
export async function grokMessage(run: KernelRun, message: Record<string, unknown>): Promise<void> {
  const method = text(message.method).replace(/^_x\.ai\//, "x.ai/");
  const params = record(message.params);
  if (message.id !== undefined && method) return grokRequest(run, message.id, method, params);
  if (replaying.has(run) || (params.sessionId && params.sessionId !== run.sessionId)) return;
  if (method === "x.ai/session/prompt_complete") {
    completeGrok(run, params);
    return;
  }
  const update = record(params.update);
  if (method === "session/update") {
    const type = text(update.sessionUpdate);
    const content = record(update.content);
    if (type === "agent_message_chunk") run.delta("answer", text(content.text));
    if (type === "agent_thought_chunk") run.emit({ type: "reasoning", text: text(content.text) });
    if (type === "tool_call" || type === "tool_call_update")
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
        output: safeDetail(update.content ?? update.rawOutput ?? ""),
      });
    if (type === "usage_update")
      run.emit({
        type: "usage",
        scope: "reported",
        inputTokens: number(update.inputTokens),
        outputTokens: number(update.outputTokens),
        contextUsedTokens: number(update.used),
        contextMaxTokens: number(update.size),
      });
  }
  if (update.sessionUpdate === "response_completed") {
    const usage = record(update.usage);
    run.emit({
      type: "usage",
      scope: "request",
      inputTokens: number(usage.input_tokens),
      outputTokens: number(usage.output_tokens),
    });
  }
  if (update.sessionUpdate === "interaction_resolved") run.invalidate(text(update.tool_call_id));
}
async function grokRequest(
  run: KernelRun,
  id: unknown,
  method: string,
  params: Record<string, unknown>,
): Promise<void> {
  const rpc = run.process;
  if (params.sessionId && params.sessionId !== run.sessionId)
    return rpc.reject(id, "不是当前会话的交互");
  if (replaying.has(run)) return rpc.reject(id, "不能重新批准历史交互");
  try {
    if (method === "session/request_permission") {
      const options = list(params.options).map(record);
      const answer = await run.ask({
        id: String(id),
        kind: "approval",
        title: text(record(params.toolCall).title) || "Grok 请求执行工具",
        detail: safeDetail(params.toolCall),
        choices: ["allow-once", "deny"],
      });
      const option = options.find(
        (value) => value.kind === (answer.decision === "allow-once" ? "allow_once" : "reject_once"),
      );
      rpc.respond(id, {
        outcome: option
          ? { outcome: "selected", optionId: option.optionId }
          : { outcome: "cancelled" },
      });
      return;
    }
    if (method === "x.ai/ask_user_question") {
      const interactionId = text(params.toolCallId) || String(id);
      const questions = list(params.questions).map((value, index) => {
        const q = record(value);
        return {
          id: String(index),
          title: text(q.question),
          options: list(q.options).map((value) => text(record(value).label)),
          multiple: q.multiSelect === true,
        };
      });
      const answer = await run.ask({
        id: interactionId,
        kind: "question",
        title: questions[0]?.title || "Grok 需要补充信息",
        questions,
      });
      rpc.respond(
        id,
        answer.decision === "deny"
          ? { outcome: "cancelled" }
          : {
              outcome: "accepted",
              answers: Object.fromEntries(
                questions.map((q) => [q.title, answer.answers?.[q.id] ?? []]),
              ),
            },
      );
      return;
    }
    if (method === "x.ai/exit_plan_mode") {
      const answer = await run.ask({
        id: String(id),
        kind: "approval",
        title: "Grok 请求开始执行计划",
        detail: safeDetail(params.planContent ?? params.plan ?? params),
        choices: ["allow-once", "deny"],
      });
      rpc.respond(id, {
        outcome: answer.decision === "allow-once" ? "approved" : "rejected",
        feedback: answer.decision === "allow-once" ? null : "用户未批准计划",
      });
      return;
    }
    rpc.reject(id, `Studio 尚不支持此 Grok 交互：${method}`);
  } catch {
    try {
      rpc.respond(
        id,
        method === "session/request_permission"
          ? { outcome: { outcome: "cancelled" } }
          : { outcome: "cancelled" },
      );
    } catch {
      /* Process already stopped. */
    }
  }
}

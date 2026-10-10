import { nativeApprovalDetail, nativeQuestionOptions } from "../../domain/kernelPresentation.js";
import { randomUUID } from "node:crypto";
import { claudeInputTokens } from "../../domain/kernelUsage.js";
import { list, number, record, safeDetail, text } from "../../domain/kernelPolicy.js";
import type { StudioKernelTurn } from "../../kernelTypes.js";
import type { KernelRun } from "./kernelRun.js";
import { assertReasoningOption, claudeModelOptions } from "./modelOptions.js";
import { claudeContentMedia } from "../../domain/kernelMedia.js";

interface ClaudeState {
  messageId: string;
  tools: Map<string, string>;
  blocks: Map<number, { id: string; name: string; json: string }>;
}
const states = new WeakMap<KernelRun, ClaudeState>();
function stateFor(run: KernelRun): ClaudeState {
  let state = states.get(run);
  if (!state) {
    state = { messageId: "assistant", tools: new Map(), blocks: new Map() };
    states.set(run, state);
  }
  return state;
}
export function claudeArgs(turn: StudioKernelTurn): string[] {
  const sharedMcpConfigPath = turn.sharedMcpConfigPath;
  return [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-prompt-tool",
    "stdio",
    // MCP 凭据只放在 Studio 私有的本次运行文件，避免进入命令行参数或外部全局配置。
    ...(sharedMcpConfigPath ? ["--mcp-config", sharedMcpConfigPath] : []),
    "--permission-mode",
    turn.permission === "full-access" ? "bypassPermissions" : "manual",
    ...(turn.model ? ["--model", turn.model] : []),
    ...(turn.reasoningEffort !== undefined ? ["--effort", turn.reasoningEffort] : []),
    turn.nativeSessionId ? `--resume=${turn.nativeSessionId}` : `--session-id=${randomUUID()}`,
  ];
}
export async function startClaude(run: KernelRun): Promise<void> {
  run.interrupt = () => run.process.request("interrupt", {}, 2000).then(() => {});
  const initialized = await run.process.request("initialize", { hooks: {} });
  if (run.turn.nativeSessionId) {
    // resume 可能带回会话覆盖；使用原生清除命令恢复 CLI 默认，而非沿用旧选择。
    if (run.turn.model === undefined) await run.process.request("set_model", {});
    if (run.turn.reasoningEffort === undefined)
      await run.process.request("apply_flag_settings", { settings: { effortLevel: null } });
  }
  if (run.turn.reasoningEffort !== undefined) {
    const options = claudeModelOptions(initialized);
    const selected = list(initialized.models)
      .map(record)
      .find((model) => model.value === run.turn.model || model.resolvedModel === run.turn.model);
    // 原生全名和别名可指向同一模型；未声明 effort 的模型必须阻止发送。
    const id = run.turn.model ? text(selected?.value) : undefined;
    assertReasoningOption(options, id, run.turn.reasoningEffort);
  }
  if (run.cancelled.signal.aborted) return run.finish("cancelled");
  run.submitted = true;
  run.process.send({
    type: "user",
    message: { role: "user", content: run.turn.text },
    parent_tool_use_id: null,
    ...(run.sessionId ? { session_id: run.sessionId } : {}),
  });
}
export async function claudeMessage(
  run: KernelRun,
  message: Record<string, unknown>,
): Promise<void> {
  const type = text(message.type);
  if (text(message.session_id)) {
    if (run.sessionId && run.sessionId !== message.session_id)
      throw new Error("Claude Code 返回了其他会话的数据");
    run.setSession(text(message.session_id));
  }
  if (type === "control_request") return claudeRequest(run, message);
  if (type === "control_cancel_request") {
    run.invalidate(String(message.request_id));
    return;
  }
  const state = stateFor(run);
  if (type === "stream_event") {
    const event = record(message.event);
    const eventType = text(event.type);
    if (eventType === "message_start") {
      state.messageId = text(record(event.message).id) || state.messageId;
      state.blocks.clear();
    }
    if (eventType === "content_block_start") {
      const block = record(event.content_block);
      if (block.type === "tool_use") {
        const id = text(block.id);
        const name = text(block.name);
        state.blocks.set(number(event.index) ?? 0, { id, name, json: "" });
        state.tools.set(id, name);
        run.emit({ type: "tool", id, name, state: "running", input: safeDetail(block.input) });
      }
    }
    if (eventType === "content_block_delta") {
      const delta = record(event.delta);
      const index = number(event.index) ?? 0;
      if (delta.type === "text_delta") run.delta(`${state.messageId}:${index}`, text(delta.text));
      if (delta.type === "thinking_delta")
        run.emit({ type: "reasoning", text: text(delta.thinking) });
      if (delta.type === "input_json_delta") {
        const tool = state.blocks.get(index);
        if (tool) {
          tool.json = (tool.json + text(delta.partial_json)).slice(0, 100_000);
        }
      }
    }
    if (eventType === "content_block_stop") {
      const block = state.blocks.get(number(event.index) ?? 0);
      if (block?.json)
        run.emit({
          type: "tool",
          id: block.id,
          name: block.name,
          state: "running",
          input: safeDetail(block.json),
        });
    }
  }
  if (type === "assistant" || type === "user") {
    const body = record(message.message);
    if (type === "assistant") {
      const usage = record(body.usage);
      const inputTokens = claudeInputTokens(usage);
      const outputTokens = number(usage.output_tokens);
      // 修复 Claude Code 对话中途 token／缓存命中停在「—」：每条 assistant 消息即一次模型请求，
      // 以 request 口径上报计费用量与缓存；轮次结束的 result 再以 turn 口径整体替换。
      if (inputTokens !== undefined && outputTokens !== undefined)
        run.emit({
          type: "usage",
          scope: "request",
          inputTokens,
          outputTokens,
          cacheReadTokens: number(usage.cache_read_input_tokens),
          cacheWriteTokens: number(usage.cache_creation_input_tokens),
          contextUsedTokens: inputTokens + outputTokens,
        });
    }
    const id = text(body.id) || state.messageId;
    if (type === "assistant" && id === state.messageId && Array.isArray(body.content)) {
      const confirmed = new Set(
        list(body.content)
          .map(record)
          .filter((block) => block.type === "tool_use")
          .map((block) => text(block.id)),
      );
      // 流式工具只是提议；最终 assistant 未包含它时不能继续冒充执行中。
      for (const block of state.blocks.values()) {
        if (!confirmed.has(block.id))
          run.tool({
            id: block.id,
            name: block.name,
            state: "unknown",
            statusDetail: "最终消息未确认此工具提议 / Unconfirmed tool proposal",
          });
      }
      state.blocks.clear();
    }
    list(body.content).forEach((value, index) => {
      const block = record(value);
      const blockType = text(block.type);
      if (type === "assistant" && blockType === "text")
        run.whole(`${id}:${index}`, text(block.text));
      // 修复依据：assistant 图片块此前被丢弃，tool_result 中的图片被字符串化截断。
      if (blockType === "image" || blockType === "tool_result")
        run.media(claudeContentMedia(block));
      if (blockType === "tool_use") {
        const toolId = text(block.id);
        const name = text(block.name);
        state.tools.set(toolId, name);
        run.emit({
          type: "tool",
          id: toolId,
          name,
          state: "running",
          input: safeDetail(block.input),
        });
      }
      if (blockType === "tool_result") {
        const toolId = text(block.tool_use_id);
        run.emit({
          type: "tool",
          id: toolId,
          name: state.tools.get(toolId) ?? "tool",
          state: block.is_error ? "failed" : "succeeded",
          output: safeDetail(block.content),
        });
      }
    });
  }
  if (type === "result") {
    const usage = record(message.usage);
    run.emit({
      type: "usage",
      scope: "turn",
      inputTokens: claudeInputTokens(usage),
      outputTokens: number(usage.output_tokens),
      cacheReadTokens: number(usage.cache_read_input_tokens),
      cacheWriteTokens: number(usage.cache_creation_input_tokens),
      modelSteps: number(message.num_turns),
      // 单模型结果才有唯一窗口容量；多模型总用量不能推导某个模型的上下文。
      contextMaxTokens:
        Object.keys(record(message.modelUsage)).length === 1
          ? number(record(Object.values(record(message.modelUsage))[0]).contextWindow)
          : undefined,
    });
    if (!run.text && typeof message.result === "string") run.whole("result", message.result);
    if (run.cancelled.signal.aborted && message.is_error) run.finish("cancelled");
    else if (message.is_error || message.subtype !== "success")
      run.finish("failed", safeDetail(message.errors ?? message.result ?? message.subtype));
    else run.finish("succeeded");
  }
}

async function claudeRequest(run: KernelRun, message: Record<string, unknown>): Promise<void> {
  const id = message.request_id;
  const request = record(message.request);
  if (request.subtype !== "can_use_tool")
    return run.process.reject(id, `尚不支持的 Claude 控制请求：${text(request.subtype)}`);
  const name = text(request.tool_name);
  const input = record(request.input);
  try {
    if (name === "AskUserQuestion") {
      const questions = list(input.questions).map((value, index) => {
        const q = record(value);
        return {
          id: String(index),
          title: text(q.question),
          options: nativeQuestionOptions(q.options),
          multiple: q.multiSelect === true,
        };
      });
      const answer = await run.ask({
        id: String(id),
        kind: "question",
        title: questions[0]?.title || "Claude Code 需要补充信息",
        questions,
      });
      if (answer.decision === "deny")
        return run.process.respond(id, { behavior: "deny", message: "用户取消回答" });
      const answers = Object.fromEntries(
        questions.map((q) => [
          q.title,
          q.multiple ? (answer.answers?.[q.id] ?? []) : (answer.answers?.[q.id]?.[0] ?? ""),
        ]),
      );
      run.process.respond(id, { behavior: "allow", updatedInput: { ...input, answers } });
      return;
    }
    const answer = await run.ask({
      id: String(id),
      kind: "approval",
      title: `Claude Code 请求使用 ${name}`,
      detail: nativeApprovalDetail(request),
      choices: ["allow-once", "deny"],
    });
    // 不把许可建议写回用户的全局或项目配置；一次批准仅作用于这个 tool_use。
    run.process.respond(
      id,
      answer.decision === "allow-once"
        ? { behavior: "allow", updatedInput: input }
        : { behavior: "deny", message: "用户拒绝执行" },
    );
  } catch {
    try {
      run.process.respond(id, { behavior: "deny", message: "交互已取消", interrupt: true });
    } catch {
      /* Process already stopped. */
    }
  }
}

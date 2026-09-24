import { spawn } from "node:child_process";
import { number, record, safeDetail, text } from "../../domain/kernelPolicy.js";
import type { StudioKernelOptions, StudioKernelTurn } from "../../kernelTypes.js";
import type { KernelExecutable } from "./executable.js";
import type { KernelRun } from "./kernelRun.js";
import { stopOwnedTree } from "./processTransport.js";

/** AGY uses its own NDJSON event protocol, not ACP. Keep prompts out of process arguments. */
export function antigravityArgs(turn: StudioKernelTurn): string[] {
  return [
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--print-timeout", "12h",
    ...(turn.nativeSessionId ? ["--conversation", turn.nativeSessionId] : []),
    ...(turn.model ? ["--model", turn.model] : []),
    ...(turn.reasoningEffort ? ["--effort", turn.reasoningEffort] : []),
    ...(turn.permission === "full-access" ? ["--dangerously-skip-permissions"] : []),
  ];
}

export async function startAntigravity(run: KernelRun): Promise<void> {
  // Print mode has no control-response channel for permission prompts or MCP injection.
  // Never mutate the user's global AGY profile or project .agents directory.
  if (run.turn.sharedMcpServers?.length)
    run.emit({
      type: "progress",
      text: "Antigravity CLI 暂无每会话 MCP 配置入口；Studio 的 Skill 已共享，MCP 请在原 CLI 配置。",
    });
  run.interrupt = () => run.process.close();
  if (run.cancelled.signal.aborted) return run.finish("cancelled");
  run.submitted = true;
  run.process.send({ event: "user", message: { content: run.turn.text } });
}

export function antigravityMessage(run: KernelRun, message: Record<string, unknown>): void {
  const event = text(message.event);
  const result = record(message.result);
  const update = record(message.step_update);
  const conversationId = text(
    event === "result" ? result.conversation_id : message.conversation_id ?? update.conversation_id,
  );
  if (conversationId) {
    if (run.turn.nativeSessionId && conversationId !== run.turn.nativeSessionId)
      throw new Error("Antigravity CLI 恢复了其他会话");
    run.setSession(conversationId);
  }
  if (event === "step_update") {
    if (update.step_type === "agent_response")
      run.delta("answer", text(update.text_delta));
    if (update.step_type === "tool") {
      const tool = record(update.tool_info);
      const error = record(tool.error);
      run.emit({
        type: "tool",
        id: String(update.step_index ?? "tool"),
        name: text(update.tool_name) || text(tool.name) || "tool",
        state: update.state === "DONE" ? (Object.keys(error).length ? "failed" : "succeeded") : "running",
        input: safeDetail(tool.parameters ?? ""),
        output: safeDetail(tool.output ?? error.message ?? ""),
      });
    }
    return;
  }
  if (event !== "result") return;
  run.whole("answer", text(result.response));
  const usage = record(result.usage);
  run.emit({
    type: "usage",
    inputTokens: number(usage.input_tokens),
    outputTokens: number(usage.output_tokens),
  });
  const status = text(result.status);
  if (status === "SUCCESS") run.finish("succeeded");
  else if (status === "CANCELED") run.finish("cancelled");
  else if (status === "INTERRUPTED") run.finish("interrupted", text(result.error));
  else run.finish("failed", text(result.error) || `Antigravity CLI 停止：${status || "未知结果"}`);
}

/** `agy models` is read-only and does not initiate a model turn. */
export async function antigravityModelOptions(
  executable: KernelExecutable,
  cwd: string,
  signal?: AbortSignal,
): Promise<StudioKernelOptions> {
  signal?.throwIfAborted();
  const output = await new Promise<string>((resolve, reject) => {
    // 环境副本需保留可选键类型，才能移除 Electron 注入的 Node 变量。
    const env: NodeJS.ProcessEnv = { ...process.env, AGY_CLI_DISABLE_AUTO_UPDATE: "true" };
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable.command, [...executable.args, "models"], {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) {
        void stopOwnedTree(child).finally(() => reject(error));
      } else resolve(stdout);
    };
    const abort = () => finish(new Error("Antigravity 模型目录查询已取消"));
    const timer = setTimeout(() => finish(new Error("Antigravity 模型目录查询超时")), 15_000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 256_000) finish(new Error("Antigravity 模型目录过大"));
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + String(chunk)).slice(-4000);
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) =>
      finish(code === 0 ? undefined : new Error(safeDetail(stderr || stdout) || `agy models 失败 (${code})`)),
    );
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
  const models = output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([a-z0-9][a-z0-9._-]{0,127})\s{2,}(.+?)\s*$/i);
    return match
      ? [{
          id: match[1]!,
          label: match[2]!,
          reasoning: ["low", "medium", "high"].map((id) => ({ id, label: id })),
        }]
      : [];
  });
  if (!models.length) throw new Error("Antigravity CLI 没有返回可识别的模型目录");
  return { models };
}

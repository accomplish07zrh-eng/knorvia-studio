import { errorText, list, record, text, type ExternalKernel } from "../../domain/kernelPolicy.js";
import type { StudioKernelOptions } from "../../kernelTypes.js";
import type { KernelExecutable } from "./executable.js";
import { ProtocolProcess } from "./processTransport.js";
import { acpModelOptions, selectAcpOption } from "./acpOptions.js";
import { initializeAcp } from "./acpProtocol.js";
import { BUILTIN_KERNEL_BY_ID, type KernelDescriptor } from "./acpCatalog.js";
import { antigravityModelOptions } from "./antigravityProtocol.js";
import { acpAvailableCommands } from "./acpCommands.js";
import { authenticateGrok } from "./grokAuth.js";
import { claudeAvailableCommands } from "./claudeCommands.js";

type Model = StudioKernelOptions["models"][number];
const effortLabels: Record<string, string> = {
  none: "无",
  minimal: "最低",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "更高",
  max: "最高",
  ultra: "极高",
};
function reasoning(values: unknown[]): Model["reasoning"] {
  const options = values
    .map((value) => {
      const option = record(value);
      const id = typeof value === "string" ? value : text(option.id);
      return { id, label: text(option.label) || effortLabels[id] || id };
    })
    .filter((option) => option.id);
  return [...new Map(options.map((option) => [option.id, option])).values()];
}
function catalog(models: Model[], defaultModel?: string): StudioKernelOptions {
  return {
    models: [
      ...new Map(models.filter((model) => model.id).map((model) => [model.id, model])).values(),
    ],
    ...(defaultModel ? { defaultModel } : {}),
  };
}

async function discoveredCommands(
  sessionId: string,
  commandUpdates: Record<string, unknown>[],
): Promise<NonNullable<StudioKernelOptions["commands"]>> {
  // ACP has no list request or completion marker; a missing native update remains empty.
  if (!commandUpdates.some((message) => acpAvailableCommands(message, sessionId)))
    await new Promise((resolve) => setTimeout(resolve, 350));
  const native = commandUpdates.flatMap(
    (message) => acpAvailableCommands(message, sessionId) ?? [],
  );
  return [...new Map(native.map((command) => [command.name, command])).values()];
}

export async function codexModelOptions(
  rpc: ProtocolProcess,
  cwd?: string,
): Promise<StudioKernelOptions> {
  return (await readCodexModelOptions(rpc, cwd)).options;
}

export async function readCodexModelOptions(
  rpc: ProtocolProcess,
  cwd?: string,
): Promise<{
  options: StudioKernelOptions;
  configuredDefault?: { model: string; reasoningEffort?: string };
}> {
  const models: Model[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let defaultModel: string | undefined;
  do {
    const response = await rpc.request("model/list", {
      limit: 100,
      includeHidden: true,
      ...(cursor ? { cursor } : {}),
    });
    for (const value of list(response.data)) {
      const model = record(value);
      if (model.hidden === true) continue;
      const id = text(model.model);
      if (model.isDefault === true) defaultModel = id;
      models.push({
        id,
        label: text(model.displayName) || id,
        ...(text(model.description) ? { description: text(model.description) } : {}),
        reasoning: reasoning(
          list(model.supportedReasoningEfforts).map((value) => ({
            id: text(record(value).reasoningEffort),
          })),
        ),
        ...(text(model.defaultReasoningEffort)
          ? { defaultReasoning: text(model.defaultReasoningEffort) }
          : {}),
      });
    }
    cursor = text(response.nextCursor) || undefined;
    if (cursor && seen.has(cursor)) throw new Error("Codex 模型目录重复返回同一分页标记");
    if (cursor) seen.add(cursor);
  } while (cursor);
  // 目录推荐模型不等于用户 CLI 默认；只抽取两项，绝不保存或暴露其他配置。
  const { model: configuredModel, model_reasoning_effort: configuredEffort } = record(
    (await rpc.request("config/read", { includeLayers: false, ...(cwd ? { cwd } : {}) })).config,
  );
  defaultModel = text(configuredModel) || defaultModel;
  if (text(configuredEffort)) {
    for (const model of models) {
      if (model.reasoning.some((option) => option.id === configuredEffort))
        model.defaultReasoning = text(configuredEffort);
      else delete model.defaultReasoning;
    }
  }
  return {
    options: {
      ...catalog(models, defaultModel),
      // These are implemented through the stable app-server RPC, not sent as model text.
      commands: [
        { name: "status", description: "显示当前 Codex 会话与项目状态" },
        { name: "compact", description: "使用 Codex 原生会话压缩" },
      ],
    },
    ...(text(configuredModel)
      ? {
          configuredDefault: {
            model: text(configuredModel),
            reasoningEffort: text(configuredEffort) || undefined,
          },
        }
      : {}),
  };
}

export function claudeModelOptions(initialized: Record<string, unknown>): StudioKernelOptions {
  const models = list(initialized.models).map((value): Model => {
    const model = record(value);
    const id = text(model.value);
    return {
      id,
      label: text(model.displayName) || id,
      ...(text(model.description) ? { description: text(model.description) } : {}),
      reasoning: model.supportsEffort === true ? reasoning(list(model.supportedEffortLevels)) : [],
    };
  });
  return {
    ...catalog(models, models.some((model) => model.id === "default") ? "default" : undefined),
    commands: claudeAvailableCommands(initialized),
  };
}

export function grokModelOptions(initialized: Record<string, unknown>): StudioKernelOptions {
  const state = record(record(initialized._meta).modelState);
  const models = list(state.availableModels).map((value): Model => {
    const model = record(value);
    const meta = record(model._meta);
    const options =
      meta.supportsReasoningEffort === true ? list(meta.reasoningEfforts).map(record) : [];
    const currentEffort = text(meta.reasoningEffort);
    const defaultReasoning = currentEffort
      ? text(
          options.find((option) => option.value === currentEffort || option.id === currentEffort)
            ?.id,
        )
      : text(options.find((option) => option.default === true)?.id);
    return {
      id: text(model.modelId),
      label: text(model.name) || text(model.modelId),
      ...(text(model.description) ? { description: text(model.description) } : {}),
      reasoning: reasoning(options),
      ...(defaultReasoning ? { defaultReasoning } : {}),
    };
  });
  return catalog(models, text(state.currentModelId));
}

export function assertReasoningOption(
  options: StudioKernelOptions,
  modelId: string | undefined,
  effort: string,
): void {
  const model = options.models.find((model) => model.id === modelId);
  if (!model)
    throw new Error(
      `无法确认模型 ${modelId || "当前默认模型"} 的思考档位，请刷新模型目录并选择模型`,
    );
  if (!model.reasoning.length) throw new Error(`模型 ${model.label} 未提供可设置的思考档位`);
  if (!model.reasoning.some((option) => option.id === effort))
    throw new Error(`模型 ${model.label} 不支持思考档位 ${effort || "空值"}`);
}

/** Only initializes the native protocol and lists capabilities; never creates a model turn. */
export async function inspectStudioKernelOptions(options: {
  kernel: ExternalKernel;
  executable: KernelExecutable;
  cwd: string;
  signal?: AbortSignal;
  descriptor?: KernelDescriptor;
  selectedModel?: string;
}): Promise<StudioKernelOptions> {
  let rpc: ProtocolProcess | undefined;
  const commandUpdates: Record<string, unknown>[] = [];
  const abort = () => rpc?.fail(new Error("模型目录查询已取消"));
  try {
    if (options.signal?.aborted) throw new Error("模型目录查询已取消");
    const mode =
      options.kernel === "codex" ? "codex" : options.kernel === "claude-code" ? "claude" : "acp";
    const descriptor = options.descriptor ?? BUILTIN_KERNEL_BY_ID.get(options.kernel);
    if (!descriptor) throw new Error("未登记的内核");
    if (descriptor.protocol === "antigravity")
      return antigravityModelOptions(options.executable, options.cwd, options.signal);
    const args =
      mode === "codex"
        ? ["app-server", "--listen", "stdio://"]
        : mode === "claude"
          ? [
              "-p",
              "--input-format",
              "stream-json",
              "--output-format",
              "stream-json",
              "--verbose",
              "--safe-mode",
              "--no-session-persistence",
            ]
          : descriptor.protocol === "grok"
            ? ["agent", "--no-leader", "stdio"]
            : descriptor.args;
    rpc = new ProtocolProcess(
      options.executable,
      args,
      options.cwd,
      mode,
      (message) => {
        if (
          message.method === "session/update" &&
          record(message.params).update &&
          record(record(message.params).update).sessionUpdate === "available_commands_update"
        )
          commandUpdates.push(message);
        if (message.type === "control_request")
          rpc?.reject(message.request_id, "模型目录查询不执行工具");
        else if (message.id !== undefined && message.method)
          rpc?.reject(message.id, "模型目录查询不执行工具");
      },
      { DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
    );
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    let result: StudioKernelOptions;
    if (mode === "codex") {
      await rpc.request("initialize", {
        clientInfo: { name: "knorvia_studio", version: "0.1.0" },
        capabilities: { experimentalApi: true },
      });
      rpc.notify("initialized", {});
      result = await codexModelOptions(rpc, options.cwd);
    } else if (mode === "claude") {
      result = claudeModelOptions(await rpc.request("initialize", { hooks: {} }));
    } else if (descriptor.protocol === "grok") {
      const initialized = await rpc.request("initialize", {
        protocolVersion: 1,
        clientInfo: { name: "knorvia-studio", version: "0.1.0" },
        clientCapabilities: {},
      });
      if (initialized.protocolVersion !== 1) throw new Error("Grok ACP 版本不兼容");
      result = grokModelOptions(initialized);
      try {
        await authenticateGrok(rpc, initialized);
        const opened = await rpc.request("session/new", { cwd: options.cwd, mcpServers: [] });
        const sessionId = text(opened.sessionId);
        if (sessionId) result.commands = await discoveredCommands(sessionId, commandUpdates);
      } catch {
        // Model inspection remains useful when a CLI version cannot expose a command catalog.
        result.commands = [];
      }
    } else {
      await initializeAcp(rpc);
      // Querying a session's native selectors creates no model turn and never sends a prompt.
      let opened = await rpc.request("session/new", { cwd: options.cwd, mcpServers: [] });
      const sessionId = text(opened.sessionId);
      if (!sessionId) throw new Error("ACP CLI 没有返回会话 ID");
      if (options.selectedModel && options.selectedModel !== acpModelOptions(opened).defaultModel) {
        const sessionId = text(opened.sessionId);
        if (!sessionId) throw new Error("ACP CLI 没有返回会话 ID");
        opened = await selectAcpOption(rpc, sessionId, opened, "model", options.selectedModel);
      }
      result = acpModelOptions(opened);
      result.commands = await discoveredCommands(sessionId, commandUpdates);
    }
    if (!result.models.length && descriptor.protocol !== "acp")
      throw new Error("此 CLI 未返回模型目录，请检查原 CLI 的版本和连接状态");
    return result;
  } catch (error) {
    return { models: [], error: errorText(error) };
  } finally {
    options.signal?.removeEventListener("abort", abort);
    await rpc?.close();
  }
}

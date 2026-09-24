import type { StudioKernelOptions } from "../../kernelTypes.js";
import { list, record, text } from "../../domain/kernelPolicy.js";
import type { ProtocolProcess } from "./processTransport.js";

type Model = StudioKernelOptions["models"][number];

function selectOptions(
  values: unknown[],
): Array<{ id: string; label: string; description?: string }> {
  return values.flatMap((value) => {
    const item = record(value);
    if (Array.isArray(item.options) && text(item.group)) return selectOptions(item.options);
    const id = text(item.value) || text(item.id);
    if (!id) return [];
    return [
      {
        id,
        label: text(item.name) || text(item.label) || id,
        ...(text(item.description) ? { description: text(item.description) } : {}),
      },
    ];
  });
}

export function configOption(
  state: Record<string, unknown>,
  category: string,
): Record<string, unknown> | undefined {
  return list(state.configOptions)
    .map(record)
    .find(
      (item) =>
        item.type === "select" &&
        (item.category === category ||
          item.id === category ||
          (category === "thought_level" && ["reasoning_effort", "effort"].includes(text(item.id)))),
    );
}

/** No invented defaults: only values returned by the ACP session are selectable. */
export function acpModelOptions(opened: Record<string, unknown>): StudioKernelOptions {
  const selector = configOption(opened, "model");
  const legacy = record(opened.models);
  const currentModel = text(selector?.currentValue) || text(legacy.currentModelId);
  const models: Model[] = selector
    ? selectOptions(list(selector.options)).map((item) => ({
        id: item.id,
        label: item.label,
        ...(item.description ? { description: item.description } : {}),
        reasoning: [],
      }))
    : list(legacy.availableModels).map((value) => {
        const item = record(value);
        const id = text(item.modelId);
        return {
          id,
          label: text(item.name) || id,
          ...(text(item.description) ? { description: text(item.description) } : {}),
          reasoning: [],
        };
      });
  const thought = configOption(opened, "thought_level");
  if (thought && currentModel) {
    const model = models.find((item) => item.id === currentModel);
    if (model) {
      model.reasoning = selectOptions(list(thought.options)).map(({ id, label }) => ({
        id,
        label,
      }));
      const current = text(thought.currentValue);
      if (current && model.reasoning.some((option) => option.id === current))
        model.defaultReasoning = current;
    }
  }
  return {
    models: [...new Map(models.filter((item) => item.id).map((item) => [item.id, item])).values()],
    ...(currentModel ? { defaultModel: currentModel } : {}),
  };
}

/** The complete returned configOptions are authoritative; a missing echo is a failed selection. */
export async function selectAcpOption(
  rpc: ProtocolProcess,
  sessionId: string,
  state: Record<string, unknown>,
  category: "model" | "thought_level" | "mode",
  requested: string,
): Promise<Record<string, unknown>> {
  const option = configOption(state, category);
  if (option) {
    if (!selectOptions(list(option.options)).some((item) => item.id === requested))
      throw new Error(
        `此 CLI 不支持${category === "model" ? "模型" : category === "mode" ? "权限模式" : "思考档位"} ${requested}`,
      );
    const response = await rpc.request("session/set_config_option", {
      sessionId,
      configId: text(option.id),
      value: requested,
    });
    if (configOption(response, category)?.currentValue !== requested)
      throw new Error(
        `此 CLI 未采用指定${category === "model" ? "模型" : category === "mode" ? "权限模式" : "思考档位"}，已停止执行`,
      );
    return response;
  }
  if (category === "model") {
    const models = record(state.models);
    if (!list(models.availableModels).some((item) => record(item).modelId === requested))
      throw new Error(`此 CLI 未提供可设置的模型 ${requested}`);
    const response = await rpc.request("session/set_model", { sessionId, modelId: requested });
    if (record(response.models).currentModelId !== requested)
      throw new Error("此 CLI 未回显指定模型，已停止执行");
    return response;
  }
  throw new Error(`此 CLI 未提供可设置的${category === "mode" ? "权限模式" : "思考档位"}`);
}

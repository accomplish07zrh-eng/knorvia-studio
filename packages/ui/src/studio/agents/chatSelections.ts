import type { StudioChatSelection, StudioKernelOptions } from "@knorvia/services";

export const STUDIO_CLI_DEFAULT_VALUE = "cli-default";

export function isStudioChatSelection(value: unknown): value is StudioChatSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    return false;
  if (Object.keys(value).some((key) => key !== "model" && key !== "reasoningEffort")) return false;
  const selection = value as StudioChatSelection;
  return (
    [
      ["model", 256],
      ["reasoningEffort", 64],
    ] as const
  ).every(([key, limit]) => {
    const item = selection[key];
    return (
      item === undefined ||
      (typeof item === "string" &&
        item.length <= limit &&
        !/[\r\n]/.test(item) &&
        !item.includes("\0"))
    );
  });
}

export function copyStudioChatSelection(selection: StudioChatSelection): StudioChatSelection {
  return {
    ...(selection.model !== undefined ? { model: selection.model } : {}),
    ...(selection.reasoningEffort !== undefined
      ? { reasoningEffort: selection.reasoningEffort }
      : {}),
  };
}

/** An explicit empty object is the user's CLI-default choice, not missing data. */
export function resolveStudioChatSelection(
  draft: StudioChatSelection | undefined,
  conversation: StudioChatSelection | undefined,
  defaults: StudioChatSelection | undefined,
): StudioChatSelection {
  return copyStudioChatSelection(draft ?? conversation ?? defaults ?? {});
}

export function studioModelOptionValue(id: string): string {
  return `model:${id}`;
}

export function studioEffectiveModel(
  selection: StudioChatSelection,
  options?: StudioKernelOptions,
) {
  const model = selection.model ?? options?.defaultModel;
  return options?.models.find((candidate) => candidate.id === model);
}

export function studioReportedDefaultReasoning(
  model: StudioKernelOptions["models"][number] | undefined,
) {
  return model?.reasoning.some((item) => item.id === model.defaultReasoning)
    ? model.defaultReasoning
    : undefined;
}

/** Only explicit menu actions change selection; catalog refresh never selects a model. */
export function selectStudioChatModel(
  selection: StudioChatSelection,
  value: string,
  options?: StudioKernelOptions,
): StudioChatSelection {
  if (value === STUDIO_CLI_DEFAULT_VALUE) return {};
  if (selection.model !== undefined && value === studioModelOptionValue(selection.model))
    return copyStudioChatSelection(selection);
  const model = options?.models.find((candidate) => studioModelOptionValue(candidate.id) === value);
  if (!model) return copyStudioChatSelection(selection);
  const reasoningEffort = studioReportedDefaultReasoning(model);
  return { model: model.id, ...(reasoningEffort !== undefined ? { reasoningEffort } : {}) };
}

export function selectStudioChatReasoning(
  selection: StudioChatSelection,
  reasoningEffort: string,
  options?: StudioKernelOptions,
): StudioChatSelection {
  if (
    !studioEffectiveModel(selection, options)?.reasoning.some((item) => item.id === reasoningEffort)
  )
    return copyStudioChatSelection(selection);
  return { ...copyStudioChatSelection(selection), reasoningEffort };
}

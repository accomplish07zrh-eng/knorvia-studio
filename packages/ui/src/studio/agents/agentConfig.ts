import type { StudioKernelConfig } from "@knorvia/services";

export function editedStudioAgentConfig(
  previous: StudioKernelConfig,
  next: Pick<StudioKernelConfig, "executablePath" | "permission" | "model">,
): StudioKernelConfig {
  const model = next.model?.trim() || undefined;
  return {
    executablePath: next.executablePath.trim(),
    permission: next.permission,
    ...(model ? { model } : {}),
    // 仅改路径或权限不能悄悄清除已保存档位；换模型时不把旧模型的档位带过去。
    ...(model === previous.model && previous.reasoningEffort !== undefined
      ? { reasoningEffort: previous.reasoningEffort }
      : {}),
  };
}

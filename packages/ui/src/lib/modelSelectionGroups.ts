import type { ModelSelectGroup } from "@/ModelConfigSelect.js";
import { shouldShowModelVisionBadge } from "@/lib/modelVisionBadge.js";
import { decodeCustomModelValue, encodeCustomModelValue } from "@/lib/customModelValue.js";
import type { ModelSelectionView } from "@knorvia/services";
import { isKnorviaAgentProvider, type KnorviaProvider } from "@knorvia/shared";

export interface ModelProviderGroupLabelOptions {
  apiKeyLabel?: string;
  apiKeyBadgeLabel?: string;
  codingPlanLabel?: string;
  codingPlanBadgeLabel?: string;
  startPlanLabel?: string;
  startPlanBadgeLabel?: string;
  teamPlanBadgeLabel?: string;
  teamPlanFallbackLabel?: string;
}

function supportsRegistryApiFormat(
  selectedProvider: KnorviaProvider,
  apiFormat: string | null | undefined,
): boolean {
  if (!apiFormat) return false;
  // 仅剩 glm（Knorvia Agent）provider；三方 CLI 的 api format 差异已随 provider 下线。
  return isKnorviaAgentProvider(selectedProvider);
}

export function buildRegistryModelSelectGroups(
  selectedProvider: KnorviaProvider,
  view: ModelSelectionView,
  _labels: ModelProviderGroupLabelOptions = {},
): ModelSelectGroup[] {
  return view.providers.flatMap((provider) => {
    if (
      provider.config.access?.type === "zhipu-account" ||
      !supportsRegistryApiFormat(selectedProvider, provider.config.api?.type)
    ) {
      return [];
    }
    return [
      {
        key: `registry-provider:${provider.providerId}`,
        label: provider.providerName?.trim() || provider.providerId,

        items: provider.models.map(({ modelId, config }) => ({
          key: `registry-provider:${provider.providerId}:${modelId}`,
          value: encodeCustomModelValue(provider.providerId, modelId),
          name: modelId,
          ...(shouldShowModelVisionBadge(
            modelId,
            config.properties?.inputFormat?.supportsImage,
            provider.config.access,
          )
            ? { supportsVisionInput: true }
            : {}),
        })),
      },
    ];
  });
}

export function resolveModelDisplayName(
  modelGroups: readonly ModelSelectGroup[],
  value: string,
): string | null {
  for (const group of modelGroups) {
    const matched = group.items.find((item) => item.value === value);
    if (matched) return matched.name;
  }

  return decodeCustomModelValue(value)?.modelName ?? null;
}

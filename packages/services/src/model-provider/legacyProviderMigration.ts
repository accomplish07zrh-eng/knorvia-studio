import type { z } from "zod";
import { buildLegacyProviderEndpoints } from "./legacyProviderEndpoints.js";
import {
  createModelProviderModelConfig,
  getDefaultModelSupportedFormatsFromApiFormat,
  mapModelProviderApiFormatToKind,
  mapModelProviderSupportedFormatToKind,
  stripLegacyClaudeProviderMappings,
} from "./legacyProviderModels.js";
import { legacyModelProviderConfigSchema } from "./legacyProviderSchemas.js";
import type {
  ModelProviderConfig,
  ModelProviderKind,
  ModelProviderSupportedFormat,
} from "./legacyProviderTypes.js";

type LegacyProvider = z.infer<typeof legacyModelProviderConfigSchema>;

function selectLegacyKind(provider: LegacyProvider): ModelProviderKind {
  if (
    provider.apiFormat === "anthropic-messages" ||
    provider.apiFormat === "openai-chat-completions" ||
    provider.apiFormat === "openai-responses"
  ) {
    return mapModelProviderApiFormatToKind(provider.apiFormat);
  }
  if (provider.endpoints.anthropic?.trim()) return "anthropic";
  if (provider.endpoints.openai?.trim()) return "openai-compatible";
  return "anthropic";
}

function legacyEndpointFormats(provider: LegacyProvider): ModelProviderSupportedFormat[] {
  const formats: ModelProviderSupportedFormat[] = [];
  if (provider.endpoints.anthropic?.trim()) formats.push("anthropic");
  if (provider.endpoints.openai?.trim()) formats.push("openai");
  return formats;
}

export function migrateLegacyModelProviderConfig(
  provider: z.infer<typeof legacyModelProviderConfigSchema>,
): ModelProviderConfig {
  const defaultKind = selectLegacyKind(provider);
  const entries: Array<[ModelProviderKind, string]> = [];
  if (provider.endpoints.anthropic?.trim()) {
    entries.push(["anthropic", provider.endpoints.anthropic]);
  }
  if (provider.endpoints.openai?.trim()) {
    entries.push([
      defaultKind === "openai" ? "openai" : "openai-compatible",
      provider.endpoints.openai,
    ]);
  }
  const endpoints = buildLegacyProviderEndpoints(entries);
  const models = provider.models.map((modelId) => {
    const formats =
      provider.modelSupportedFormats?.[modelId] ??
      (provider.apiFormat
        ? getDefaultModelSupportedFormatsFromApiFormat(provider.apiFormat)
        : legacyEndpointFormats(provider));
    const kinds = [
      ...new Set(
        formats
          .map(mapModelProviderSupportedFormatToKind)
          .filter((kind): kind is ModelProviderKind => Boolean(kind)),
      ),
    ];
    return createModelProviderModelConfig({
      id: modelId,
      name: provider.modelDisplayNames?.[modelId],
      kinds,
      defaultKind: kinds.includes(defaultKind) ? defaultKind : kinds[0],
      disabledReason:
        kinds.length === 0 && formats.includes("gemini")
          ? "legacy gemini format is not supported by knorvia.model-providers.v2"
          : undefined,
    });
  });
  return {
    id: provider.id,
    name: provider.name,
    ...(provider.enabled !== undefined ? { enabled: provider.enabled } : {}),
    ...(provider.systemDisabledReason
      ? { systemDisabledReason: provider.systemDisabledReason }
      : {}),
    endpoints,
    apiFormat: provider.apiFormat,
    source: provider.source,
    modelsDevProviderId: provider.modelsDevProviderId,
    apiKeyRequired: provider.apiKeyRequired,
    headers: provider.headers,
    logoUrl: provider.logoUrl,
    apiKey: provider.apiKey,
    apiKeyUrl: provider.apiKeyUrl,
    defaultKind,
    models,
    providerMappings: stripLegacyClaudeProviderMappings(provider.providerMappings),
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

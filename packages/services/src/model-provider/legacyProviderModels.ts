import type {
  ModelProviderApiFormat,
  ModelProviderConfig,
  ModelProviderEndpoints,
  ModelProviderKind,
  ModelProviderModality,
  ModelProviderModelConfig,
  ModelProviderModelEntry,
  ModelProviderReasoningSpec,
  ModelProviderSupportedFormat,
  ProviderModelMappings,
} from "./legacyProviderTypes.js";

export const MODEL_PROVIDER_NEW_MODEL_CONTEXT_WINDOW = 200_000;

export function stripModelProviderReasoningPatches(
  reasoning: ModelProviderReasoningSpec,
): ModelProviderReasoningSpec {
  return {
    ...(reasoning.defaultLevel ? { defaultLevel: reasoning.defaultLevel } : {}),
    levels: Object.fromEntries(Object.keys(reasoning.levels).map((level) => [level, {}])),
  };
}

export function stripLegacyClaudeProviderMappings(
  providerMappings: ProviderModelMappings | undefined,
): ProviderModelMappings | undefined {
  if (!providerMappings) return undefined;
  const { claude: _claude, ...remaining } = providerMappings;
  return remaining;
}

export function resolveModelProviderContextWindow(contextWindow: number | undefined): number {
  const integer =
    typeof contextWindow === "number" && Number.isFinite(contextWindow)
      ? Math.floor(contextWindow)
      : 0;
  return integer > 0 ? integer : MODEL_PROVIDER_NEW_MODEL_CONTEXT_WINDOW;
}

export function isModelProviderModelConfig(
  model: ModelProviderModelEntry,
): model is ModelProviderModelConfig {
  return typeof model === "object" && model !== null;
}

export function getModelProviderModelIds(
  provider: Pick<ModelProviderConfig, "models"> | null | undefined,
): string[] {
  if (!provider) return [];
  return provider.models
    .filter((model) => !isModelProviderModelConfig(model) || model.deleted !== true)
    .map((model) => (isModelProviderModelConfig(model) ? model.id.trim() : model.trim()))
    .filter((id) => id.length > 0);
}

export function mapModelProviderSupportedFormatToKind(
  format: ModelProviderSupportedFormat,
): ModelProviderKind | null {
  switch (format) {
    case "anthropic":
      return "anthropic";
    case "openai":
      return "openai-compatible";
    case "responses":
      return "openai";
    case "gemini":
      return null;
  }
}

export function createModelProviderModelConfig(params: {
  id: string;
  name?: string;
  kinds?: readonly ModelProviderKind[];
  defaultKind?: ModelProviderKind;
  contextWindow?: number;
  maxOutputTokens?: number;
  modalities?: {
    input?: readonly ModelProviderModality[];
    output?: readonly ModelProviderModality[];
  };
  reasoning?: ModelProviderReasoningSpec;
  priority?: number;
  disabledReason?: string;
  supportsTools?: boolean;
  supportsStructuredOutput?: boolean;
  modified?: boolean;
  deleted?: boolean;
}): ModelProviderModelConfig {
  const input: ModelProviderModality[] = [
    ...new Set<ModelProviderModality>(params.modalities?.input ?? ["text"]),
  ];
  const output: ModelProviderModality[] = [
    ...new Set<ModelProviderModality>(params.modalities?.output ?? ["text"]),
  ];
  return {
    id: params.id.trim(),
    name: params.name?.trim() || undefined,
    kinds: [...new Set(params.kinds ?? [])],
    ...(params.defaultKind ? { defaultKind: params.defaultKind } : {}),
    modalities: {
      input,
      output,
    },
    contextWindow: resolveModelProviderContextWindow(params.contextWindow),
    ...(params.maxOutputTokens ? { maxOutputTokens: params.maxOutputTokens } : {}),
    ...(params.reasoning ? { reasoning: params.reasoning } : {}),
    ...(params.priority !== undefined && Number.isFinite(params.priority)
      ? { priority: params.priority }
      : {}),
    ...(params.disabledReason ? { disabledReason: params.disabledReason } : {}),
    ...(params.supportsTools !== undefined ? { supportsTools: params.supportsTools } : {}),
    ...(params.supportsStructuredOutput !== undefined
      ? { supportsStructuredOutput: params.supportsStructuredOutput }
      : {}),
    ...(params.modified !== undefined ? { modified: params.modified } : {}),
    ...(params.deleted !== undefined ? { deleted: params.deleted } : {}),
  };
}

export function mapModelProviderApiFormatToKind(
  apiFormat: ModelProviderApiFormat,
): ModelProviderKind {
  switch (apiFormat) {
    case "anthropic-messages":
      return "anthropic";
    case "openai-chat-completions":
      return "openai-compatible";
    case "openai-responses":
      return "openai";
  }
}

export function resolveModelProviderDefaultKind(
  provider: Pick<ModelProviderConfig, "apiFormat" | "defaultKind" | "endpoints">,
): ModelProviderKind {
  if (provider.defaultKind) return provider.defaultKind;
  const paths = provider.endpoints.paths;
  if (paths?.["openai-compatible"] !== undefined) return "openai-compatible";
  if (paths?.openai !== undefined) return "openai";
  if (paths?.anthropic !== undefined) return "anthropic";
  return mapModelProviderApiFormatToKind(resolveModelProviderApiFormat(provider));
}

export function resolveModelProviderKindApiFormat(kind: ModelProviderKind): ModelProviderApiFormat {
  switch (kind) {
    case "anthropic":
      return "anthropic-messages";
    case "openai":
      return "openai-responses";
    case "openai-compatible":
      return "openai-chat-completions";
  }
}

export function getDefaultModelSupportedFormatsFromEndpoints(
  endpoints: Partial<
    Pick<ModelProviderEndpoints, "anthropic" | "openai" | "gemini" | "baseURL" | "paths">
  >,
): ModelProviderSupportedFormat[] {
  const formats: ModelProviderSupportedFormat[] = [];
  if (endpoints.baseURL?.trim() || endpoints.paths) {
    if (endpoints.paths?.anthropic !== undefined) formats.push("anthropic");
    if (endpoints.paths?.["openai-compatible"] !== undefined) formats.push("openai");
    if (endpoints.paths?.openai !== undefined) formats.push("responses");
  }
  return formats;
}

export function getDefaultModelSupportedFormatsFromApiFormat(
  apiFormat: ModelProviderApiFormat,
): ModelProviderSupportedFormat[] {
  switch (apiFormat) {
    case "anthropic-messages":
      return ["anthropic"];
    case "openai-chat-completions":
      return ["openai"];
    case "openai-responses":
      return ["responses"];
  }
}

export function resolveModelProviderApiFormat(
  provider: Pick<ModelProviderConfig, "apiFormat" | "endpoints"> &
    Partial<Pick<ModelProviderConfig, "defaultKind">>,
): ModelProviderApiFormat {
  const apiFormat = provider.apiFormat;
  if (
    apiFormat === "anthropic-messages" ||
    apiFormat === "openai-chat-completions" ||
    apiFormat === "openai-responses"
  )
    return apiFormat;
  if (provider.defaultKind) return resolveModelProviderKindApiFormat(provider.defaultKind);
  const paths = provider.endpoints.paths;
  if (paths?.anthropic !== undefined) return "anthropic-messages";
  if (paths?.openai !== undefined) return "openai-responses";
  if (paths?.["openai-compatible"] !== undefined) return "openai-chat-completions";
  return "anthropic-messages";
}

export type {
  ClaudeModelMapping,
  ProviderModelMappings,
  ModelProviderEndpoints,
  ModelProviderSupportedFormat,
  ModelProviderApiFormat,
  ModelProviderCatalogSourceId,
  ModelProviderKind,
  ModelProviderModality,
  ProviderOptionsPatch,
  ModelProviderReasoningSpec,
  ModelProviderCatalogModel,
  ModelProviderModelConfig,
  ModelProviderModelEntry,
  ModelProviderSource,
  ModelProviderSystemDisabledReason,
  ModelProviderConfig,
} from "./legacyProviderTypes.js";

export {
  modelProviderApiFormatSchema,
  modelProviderKindSchema,
  modelProviderCatalogSourceIdSchema,
  modelProviderReasoningSpecSchema,
  modelProviderCatalogFileSchema,
  modelProviderSourceSchema,
  modelProviderSystemDisabledReasonSchema,
  modelProviderEndpointsSchema,
  legacyModelProviderListSchema,
  modelProviderStoreFileSchema,
  modelProviderDisplayOrderStateSchema,
} from "./legacyProviderSchemas.js";

export {
  MODEL_PROVIDER_NEW_MODEL_CONTEXT_WINDOW,
  stripModelProviderReasoningPatches,
  stripLegacyClaudeProviderMappings,
  resolveModelProviderContextWindow,
  isModelProviderModelConfig,
  getModelProviderModelIds,
  mapModelProviderSupportedFormatToKind,
  createModelProviderModelConfig,
  resolveModelProviderDefaultKind,
  resolveModelProviderKindApiFormat,
  getDefaultModelSupportedFormatsFromEndpoints,
  getDefaultModelSupportedFormatsFromApiFormat,
  resolveModelProviderApiFormat,
} from "./legacyProviderModels.js";

export {
  getDefaultModelProviderEndpointPathForKind,
  normalizeModelProviderBaseUrlForKind,
  normalizeModelProviderConfiguredBaseUrl,
  resolveModelProviderRuntimeBaseUrl,
} from "./legacyProviderEndpoints.js";

export { migrateLegacyModelProviderConfig } from "./legacyProviderMigration.js";

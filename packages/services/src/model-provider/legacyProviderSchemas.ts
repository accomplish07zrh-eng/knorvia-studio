import { z } from "zod";

const supportedFormatSchema = z.enum(["anthropic", "openai", "responses", "gemini"]);
export const modelProviderApiFormatSchema = z.enum([
  "anthropic-messages",
  "openai-chat-completions",
  "openai-responses",
]);
export const modelProviderKindSchema = z.enum(["anthropic", "openai", "openai-compatible"]);
export const modelProviderCatalogSourceIdSchema = z.enum(["china-llm-knorvia-dev"]);
const modalitySchema = z.enum(["text", "image", "video", "audio", "pdf"]);
export const modelProviderSourceSchema = z.enum(["builtin", "models-dev", "custom", "workspace"]);
export const modelProviderSystemDisabledReasonSchema = z.enum([
  "coding_plan_not_authenticated",
  "coding_plan_not_connected",
  "coding_plan_auth_failed",
  "coding_plan_not_entitled",
  "oauth_provider_inactive",
]);

const providerMappingsSchema = z
  .object({
    claude: z
      .object({
        haiku: z.string(),
        sonnet: z.string(),
        opus: z.string(),
        reasoning: z.string(),
      })
      .optional(),
  })
  .catchall(z.unknown());
const operationSchema = z.object({ path: z.array(z.string().min(1)).min(1) });
const patchSchema = z.object({
  set: z.array(operationSchema.extend({ value: z.unknown() })).optional(),
  unset: z.array(operationSchema).optional(),
});
export const modelProviderReasoningSpecSchema = z.object({
  defaultLevel: z.string().min(1).optional(),
  levels: z.record(z.string().min(1), z.partialRecord(modelProviderKindSchema, patchSchema)),
});

const endpointPathsSchema = z.partialRecord(modelProviderKindSchema, z.string());
const legacyEndpointsSchema = z.object({
  anthropic: z.string().default(""),
  openai: z.string().default(""),
  gemini: z.string().default(""),
});
export const modelProviderEndpointsSchema = legacyEndpointsSchema.extend({
  anthropic: z.string().optional(),
  openai: z.string().optional(),
  gemini: z.string().optional(),
  baseURL: z.string().optional(),
  paths: endpointPathsSchema.optional(),
});

const catalogEndpointsSchema = z.object({
  baseURL: z.string(),
  paths: endpointPathsSchema,
});
const catalogModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  kinds: z.array(modelProviderKindSchema),
  defaultKind: modelProviderKindSchema.optional(),
  modelIdByKind: z.partialRecord(modelProviderKindSchema, z.string().min(1)).optional(),
  modalities: z.object({
    input: z.array(modalitySchema),
    output: z.array(modalitySchema),
  }),
  contextWindow: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive().optional(),
  reasoning: modelProviderReasoningSpecSchema.optional(),
  priority: z.number().finite().optional(),
});
const catalogProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  endpoints: catalogEndpointsSchema,
  defaultKind: modelProviderKindSchema.optional(),
  models: z.array(catalogModelSchema),
});
export const modelProviderCatalogFileSchema = z.object({
  schemaVersion: z.literal("knorvia.model-providers.v1"),
  providers: z.array(catalogProviderSchema),
});
const modelConfigSchema = catalogModelSchema.extend({
  disabledReason: z.string().optional(),
  supportsTools: z.boolean().optional(),
  supportsStructuredOutput: z.boolean().optional(),
  modified: z.boolean().optional(),
  deleted: z.boolean().optional(),
});

const identityShape = {
  id: z.string(),
  name: z.string(),
  enabled: z.boolean().optional(),
  systemDisabledReason: modelProviderSystemDisabledReasonSchema.optional(),
};
const credentialsShape = {
  modelsDevProviderId: z.string().optional(),
  apiKeyRequired: z.boolean().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  logoUrl: z.string().optional(),
  apiKey: z.string(),
  apiKeyUrl: z.string().optional(),
};
const metadataShape = {
  modelDisplayNames: z.record(z.string(), z.string()).optional(),
  modelSupportedFormats: z.record(z.string(), z.array(supportedFormatSchema)).optional(),
  providerMappings: providerMappingsSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
};
export const legacyModelProviderConfigSchema = z.object({
  ...identityShape,
  endpoints: legacyEndpointsSchema,
  apiFormat: modelProviderApiFormatSchema.optional(),
  source: modelProviderSourceSchema.optional(),
  ...credentialsShape,
  models: z.array(z.string()).default([]),
  ...metadataShape,
});
export const legacyModelProviderListSchema = z.array(legacyModelProviderConfigSchema);
const currentProviderSchema = z.object({
  ...identityShape,
  endpoints: modelProviderEndpointsSchema,
  apiFormat: modelProviderApiFormatSchema.optional(),
  source: modelProviderSourceSchema.optional(),
  catalogSourceId: modelProviderCatalogSourceIdSchema.optional(),
  catalogProviderId: z.string().optional(),
  ...credentialsShape,
  defaultKind: modelProviderKindSchema.optional(),
  models: z.array(modelConfigSchema).default([]),
  ...metadataShape,
});
export const modelProviderStoreFileSchema = z.object({
  schemaVersion: z.literal("knorvia.model-providers.v2"),
  providers: z.array(currentProviderSchema),
});
export const modelProviderDisplayOrderStateSchema = z.object({
  providerIds: z.array(z.string().min(1)),
  updatedAt: z.number().int().nonnegative(),
});

export interface ClaudeModelMapping {
  haiku: string;
  sonnet: string;
  opus: string;
  reasoning: string;
}

export interface ProviderModelMappings {
  [provider: string]: unknown;
  /** @deprecated Claude 槽位不再写入 v2 provider store，仅用于读取旧配置后迁移清理。 */
  claude?: ClaudeModelMapping;
}

export type ModelProviderSupportedFormat = "anthropic" | "openai" | "responses" | "gemini";
export type ModelProviderApiFormat =
  | "anthropic-messages"
  | "openai-chat-completions"
  | "openai-responses";
export type ModelProviderCatalogSourceId = "china-llm-knorvia-dev";
export type ModelProviderKind = "anthropic" | "openai" | "openai-compatible";
export type ModelProviderModality = "text" | "image" | "video" | "audio" | "pdf";
export type ModelProviderSource = "builtin" | "models-dev" | "custom" | "workspace";
export type ModelProviderSystemDisabledReason =
  | "coding_plan_not_authenticated"
  | "coding_plan_not_connected"
  | "coding_plan_auth_failed"
  | "coding_plan_not_entitled"
  | "oauth_provider_inactive";

export interface ModelProviderEndpoints {
  /** @deprecated 仅用于读取旧 provider 配置；新 store 使用 baseURL + paths。 */
  anthropic?: string;
  /** @deprecated 仅用于读取旧 provider 配置；新 store 使用 baseURL + paths。 */
  openai?: string;
  /** @deprecated Gemini custom provider 已统一走 endpoints.openai + compat，仅保留旧数据兼容读取。 */
  gemini?: string;
  /** v2 catalog endpoint base URL；旧字段保留给迁移期 UI/连通性代码读取。 */
  baseURL?: string;
  /** v2 catalog endpoint paths，key 使用公开 runtime kind。 */
  paths?: Partial<Record<ModelProviderKind, string>>;
}

export interface ProviderOptionsPatch {
  set?: Array<{ path: string[]; value: unknown }>;
  unset?: Array<{ path: string[] }>;
}

export interface ModelProviderReasoningSpec {
  defaultLevel?: string;
  levels: Record<string, Partial<Record<ModelProviderKind, ProviderOptionsPatch>>>;
}

export interface ModelProviderCatalogModel {
  id: string;
  name?: string;
  kinds: ModelProviderKind[];
  defaultKind?: ModelProviderKind;
  modelIdByKind?: Partial<Record<ModelProviderKind, string>>;
  modalities: {
    input: ModelProviderModality[];
    output: ModelProviderModality[];
  };
  contextWindow: number;
  maxOutputTokens?: number;
  reasoning?: ModelProviderReasoningSpec;
  priority?: number;
}

export interface ModelProviderModelConfig extends ModelProviderCatalogModel {
  disabledReason?: string;
  supportsTools?: boolean;
  supportsStructuredOutput?: boolean;
  modified?: boolean;
  deleted?: boolean;
}

export type ModelProviderModelEntry = string | ModelProviderModelConfig;

export interface ModelProviderConfig {
  id: string;
  name: string;
  /** 缺省等同启用；false 时仅从聊天框模型列表隐藏，不删除供应商配置。 */
  enabled?: boolean;
  /**
   * 系统自动关闭 provider 的原因。enabled=false 且该字段为空时表示用户手动关闭，
   * 后续权益校验成功也不能自动打开。
   */
  systemDisabledReason?: ModelProviderSystemDisabledReason;
  endpoints: ModelProviderEndpoints;
  apiFormat?: ModelProviderApiFormat;
  source?: ModelProviderSource;
  catalogSourceId?: ModelProviderCatalogSourceId;
  catalogProviderId?: string;
  modelsDevProviderId?: string;
  apiKeyRequired?: boolean;
  headers?: Record<string, string>;
  logoUrl?: string;
  apiKey: string;
  apiKeyUrl?: string;
  models: ModelProviderModelEntry[];
  defaultKind?: ModelProviderKind;
  /** @deprecated 旧模型显示名 map 只用于 v1 自动迁移。 */
  modelDisplayNames?: Record<string, string>;
  /** @deprecated 旧模型格式 map 只用于 v1 自动迁移。 */
  modelSupportedFormats?: Record<string, ModelProviderSupportedFormat[]>;
  providerMappings?: ProviderModelMappings;
  createdAt: number;
  updatedAt: number;
}

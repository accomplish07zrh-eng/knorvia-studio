# Legacy model provider serialization — behavior/API contract

Complete owner legacyModelProviderSerialized.ts independently reauthored; preserve every exported interface/type/schema/function. Old max-lines suppression must not be reused; cohesive new private modules allowed under model-provider, with root preserving exports. Source schema expressions are NOT supplied, only wire shapes/validation. Type/API declarations in appendix retain exact compatibility expression and are explicitly disclosed. Owner pure serialization/migration helpers, no IO/runtime/network/auth activity. No novel feature or bugs fixed. Full schemas and normalizers are one compatible owner; do not only refactor old body.

## Schema compatibility

All z.object schemas STRIP unknown fields, except providerMappings catches unknown values; preserve shape property ordering as listed. zod version4.6.5. All .optional fields preserve present undefined as zod does. Arrays no min unless specified. z.number generally unbounded beyond zod ordinary validation; constraints explicit below. Partial records use z.partialRecord enum keys, ordinary arbitrary records z.record(z.string(),value). Public schema names listed in API below.

Enums (in order): supportedFormat anthropic/openai/responses/gemini; apiFormat anthropic-messages/openai-chat-completions/openai-responses; kind anthropic/openai/openai-compatible; catalogSource china-llm-knorvia-dev; modality text/image/video/audio/pdf; source builtin/models-dev/custom/workspace; systemDisabledReason coding_plan_not_authenticated/coding_plan_not_connected/coding_plan_auth_failed/coding_plan_not_entitled/oauth_provider_inactive.
providerMappings object optional claude {haiku,sonnet,opus,reasoning required strings}, unknown keys preserved by catchall unknown. Option patch operation path:string[] each min1,array min1. set optional array operation extended value:z.unknown(), unset optional array operation. Reasoning {defaultLevel?:string min1,levels:record(string min1,partialRecord(kind,patch))}. Endpoint paths partialRecord(kind,string). Legacy endpoints {anthropic:string default '',openai:string default '',gemini:string default ''}. Current endpoints starts legacy fields then overrides all3 to optional string, adds baseURL?:string,paths?:endpoint paths.
Catalog endpoint {baseURL:string,paths:paths required}. Catalog model ordered fields id:string min1,name?:string,kinds:kind[],defaultKind?:kind,modelIdByKind?:partialRecord(kind,string min1),modalities:{input:modality[],output:modality[]},contextWindow:number int positive,maxOutputTokens?:number int positive,reasoning?:reasoning,priority?:number finite. Catalog provider {id:string min1,name:string min1,endpoints:catalog endpoint,defaultKind?:kind,models:catalog model[]}. Public catalog file {schemaVersion:literal knorvia.model-providers.v1,providers:catalog provider[]}. Model config extends catalog model with disabledReason?:string,supportsTools?:boolean,supportsStructuredOutput?:boolean,modified?:boolean,deleted?:boolean.
Legacy provider ordered: id:string,name:string,enabled?:boolean,systemDisabledReason?:enum,endpoints:legacy endpoints,apiFormat?:enum,source?:enum,modelsDevProviderId?:string,apiKeyRequired?:boolean,headers?:record(string,string),logoUrl?:string,apiKey:string,apiKeyUrl?:string,models:string[] default [],modelDisplayNames?:record(string,string),modelSupportedFormats?:record(string,supportedFormat[]),providerMappings?:providerMappings,createdAt:number,updatedAt:number. Public legacyModelProviderListSchema array legacy provider.
Current provider ordered: id,name,enabled,systemDisabledReason,endpoints:current endpoints,apiFormat,source,catalogSourceId?:enum,catalogProviderId?:string,modelsDevProviderId,apiKeyRequired,headers,logoUrl,apiKey,apiKeyUrl,defaultKind?:kind,models:model config[] default [],modelDisplayNames,modelSupportedFormats,providerMappings,createdAt,updatedAt (other validators identical legacy). Public modelProviderStoreFileSchema object schemaVersion:literal knorvia.model-providers.v2,providers:array current provider. Public modelProviderDisplayOrderStateSchema {providerIds:string[] each min1,updatedAt:number int nonnegative}. No list schema exported for current provider except store. Public endpoints,apiFormat,kind,catalogSourceId,reasoning,source,systemDisabledReason schemas exported.

## Pure normalization/model functions

MODEL_PROVIDER_NEW_MODEL_CONTEXT_WINDOW=200_000. Context window: typeof number AND Number.isFinite ->Math.floor; floor>0 retained else200000. Model config predicate typeof object&&notnull (arrays counted, no validation). getModelProviderModelIds(falsy input including null/undefined)->[] else provider.models: remove object models whose deleted===true; then object id.trim or string.trim; drop empty, do NOT dedupe. Bad runtime values retain natural errors.
stripModelProviderReasoningPatches: new object truthy defaultLevel included then levels:Object.fromEntries(Object.keys(reasoning.levels).map(level=>[level,{}])); no otherfields/deepclone.
stripLegacyClaudeProviderMappings: falsy input undefined; destructure claude omitted, return all remaining own enumerable fields, possibly {}. No clone unknown values.
Supported format→kind mapping anthropic→anthropic,openai→openai-compatible,responses→openai,gemini→null; invalid runtime value undefined (switch no default). Kind→API anthropic→anthropic-messages,openai→openai-responses,openai-compatible→openai-chat-completions; invalid undefined. API→formats corresponding single anthropic,responses,openai; invalid undefined.
createModelProviderModelConfig params exact in declaration appendix. Compute deduplicated input modalities then output modalities before constructing result/id trimming (phase/error order retained). Result ordered fields: id.trim(), name:params.name?.trim()||undefined (property always present), kinds:first-occurrence dedupe params.kinds??[], truthy defaultKind optional, modalities {input:first-occurrence dedupe params.modalities?.input ?? ['text'],output:same default}, contextWindow normalized, truthy maxOutputTokens included, truthy reasoning retained identity, priority iff !==undefined &&Number.isFinite, truthy disabledReason, supportsTools/supportsStructuredOutput/modified/deleted iff!==undefined preserving false. No forced kind inclusion, no validation of empty ids or negative output bound at helper stage.
resolveModelProviderDefaultKind: truthy provider.defaultKind; then paths openai-compatible !==undefined then openai then anthropic; else resolveAPI→kind. resolveModelProviderApiFormat: valid explicit API first, truthy defaultKind->kindAPI, paths anthropic !==undefined then openai then openai-compatible else anthropic-messages. These priority orders DIFFER; preserve. Legacy endpoint anthropic/openai/gemini not used by these current selectors.
Default endpoint path mapping anthropic /v1/messages;openai /responses;openai-compatible /chat/completions; invalid undefined.
getDefaultModelSupportedFormatsFromEndpoints: formats empty. If endpoints.baseURL?.trim() truthy OR endpoints.paths truthy: push anthropic if paths.anthropic !==undefined,openai if paths['openai-compatible']!==undefined,responses if paths.openai!==undefined,return. Else[]; legacy endpoint fields ignored.

## URL handling

Never call network; URL parsing only.
Configured base normalization: trim +remove all trailing '/', return'' ifempty. try new URL; only http:/https: eligible repeated URL collapse; otherprotocol returnnormalized. Marker `${parsed.protocol}//${parsed.host}`; second occurrence search starting marker.length. Ifnone originalnormalized. first=beforesecond remove trailing /, second=fromsecond remove trailing /; iff strings EXACT equal return first; else original. URL parsecatch original. normalizeModelProviderConfiguredBaseUrl calls this collapse and removes trailingslashes again; do not remove protocol endpoint suffixes or /v1.
normalizeModelProviderBaseUrlForKind: start configured normalization. suffix order anthropic ['/v1/messages','/messages'];openai ['/responses'];openai-compatible ['/chat/completions']. case-insensitive suffix match first ->remove suffix andbreak, thenremove trailing '/'. Invalid kind retains native iterable error. Do NOT remove /v1 for openai responses or compatible.
join base/path internally: trim both; empty path returntrimbase; absoluteHTTP(S) path returntrimpath; emptybase returntrimpath; ifbaseends'/' andpathstarts'/' remove EXACT one trailing base slash thenconcat; ifneither insert'/'; elseconcat. Absolute detection URL http(s)only. No query/path resolution.
resolveModelProviderRuntimeBaseUrl(provider,kind default from resolveAPI mappedkind): base=provider.endpoints.baseURL?.trim()??'', paths=...??{}. If !baseURL?.trim AND !provider.endpoints.paths return''. If paths[kind]===undefined return''. Else join(base,paths[kind]??'') then normalizeForKind. Only explicitly declared paths count, absolute path avoids duplicated base. Empty declared string counts and uses base.
Legacy endpoint building: normalize each [kind,rawUrl] via kind normalizer,dropfalseempty. Ifnone return{}. Parse each URL catchnull. canShareOrigin=first parsed &&everyparsed.origin===first.origin (noHTTP restrictionhere). Ifshare include baseURL:first.origin, otherwise absent. paths:Object.fromEntries entrieskind → share&&parsed ? (pathname==='/'?'':pathname.replace(trailingSlash,''))+search :normalizedURL. Exclude hash; preserve query. Duplicatekinds Object.fromEntries lastvalue wins with insertionorder. No crossoriginurlrewrite.

## Legacy migration

Input legacy schema inferred type (type declaration). Defaultkind recognizes only three valid explicit API values; invalid truthy runtime API values fall through to endpoint preference, while model-format fallback still uses truthy API value and may naturally fail; otherwise truthy optional-chained .anthropic?.trim()->anthropic,.openai?.trim()->openai-compatible,elseanthropic; gemini ignored. Endpoint entries first anthropic iftrimtruthy,thenopenai iftrimtruthy withkind openai ONLY ifdefaultkindopenai elseopenai-compatible. Build endpoints above BEFORE any model transformation (error ordering retained). Each original model string in order with no normalization/drop: formats=provider.modelSupportedFormats?.[modelId] ?? (truthyapiFormat ? API-defaultformats : legacy optional-chained endpointpresence .anthropic?.trim()/.openai?.trim() formats anthropic thenopenai). Emptyexplicitformats respected. Convert/dedupe kinds,geminidropped. disabledReason iffkinds empty AND formatsincludesgemini exact 'legacy gemini format is not supported by knorvia.model-providers.v2'. createModelConfig {id:modelId,name:modelDisplayNames?.[modelId],kinds,defaultKind:kindincludeslegacydefault?that:kinds[0],disabledReason}. This helper trimsids,names,defaults200000/textmodalities. No persistedreasoningpatch orlegacyClaude slot.
Return ordered fields exactly id,name, optional enabled iff!==undefined, optionaltruthysystemDisabledReason,endpoints,apiFormat,source,modelsDevProviderId,apiKeyRequired,headers,logoUrl,apiKey,apiKeyUrl,defaultKind,models:migrated,providerMappings:stripLegacyClaudeProviderMappings(...),createdAt,updatedAt. All listed nonconditional fields included even undefined. Do NOT copy modelDisplayNames/modelSupportedFormats/unknown provider fields; retained headers/mappings references as specified. No auth/key redaction/injection/change, synthesized API-key fixtures forbidden except obviously fabricated data if needed.

## Validation limits

Original full five model files type check passed. Pure no newwrite path, ordinary tests/builds skipped as explicitly directed. Scoped types/lint/architecture only; no synthetic regression suite required. Coordinator review source-exposed, fresh author only this behaviorpacket and retained type declarations (not schema expressions/bodies/history), exact exposures/hashes recorded. Retained zod/shared/node deps not classified as fresh. No blanketMIT claim. Frozen failures unchanged; no global licensing/inventory changes.

## Verified declaration-only appendix

### legacyModelProviderSerialized.ts

```ts
import { z } from "zod";

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

export type ModelProviderSupportedFormat = "anthropic" | "openai" | "responses" | "gemini";

export type ModelProviderApiFormat =
  | "anthropic-messages"
  | "openai-chat-completions"
  | "openai-responses";

export type ModelProviderCatalogSourceId = "china-llm-knorvia-dev";

export type ModelProviderKind = "anthropic" | "openai" | "openai-compatible";

export type ModelProviderModality = "text" | "image" | "video" | "audio" | "pdf";

export interface ProviderOptionsPatch {
  set?: Array<{ path: string[]; value: unknown }>;
  unset?: Array<{ path: string[] }>;
}

export interface ModelProviderReasoningSpec {
  defaultLevel?: string;
  levels: Record<string, Partial<Record<ModelProviderKind, ProviderOptionsPatch>>>;
}

export function stripModelProviderReasoningPatches(
  reasoning: ModelProviderReasoningSpec,
): ModelProviderReasoningSpec;

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

export type ModelProviderSource = "builtin" | "models-dev" | "custom" | "workspace";

export type ModelProviderSystemDisabledReason =
  | "coding_plan_not_authenticated"
  | "coding_plan_not_connected"
  | "coding_plan_auth_failed"
  | "coding_plan_not_entitled"
  | "oauth_provider_inactive";

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

export function stripLegacyClaudeProviderMappings(
  providerMappings: ProviderModelMappings | undefined,
): ProviderModelMappings | undefined;

export function resolveModelProviderContextWindow(contextWindow: number | undefined): number;

export function isModelProviderModelConfig(
  model: ModelProviderModelEntry,
): model is ModelProviderModelConfig;

export function getModelProviderModelIds(
  provider: Pick<ModelProviderConfig, "models"> | null | undefined,
): string[];

export function mapModelProviderSupportedFormatToKind(
  format: ModelProviderSupportedFormat,
): ModelProviderKind | null;

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
}): ModelProviderModelConfig;

export function resolveModelProviderDefaultKind(
  provider: Pick<ModelProviderConfig, "apiFormat" | "defaultKind" | "endpoints">,
): ModelProviderKind;

export function resolveModelProviderKindApiFormat(kind: ModelProviderKind): ModelProviderApiFormat;

export function getDefaultModelProviderEndpointPathForKind(kind: ModelProviderKind): string;

export function normalizeModelProviderBaseUrlForKind(
  baseURL: string,
  kind: ModelProviderKind,
): string;

export function normalizeModelProviderConfiguredBaseUrl(baseURL: string): string;

export function resolveModelProviderRuntimeBaseUrl(
  provider: Pick<ModelProviderConfig, "apiFormat" | "defaultKind" | "endpoints">,
  kind = mapModelProviderApiFormatToKind(resolveModelProviderApiFormat(provider)),
): string;

export function migrateLegacyModelProviderConfig(
  provider: z.infer<typeof legacyModelProviderConfigSchema>,
): ModelProviderConfig;

export function getDefaultModelSupportedFormatsFromEndpoints(
  endpoints: Partial<
    Pick<ModelProviderEndpoints, "anthropic" | "openai" | "gemini" | "baseURL" | "paths">
  >,
): ModelProviderSupportedFormat[];

export function getDefaultModelSupportedFormatsFromApiFormat(
  apiFormat: ModelProviderApiFormat,
): ModelProviderSupportedFormat[];

export function resolveModelProviderApiFormat(
  provider: Pick<ModelProviderConfig, "apiFormat" | "endpoints"> &
    Partial<Pick<ModelProviderConfig, "defaultKind">>,
): ModelProviderApiFormat;
```

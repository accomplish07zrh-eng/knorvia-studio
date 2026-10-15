# apps-cli-packages-01-model 接口（interface.md）

本文件只列**兼容所需的模块路径、导出名、参数与返回类型**。列出的模块路径与导出是重写的输入：44 个
文件按就地路径替换，导出名与签名不得变；内部怎么拆文件由重写自行决定。

签名由 tests/build-interface.mjs 用 TypeScript 编译器 API（createSourceFile 加类型检查器）从源码逐字
提取：函数与方法体换成分号，其余文本保持源码原样；无显式注解的常量用类型检查器推导的类型。
dep:refs 的 list-exports 对 adapters 包报「源文件未加载到 project」，所以这里用与 ts-morph 等价的
编译器 API 分析，同一套 TypeScript 解析器，不新增依赖。

重新生成（仓库根目录，Node 与 mise.toml 一致）：

```text
node specs/contracts/apps-cli-packages-01-model/tests/build-interface.mjs          # 重写标记块
node specs/contracts/apps-cli-packages-01-model/tests/build-interface.mjs --check  # 校验，落后退出码 1
```

小节标题行给出该文件的普通与声明两种模式实测（对上游固定提交 zcode-872ad960）、物理行数与导出计数。
声明模式的剥离集取自本文件代码块与反引号里的标识符，工具语义见 GATE-PLAYBOOK。

不在范围的 7 个达标文件不列出、也不被本包改动：failure-tls、index、provider-finish-business-error、
runner-debug-redaction、strict-tool-schema、system-message-compat、tool-call-validation。

<!-- INTERFACE:START -->

### `apps/cli/packages/adapters/src/model/anthropic-reasoning-metadata.ts`

普通模式 containment 0.769 / run 9 / structural 0.333（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 1.000）。18 行。导出 1 个声明、0 条 re-export。

```ts
export function providerOptionsForReasoningBlock(
  block: ModelReasoningContentBlock,
  options: ReasoningTransformOptions,
): ReasoningProviderOptions;
```

### `apps/cli/packages/adapters/src/model/anthropic-request-metadata.ts`

普通模式 containment 0.333 / run 5 / structural 0.056（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.333）。28 行。导出 2 个声明、0 条 re-export。

```ts
export async function resolveAnthropicRequestMetadataUserId(input: {
  env: EnvRecord;
  providerKind: string | undefined;
  sessionId?: ModelStatusContext["sessionId"];
}): Promise<string | undefined>;
export function redactAnthropicRequestMetadata(value: unknown): unknown;
```

### `apps/cli/packages/adapters/src/model/anthropic-stream-compat.ts`

普通模式 containment 0.229 / run 3 / structural 0.033（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.373）。176 行。导出 1 个声明、0 条 re-export。

```ts
export function createAnthropicCompatFetch(baseFetch: ProviderFetch): ProviderFetch;
```

### `apps/cli/packages/adapters/src/model/empty-completion-retry.ts`

普通模式 containment 0.878 / run 16 / structural 0.389（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.923）。54 行。导出 2 个声明、0 条 re-export。

```ts
export function canRetryEmptyCompletion(input: {
  abortSignal?: AbortSignal;
  attempt: number;
  maxAttempts: number;
  retryCount: number;
}): boolean;
export async function scheduleEmptyCompletionRetry(input: {
  abortSignal?: AbortSignal;
  attempt: number;
  completedAt: number;
  errorPhase: "response" | "stream";
  logger?: Logger;
  requestHeaders: Record<string, string>;
  requestStatusSink?: ModelStatusSink;
  responseHeaders: Record<string, string>;
  retry: ResolvedAiSdkModelRetryOptions;
  retryBudgetAttempt: number;
  startedAt: number;
  statusContext: ModelStatusContext;
  statusSink?: ModelStatusSink;
  streamOutputCommitted?: boolean;
}): Promise<void>;
```

### `apps/cli/packages/adapters/src/model/errors.ts`

普通模式 containment 0.732 / run 11 / structural 0.357（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.909）。51 行。导出 6 个声明、0 条 re-export。

```ts
export const ModelErrorSource: {
  readonly Network: "network";
  readonly Provider: "provider";
  readonly Runtime: "runtime";
};
export type ModelErrorSource = (typeof ModelErrorSource)[keyof typeof ModelErrorSource];
export type LocalProviderConfigurationErrorContext = Record<string, unknown> & {
  envKey?: string;
  modelId?: ModelId;
  providerId: string;
  reason: typeof ModelFailureReason.ProviderNotConfigured;
  retryable: false;
  source: typeof ModelErrorSource.Runtime;
};
export function createLocalProviderConfigurationErrorContext(
  context: Pick<LocalProviderConfigurationErrorContext, "envKey" | "modelId" | "providerId">,
): LocalProviderConfigurationErrorContext;
export interface AiSdkModelAdapterErrorOptions {
  cause?: unknown;
  context?: Record<string, unknown>;
}
export class AiSdkModelAdapterError extends Error {
  readonly code: ModelErrorCode;
  override readonly cause?: unknown;
  readonly context?: Record<string, unknown>;
  constructor(code: ModelErrorCode, message: string, options: AiSdkModelAdapterErrorOptions = {});
  enrichContext(context: Record<string, unknown>): this;
}
```

### `apps/cli/packages/adapters/src/model/failure-ai-sdk-provider-error.ts`

普通模式 containment 0.467 / run 3 / structural 0.000（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.500）。27 行。导出 1 个声明、0 条 re-export。

```ts
export function readMappedAiSdkProviderBusinessError(
  error: unknown,
): ProviderBusinessError | undefined;
```

### `apps/cli/packages/adapters/src/model/failure-classifier.ts`

普通模式 containment 0.262 / run 12 / structural 0.080（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.423）。225 行。导出 5 个声明、0 条 re-export。

```ts
export interface ClassifiedModelFailure {
  code: ModelErrorCodeType;
  message: string;
  reason: ModelFailureReason;
  retryReason: ModelRetryReason;
  retryable: boolean;
  retryAfterMs?: number;
  statusCode?: number;
}
export function findProviderBusinessError(
  error: unknown,
  seen = new WeakSet<object>(),
): ProviderBusinessError | undefined;
export function inspectProviderFailure(error: unknown): ProviderFailureDetails;
export function classifyModelFailure(
  error: unknown,
  abortSignal?: AbortSignal,
): ClassifiedModelFailure;
export function isRetryableFailure(failure: ClassifiedModelFailure): boolean;
```

### `apps/cli/packages/adapters/src/model/failure-inspection.ts`

普通模式 containment 0.202 / run 2 / structural 0.010（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.444）。127 行。导出 14 个声明、0 条 re-export。

```ts
export function unwrapRetryError(error: unknown): unknown;
export function getStatusCode(error: unknown): number | undefined;
export function getHttpResponseStatus(error: unknown): number | undefined;
export function getApiCallResponseBody(error: unknown): unknown;
export function getApiCallErrorData(error: unknown): unknown;
export function getResponseHeaders(error: unknown): Record<string, string> | undefined;
export function getErrorCode(error: unknown): string | undefined;
export function isAbortFailure(error: unknown, abortSignal?: AbortSignal): boolean;
export function isTimeoutFailure(
  error: unknown,
  code = getErrorCode(error),
  statusCode = getStatusCode(error),
): boolean;
export function isContextExceededFailure(error: unknown): boolean;
export function isProxyFailure(code?: string): boolean;
export function isNetworkFailure(code?: string): boolean;
export function isProviderMarkedRetryable(error: unknown): boolean;
export function parseRetryAfterMs(headers?: Record<string, string>): number | undefined;
```

### `apps/cli/packages/adapters/src/model/failure-provider-business-codes.ts`

普通模式 containment 0.447 / run 14 / structural 0.077（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.575）。142 行。导出 3 个声明、0 条 re-export。

```ts
export function getProviderBusinessCodeMapping(
  providerCode: string,
): ProviderBusinessCodeMapping | undefined;
export function isRetryableProviderBusinessNetworkFailure(
  error: ProviderBusinessError,
  providerCode: string | undefined,
): boolean;
export function isRetryableProviderBusinessTimeoutFailure(
  error: ProviderBusinessError,
  providerCode: string | undefined,
  statusCode?: number,
): boolean;
```

### `apps/cli/packages/adapters/src/model/media-transform-policy.ts`

普通模式 containment 0.333 / run 5 / structural 0.000（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.636）。31 行。导出 2 个声明、0 条 re-export。

```ts
export function dataUrlToDataContent(
  dataUrl: string,
): { mediaType: string; data: string } | undefined;
export function unsupportedInputMediaText(
  block: ModelMessageContentBlock,
  inputFormat: ModelInputFormat | undefined,
): string | undefined;
```

### `apps/cli/packages/adapters/src/model/model-execution.ts`

普通模式 containment 0.456 / run 25 / structural 0.657（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.516）。318 行。导出 14 个声明、0 条 re-export。

```ts
export type AiSdkProviderKind = "openai" | "anthropic" | "openai-compatible";
export type EnvRecord = Record<string, string | undefined>;
export interface AiSdkModelExecutionConfig {
  defaultHeaders?: Readonly<Record<string, string>>;
  env?: EnvRecord;
  network?: AiSdkNetworkConfig;
}
export interface AiSdkModelExecutionOptions {
  logger?: Logger;
  transport?: ProviderFetch;
}
export interface AiSdkNetworkConfig {
  caCertFile?: string;
  httpProxy?: string;
  noProxy?: string;
}
export interface AiSdkResolvedModel {
  baseURL?: string;
  headers?: Record<string, string>;
  providerId: ModelProviderId;
  modelId: ModelId;
  model: LanguageModel;
  providerKind: AiSdkProviderKind;
  providerOptions?: Record<string, unknown>;
  rawRequestBodyCapture?: RawRequestBodyCapture;
}
export interface AiSdkBoundModelResolution {
  readonly resolved: AiSdkResolvedModel;
  resolveRequest(input: {
    readonly options: ModelOptionValues;
    readonly requestAuth?: ModelRequestAuth;
  }): AiSdkResolvedModel;
}
export interface ProviderBusinessErrorFetchOptions {
  caCertFile?: string;
  env?: EnvRecord;
  providerId: string;
  providerKind: AiSdkProviderKind;
  fetch?: ProviderFetch;
  httpProxy?: string;
  noProxy?: string;
}
export interface ProviderBusinessErrorOptions {
  providerCode?: ProviderCode;
  providerId: string;
  providerKind: AiSdkProviderKind;
  providerMessage?: string;
  providerRequestId?: string;
  responseBodySummary?: Record<string, unknown>;
  responseHeaders?: Record<string, string>;
  responseStatus?: number;
  statusCode?: number;
}
export class ProviderBusinessError extends Error {
  readonly code = "PROVIDER_BUSINESS_ERROR";
  readonly isProviderBusinessError = true;
  readonly providerCode?: ProviderCode;
  readonly providerId!: string;
  readonly providerKind!: AiSdkProviderKind;
  readonly providerMessage?: string;
  readonly providerRequestId?: string;
  readonly responseBodySummary?: Record<string, unknown>;
  readonly responseHeaders?: Record<string, string>;
  readonly responseStatus?: number;
  readonly statusCode?: number;
  constructor(options: ProviderBusinessErrorOptions);
}
export function isProviderBusinessError(error: unknown): error is ProviderBusinessError;
export function readProviderBusinessFailureFromBody(body: unknown):
  | {
      providerCode?: ProviderCode;
      providerMessage?: string;
      providerRequestId?: string;
      responseBodySummary: Record<string, unknown>;
      statusCode?: number;
    }
  | undefined;
export function createProviderBusinessErrorFetch(
  options: ProviderBusinessErrorFetchOptions,
): ProviderFetch;
export class AiSdkModelExecution {
  private readonly config: AiSdkModelExecutionConfig;
  private readonly transport?: ProviderFetch;
  constructor(config: AiSdkModelExecutionConfig = {}, options: AiSdkModelExecutionOptions = {});
  bindModel(input: {
    readonly providerId: string;
    readonly modelId: string;
    readonly providerConfig: RegistryProviderConfig;
    readonly supportsJsonSchemaOutput: boolean;
    readonly optionSpecs: {
      readonly reasoningLevel: { readonly map: string };
      readonly maxOutputTokens: { readonly map: string };
    };
  }): AiSdkBoundModelResolution;
}
```

### `apps/cli/packages/adapters/src/model/model-option-map-fetch.ts`

普通模式 containment 0.375 / run 9 / structural 0.118（未过线，列入本包 44 个继承文件）；声明模式过线（containment 0.000）。35 行。导出 2 个声明、0 条 re-export。

```ts
export interface RawRequestBodyCapture {
  body?: JsonObject;
}
export function createModelOptionMapFetch(input: {
  readonly capture?: RawRequestBodyCapture;
  readonly fetch: ProviderFetch;
  readonly maps: CompiledModelOptionMaps;
  readonly values: ModelOptionValues;
}): ProviderFetch;
```

### `apps/cli/packages/adapters/src/model/model-request-headers.ts`

普通模式 containment 0.455 / run 3 / structural 0.091（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 1.000）。16 行。导出 1 个声明、0 条 re-export。

```ts
export function mergeModelRequestHeaders(
  ...sources: (Readonly<Record<string, string>> | undefined)[]
): Record<string, string>;
```

### `apps/cli/packages/adapters/src/model/model.ts`

普通模式 containment 0.232 / run 13 / structural 0.267（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.333）。116 行。导出 4 个声明、0 条 re-export。

```ts
export interface ModelExecutionRequest extends Omit<ModelRequest, "options"> {
  options: Required<ModelOptions>;
}
export interface ModelExecutor {
  generateText(request: ModelExecutionRequest): Promise<ModelResult>;
  streamText(request: ModelExecutionRequest): AsyncIterable<ModelEvent>;
}
export interface CreateModelOptions {
  providerId: ModelProviderId;
  modelId: ModelId;
  displayName?: string;
  properties: ModelPropertiesInput;
  optionSpecs: ModelOptionSpecs;
  options?: ModelOptions;
  executor: ModelExecutor;
}
export function createModel(input: CreateModelOptions): Model;
```

### `apps/cli/packages/adapters/src/model/offpeak-retry.ts`

普通模式 containment 0.571 / run 6 / structural 0.143（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.800）。28 行。导出 3 个声明、0 条 re-export。

```ts
export const OFF_PEAK_TICKET_EXPIRED_MARKER: "off-peak-ticket-expired";
export function resolveOffPeakFailureDecision(params: {
  offPeak: boolean;
  failure: ClassifiedModelFailure;
  error: unknown;
}): OffPeakFailureDecision | null;
export function offPeakTicketExpiredMessage(original: string): string;
```

### `apps/cli/packages/adapters/src/model/openai-responses-json-compat.ts`

普通模式 containment 0.464 / run 3 / structural 0.167（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.750）。36 行。导出 1 个声明、0 条 re-export。

```ts
export function createOpenAIResponsesJsonCompatFetch(baseFetch: ProviderFetch): ProviderFetch;
```

### `apps/cli/packages/adapters/src/model/opencode-session.ts`

普通模式 containment 0.500 / run 2 / structural 0.333（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.800）。12 行。导出 1 个声明、0 条 re-export。

```ts
export function isOpenCodeGoBaseUrl(baseURL: string | undefined): boolean;
```

### `apps/cli/packages/adapters/src/model/reasoning-history-normalization.ts`

普通模式 containment 0.264 / run 4 / structural 0.023（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.600）。68 行。导出 2 个声明、0 条 re-export。

```ts
export function normalizeReasoningHistory(
  messages: ModelInputMessage[],
  targetModel?: { modelId: ModelId; providerId: ModelProviderId },
): ModelInputMessage[];
export function repairReasoningHistoryAfterSignatureRejection(
  messages: ModelInputMessage[],
  error: unknown,
): ModelInputMessage[] | undefined;
```

### `apps/cli/packages/adapters/src/model/request-admission.ts`

普通模式 containment 0.586 / run 7 / structural 0.211（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.750）。42 行。导出 2 个声明、0 条 re-export。

```ts
export interface AttemptAdmission {
  readonly ticket?: ModelRequestAdmissionTicket;
  release(): void;
}
export async function admitAttempt(input: {
  admission?: ModelRequestAdmission;
  model: ModelRequestTarget;
  signal?: AbortSignal;
  onQueued?: () => Promise<void>;
  onAdmitted?: (queuedMs: number) => Promise<void>;
}): Promise<AttemptAdmission>;
```

### `apps/cli/packages/adapters/src/model/retry-budget.ts`

普通模式 containment 0.952 / run 6 / structural 1.000（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 1.000）。28 行。导出 5 个声明、0 条 re-export。

```ts
export const UNBOUNDED_RETRY_MAX_ATTEMPTS: 0;
export function isUnboundedRetryBudget(budget: ModelRetryBudget | undefined): boolean;
export function retryBudgetAllows(
  budget: ModelRetryBudget | undefined,
  retryBudgetAttempt: number,
  maxAttempts: number,
): boolean;
export function retryAttemptLoopContinues(
  budget: ModelRetryBudget | undefined,
  attempt: number,
  loopMaxAttempts: number,
): boolean;
export function retryBudgetMaxAttempts(
  budget: ModelRetryBudget | undefined,
  maxAttempts: number,
): number;
```

### `apps/cli/packages/adapters/src/model/retry-policy.ts`

普通模式 containment 0.357 / run 8 / structural 0.150（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.429）。54 行。导出 3 个声明、0 条 re-export。

```ts
export interface AiSdkModelRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  backoffFactor?: number;
  maxDelayMs?: number;
  jitter?: boolean;
}
export type ResolvedAiSdkModelRetryOptions = Required<AiSdkModelRetryOptions>;
export function resolveAiSdkModelRetryOptions(
  options: AiSdkModelRetryOptions | undefined,
  env: EnvRecord,
): ResolvedAiSdkModelRetryOptions;
```

### `apps/cli/packages/adapters/src/model/runner-attribution.ts`

普通模式 containment 0.313 / run 4 / structural 0.000（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.412）。43 行。导出 3 个声明、0 条 re-export。

```ts
export function normalizeModelSessionIdForAttribution(
  sessionId: ModelStatusContext["sessionId"],
): string | undefined;
export function resolveModelRequestSessionType(
  explicitType: unknown,
  modelCall: Pick<ResolvedModelApiCallObservation, "actorKind" | "operation">,
): ModelRequestSessionTypeValue;
export function createModelRequestAttributionHeaders(
  context: ModelStatusContext,
): Record<string, string>;
```

### `apps/cli/packages/adapters/src/model/runner-debug.ts`

普通模式 containment 0.272 / run 15 / structural 0.075（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.519）。306 行。导出 4 个声明、0 条 re-export。

```ts
export function shouldRecordModelIO(env: EnvRecord): boolean;
export function isDevelopmentModelIOEnv(env: EnvRecord): boolean;
export function recordGenerateTextDebug(input: {
  attempt: number;
  debugDir?: string;
  error?: unknown;
  isDev: boolean;
  modelIoFullRetentionEnabled: boolean;
  normalizedToolCalls: ModelTextResult["toolCalls"];
  options: AiSdkGenerateTextOptions;
  recordModelIO: boolean;
  request: AiSdkModelTextRequest;
  requestId: string;
  resolved: ResolvedAiSdkModel;
  result?: AiSdkGenerateTextResult;
  startedAt: number;
}): Promise<void>;
export async function recordStreamTextDebug(input: {
  attempt: number;
  debugDir?: string;
  error?: unknown;
  isDev: boolean;
  modelIoFullRetentionEnabled: boolean;
  normalizedToolCalls: ModelTextResult["toolCalls"];
  options: AiSdkStreamTextOptions;
  recordModelIO: boolean;
  request: AiSdkModelTextRequest;
  requestId: string;
  resolved: ResolvedAiSdkModel;
  result?: AiSdkStreamTextResult;
  startedAt: number;
}): Promise<void>;
```

### `apps/cli/packages/adapters/src/model/runner-diagnostics.ts`

普通模式 containment 0.659 / run 19 / structural 0.214（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.778）。159 行。导出 9 个声明、0 条 re-export。

```ts
export function createStreamDiagnostics(): StreamDiagnostics;
export function recordStreamChunkDiagnostic(d: StreamDiagnostics, chunk: unknown): void;
export function getGenerateTextResultMetadata(result?: AiSdkGenerateTextResult);
export function logGenerateTextDiagnostics(input: {
  attempt: number;
  completedAt: number;
  logger?: Logger;
  result: AiSdkGenerateTextResult;
  startedAt: number;
  statusContext: ModelStatusContext;
  toolCallCount: number;
  usage: ModelUsage;
}): void;
export function logStreamDiagnostics(input: {
  attempt: number;
  diagnostics: StreamDiagnostics;
  durationMs: number;
  emittedError: boolean;
  emittedEvent: boolean;
  logger?: Logger;
  outboundHeaders?: Record<string, string>;
  statusContext: ModelStatusContext;
}): void;
export function logStreamFailureDiagnostics(input: {
  attempt: number;
  canRetry: boolean;
  diagnostics: StreamDiagnostics;
  durationMs: number;
  emittedError: boolean;
  emittedEvent: boolean;
  emittedRetryBoundaryEvent: boolean;
  error: unknown;
  failure: ClassifiedModelFailure;
  logger?: Logger;
  statusContext: ModelStatusContext;
}): void;
export function logIgnoredStreamChunk(input: {
  attempt: number;
  chunk: unknown;
  logger?: Logger;
  statusContext: ModelStatusContext;
}): void;
export function isSuspiciousStreamDiagnostics(d: StreamDiagnostics): boolean;
export function isZeroOutputModelCompletion(input: {
  finishReason?: string;
  reasoningLength: number;
  textLength: number;
  toolCallCount: number;
  usage?: ModelUsage;
}): boolean;
```

### `apps/cli/packages/adapters/src/model/runner-generate.ts`

普通模式 containment 0.547 / run 12 / structural 0.037（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.529）。379 行。导出 1 个声明、0 条 re-export。

```ts
export async function runGenerateText(input: {
  debugDir?: string;
  env: EnvRecord;
  logger?: Logger;
  request: AiSdkModelTextRequest;
  resolveModel: () => ResolvedAiSdkModel;
  resolved: ResolvedAiSdkModel;
  retry: ResolvedAiSdkModelRetryOptions;
  runtime: AiSdkModelRuntime;
  statusSink?: ModelStatusSink;
  modelIoFullRetentionEnabled: boolean;
}): Promise<ModelTextResult>;
```

### `apps/cli/packages/adapters/src/model/runner-network-headers.ts`

普通模式 containment 0.111 / run 1 / structural 0.111（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 1.000）。13 行。导出 1 个声明、0 条 re-export。

```ts
export function sanitizeModelNetworkHeaders(value: unknown): Record<string, string>;
```

### `apps/cli/packages/adapters/src/model/runner-normalization.ts`

普通模式 containment 0.433 / run 6 / structural 0.013（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.694）。165 行。导出 6 个声明、0 条 re-export。

```ts
export function normalizeUsage(usage?: Partial<LanguageModelUsage>): ModelUsage;
export function normalizeReasoning(
  reasoning?: readonly { providerMetadata?: unknown; text?: string; type?: string }[],
): ModelReasoningContentBlock[] | undefined;
export function toModelStreamEvent(chunk: TextStreamPart<ToolSet>): ModelStreamEvent | undefined;
export function normalizeToolCalls(
  result: AiSdkGenerateTextResult,
  logger?: Logger,
): ModelTextResult["toolCalls"];
export function normalizeToolResults(
  result: AiSdkGenerateTextResult,
  normalizedToolCalls?: ModelTextResult["toolCalls"],
): ModelToolResult[] | undefined;
export function normalizeSources(result: AiSdkGenerateTextResult): ModelSource[] | undefined;
```

### `apps/cli/packages/adapters/src/model/runner-options.ts`

普通模式 containment 0.683 / run 9 / structural 0.243（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.737）。85 行。导出 2 个声明、0 条 re-export。

```ts
export function createGenerateTextOptions(input: {
  anthropicMetadataUserId?: string;
  env?: EnvRecord;
  includeModelIO: boolean;
  request: AiSdkModelTextRequest;
  resolved: ResolvedAiSdkModel;
  statusContext: ModelStatusContext;
}): AiSdkGenerateTextOptions;
export function createStreamTextOptions(input: {
  anthropicMetadataUserId?: string;
  env?: EnvRecord;
  includeModelIO: boolean;
  request: AiSdkModelTextRequest;
  resolved: ResolvedAiSdkModel;
  statusContext: ModelStatusContext;
}): AiSdkStreamTextOptions;
```

### `apps/cli/packages/adapters/src/model/runner-record.ts`

普通模式 containment 0.813 / run 8 / structural 0.412（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 1.000）。23 行。导出 5 个声明、0 条 re-export。

```ts
export function isRecord(value: unknown): value is Record<string, unknown>;
export function asRecord(value: unknown): Record<string, unknown>;
export function stringProperty(record: Record<string, unknown>, key: string): string | undefined;
export function numberProperty(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined;
export function stringMetadata(value: unknown): string | undefined;
```

### `apps/cli/packages/adapters/src/model/runner-retry.ts`

普通模式 containment 0.486 / run 9 / structural 0.133（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.480）。91 行。导出 5 个声明、0 条 re-export。

```ts
export class TerminalStreamChunkError extends Error {
  readonly adapterError: AiSdkModelAdapterError;
  constructor(adapterError: AiSdkModelAdapterError);
}
export function calculateRetryDelay(
  retry: ResolvedAiSdkModelRetryOptions,
  attempt: number,
  retryAfterMs?: number,
): number;
export function sleep(delayMs: number, abortSignal?: AbortSignal): Promise<void>;
export function logRetryDelayDecision(input: {
  attempt: number;
  canRetry: boolean;
  delayMs?: number;
  failure: ClassifiedModelFailure;
  logger?: Logger;
  responseHeaders: Record<string, string>;
  statusContext: ModelStatusContext;
}): void;
export function toAdapterError(
  error: unknown,
  failure: ClassifiedModelFailure,
  statusContext: ModelStatusContext,
  attempt: number,
  additionalContext: Record<string, unknown> = {},
): AiSdkModelAdapterError;
```

### `apps/cli/packages/adapters/src/model/runner-runtime-headers.ts`

普通模式 containment 0.556 / run 7 / structural 0.167（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.667）。36 行。导出 2 个声明、0 条 re-export。

```ts
export class RuntimeHeadersRefreshError extends Error {
  constructor(cause: unknown);
}
export async function resolveModelForAttempt(input: {
  attempt: number;
  reason?: "model-request";
  request: AiSdkModelTextRequest;
  resolveModel: (requestAuth?: ModelRequestAuth) => ResolvedAiSdkModel;
}): Promise<ResolvedAiSdkModel>;
```

### `apps/cli/packages/adapters/src/model/runner-runtime.ts`

普通模式 containment 0.600 / run 11 / structural 0.526（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.423）。60 行。导出 9 个声明、0 条 re-export。

```ts
export type AiSdkGenerateTextOptions = Parameters<typeof aiGenerateText>[0];
export type AiSdkGenerateTextResult = Awaited<ReturnType<typeof aiGenerateText>>;
export type AiSdkStreamTextOptions = Parameters<typeof aiStreamText>[0];
export type AiSdkStreamTextResult = ReturnType<typeof aiStreamText>;
export type ResolvedAiSdkModel = AiSdkResolvedModel & {
  properties: ModelProperties;
  accountAccess?: KnorviaProviderAccountAccess;
};
export interface AiSdkModelRuntime {
  generateText(options: AiSdkGenerateTextOptions): Promise<AiSdkGenerateTextResult>;
  streamText(options: AiSdkStreamTextOptions): AiSdkStreamTextResult;
}
export interface RunStreamTextInput {
  debugDir?: string;
  env: EnvRecord;
  logger?: Logger;
  request: AiSdkModelTextRequest;
  resolveModel: () => ResolvedAiSdkModel;
  resolved: ResolvedAiSdkModel;
  retry: ResolvedAiSdkModelRetryOptions;
  runtime: AiSdkModelRuntime;
  statusSink?: ModelStatusSink;
  streamIdleTimeoutMs: number;
  modelIoFullRetentionEnabled: boolean;
}
export interface AiSdkModelTextRequest extends ModelTextRequest {
  abortSignal?: AbortSignal;
  traceContext?: TraceContext;
  refreshRuntimeHeadersBeforeAttempt?: (input: {
    accountAccess?: KnorviaProviderAccountAccess;
    attempt: number;
    reason?: "model-request";
    abortSignal?: AbortSignal;
    providerId: string;
    modelId: string;
    traceContext?: TraceContext;
  }) => Promise<{ headersApplied: boolean; requestAuth?: ModelRequestAuth }>;
  streamIdleTimeoutRetryNumber?: number;
  preserveProviderStreamBoundaries?: boolean;
}
export const defaultRuntime: AiSdkModelRuntime;
```

### `apps/cli/packages/adapters/src/model/runner-status.ts`

普通模式 containment 0.447 / run 20 / structural 0.084（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.478）。207 行。导出 7 个声明、1 条 re-export。

```ts
export {
  createModelRequestAttributionHeaders,
  normalizeModelSessionIdForAttribution,
  resolveModelRequestSessionType,
} from "./runner-attribution.js";
export interface ModelStatusContext {
  traceId: TraceId;
  queryId?: QueryId;
  sessionId?: ModelNetworkStatusEvent["sessionId"];
  turnId?: ModelNetworkStatusEvent["turnId"];
  parentSessionId?: ModelNetworkStatusEvent["parentSessionId"];
  toolCallId?: string;
  spanId?: string;
  parentSpanId?: string;
  querySource?: string;
  requestId: string;
  providerId: ResolvedAiSdkModel["providerId"];
  modelId: ResolvedAiSdkModel["modelId"];
  modelRequestSessionType: ModelRequestSessionTypeValue;
  baseURL?: string;
  providerKind?: string;
  transport: ModelTransportKind;
  maxAttempts: number;
  streamRecovery?: ModelNetworkStatusEvent["streamRecovery"];
  modelCall: ResolvedModelApiCallObservation;
}
export function createStatusContext(input: {
  maxAttempts: number;
  request: AiSdkModelTextRequest;
  resolved: ResolvedAiSdkModel;
  transport: ModelTransportKind;
}): ModelStatusContext;
export function createAttemptStatusContext(
  context: ModelStatusContext,
  attempt: number,
): ModelStatusContext;
export async function publishModelStatus(
  event: ModelNetworkStatusEvent,
  options: PublishOptions,
): Promise<void>;
export function admissionWaitPublishers(
  context: ModelStatusContext,
  attempt: number,
  options: PublishOptions,
): { onQueued: () => Promise<void>; onAdmitted: (queuedMs: number) => Promise<void> };
export async function publishModelTelemetryMilestone(
  event: Extract<
    ModelNetworkStatusEvent,
    { type: "model_first_provider_event" | "model_first_content" | "model_first_text" }
  >,
  options: { logger?: Logger; statusSink?: ModelStatusSink },
): Promise<void>;
export function modelStatusContextToLogContext(
  context: ModelStatusContext | ModelNetworkStatusEvent,
  attempt: number,
): Record<string, unknown>;
```

### `apps/cli/packages/adapters/src/model/runner-stream.ts`

普通模式 containment 0.357 / run 4 / structural 0.011（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.286）。413 行。导出 1 个声明、0 条 re-export。

```ts
export async function* runStreamText(input: RunStreamTextInput): AsyncGenerator<ModelStreamEvent>;
```

### `apps/cli/packages/adapters/src/model/runner-telemetry.ts`

普通模式 containment 0.348 / run 4 / structural 0.036（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.571）。59 行。导出 4 个声明、0 条 re-export。

```ts
export function readModelFailureErrorPhase(error: unknown): ModelApiErrorPhase | undefined;
export function modelFailureAttributionFields(
  error: unknown,
  failure: ClassifiedModelFailure,
  errorPhase: unknown,
): { errorPhase?: ModelApiErrorPhase; exceptionKind: ModelFailureExceptionKind };
export function modelFailureStatusFields(
  error: unknown,
  failure: ClassifiedModelFailure,
  errorPhase: ModelApiErrorPhase,
);
export function providerRequestIdFromHeaders(headers: Record<string, string>): string | undefined;
```

### `apps/cli/packages/adapters/src/model/runner.ts`

普通模式 containment 0.383 / run 20 / structural 0.087（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.238）。250 行。导出 3 个声明、3 条 re-export。

```ts
export type { AiSdkModelRetryOptions } from "./retry-policy.js";
export type {
  AiSdkGenerateTextOptions,
  AiSdkGenerateTextResult,
  AiSdkModelRuntime,
  AiSdkModelTextRequest,
  AiSdkStreamTextOptions,
  AiSdkStreamTextResult,
} from "./runner-runtime.js";
export { normalizeUsage, toModelStreamEvent } from "./runner-normalization.js";
export interface AiSdkModelAdapterOptions {
  defaultHeaders?: AiSdkModelExecutionConfig["defaultHeaders"];
  network?: AiSdkNetworkConfig;
  runtime?: AiSdkModelRuntime;
  env?: EnvRecord;
  debugDir?: string;
  logger?: Logger;
  retry?: AiSdkModelRetryOptions;
  statusSink?: ModelStatusSink;
  streamIdleTimeoutMs?: number;
  modelIoFullRetentionEnabled?: boolean;
}
export interface CreateAiSdkModelOptions {
  providerId: string;
  modelId: string;
  providerConfig: RegistryProviderConfig;
  modelConfig: RegistryModelConfig;
  displayName?: string;
  options?: ModelOptions;
  requestDependencies?: ModelRequestDependencies;
}
export class AiSdkModelAdapter {
  private readonly env: EnvRecord;
  private readonly debugDir?: string;
  private readonly logger?: Logger;
  private readonly retry;
  private readonly runtime;
  private readonly execution;
  private statusSink?: ModelStatusSink;
  private readonly streamIdleTimeoutMs: number;
  private fullRetention: boolean;
  constructor(options: AiSdkModelAdapterOptions);
  setModelIoFullRetentionEnabled(enabled: boolean): void;
  addStatusSink(sink: ModelStatusSink): void;
  createModel(options: CreateAiSdkModelOptions): Model;
}
```

### `apps/cli/packages/adapters/src/model/stream-idle-timeout.ts`

普通模式 containment 0.513 / run 7 / structural 0.375（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.652）。98 行。导出 4 个声明、1 条 re-export。

```ts
export { DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS } from "@knorvia/contracts";
export function resolveModelStreamIdleTimeoutMs(options: {
  baseTimeoutMs?: number;
  retryNumber?: number;
}): number;
export function isModelStreamIdleTimeoutError(error: unknown): error is ModelStreamIdleTimeoutError;
export function createLinkedAbortController(parentSignal?: AbortSignal): LinkedAbortController;
export async function readNextWithStreamIdleTimeout<T>(
  iterator: AsyncIterator<T>,
  options: {
    abortController: AbortController;
    onTimeout?: (error: ModelStreamIdleTimeoutError) => void | Promise<void>;
    timeoutMs: number;
  },
): Promise<IteratorResult<T>>;
```

### `apps/cli/packages/adapters/src/model/stream-retry-boundary.ts`

普通模式 containment 0.321 / run 3 / structural 0.000（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.357）。142 行。导出 1 个声明、0 条 re-export。

```ts
export function isRetrySafePreludeStreamEvent(event: ModelStreamEvent): boolean;
```

### `apps/cli/packages/adapters/src/model/streaming-tool-call-assembler.ts`

普通模式 containment 0.250 / run 3 / structural 0.021（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.333）。80 行。导出 1 个声明、0 条 re-export。

```ts
export class StreamingToolCallAssembler {
  private readonly logger?: Logger;
  private readonly pending = new Map<string, Pending>();
  private readonly calls = new Map<string, ModelToolCall>();
  constructor(options: StreamingToolCallAssemblerOptions = {});
  snapshotNormalizedToolCalls(): ModelToolCall[];
  handle(event: ModelStreamEvent): ModelStreamEvent[];
  flush(): ModelStreamEvent[];
  private commit(id: string): ModelStreamEvent[];
}
```

### `apps/cli/packages/adapters/src/model/tool-input-normalization.ts`

普通模式 containment 0.684 / run 8 / structural 0.111（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 1.000）。26 行。导出 1 个声明、0 条 re-export。

```ts
export function normalizeModelToolInput(
  input: unknown,
  options: NormalizeModelToolInputOptions,
): unknown;
```

### `apps/cli/packages/adapters/src/model/tool-result-media-projection.ts`

普通模式 containment 0.405 / run 8 / structural 0.185（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.567）。107 行。导出 5 个声明、0 条 re-export。

```ts
export function shouldTextifyStructuredToolResults(
  options: Pick<ToolResultMediaProjectionOptions, "apiFormat" | "providerKind">,
): boolean;
export function toolResultHasVideoMedia(content: ModelMessageContent): boolean;
export function toStructuredToolResultText(
  content: ModelMessageContent,
  options: Pick<ToolResultMediaProjectionOptions, "inputFormat"> = {},
): string;
export function toToolResultMediaUserParts(
  content: ModelMessageContent,
  options: ToolResultMediaProjectionOptions,
): AiSdkUserContentParts;
export function undeliverableFrameReferenceText(
  content: ModelMessageContent,
  options: Pick<ToolResultMediaProjectionOptions, "stripMedia" | "inputFormat">,
): string | undefined;
```

### `apps/cli/packages/adapters/src/model/tool-transform.ts`

普通模式 containment 0.272 / run 8 / structural 0.038（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.488）。129 行。导出 2 个声明、0 条 re-export。

```ts
export interface AiSdkToolTransformOptions {
  requiresMfjsToolSchema?: boolean;
  supportsNativeWebSearch?: boolean;
  providerKind?: "openai" | "anthropic" | "openai-compatible" | "gateway" | "custom";
  modelId?: string;
}
export function toAiSdkTools(
  tools?: ModelToolContract[],
  options: AiSdkToolTransformOptions = {},
): ToolSet | undefined;
```

### `apps/cli/packages/adapters/src/model/transform.ts`

普通模式 containment 0.204 / run 6 / structural 0.025（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.207）。207 行。导出 2 个声明、0 条 re-export。

```ts
export interface AiSdkMessageTransformOptions {
  apiFormat?: string;
  providerOptions?: Record<string, unknown>;
  providerKind?: "openai" | "anthropic" | "openai-compatible" | "gateway" | "custom";
  stripMedia?: boolean;
  inputFormat?: ModelInputFormat;
}
export function toAiSdkMessages(
  messages: ModelInputMessage[],
  options: AiSdkMessageTransformOptions = {},
): AiSdkModelMessage[];
```

### `apps/cli/packages/adapters/src/model/workflow-model-failure-policy.ts`

普通模式 containment 0.606 / run 9 / structural 0.196（未过线，列入本包 44 个继承文件）；声明模式未过线（containment 0.865）。113 行。导出 7 个声明、0 条 re-export。

```ts
export type WorkflowProviderStopKind =
  | "auth"
  | "not_configured"
  | "model_unavailable"
  | "invalid_request"
  | "quota"
  | "other";
export const WORKFLOW_QUOTA_PROVIDER_CODES: ReadonlySet<string>;
export type WorkflowModelFailurePolicy =
  | { decision: "retry" }
  | { decision: "stop"; kind: WorkflowProviderStopKind }
  | { decision: "context_exceeded" }
  | { decision: "cancelled" };
export function resolveWorkflowModelFailurePolicy(
  failure: Pick<ClassifiedModelFailure, "code" | "reason" | "retryable">,
  providerCode: string | undefined,
): WorkflowModelFailurePolicy;
export function retryAllowedByFailurePolicy(
  failure: ClassifiedModelFailure,
  retryBudget: ModelRetryBudget | undefined,
  providerCode: string | undefined,
): boolean;
export interface WorkflowModelFailureInspection {
  policy: WorkflowModelFailurePolicy;
  reason: string;
  providerCode?: string;
  providerId?: string;
  modelId?: string;
  rawMessage?: string;
  resetAt?: number;
}
export function inspectWorkflowModelFailure(
  error: unknown,
): WorkflowModelFailureInspection | undefined;
```

<!-- INTERFACE:END -->

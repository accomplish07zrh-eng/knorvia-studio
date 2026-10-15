# apps-cli-packages-01-model 行为（behavior.md）

编号 B1、B2…；发布后编号不重用、不重排。每条写：输入、输出、错误语义、时序与并发、幂等、资源释放、
平台差异、状态所有者、日志级别。语义常量逐字列出（值、键名、文案是兼容事实）。条目 → 测试对照表见
README 第八节；语义常量条目必须有锁值断言（M1 教训）。

状态所有者总纲（全包适用）：**模型对象**持有创建时冻结的 provider/model 身份、能力与已绑定选项；
**逻辑请求**持有 canonical messages 与归因；**物理 attempt** 独占 requestId、准入票据、取消控制器与计时。
本文件只写可观察行为，不写实现结构。

## 批次 A：模型装配、provider 路由与请求投影（model-execution / model / model-option-map-fetch / model-request-headers / opencode-session）

### B1 provider API 格式到 SDK 种类的路由

- 输入：`bindModel` 的 `providerConfig`（`api.type` 字符串）。
- 输出：`providerKind` 三选一与对应 SDK 构造路径。
- 错误语义：`api.type` 不在已知集合时抛普通 `Error`，消息为 `Unsupported provider API format: <type>`。
- 时序与并发：不适用（纯路由判定）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：`AiSdkModelExecution` 实例的绑定期决定，绑定后不变。
- 日志级别：不适用（本模块不打日志）。
- 语义常量：`anthropic-messages` → `anthropic`（Anthropic Messages）；`openai-responses` → `openai`（OpenAI Responses）；`openai-chat-completions` → `openai-compatible`（OpenAI Compatible）；`api.type` 缺省按 `openai-chat-completions` 处理；`baseURL` 取 `api.baseUrl`（字符串时）；静态 header 取 `api.headers`；静态密钥取 `access.apiKey`；`providerOptions` 取 `config.providerOptions`。
- （依据：model-execution.ts 207-236 行）

### B2 请求期鉴权与 header 合并（大小写不敏感、后者覆盖前者）

- 输入：`resolveRequest` 的 `options`（选项映射值）与 `requestAuth`（可缺省）；绑定期的 `defaultHeaders`、静态 `api.headers`。
- 输出：一份合并后的请求 header 表与最终 apiKey。
- 错误语义：不适用。
- 时序与并发：每次 `resolveRequest` 独立计算，不共享可变状态。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：逻辑请求级（覆盖只属于本次请求，不回写静态 registry）。
- 日志级别：不适用。
- 语义常量：合并顺序为 `defaultHeaders` → 静态 `api.headers` → `requestAuth.headers`；同名（按小写归一）后出现者覆盖先出现者，**输出保留最后来源的原始大小写与插入顺序**；`requestAuth.apiKey` 优先于静态 `access.apiKey`；anthropic 种类且合并结果中不存在 `authorization`（大小写不敏感）又持有 apiKey 时，追加 `Authorization: Bearer <apiKey>`。
- （依据：model-execution.ts 238-253 行、model-request-headers.ts 1-15 行）

### B3 三种 provider 的 SDK 构造与 baseURL 归一

- 输入：`baseURL`、`apiKey`、合并后的 `headers`、包装后的 `fetch`、`modelId`。
- 输出：AI SDK `LanguageModel` 实例与 `AiSdkResolvedModel` 记录（`baseURL`、`headers`、`providerId`、`modelId`、`model`、`providerKind`、`providerOptions`、`rawRequestBodyCapture`）。
- 错误语义：不适用（构造期不校验网络可达）。
- 时序与并发：每次 `resolveRequest` 构造一份新的请求级模型实例与新的捕获对象。
- 幂等：同输入同形状。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：请求级装配；`resolved` 占位实例在绑定期构造一次（无请求鉴权、无选项映射包装）。
- 日志级别：不适用。
- 语义常量：anthropic 的 `baseURL` 先去掉结尾 `/`，再补 `/v1`（除非已以 `/v1` 结尾）；`baseURL` 与 `apiKey` 均缺省时 anthropic 用 SDK 默认单例；`openai` 一律走 `responses(modelId)` 端点；`openai-compatible` 以 `providerId` 为 SDK name、`baseURL` 缺省用空串、**`includeUsage: true`**（OpenAI 兼容端点仅在请求带 `stream_options.include_usage` 时才在流末尾返回用量；否则用量累计恒加 0——这是已修的对话底部 token/缓存命中不随轮次变化缺陷，行为保持）。
- （依据：model-execution.ts 271-316 行）

### B4 选项映射 fetch 包装（请求体改写与原始体捕获）

- 输入：一次 HTTP 请求的 `init.body`、编译好的选项映射与取值、可选捕获对象。
- 输出：改写后的请求体（重新序列化）转发给底层 fetch；`capture.body` 记录改写后的对象。
- 错误语义：`init.body` 不是字符串时抛 `TypeError`，消息 `Model option maps require a JSON object request body`；JSON 解析失败抛 `TypeError`，消息 `Model option maps require valid JSON`（cause 保留解析错误）；解析结果不是普通对象（null、数组）时抛同一「JSON object request body」`TypeError`。
- 时序与并发：包装器无状态，随用随建。
- 幂等：同输入同输出；`capture` 只在有 `values` 时启用。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：请求级；`RawRequestBodyCapture` 对象归属 `AiSdkResolvedModel`。
- 日志级别：不适用。
- 语义常量：`init.body === undefined` 时**原样透传**（不改写、不捕获）；捕获对象字段名 `body`。
- > 往返候选：改写后的请求体形状（模型选项映射结果）随金样固定。
- （依据：model-option-map-fetch.ts 12-34 行）

### B5 provider 业务错误体的提取（readProviderBusinessFailureFromBody）

- 输入：响应体（字符串或已解析值）。
- 输出：`{ providerCode, providerMessage, providerRequestId, responseBodySummary, statusCode }` 或 `undefined`。
- 错误语义：不抛错；不满足条件返回 `undefined`（调用方把原响应回传）。
- 时序与并发：不适用（纯函数）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：字符串体长度 **> 64_000** 直接放弃（返回 undefined）；字符串体按 JSON 解析，失败返回 undefined；解析结果必须是普通对象（非数组）；`providerCode` 取顶层或 `error` 子对象的 `providerCode` / `error_code` / `code`（字符串或有限数字，先顶层后子对象）；`providerMessage` 取子对象 `message` / `error` 优先、其次顶层同名键；`providerRequestId` 取子对象 `request_id` / `requestId` / `id` 优先、其次顶层；`statusCode` 取顶层 `status`（数字）否则子对象 `status`；三者全缺省返回 undefined；`providerMessage`、`providerRequestId` 各截断到 **1000** 字符；`responseBodySummary` 只收前 **20** 个值为 null/string/number/boolean 的顶层条目，含 `error` 子对象时附同规则摘要。
- （依据：model-execution.ts 97-166 行）

### B6 非 2xx 响应转 ProviderBusinessError（含清理路径）

- 输入：一次 fetch 的响应（经网络代理 fetch 转发）。
- 输出：2xx 原样返回；非 2xx 且业务体可提取时**抛** `ProviderBusinessError`，否则原样返回响应。
- 错误语义：`ProviderBusinessError` 的 `code` 为 `PROVIDER_BUSINESS_ERROR`、`name` 为 `ProviderBusinessError`、消息优先用 `providerMessage`、缺省 `Provider <providerId> rejected the request`；携带 `providerCode`、`providerId`、`providerKind`、`providerRequestId`、`responseBodySummary`、`responseHeaders`（全部响应头）、`responseStatus`、`statusCode`（体内的 status 缺省用 HTTP 状态码）。
- 时序与并发：先 `response.clone()` 读体；抛错前对原响应 `body?.cancel()`，取消失败仅吞掉（尽力清理，不覆盖原始错误）。
- 幂等：同输入同输出。
- 资源释放：见上（克隆读体 + 原体取消）。
- 平台差异：不适用。
- 状态所有者：请求级 fetch 包装。
- 日志级别：不适用（清理失败静默）。
- 语义常量：判定错误形状时兼容「duck typing」：非本类实例但 `isProviderBusinessError === true` 的对象也算业务错误（`isProviderBusinessError` 判定）；类字段 `isProviderBusinessError = true`。
- （依据：model-execution.ts 73-96、167-198 行）

### B7 模型对象的不可变绑定与 bind 合并

- 输入：`createModel` 入参（身份、能力、选项规格、初始选项、执行器）；`bind(next)` 的增量选项。
- 输出：冻结的 `Model` 对象（`providerId`、`modelId`、`displayName`、`properties`、`optionSpecs`、`options`、`bind`、`generateText`、`streamText`）。
- 错误语义：见 B8 的选项校验与 B9 的请求能力校验。
- 时序与并发：`bind` 产生新模型对象，旧对象不受影响（绑定期冻结身份与能力）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：模型对象（创建时冻结）。
- 日志级别：不适用。
- 语义常量：`bind(next = {})` 用 `{ ...options, ...next }` 浅合并（next 的键覆盖）；`properties`、`optionSpecs`、`options` 与模型对象本体都 `Object.freeze`；`generateText`/`streamText` 的请求期覆盖以 `{ ...resolved, ...request.options }` 再次校验后传给执行器。
- （依据：model.ts 83-115 行）

### B8 选项校验与默认值（语义常量条目）

- 输入：`optionSpecs` 与一次调用的 `options`（可缺省字段）。
- 输出：补齐后的 `Required<ModelOptions>`（`reasoningLevel`、`maxOutputTokens`）。
- 错误语义：`reasoningLevel` 不在 `specs.reasoningLevel.values` 内 → `AiSdkModelAdapterError` code `invalid_model_request`，消息 `Unsupported reasoningLevel: <值>`，context `{ reason: "invalid_request", retryable: false, source: "runtime" }`；`maxOutputTokens` 非正整数或超过上限 → 同 code，消息 `maxOutputTokens must be a positive integer no greater than <max>`，context 同上。
- 时序与并发：不适用（纯函数）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：`reasoningLevel` 缺省取 `specs.reasoningLevel.values[0]`（首个允许值）；`maxOutputTokens` 缺省取 `specs.maxOutputTokens.max`（规格上限）；上限判定含等号（等于 max 合法）。
- （依据：model.ts 31-47 行）

### B9 请求能力校验（工具、结构化输出、输入媒体）

- 输入：一次 `ModelRequest`（`tools`、`responseJsonSchema`、`messages` 各内容块）与模型 `properties`。
- 输出：通过（返回）或抛错。
- 错误语义：带 `tools` 而 `properties.supportsToolCall` 为假 → code `invalid_model_request`，消息 `Selected model does not support tools`，context `{ reason: "invalid_request", retryable: false }`（**无 source 字段**）；带 `responseJsonSchema` 而 `supportsJsonSchemaOutput` 为假 → 消息 `Selected model does not support structured output`，context 同上；内容块为 `image` 而 `inputFormat.supportsImage` 为假 → `Selected model does not support image input`；`video` 而 `supportsVideo` 为假 → `… video input`；`file` 且 mediaType 匹配 PDF 而 `supportsPdf` 为假 → `… PDF input`（这组 context 带 `source: "runtime"`）。错误 code 统一 `invalid_model_request`。
- 时序与并发：不适用（纯函数，逐消息逐块扫描）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：PDF 判定用 mediaType 正则 `^application\/pdf(?:;|$)`（大小写不敏感，允许 `application/pdf; …` 参数后缀）；只检查数组形式的 `message.content`（字符串内容不检查）。
- （依据：model.ts 48-82 行）

### B10 OpenCode Go base URL 判定

- 输入：`baseURL`（可缺省）。
- 输出：布尔。
- 错误语义：URL 解析失败返回 false，不抛错。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：仅当 origin 等于 `https://opencode.ai` 且 pathname 匹配 `^\/zen\/go\/v1\/?$`（允许尾斜杠）时为 true；空值/缺省为 false。
- （依据：opencode-session.ts 1-11 行）

## 批次 B：重试、准入与失败裁决（retry-policy / retry-budget / offpeak-retry / empty-completion-retry / request-admission / workflow-model-failure-policy）

### B11 重试选项解析与默认值（语义常量条目）

- 输入：可选的 `AiSdkModelRetryOptions` 与环境变量表 `env`。
- 输出：补齐后的重试参数（`maxAttempts`、`baseDelayMs`、`backoffFactor`、`maxDelayMs`、`jitter`）。
- 错误语义：非法值不抛错，静默回退默认值。
- 时序与并发：不适用（纯函数）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用（调用方持有解析结果）。
- 日志级别：不适用。
- 语义常量：默认值 `maxAttempts = 11`、`baseDelayMs = 2000`、`backoffFactor = 2`、`maxDelayMs = 60000`、`jitter = true`；覆盖键（**键名不得改**）`KNORVIA_MODEL_MAX_ATTEMPTS`、`KNORVIA_MODEL_RETRY_BASE_DELAY_MS`、`KNORVIA_MODEL_RETRY_BACKOFF_FACTOR`、`KNORVIA_MODEL_RETRY_MAX_DELAY_MS`、`KNORVIA_MODEL_RETRY_JITTER`；**显式 options 优先于 env**（`options.X ?? env.X`）；数值解析：字符串按 `Number` 转换，非有限数或 ≤ 0 回退默认，`maxAttempts` 向下取整；布尔解析：`true`/`"true"`/`"1"` 为真、`false`/`"false"`/`"0"` 为假，其余回退默认。
- （依据：retry-policy.ts 1-53 行）

### B12 重试预算（有界 / workflow 无界）的判定

- 输入：`ModelRetryBudget`（可缺省）、当前预算内尝试数 / 循环尝试数、`maxAttempts` / `loopMaxAttempts`。
- 输出：布尔判定与换算后的最大尝试数。
- 错误语义：不适用。
- 时序与并发：不适用（纯函数）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：逻辑请求的预算状态（由调用方持有）。
- 日志级别：不适用。
- 语义常量：`UNBOUNDED_RETRY_MAX_ATTEMPTS = 0`（无界预算对外换算出的最大尝试数是 0，不是无穷大）；无界判定为 `budget === ModelRetryBudget.Unbounded`；`retryBudgetAllows` = 无界或 `retryBudgetAttempt < maxAttempts`（严格小于）；`retryAttemptLoopContinues` = 无界或 `attempt <= loopMaxAttempts`（含等号）；`retryBudgetMaxAttempts` = 无界取 0、否则取入参。
- （依据：retry-budget.ts 1-27 行）

### B13 空补全重试：条件、事件与等待

- 输入：空补全判定的入参（`abortSignal`、`attempt`、`maxAttempts`、`retryCount`）；调度入参（计时、header、状态上下文、重试参数）。
- 输出：`canRetryEmptyCompletion` 布尔；`scheduleEmptyCompletionRetry` 先发状态事件再等待退避。
- 错误语义：等待中被取消按取消语义结束（不抛业务错误）。
- 时序与并发：事件序列固定为「`model_retry_scheduled` 事件 → 退避等待」；事件字段先于等待发布。
- 幂等：判定函数同输入同输出；调度每次调用恰好发一个事件。
- 资源释放：等待接受 `abortSignal`，可被打断。
- 平台差异：不适用。
- 状态所有者：物理 attempt。
- 日志级别：事件经 `publishModelStatus` 转发给 logger 与状态接收端（级别由该通道定，本模块不直接打日志）。
- 语义常量：允许重试的条件 = 未取消 **且** `attempt < maxAttempts` **且** `retryCount < 1`（空补全最多重试一次）；事件 `type: "model_retry_scheduled"`、`reason: "stale_connection"`、`message: "Provider returned an empty completion"`、`nextAttempt = attempt + 1`、`delayMs = calculateRetryDelay(retry, retryBudgetAttempt)`、`timestamp` 为 ISO 字符串，带 `requestHeaders`/`responseHeaders`。
- （依据：empty-completion-retry.ts 1-53 行）

### B14 attempt 准入（admission）的排队与票据释放

- 输入：可选的 `ModelRequestAdmission`、请求目标 `model`、取消信号、`onQueued`/`onAdmitted` 回调。
- 输出：`AttemptAdmission`（`ticket` 与幂等的 `release()`）。
- 错误语义：进入时或排队后信号已取消 → 抛 `signal.reason`，缺省抛 `DOMException("Aborted", "AbortError")`。
- 时序与并发：快路径（`tryAcquire` 立即拿到票据）不发排队回调；慢路径事件序列为「`onQueued()` → `acquire()` 返回 → 取消复查 → `onAdmitted(queuedMs)`」，`queuedMs = Date.now() - queuedAt`。
- 幂等：`release()` 幂等（内部 released 标志，只释放一次票据）。
- 资源释放：票据释放在所有终止路径由调用方触发；无 admission 时 `release()` 为空操作。
- 平台差异：不适用。
- 状态所有者：物理 attempt 持有票据；准入端口由外部注入。
- 日志级别：不适用。
- 语义常量：`onQueued`/`onAdmitted` **只在 admission 提供 `tryAcquire` 时才可能触发**（纯 `acquire` 端口不发这两个回调）；`acquire` 入参 `{ model, signal }`，`tryAcquire` 入参 `{ model }`。
- （依据：request-admission.ts 1-41 行）

### B15 off-peak 特例（票据过期与重新排队）

- 输入：`offPeak` 标志、失败分类、原始错误。
- 输出：`null` / `{ kind: "ticketExpired" }` / `{ kind: "queued", delayMs }`。
- 错误语义：不适用（纯判定）。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：物理 attempt 的重试裁决。
- 日志级别：不适用。
- 语义常量：非 off-peak 直接 `null`；业务码（字符串化后）`3102` / `3001` → 票据过期；`3105` 或 HTTP `statusCode === 429` → 排队，`delayMs = min(300000, max(0, retryAfterMs ?? 60000))`；过期消息模板 `<原文> [off-peak-ticket-expired]`，标记常量 `OFF_PEAK_TICKET_EXPIRED_MARKER = "off-peak-ticket-expired"`。
- （依据：offpeak-retry.ts 1-27 行）

### B16 workflow 模型失败裁决表（语义常量条目）

- 输入：失败分类的 `code`/`reason`/`retryable` 与 provider 业务码（字符串，可缺省）。
- 输出：`WorkflowModelFailurePolicy`：`retry` / `stop`（kind 五选一）/ `context_exceeded` / `cancelled`。
- 错误语义：不适用（纯判定）。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：workflow 驱动侧的 run 裁决（bootstrap 经 `inspectWorkflowModelFailure` 消费）。
- 日志级别：不适用。
- 语义常量：**判定顺序**（先命中先生效）：`reason === "cancelled"` → `cancelled`；provider 码在配额码表内 → `stop(quota)`；`reason === "context_exceeded"` 或 `code === "model_context_exceeded"` → `context_exceeded`；`reason === "auth_failed"` → `stop(auth)`；`reason === "provider_not_configured"` 或 `code === "provider_not_configured"` → `stop(not_configured)`；`code === "model_not_found"` → `stop(model_unavailable)`；`reason === "invalid_request"` 或 `code === "invalid_model_request"` → `stop(invalid_request)`；其余 → `retry`。stop kind 集合：`auth`、`not_configured`、`model_unavailable`、`invalid_request`、`quota`、`other`（`other` 保留在类型里，本表不产生）。**配额码表（逐字，键名 `WORKFLOW_QUOTA_PROVIDER_CODES`）**：`1005`、`2056`、`20097`、`1304`、`1308`、`1310`、`1313`、`1316`、`1317`、`1318`、`1319`、`1320`、`1321`、`insufficient_quota`、`credit_balance_exhausted`、`organization_spend_limit_exceeded`、`project_spend_limit_exceeded`、`organization_usage_limit_exceeded`、`exceeded_current_quota_error`。
- （依据：workflow-model-failure-policy.ts 6-55 行）

### B17 重试许可的双轨裁决

- 输入：失败分类、重试预算、provider 业务码。
- 输出：布尔。
- 错误语义：不适用。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：物理 attempt 的重试裁决。
- 日志级别：不适用。
- 语义常量：**workflow 无界预算**走策略表（仅 `decision === "retry"` 才允许）；**普通有界预算**直接看 `failure.retryable`（布尔裁决与策略表不能互相替代）。
- （依据：workflow-model-failure-policy.ts 56-64 行）

### B18 workflow 侧失败检视（inspectWorkflowModelFailure）

- 输入：任意错误值（含一层 `cause`）。
- 输出：`WorkflowModelFailureInspection`（`policy`、`reason`、`providerCode?`、`providerId?`、`modelId?`、`rawMessage?`、`resetAt?`）或 `undefined`。
- 错误语义：不抛错；找不到匹配返回 `undefined`。
- 时序与并发：不适用（纯检视）。
- 幂等：同输入同输出（`resetAt` 例外：`Date.now() + retryAfterMs`，随调用时刻变化）。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：只认 `name === "AiSdkModelAdapterError"` 且带对象 `context` 的候选（先看错误本体，再看一层 `cause`，先命中先返回）；`reason` 取 `context.reason`（非字符串时 `"unknown"`）；`code` 取 `context.code`，缺省 `"model_request_failed"`；`retryable` 仅当 `context.retryable === true`；`providerCode` 取 `context.providerErrorCode`（字符串）；`retryAfterMs`（数字）换算 `resetAt = Date.now() + retryAfterMs`；`providerId`/`modelId` 取 context 同名字符串；`rawMessage` 取错误的 `message` 字符串。
- （依据：workflow-model-failure-policy.ts 65-112 行）

## 批次 C：错误体系、失败分类与业务码表（errors / failure-\*）

### B19 错误对象体系与本地 provider 配置错误上下文

- 输入：`AiSdkModelAdapterError` 的 `code`、`message`、可选 `cause`/`context`；`enrichContext` 的增量键值。
- 输出：带稳定识别特征的错误对象；`createLocalProviderConfigurationErrorContext` 产出补齐后的上下文。
- 错误语义：`name` 固定 `AiSdkModelAdapterError`（workflow 检视靠它识别）；`cause` 仅在显式提供时传给 `Error`（不制造 `cause: undefined` 可枚举差异）。
- 时序与并发：不适用。
- 幂等：`enrichContext` 只**补缺**——已有键不覆盖（first-wins）；无 `context` 时先建空对象并以可枚举属性补挂，再补键。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：错误对象自身。
- 日志级别：不适用（错误向上冒泡，不在本层打日志）。
- 语义常量：`ModelErrorSource` 三值 `network` / `provider` / `runtime`；本地 provider 配置错误上下文固定 `reason = ModelFailureReason.ProviderNotConfigured`、`retryable = false`、`source = "runtime"`，可带 `envKey`、`modelId`、`providerId`（`providerId` 必填）。
- （依据：errors.ts 1-50 行）

### B20 错误链检视工具（cause 链遍历与字段提取）

- 输入：任意错误值（含 `cause` 链）。
- 输出：状态码、响应体、错误数据、header、错误码等提取结果。
- 错误语义：不抛错；遍历有环检测（同一对象不再访问）。
- 时序与并发：不适用（纯函数）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：`Headers` 实例按标准 Web API 处理；其余按普通对象。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：遍历顺序沿 `cause` 一层层向下，访问过的对象跳过；状态码键候选 `statusCode` / `status` / `responseStatus`；HTTP 响应状态取 `response.status`；响应体取 `responseBody`，其次 `response.body`；错误数据取 `data`，其次 `errorData`；header 归一：`Headers` 实例转条目表，普通对象只收字符串值条目，**空表按无 header 处理**；响应 header 取 `responseHeaders`，其次 `response.headers`；错误码取字符串 `code`；`unwrapRetryError`：`name` 为 `RetryError` 或 `AI_RetryError` 时取 `errors` 数组最后一个，否则 `lastError` → `cause` → 本体；取消判定（`isAbortFailure`）：信号已取消，或 `name === "AbortError"`，或 `code` 为 `ABORT_ERR` / `ERR_ABORTED`；超时判定（`isTimeoutFailure`）：状态 408/504，或错误码匹配 `TIMEOUT|TIMEDOUT|ETIMEDOUT`（大小写不敏感），或 `Error.message` 匹配 `timed?\s*out`；上下文超限判定：消息（含 cause 链上的消息）匹配 `context.{0,20}(length|window|limit|exceed)|too many tokens|maximum context`；代理判定：错误码匹配 `PROXY|ERR_PROXY`；网络判定：错误码匹配 `^(ECONN|EPIPE|ENET|EHOST|EAI_|UND_ERR|CONNECTIONCLOSED|ERR_NETWORK)`（大小写不敏感）；provider 标记可重试：cause 链上 `isRetryable` 或 `retryable` 布尔为真。
- （依据：failure-inspection.ts 1-126 行）

### B21 Retry-After 响应头解析（语义常量条目）

- 输入：响应 header 表（可缺省，键大小写任意）。
- 输出：毫秒数或 `undefined`。
- 错误语义：不抛错；解析失败返回 `undefined`。
- 时序与并发：绝对时刻分支相对当前时间换算。
- 幂等：同一 header 表在不同时刻解析，日期分支结果不同（相对剩余时间）。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：键按小写归一；`x-should-retry` 为 `false` 或 `0`（大小写不敏感）→ 直接 `undefined`；`retry-after-ms` 为有限数 → `max(0, 毫秒)`；`retry-after` 为有限数 → 按**秒**换算 `max(0, 秒 × 1000)`；否则按日期解析 `max(0, Date.parse(值) - Date.now())`；非有限值一律 `undefined`。
- （依据：failure-inspection.ts 112-126 行）

### B22 provider 业务码映射表（语义常量条目，逐码锁定）

- 输入：provider 业务码（字符串）。
- 输出：`{ code, reason, retryReason, retryable, message? }` 映射或 `undefined`。
- 错误语义：不适用（纯查表）。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：模块级只读表（初始化即冻结语义，不含运行期可变状态）。
- 日志级别：不适用。
- 语义常量：**整表逐字锁定**（码 → code / reason / retryReason / retryable）：

| 业务码                                                                                                                                                                                                                                                                                                              | code                      | reason                | retryReason           | retryable |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------- | --------------------- | --------- |
| `500`、`1120`、`1230`、`2007`                                                                                                                                                                                                                                                                                       | `model_request_failed`    | `server_error`        | `server_error`        | true      |
| `1234`                                                                                                                                                                                                                                                                                                              | `model_request_failed`    | `network_error`       | `network_error`       | true      |
| `1312`、`engine_overloaded_error`、`overloaded_error`                                                                                                                                                                                                                                                               | `model_request_failed`    | `provider_overloaded` | `provider_overloaded` | true      |
| `1302`、`1303`、`1305`、`3002`、`rate_limit_reached_error`、`rate_limit_error`                                                                                                                                                                                                                                      | `model_rate_limited`      | `rate_limited`        | `rate_limited`        | true      |
| `3008`、`3009`、`3010`、`1304`、`1308`、`1310`、`1313`、`insufficient_quota`、`credit_balance_exhausted`、`organization_spend_limit_exceeded`、`project_spend_limit_exceeded`、`organization_usage_limit_exceeded`、`exceeded_current_quota_error`、`2056`、`20097`、`1316`、`1317`、`1318`、`1319`、`1320`、`1321` | `model_rate_limited`      | `rate_limited`        | `rate_limited`        | false     |
| `1006`                                                                                                                                                                                                                                                                                                              | `provider_not_configured` | `auth_failed`         | `auth_refresh`        | false     |
| `3007`                                                                                                                                                                                                                                                                                                              | `invalid_model_request`   | `auth_failed`         | `auth_refresh`        | false     |
| `3006`                                                                                                                                                                                                                                                                                                              | `model_not_found`         | `invalid_request`     | `network_error`       | false     |
| `3001`                                                                                                                                                                                                                                                                                                              | `invalid_model_request`   | `invalid_request`     | `network_error`       | false     |
| `1261`                                                                                                                                                                                                                                                                                                              | `model_context_exceeded`  | `context_exceeded`    | `network_error`       | false     |
| `1005`                                                                                                                                                                                                                                                                                                              | `model_request_failed`    | `invalid_request`     | `network_error`       | false     |
| `1113`、`1309`、`1311`、`1008`、`1314`、`1315`                                                                                                                                                                                                                                                                      | `model_request_failed`    | `unknown`             | `network_error`       | false     |

- （依据：failure-provider-business-codes.ts 9-121 行）

### B23 业务错误的网络/超时可重试判定

- 输入：`ProviderBusinessError`、其业务码（可缺省）、HTTP 状态码（可缺省）。
- 输出：布尔。
- 错误语义：不适用。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：**业务码命中映射表即不可重试**（表优先于文案判定）；网络类：消息（`providerMessage` + `message` 拼接）匹配 `internal network|connection reset|socket hang up`（大小写不敏感）→ 可重试；超时类：HTTP `408`/`504` 或消息匹配 `timed?\s*out` → 可重试。
- （依据：failure-provider-business-codes.ts 122-141 行）

### B24 AI SDK 错误到业务错误的兜底映射

- 输入：AI SDK 抛出的任意错误（含 cause 链）。
- 输出：`ProviderBusinessError` 或 `undefined`。
- 错误语义：不抛错。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：提取顺序 `data` / `errorData` 优先于 `responseBody` / `response.body`，两者都走 B5 的体解析；映射出的错误 `providerId` 固定 `"unknown"`、`providerKind` 固定 `"openai-compatible"`；`providerCode` 强制字符串化；`statusCode` 取体内的 `status`，缺省用 cause 链上的 HTTP 状态。
- （依据：failure-ai-sdk-provider-error.ts 1-26 行）

### B25 业务错误定位与 provider 细节提取

- 输入：任意错误值。
- 输出：`findProviderBusinessError` 给出业务错误对象；`inspectProviderFailure` 给出 `{ providerErrorCode, providerErrorMessage, providerRequestId }` 或空对象。
- 错误语义：不抛错；找不到返回 `undefined` / 空对象。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：查找沿 `cause` 与 `error` 两个引用位深度优先（带 WeakSet 环守卫，先 `cause` 后 `error`）；识别兼容 duck typing（`isProviderBusinessError === true`）；业务码解析顺序：`providerCode` 字段 → `responseBodySummary` 顶层/`error` 子对象的 `providerCode` / `error_code` / `code` → 消息里 `[dddd]` 前缀正则 `^\[(\d{4})\](?=\[)`（先 `providerMessage` 后 `message`）。
- （依据：failure-classifier.ts 46-88 行）

### B26 失败分类裁决表（classifyModelFailure，语义常量条目）

- 输入：任意错误、可选 `AbortSignal`。
- 输出：`ClassifiedModelFailure`（`code`、`message`、`reason`、`retryReason`、`retryable`、可选 `retryAfterMs`、`statusCode`）。
- 错误语义：不抛错；`message` 取 `Error.message`，非 Error 用 `String(error)`，空值用 `"Model request failed"`。
- 时序与并发：不适用（纯判定）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：物理 attempt 的失败裁决。
- 日志级别：不适用。
- 语义常量：**裁决顺序逐条锁定**（先命中先返回；`statusCode` 与 `retryAfterMs`（来自 B21）随结果透出）：

| #   | 条件                                              | code                      | reason                | retryReason           | retryable                                                            |
| --- | ------------------------------------------------- | ------------------------- | --------------------- | --------------------- | -------------------------------------------------------------------- |
| 1   | 取消（B20）                                       | `model_request_cancelled` | `cancelled`           | `network_error`       | false                                                                |
| 2   | 流空闲超时错误（`isModelStreamIdleTimeoutError`） | `model_request_timeout`   | `stream_idle_timeout` | `stream_idle_timeout` | true                                                                 |
| 3a  | 业务错误且业务码命中 B22 表                       | 表值                      | 表值                  | 表值                  | 表值（消息取 `providerMessage` 优先，状态取业务错误的 `statusCode`） |
| 3b  | 业务错误且 B23 超时判定为真                       | `model_request_timeout`   | `timeout`             | `timeout`             | true                                                                 |
| 3c  | 业务错误且 B23 网络判定为真                       | `model_request_failed`    | `network_error`       | `network_error`       | true                                                                 |
| 4   | 超时（B20）                                       | `model_request_timeout`   | `timeout`             | `timeout`             | true                                                                 |
| 5   | HTTP 429                                          | `model_rate_limited`      | `rate_limited`        | `rate_limited`        | true                                                                 |
| 6   | HTTP 529                                          | `model_request_failed`    | `provider_overloaded` | `provider_overloaded` | true                                                                 |
| 7   | HTTP 401 / 403                                    | `provider_not_configured` | `auth_failed`         | `auth_refresh`        | false                                                                |
| 8   | 上下文超限（B20）                                 | `model_context_exceeded`  | `context_exceeded`    | `network_error`       | false                                                                |
| 9   | HTTP 400 / 422                                    | `invalid_model_request`   | `invalid_request`     | `network_error`       | false                                                                |
| 10  | HTTP ≥ 500                                        | `model_request_failed`    | `server_error`        | `server_error`        | true                                                                 |
| 11  | TLS 失败（`isTlsFailure(code)`）                  | `model_request_failed`    | `tls_error`           | `network_error`       | true                                                                 |
| 12  | 代理失败（B20）                                   | `model_request_failed`    | `proxy_error`         | `network_error`       | true                                                                 |
| 13  | 网络失败（B20）                                   | `model_request_failed`    | `network_error`       | `network_error`       | true                                                                 |
| 14  | 其余                                              | `model_request_failed`    | `unknown`             | `network_error`       | `isProviderMarkedRetryable`                                          |

- 另：`isRetryableFailure(failure)` 直接返回 `failure.retryable`。
- （依据：failure-classifier.ts 89-224 行）

## 批次 D：消息、工具与媒体投影（transform / tool-transform / media-transform-policy / tool-result-media-projection / tool-input-normalization / anthropic-\*-metadata / reasoning-history-normalization）

### B27 输入消息到 AI SDK 消息的投影（总则与 system/user/assistant）

- 输入：`ModelInputMessage[]` 与投影选项（`apiFormat`、`providerOptions`、`providerKind`、`stripMedia`、`inputFormat`）。
- 输出：AI SDK 消息数组（角色、内容形状见下）。
- 错误语义：tool 消息缺 `toolCallId` 或 `toolName` 抛 `AiSdkModelAdapterError`（code `invalid_model_request`，消息 `Tool messages require toolCallId and toolName`，context `{ reason: "invalid_request", retryable: false, source: "runtime" }`）。
- 时序与并发：单遍顺序投影，消息顺序保持。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用（纯投影）。
- 日志级别：不适用。
- 语义常量：`providerKind === "openai-compatible"` 时先做 system 消息归一（范围外模块 `system-message-compat`，其行为经本投影的测试锁定，不另设条目）；system 块内容为字符串直用，块数组只取 `text` 块并以 `\n` 连接；user/assistant 消息带 `cacheControl` 时输出 `providerOptions.cacheControl`（无则整个 `providerOptions` 不出现）；user 字符串内容为空串时占位 `[Empty user message]`；user 单个 text 块与 assistant 单个 text 块**塌缩为纯字符串**；assistant 的 reasoning 块仅在有 `text` 或 `providerOptions` 时投影，`providerOptions` 非空对象时附带（B34）；tool 调用块投影 `toolCallId`/`toolName`/`input`，空工具名闭合：anthropic 用空串 `""`，其余用 `unnamed_tool`；`providerExecuted` 仅在显式提供时出现。
- （依据：transform.ts 24-156 行）

### B28 tool 结果投影与连续 tool 媒体的合并（保持既有修复行为）

- 输入：tool 角色消息（`toolCallId`、`toolName`、`content`、`isError`）与投影选项。
- 输出：`role: "tool"` 消息（单条 `tool-result`）+ 追加的媒体 user 消息（见时序）。
- 错误语义：见 B27（缺标识即抛）。
- 时序与并发：**连续 tool 结果的图片/媒体不逐条插入**——暂存后在该段结束（下一条非 tool 消息或序列末尾）合并为**一条** user 消息，顺序保持（历史缺陷：逐条插入会产生 tool① → user(图片①) → tool② 序列，AI SDK 报 MissingToolResultsError；现行行为 tool① → tool② → user(图片①, 图片②)）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用（投影期局部暂存）。
- 日志级别：不适用。
- 语义常量：结果内容选择顺序——①帧引用媒体不可投递（B31）→ `{ type: "error-text", value: <固定文案> }`；②需要文本化（B31 判定或结果含视频媒体）→ `isError ? "error-text" : "text"`，值为结构化文本（B31）；③其余 → `isError ? "error-text" : "json"`，值为原始内容数组。
- （依据：transform.ts 116-205 行）

### B29 user/assistant 内容块投影细则

- 输入：一条 user 或 assistant 消息的内容（字符串或块数组）与选项。
- 输出：AI SDK 内容（字符串或 part 数组）。
- 错误语义：无效 data URL 不抛错，落固定占位文案（见下）。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：user：空串内容 → `[Empty user message]`；空 text 块同占位；不支持媒体（B30）或 `stripMedia` 命中（image/video/file 三类）→ text 占位（不支持时为 B30 文案、stripMedia 时为 `[Media omitted]`）；image 解析成功 → `{ type: "image", image, mediaType }`，失败 → `[Invalid image data]`；video 解析成功 → `{ type: "file", data, mediaType }`，失败 → `[Invalid video data]`；file 块**先 text 后 dataUrl**（有 `text` 就投影文本，不看 dataUrl），dataUrl 解析成功 → `{ type: "file", data, mediaType, filename? }`（`name` 缺省时无 `filename` 键），失败 → `[Invalid file data]`；`resource_link` → 文本 `[Resource: <title ?? name ?? uri>]`；全空的 user 内容 → `[Empty user message]`。assistant：空串内容跳过；text 块为空跳过；tool 调用见 B27。
- （依据：transform.ts 24-106 行）

### B30 data URL 解析与不支持媒体的占位文案（语义常量条目）

- 输入：data URL 字符串；内容块与 `inputFormat` 能力表。
- 输出：`{ mediaType, data }` 或 `undefined`；不支持文案或 `undefined`。
- 错误语义：不抛错。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：data URL 正则 `^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$`（data 段允许换行，解析后**剔除全部 CR/LF**）；不支持判定矩阵：`image` 且 `!supportsImage` → `image input`；`video`，或 `file` 且 mediaType（小写）以 `video/` 开头，且 `!supportsVideo` → `video input`；`file` 且 mediaType 去参数后等于 `application/pdf` 且带 `dataUrl`，且 `!supportsPdf` → `PDF input`；`inputFormat` 缺省时不判定（一切可投递）；文案模板 `[Attached <label>]\n[Media omitted from provider request because the selected model does not support <类>]`，`label` 取 `name`（非空）否则 mediaType 否则块类型。
- （依据：media-transform-policy.ts 1-30 行）

### B31 工具结果媒体与 CUA 帧引用的邻接规则

- 输入：工具结果内容、投影选项。
- 输出：文本化判定、结构化文本、可投递媒体 part 列表、不可投递提示文案。
- 错误语义：不抛错。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：文本化判定 = `providerKind === "openai-compatible"` **或** `apiFormat === "openai-chat-completions"`（结构化工具结果文本化）；含视频媒体判定 = video/file 块且 mediaType 以 `video/` 开头且带非空 `dataUrl`；结构化文本按块拼接（`"\n\n"` 连接、空段剔除）：text 原文、reasoning → 空、file 有 text 用 text、`resource_link` → `[Resource: <title ?? name ?? uri>]`、其余 → `[Attached <mediaType ?? "media">]`；可投递判定 = 非 `stripMedia`、非不支持媒体、image/video/file 三类且 `dataUrl` 能解析（B30）；媒体 part：image → `{ type: "image", image, mediaType }`，video/file → `{ type: "file", data, mediaType, filename: <name ?? undefined> }`；**CUA 邻接**：媒体块后紧跟的 text 块若含官方 CUA 图片凭据文本（`containsOfficialCuaImageRefCredentialText`）则该文本随媒体一起投影并被消费（不再单独投影）；帧引用不可投递的提示文案（逐字）：`Tool result omitted because its frame reference media could not be delivered to the selected model.`（出现在结果首块，或其前一块不可投递时触发，整条结果以 error-text 形态返回该文案）。
- （依据：tool-result-media-projection.ts 1-106 行）

### B32 工具契约到 AI SDK 工具集（含 provider 原生工具与 strict schema）

- 输入：`ModelToolContract[]` 与选项（`requiresMfjsToolSchema`、`supportsNativeWebSearch`、`providerKind`、`modelId`）。
- 输出：`ToolSet` 或 `undefined`（无工具时）。
- 错误语义：provider 原生工具在非 anthropic 或不支持原生 web 搜索时抛 `invalid_model_request`，消息 `Native web search is not supported by this model`，context `{ reason: "invalid_request", retryable: false }`；schema 本地引用无法解析抛 `invalid_model_request`，消息 `Tool <name> has an unresolved local schema reference: <ref>`，context 带 `toolName`、`ref`、`reason: "invalid_request"`、`retryable: false`、`source: "runtime"`。
- 时序与并发：不适用（纯装配）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：`contract.providerNative` 时固定装配 `anthropic.tools.webSearch_20260209(contract.providerNative.args)`；`requiresMfjsToolSchema` 时展开本地 `$ref`（`#/` 指针、`~1`/`~0` 转义），环引用保留 `$ref` 原样，`$defs`/`definitions` 键被剥除，展开目标与同级键合并（对象目标直接合并，非对象目标有同级键时包 `allOf`）；strict schema 仅当 `contract.strict` **且** `providerKind === "anthropic"` **且** `isAnthropicFirstPartyModelId(modelId)`，命中时 `strict: true` 显式给出（否则 `strict: undefined`）；execute 包装把工具元数据（`readOnly`、`destructive`、`concurrentSafe`、`requiresUserInteraction`、`sideEffectScope`、`maxOutputBytes`、`timeoutMs`、`needsApproval`、`permission`、`resultBudget`）放进 `metadata`，并透传 `toolCallId`、`abortSignal`。
- （依据：tool-transform.ts 1-128 行）

### B33 工具入参归一（含日志级别）

- 输入：任意工具入参、`source`（generateText/streamText）、可选 `toolName` 与 logger。
- 输出：归一后的入参对象。
- 错误语义：JSON 解析失败不抛错，回退空对象并告警。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：**warn**（仅解析失败时；消息逐字 `Invalid model tool input; using an empty object`，附 `source`、`toolName`、`error` 字段）。
- 语义常量：`undefined` 或空串 → `{}`；非字符串原样返回（`null` 归一为 `{}`）；字符串按 JSON 解析，解析结果 `null` 归一为 `{}`。
- （依据：tool-input-normalization.ts 1-25 行）

### B34 reasoning 块的 providerOptions 透传

- 输入：reasoning 内容块。
- 输出：`{}` 或 `{ providerOptions }`。
- 错误语义：不适用。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：`providerOptions` 缺省或空对象 → 输出空对象（不产出 `providerOptions` 键）；否则原样透传（不按 provider 分流）。
- （依据：anthropic-reasoning-metadata.ts 1-17 行）

### B35 Anthropic 请求元数据：user id 生成与脱敏

- 输入：`env`、`providerKind`、可选 `sessionId`；脱敏入参为任意 JSON 形状值。
- 输出：元数据 user id 字符串或 `undefined`；脱敏后的同形状值。
- 错误语义：设备标识获取失败按空值处理（返回 `undefined`），不抛错。
- 时序与并发：user id 生成是异步（读取设备标识）；脱敏是纯函数。
- 幂等：脱敏同输入同输出；user id 稳定（设备标识不变时逐字节一致）。
- 资源释放：不适用。
- 平台差异：设备标识的落盘路径由 `ensureCliDeviceMid` 决定（跨平台）。
- 状态所有者：设备标识文件（既有模块所有）；元数据随请求。
- 日志级别：不适用。
- 语义常量：仅 `providerKind === "anthropic"` 生成，其余为 `undefined`；序列化形状（逐字）`{"device_id":<设备标识>,"account_uuid":"","session_id":<sessionId 字符串化，缺省空串>}`；脱敏规则：键名匹配 `^(user_?id)$`（大小写不敏感）→ 值替换为 `[REDACTED]`，数组逐项递归、对象逐键递归、原始值原样。
- > 往返候选：元数据 JSON 形状随请求金样固定；脱敏输出是调试记录的安全边界。
- （依据：anthropic-request-metadata.ts 1-27 行）

### B36 reasoning 历史归一与签名拒绝后的修复

- 输入：消息序列（可含 reasoning 块）；修复入参另有错误值。
- 输出：归一后的消息序列；修复输出为新序列或 `undefined`（无需修复）。
- 错误语义：不抛错。
- 时序与并发：不适用（纯变换）。
- 幂等：同输入同输出（修复：未命中签名键返回 `undefined`）。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用（不修改 canonical history，只产出投影副本）。
- 日志级别：不适用。
- 语义常量：归一剔除 reasoning 块的两种情形——①`text` 为空且 `providerOptions` 缺省/空对象；②目标 `providerId` 含 `openai`（大小写不敏感，缺省目标按空串）且 `providerOptions` 带 `itemId` 或 `item_id`（「已存 reasoning 不重放」）；剔除后 assistant 消息既无内容又无 `toolCalls` 则整条剔除；字符串内容消息浅拷贝保留。修复触发条件：错误消息匹配 `signature|thinking(?:[_ -]?block)?`（大小写不敏感）；修复动作：递归删除 `providerOptions` 里的 `signature`、`thinking_signature`、`encrypted_content` 键（含数组递归），仅当实际删过键才返回新序列。
- （依据：reasoning-history-normalization.ts 1-67 行）

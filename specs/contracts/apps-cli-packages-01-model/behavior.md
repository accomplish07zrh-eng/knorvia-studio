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

## 批次 E：流式边界、清理与 provider 兼容（stream-\* / anthropic-stream-compat / openai-responses-json-compat）

### B37 流空闲超时的额度与错误形状（语义常量条目）

- 输入：`baseTimeoutMs`（可缺省）、`retryNumber`（可缺省）。
- 输出：本次 attempt 的空闲超时毫秒数；超时错误对象形状。
- 错误语义：超时抛 `ModelStreamIdleTimeoutError`（见下）；输入非法不抛错。
- 时序与并发：不适用（纯换算 + 工厂）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：物理 attempt。
- 日志级别：不适用（超时经调用方发状态事件）。
- 语义常量：基础额度缺省取 `DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS`（由 `@knorvia/contracts` 再导出，值以契约为准）；`baseTimeoutMs` 非有限数或 ≤ 0 → **返回 0（禁用计时）**；`retryNumber` 向下取整且不小于 0；额度公式 `base + retryNumber × 30000`（`RETRY_INCREMENT_MS = 30_000`）；错误 `name = "ModelStreamIdleTimeoutError"`、`code = "MODEL_STREAM_IDLE_TIMEOUT"`、消息逐字 `Model stream produced no event for <idleMs>ms`，带 `idleMs`、`timeoutMs` 字段；识别兼容 duck typing（`code === "MODEL_STREAM_IDLE_TIMEOUT"` 的对象也算）。
- （依据：stream-idle-timeout.ts 1-35 行）

### B38 关联取消与带空闲计时的迭代读取

- 输入：父信号（可缺省）；迭代器与 `abortController`、`timeoutMs`、`onTimeout` 回调。
- 输出：下一条迭代结果；或抛出取消/超时错误。
- 错误语义：进入时已取消 → 抛 `signal.reason`，缺省 `DOMException("Aborted", "AbortError")`；等待中取消 → 以 `signal.reason` 拒绝；超时 → 抛 `ModelStreamIdleTimeoutError`（并把控制器以该错误中止）。
- 时序与并发：事件序列「迭代下一条 / 取消拒绝 / 计时拒绝」三者竞速，先到先生效；超时分支顺序为「构造超时错误 → `abortController.abort(error)` → 等待 `onTimeout` 回调（若有）→ 以该错误拒绝」。
- 幂等：读取本身不幂等（推进迭代器）；关联控制器构造幂等。
- 资源释放：`finally` 总是清计时器与 abort 监听；关联控制器的 `cleanup()` 解除父监听（父已中止时保持同步中止语义）。
- 平台差异：不适用（`AbortController`/`DOMException` 为标准 API）。
- 状态所有者：物理 attempt 的取消控制器。
- 日志级别：不适用。
- 语义常量：关联控制器以 `parentSignal.reason` 传递中止原因（含父已中止时的立即中止）；取消拒绝时**若 reason 是空闲超时错误则不拒绝**（超时路径自行处理，避免双重拒绝）；`timeoutMs > 0` 才挂计时器（0 表示禁用）。
- （依据：stream-idle-timeout.ts 36-97 行）

### B39 compact 流边界映射（provider 事件 → 内部边界事件）

- 输入：provider 原始流事件（`type`、`index`、`content_block`、`delta`）。
- 输出：`compact_stream_boundary` 事件或 `undefined`（不识别）。
- 错误语义：不抛错。
- 时序与并发：逐事件调用，顺序保持。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：compact 回放边界跟踪（消费方）。
- 日志级别：不适用。
- 语义常量：映射表——`message_start` → boundary `provider_response_start`；`content_block_start` → `provider_content_block_start`（`blockType` 取 `content_block.type`，缺省 null；`index` 数字否则 null）；`content_block_delta` → `provider_content_block_delta`（`deltaType` 取 `delta.type`，缺省 null）；`content_block_stop` → `provider_content_block_stop`；`message_delta` → `provider_stop_reason`（`present` = `stop_reason` 非 null 且非 undefined）；其余类型 → `undefined`。
- （依据：stream-retry-boundary.ts 31-67 行）

### B40 重放安全前奏事件的判定

- 输入：一条内部流事件。
- 输出：布尔（是否属于「未对外可见、可整体重放」的前奏）。
- 错误语义：不适用。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：输出提交门（调用方）。
- 日志级别：不适用。
- 语义常量：安全集合 `start`、`text_start`、`text_end`、`reasoning_start`、`reasoning_end`、`tool_input_start`、`tool_input_delta`、`tool_input_end`；`text_delta` 与 `reasoning_delta` **仅当 `text` 为空串**才算安全；其余一律不安全（含 `tool_call`、`finish`、`error` 等）。
- （依据：stream-retry-boundary.ts 12-30 行）

### B41 compact 体失败后的重试许可

- 输入：失败错误、`errorChunkObserved` 标志。
- 输出：布尔。
- 错误语义：不适用。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：compact 流的重试裁决。
- 日志级别：不适用。
- 语义常量：「体失败」= 已观察到 error-chunk **或** 响应 `content-type`（小写）含 `text/event-stream` **或** 错误链上能取到响应体；非体失败 → 允许重试；体失败时仅两种情形允许：空闲超时错误（B37），或**无 HTTP 状态码**且错误码（大写）属于 `ECONNRESET` / `EPIPE` / `CONNECTIONCLOSED`。
- （依据：stream-retry-boundary.ts 68-84 行）

### B42 流清理与被放弃流的关闭（含 1 秒上限与日志级别）

- 输入：迭代器、可选 `consumeStream`、logger；关闭入参另有 `abortController`、`attempt`、`committed`、状态上下文与接收端。
- 输出：清理完成（void）；关闭路径另发一条失败状态事件。
- 错误语义：清理失败不抛错，仅告警；不影响原始错误。
- 时序与并发：`iterator.return()` 与 `consumeStream()` **并发**执行、`allSettled` 等待；整体以 **1000ms** 为上限竞速，超时即放弃等待。
- 幂等：清理可重复调用（以迭代器自身语义为准）。
- 资源释放：本条即资源释放语义（迭代器收尾 + SDK consume 清理）。
- 平台差异：不适用。
- 状态所有者：物理 attempt 的终态清理。
- 日志级别：**warn**（两条逐字消息）：清理子任务失败 `Model stream cleanup failed`（附 `error`）；清理超时 `Model stream cleanup exceeded 1000ms`。
- 语义常量：被放弃流的关闭序列——「以 `DOMException("Model stream consumer closed", "AbortError")` 中止 → 清理（若有迭代器）→ 发布 `model_request_failed`」，失败事件字段 `reason: "cancelled"`、`retryable: false`、`errorCode: "model_request_cancelled"`、`message` 为该 DOMException 消息、`streamOutputCommitted` 透传 `committed` 标志。
- （依据：stream-retry-boundary.ts 85-141 行）

### B43 流式工具调用装配器（状态机）

- 输入：内部流事件序列；`flush()` 无入参。
- 输出：透传/追加的事件序列；`snapshotNormalizedToolCalls()` 给出已提交工具调用列表。
- 错误语义：不抛错（坏入参经 B33 归一）。
- 时序与并发：单会话串行；事件顺序保持（`tool_input_end` 后**紧随**合成的 `tool_call`）。
- 幂等：同一 `toolCallId` 只提交一次（重复 `tool_call` 抑制）。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：装配器实例（pending 与已提交两张登记表，均按插入序）。
- 日志级别：仅入参归一失败时由 B33 发 warn。
- 语义常量：`tool_input_start` 登记（id、toolName、空 input、`providerExecuted`）并透传；`tool_input_delta` 累加文本并透传；`tool_input_end` 标记结束后输出「原事件 + 合成 `tool_call`」；合成调用的 `name` 经 `normalizeModelToolName`（带 `toolCallId`、`providerExecuted`）、`input` 经 `normalizeModelToolInput`（`source: "streamText"`）；`tool_call` 事件：同 id 已有提交 → 输出空数组（丢弃）；对应 pending 未结束 → 丢弃；否则登记并透传；`flush()` 按插入序提交全部未决（每项输出一个合成 `tool_call`）。
- （依据：streaming-tool-call-assembler.ts 1-79 行）

### B44 Anthropic 兼容 fetch：请求体归一

- 输入：请求 `init.body`（JSON 字符串）。
- 输出：归一后的请求体字符串（解析失败原样转发）。
- 错误语义：JSON 解析失败不抛错，**原样交给 provider**（保留 provider 的报错语义）。
- 时序与并发：不适用（纯包装）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：请求级包装。
- 日志级别：不适用。
- 语义常量：`system` 字符串 → 单元素 `[{ type: "text", text }]` 数组；`messages` 里 `role: "system"` 且 content 恰为单个 text 块 → content 收拢为字符串；递归修补 thinking 块：`type: "thinking"` 且 `signature` 不是字符串 → 补 `signature: ""`；`tool_result` 块的归一：带字符串 `name` → 转 `tool_use`（`id` 取 `id ?? tool_use_id ?? tool_<uuid>`，`input ?? {}`），不带 `name` → 转 `text`（content 字符串直用，否则 `JSON.stringify(content ?? "")`）。
- （依据：anthropic-stream-compat.ts 5-51、140-149 行）

### B45 Anthropic 兼容 fetch：响应侧 SSE/JSON 修补（含签名补发）

- 输入：响应（SSE 流或 JSON 体）。
- 输出：修补后的等价响应（状态、statusText 保持；替换体时删除 `content-length`）。
- 错误语义：体解析失败原样返回原响应，不抛错。
- 时序与并发：SSE 修补是流式逐块（按空行分帧，跨块拼接残余）；帧内 `data:` 行按序合并。
- 幂等：同输入同输出（uuid 例外：缺 id 的 `tool_use` 生成随机 id）。
- 资源释放：不适用。
- 平台差异：换行风格保持（`\r\n` 帧分隔用 `\r\n` 重拼，否则 `\n`）。
- 状态所有者：请求级包装（签名状态表按 `index` 作用域）。
- 日志级别：不适用。
- 语义常量：仅 2xx 响应进入修补；`content-type` 含 `text/event-stream` → SSE 修补；含 `json` → JSON 修补（递归补 `signature: ""`）；其余原样。SSE 规则：`data:` 行取 `data:` 后内容去前导空白、以 `\n` 合并；空数据或 `[DONE]` 帧原样透传；解析非对象透传；`content_block_start` 的 `content_block` 走 B44 的 `tool_result` 归一，thinking 块带非空字符串 `signature` 时按 `index` 记忆；`content_block_delta` 的 `signature_delta` 标记该 index 已观察到增量；`content_block_stop` 时若该 index 记忆了签名且**没观察到增量**，在该帧前注入一条合成帧 `content_block_delta`（`delta: { type: "signature_delta", signature }`，逐字 `event: content_block_delta`）；输出帧保留非 data 行 + 重写后的 `data: <JSON>`。
- （依据：anthropic-stream-compat.ts 52-139、150-175 行）

### B46 OpenAI Responses JSON 兼容：响应形状补全

- 输入：响应。
- 输出：补全后的等价响应（或原响应）。
- 错误语义：JSON 解析失败原样返回。
- 时序与并发：不适用。
- 幂等：同输入同输出（uuid 例外：缺 id 的 `message` 生成随机 id）。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：请求级包装。
- 日志级别：不适用。
- 语义常量：仅 2xx、非 SSE、`content-type` 含 `json` 的响应进入补全；递归修补两处——`type: "message"` 且 `id` 非字符串 → 补 `id: msg_<uuid>`（前缀逐字 `msg_`）；`type: "output_text"` 且 `annotations` 非数组 → 补 `[]`；替换体时删除 `content-length`。
- （依据：openai-responses-json-compat.ts 1-35 行）

## 批次 F：runner 核心编排（runner / runner-runtime / runner-options / runner-generate / runner-stream）

### B47 适配器构造、默认值与状态接收端组合（语义常量条目）

- 输入：`AiSdkModelAdapterOptions`。
- 输出：适配器实例；`setModelIoFullRetentionEnabled` 切换全量保留；`addStatusSink` 追加接收端。
- 错误语义：构造不抛业务错误。
- 时序与并发：`addStatusSink` 的组合是**纯转发**：组合后的接收端只有 `publish` 一个方法，向先后两个接收端并发投递（`allSettled`，单个失败不影响另一个，也不影响请求结果），**不转发** `failureError` 等扩展参数（历史兼容限制：组合只转发普通 publish）。
- 幂等：构造幂等；`setModelIoFullRetentionEnabled` 为显式可变开关（适配器实例级）。
- 资源释放：不适用。
- 平台差异：数据根目录解析跨平台（`resolveKnorviaDataRoot`）。
- 状态所有者：适配器实例持有默认重试参数、调试目录、全量保留开关与状态接收端。
- 日志级别：不适用（日志经注入的 logger）。
- 语义常量：`env` 缺省 `{}`；调试目录缺省 `<data root>/cli/debug`（`KNORVIA_RUNTIME_ENV === "development"`）否则 `<data root>/cli/rollout`（显式 `debugDir` 优先）；`streamIdleTimeoutMs` 缺省 **90_000**；`modelIoFullRetentionEnabled` 缺省 **false**；重试参数按 B11 从 options 与 env 解析。
- > 往返候选：调试/rollout 目录布局与记录文件是持久化数据（见 B54）。
- （依据：runner.ts 43-108 行）

### B48 createModel 装配与请求准备（调用上下文合并、鉴权刷新）

- 输入：`CreateAiSdkModelOptions`（provider/model 身份、配置、选项规格、可选请求依赖）；每次调用的 `AiSdkModelTextRequest`。
- 输出：`Model` 对象（B7/B8/B9 的语义叠加）；`makeRequest` 产出「准备好的请求 + 惰性 `resolveModel` + 初始 `resolved`」。
- 错误语义：鉴权刷新缺凭据 → `AiSdkModelAdapterError` code `model_request_auth_missing`，消息 `Model request authentication is missing`，context `{ reason: "auth_failed", retryable: false, source: "runtime" }`（**pre-start 抛出时不补发 failed 事件**，见 known-differences）。
- 时序与并发：每个 attempt 重新执行「刷新鉴权 → 重解析模型 → 投影选项」；`resolveModel` 惰性求值，读取请求上的 `__requestAuth`。
- 幂等：请求准备不修改调用方消息数组（reasoning 归一产出副本）。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：模型对象冻结身份；调用期覆盖只属于本次请求（鉴权写在请求对象上，不回写静态 registry）。
- 日志级别：不适用。
- 语义常量：调用上下文合并（`getCurrentModelInvocationContext()`）：`metadata` 为「invocation 先、request 后覆盖」的浅合并；`statusSink`、`traceContext`、`modelCall`、`modelRequestSessionType`、`modelRetryBudget`、`modelRequestAdmission`、`streamIdleTimeoutRetryNumber`、`preserveProviderStreamBoundaries` 均「请求值 ?? invocation 值」；reasoning 历史按 B36 以 `{providerId, modelId}` 为目标归一；`accountAccess` 取 `providerConfig.access.type === "zhipu-account"`（其余不带）；`refreshRuntimeHeadersBeforeAttempt` 仅在有 accountAccess 且（外部刷新或 `requestDependencies.requestAuth`）时包装：外部刷新优先，否则经 `authSource.source.resolve(input)` 取鉴权、缺失即抛上面的错误、成功返回 `{ headersApplied: true, requestAuth }`；选项取值 `reasoningLevel = request.providerOptions.reasoningLevel ?? specs.reasoningLevel.values[0]`、`maxOutputTokens = request.maxOutputTokens ?? specs.maxOutputTokens.max`；`generateText`/`streamText` 包装把模型选项映射回请求（`maxOutputTokens`、`providerOptions.reasoningLevel`）。
- （依据：runner.ts 109-248 行）

### B49 SDK 请求选项装配（语义常量条目）

- 输入：`anthropicMetadataUserId`、`request`、`resolved`、`statusContext`、`includeModelIO`、`env`。
- 输出：AI SDK `generateText`/`streamText` 选项对象（缺省键被剔除）。
- 错误语义：不适用（结构化输出缺省值的运行期错误见 B51）。
- 时序与并发：每次 attempt 装配一次。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：物理 attempt。
- 日志级别：不适用。
- 语义常量：`providerOptions` 合并顺序 `resolved.providerOptions` → `request.providerOptions`；带 `anthropicMetadataUserId` 时写入 `providerOptions.anthropic.metadata.userId`（B35 的值）；OpenCode 会话头：`isOpenCodeGoBaseUrl(resolved.baseURL)` 且 `sessionId !== undefined` 时追加 `x-opencode-session: <String(sessionId)>`；`responseJsonSchema` 存在时 `output = Output.object({ schema: jsonSchema(schema) })`，否则无 `output` 键；请求头合并顺序 `resolved.headers` → OpenCode 会话头 → 归因头（B53）；**`maxRetries: 0` 固定**（SDK 内置重试关闭，全部物理重试由适配器管理）；透传字段 `toolChoice`、`temperature`、`maxOutputTokens`、`topP`、`topK`、`presencePenalty`、`frequencyPenalty`、`stopSequences`、`seed`、`abortSignal`、`tools`（B32）、`messages`（B27–B36）；值为 `undefined` 的键不出现在输出对象（`omitUndefined`）。`createStreamTextOptions` 与本条同构（同一装配）。
- （依据：runner-options.ts 18-84 行）

### B50 运行时端口与请求扩展字段

- 输入：`AiSdkModelRuntime`（可注入，默认 `defaultRuntime` = AI SDK 的 `generateText`/`streamText` 直通）。
- 输出：运行时端口对象与请求扩展类型语义。
- 错误语义：不适用。
- 时序与并发：不适用（端口声明）。
- 幂等：不适用。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：适配器实例持有 runtime（默认全局）。
- 日志级别：不适用。
- 语义常量：请求扩展字段（兼容面）：`abortSignal`、`traceContext`、`refreshRuntimeHeadersBeforeAttempt`（入参含 `accountAccess`、`attempt`、`reason: "model-request"`、`abortSignal`、`providerId`、`modelId`、`traceContext`；返回 `{ headersApplied, requestAuth? }`）、`streamIdleTimeoutRetryNumber`、`preserveProviderStreamBoundaries`。
- （依据：runner-runtime.ts 1-59 行）

### B51 runGenerateText 的 attempt 状态机（事件序列）

- 输入：见 `RunStreamTextInput` 同构入参（generate 版）。
- 输出：`ModelTextResult`（`text`、`finishReason`、`usage`、`reasoning`、`toolCalls`、`toolResults`、`sources`、`providerMetadata`）。
- 错误语义：不重试的失败经 `toAdapterError`（B55）转为适配错误；鉴权缺失且未发 started 时**原样抛出**。
- 时序与并发：单请求串行循环；每个物理 attempt 事件序列固定：
  `（准入 queued?）→ （准入 admitted?）→ model_request_started → [runtime.generateText] → model_request_completed` 或失败序列
  `model_request_failed → (model_retry_scheduled → 退避等待)`。
- 幂等：attempt 编号单调递增（`attempt` 为物理次数、`retryBudgetAttempt` 为预算内计数、`emptyRetryCount` 单独计数）。
- 资源释放：准入票据在**所有终止路径**释放（`finally` 兜底 + 各分支显式释放，含退避前）。
- 平台差异：不适用。
- 状态所有者：逻辑请求（trace/session/turn 归因）+ 物理 attempt（requestId、票据、计时）。
- 日志级别：状态事件经 `publishModelStatus` 转发；调试记录见 B54。
- 语义常量：成功路径细节——「刷新鉴权（B48）→ 重解析模型 → Anthropic 元数据（B35）→ 装配选项（B49）→ started（带 `requestHeaders: resolved.headers`）→ `runtime.generateText`（可被 `abortSignal` 竞速打断）→ 终局业务错误探测（B57）→ 归一（B56）」；`responseJsonSchema` 时结果缺 `output` 抛 `Structured model output is missing`，序列化失败抛 `Structured model output cannot be serialized`（cause 保留），`text` 取 `JSON.stringify(output)`；零输出补全（B58 判定 + B13 条件）走「记录调试 → model_request_failed（reason `stale_connection`、retryable true、errorCode `model_request_failed`、errorPhase `response`、消息 `Provider returned an empty completion`）→ 释放票据 → 空补全重试调度（B13）→ `emptyRetryCount+1`、`retryBudgetAttempt+1` → 继续循环」。失败路径细节——「分类（B26）→ 已装配选项则记录调试 → off-peak 裁决（B15）→ 重试许可 = offPeak 排队 **或**（B17 裁决 且 B12 预算）→ model_request_failed（字段：reason、retryable=canRetry、message、statusCode、errorCode、retryAfterMs、errorPhase `response`）→ 票据过期则抛（消息加 B15 后缀、retryable 置 false、errorPhase `response`）→ 不可重试则抛 → 可重试：延迟 = offPeak 排队延迟（B15）否则 `calculateRetryDelay(retry, retryBudgetAttempt, failure.retryAfterMs)`（B55）；`model_retry_scheduled` 的 reason = `offpeak_queued` 否则 `failure.retryReason` → 释放票据 → 退避等待 → 非 offPeak 排队时 `retryBudgetAttempt+1`」。
- （依据：runner-generate.ts 42-378 行）

### B52 runStreamText 的 attempt 状态机（输出提交门与前奏缓冲）

- 输入：`RunStreamTextInput`。
- 输出：`AsyncGenerator<ModelStreamEvent>`（事件序列见下）。
- 错误语义：同 B51；compact 模式的额外规则见下。
- 时序与并发：与 B51 同骨架（准入、刷新、started、重试、票据释放），差异在流式路径：
  1. **前奏缓冲**：重放安全事件（B40）在「首个对外可见内容」之前缓存不发；首个非安全事件或首个非空增量到达时一次性冲刷前奏；
  2. **可见性**：非空 `text_delta` / `reasoning_delta` 累计长度并置 `visible`；`tool_call` 置 `visible`；
  3. **compact 模式**（`preserveProviderStreamBoundaries`）：`raw` 事件除 `ping` 外触发「前奏冲刷 + 边界映射（B39）」，`content_block_stop` 置 `committed`；`tool_call` 在未 `committed` 时先补发 `inferred_content_block_stop` 边界；错误体重试另受 B41 约束；
  4. **空补全重试**只在非 compact 模式生效（B13 + B58），事件 `errorPhase: "stream"`、`streamOutputCommitted: false`；
  5. 收尾序列：「冲刷前奏 → 冲刷装配器未决调用（B43）→ 发 finish（若 provider 给了）→ completed 事件」，completed 带 `finishReason`/`usage`（有 finish 时）、`timeToFirstContentMs = firstContentAt - startedAt`（有首内容时）、`streamOutputCommitted`（非 compact 时 `committed ||= visible`）；
  6. 失败路径：清理流（B42）→ 分类 → 重试许可 = （offPeak 排队 或（compact 重试许可（B41）且 B17 且 B12））**且 `!visible && !replayBoundary`**（**输出提交门**：已对外可见即不再重放）→ `model_request_failed` 的 `streamOutputCommitted: replayBoundary` → 取消类失败不写调试记录 → 票据过期抛出（errorPhase `stream`、`streamOutputCommitted: committed`）；
  7. `finally`：compact 模式下「started 后未收尾」的 attempt 走 B42 的放弃关闭（`streamOutputCommitted: committed`），随后中止并清理关联控制器、释放票据。
- 幂等：同 B51；前奏只冲刷一次（`splice` 语义）。
- 资源释放：B42 的 1 秒上限清理 + 关联控制器清理 + 票据释放。
- 平台差异：不适用。
- 状态所有者：同 B51。
- 日志级别：同 B51。
- 语义常量：`firstContentAt` 取**首个可见内容**时刻；流式完成事件补报 `usage` 与首内容耗时（历史缺陷修复：对话底部 tok/s 恒「—」、步数与缓存不更新；与非流式路径一致，保持）。
- （依据：runner-stream.ts 35-412 行）

## 批次 G：状态、调试持久化、重试与归一（runner-status / runner-debug / runner-retry / runner-normalization / runner-diagnostics / runner-attribution / runner-network-headers / runner-runtime-headers / runner-record / runner-telemetry）

### B53 状态上下文、attempt 上下文与事件发布（含接收端去重）

- 输入：请求、已解析模型、transport、`maxAttempts`；发布入参为事件 + 接收端集合。
- 输出：`ModelStatusContext`；`publishModelStatus` 把脱敏后的事件并发投递给全部接收端。
- 错误语义：任一接收端抛错被捕获 → `logger.warn("Model status sink rejected an event", { type, error })`，不影响其他接收端与请求结果。
- 时序与并发：`Promise.all` 并发投递；`admissionWaitPublishers` 的 `onQueued`/`onAdmitted` 事件序列见 B14（不含票据接收端自身）。
- 幂等：事件每调用一次；attempt ≤ 1 **复用同一上下文（同一 requestId）**，attempt ≥ 2 换新 requestId（uuid）。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：逻辑请求上下文；物理 attempt 的 requestId。
- 日志级别：warn（见错误语义）。
- 语义常量：上下文字段来源——`traceId` = `traceContext.traceId ?? metadata.traceId ?? <uuid>`；`queryId`/`sessionId`/`turnId` = `traceContext.* ?? metadata.*`；`parentSessionId`/`toolCallId`/`querySource` 只看 metadata；`spanId`/`parentSpanId` 只看 traceContext；`requestId` = `metadata.requestId ?? <uuid>`；`modelCall` 缺省 `{ actorKind: "main", operation: "model" }`；`modelRequestSessionType` 按 B59 解析。发布规则——`requestHeaders`/`responseHeaders` 先经 B60 脱敏；接收端按**对象身份去重**（票据 → 请求级 → 适配器级，重复跳过）；票据接收端只收普通 `publish`；仅适配器级（`statusSink`）接收端在 `model_request_failed` 且带 `failureError` 时优先调 `publishFailure(event, failureError)`（若实现）；`model_request_queued`/`model_request_admitted`（带 `queuedMs`）**不投递给票据接收端**；遥测里程碑（`model_first_provider_event`/`model_first_content`/`model_first_text`）只投递适配器级接收端；`modelStatusContextToLogContext` 固定 12 字段（traceId、queryId、sessionId、turnId、requestId、providerId、modelId、providerKind、transport、attempt、maxAttempts）。
- （依据：runner-status.ts 25-206 行）

### B54 调试持久化（JSONL 记录、限额、轮转、脱敏）——持久化往返核心

- 输入：attempt 记录要素（选项、请求、结果/错误、计时）；`debugDir`、`isDev`、`fullRetention`、`recordModelIO`。
- 输出：一行 JSONL 记录追加（或覆盖）到会话文件；无输出（禁用/跳过/失败吞掉）。
- 错误语义：写盘任何失败**静默吞掉**（调试不影响请求结果）。
- 时序与并发：流式记录先以 **1000ms** 上限收敛聚合（`text`/`reasoning`/`toolResults`/`sources`/`response` 五个 promise 竞速 `allSettled`）再落盘；生成式记录直接落盘。
- 幂等：同输入追加一行（append 语义）；覆盖仅在超限分支发生。
- 资源释放：不适用（文件保持句柄不常驻）。
- 平台差异：文件名经跨平台消毒（见语义常量）。
- 状态所有者：`debugDir` 下的 `<会话键>.jsonl` 文件；模块级 `priorMessages` 表（会话键 → 上次 canonical messages，决定 delta/baseline）。
- 日志级别：不适用（本模块不打日志）。
- 语义常量：
  - 开关：`shouldRecordModelIO = KNORVIA_RUNTIME_ENV !== "test"`（test runtime 关闭、其余含未设置默认启用）；`isDevelopmentModelIOEnv = KNORVIA_RUNTIME_ENV === "development"`；生成式记录另受 `metadata.skipTranscript === true` 跳过（**非流记录遵守 skipTranscript，流式只看环境门**）；`debugDir` 缺省见 B47（development → `cli/debug`，其余 → `cli/rollout`）。
  - 会话文件键：`traceContext.sessionId ?? metadata.sessionId ?? metadata.session_id ?? metadata.session ?? requestId`；消毒：去首尾空白、`[^a-zA-Z0-9_.-]+` → `_`、截 160、Windows 保留设备名（`con/prn/aux/nul/com1-9/lpt1-9`，含扩展形）加 `_` 前缀、空则退 `requestId`、再退 `"request"`。
  - 记录形状（JSONL 一行一记录）：`kind`（`generate`/`stream`）、`attempt`、`startedAt`、`completedAt`、`providerId`、`modelId`、`request`、`response`（generate）或 `aggregate`（stream，五项 `allSettled` 结果）、`toolCalls`、`error`、`fullRetention`、`development`；错误序列化为「可枚举自有属性 + `name` + `message`」。
  - canonical 与 SDK 副本：非全量、非开发、无错误的生成式记录里 `request.messages` 换成 canonical `request.messages` 并把 SDK 副本放 `sdkMessages`；**成功生产记录清理重复**（删 `sdkMessages`、`body.messages`、`request.body.messages`、`response.body`、各 step 的同名副本、`aggregate.response.value.body`），失败/开发/全量保留不清理。
  - 消息压缩：`messageLimit` = 开发 **256** / 生产 **64**；有连续性（文件已有内容）且上次消息是本次前缀 → `messageContext = { mode: "delta", retainedPrefix }`、`messages` 只留增量；否则 `messageContext = { mode: "baseline", omitted }`、`messages` 只留**最近 `messageLimit` 条**（连续性不明时必须保住最近上下文，不得只留 omitted 计数）。
  - 限额：单文件上限 = 开发 **256 MiB** / 生产 **64 MiB**；单行超限 → 换写瘦身行（保留 `kind`、`attempt`、`startedAt`、`completedAt`、`providerId`、`modelId`、`error` 与 `truncated: { originalBytes, reason: "model-io-record-size-limit" }`）；写入时「已有字节 + 新行 ≥ 上限」→ **用 baseline 压缩后的行覆盖整个文件**（writeFile），否则追加。
  - 生产轮转：非全量、非开发时，目录内 `.jsonl` 文件（含将写的当前文件）**至多保留 3 个**，按 mtime 从旧到新删（`allSettled` 尽力而为，当前文件不删）。
  - 全量保留（`modelIoFullRetentionEnabled`，B47 开关）：不做压缩、不去重、不瘦身、不轮转，原样追加（脱敏仍生效）。
  - 脱敏（经范围外模块 `runner-debug-redaction`）：headers、Anthropic user id（B35）、媒体原始数据一律脱敏，全量保留不豁免。
- > 往返候选：**本条全部是持久化格式**——旧写 → 新读 → 新写 → 旧读 的往返金样以本条为准（JSONL 行形状、`messageContext` 两模式、瘦身行、文件名消毒、轮转上限）。
- （依据：runner-debug.ts 1-305 行）

### B55 重试延迟、退避等待与适配错误（语义常量条目）

- 输入：重试参数、attempt、可选 `retryAfterMs`；`sleep` 另有 `abortSignal`；`toAdapterError` 另有错误、失败分类、状态上下文。
- 输出：延迟毫秒数；`sleep` 的完成/拒绝；`toAdapterError` 的 `AiSdkModelAdapterError`。
- 错误语义：`sleep` 入口或等待中取消 → 拒绝 `signal.reason`，缺省 `DOMException("Aborted", "AbortError")`。
- 时序与并发：`sleep` 可被取消打断；计时器与监听在完成/拒绝时清理。
- 幂等：`calculateRetryDelay` 同输入同输出（`jitter` 时含随机成分）；`toAdapterError` 对已是适配错误的输入走「补缺」不新建。
- 资源释放：`sleep` 的 `finally` 等价清理（清计时器、摘监听）。
- 平台差异：不适用。
- 状态所有者：物理 attempt。
- 日志级别：`logRetryDelayDecision` 用 **debug**，消息逐字 `Model retry decision`（字段 attempt、canRetry、delayMs、reason、requestId）。
- 语义常量：延迟公式 `raw = baseDelayMs × backoffFactor^(attempt-1)`、`delay = min(maxDelayMs, raw)`；`Retry-After` 覆盖条件（`retryAfterMs ≥ 0` 且（`≤ 300_000` **或** `< raw`））命中则 `delay = retryAfterMs`；`jitter` 为真时最终值 `round(delay × (0.5 + rand×0.5))`，否则 `round(delay)`，并 `max(0, ·)`。`TerminalStreamChunkError`：`name = "TerminalStreamChunkError"`、消息取适配错误消息、`cause` 与 `adapterError` 都指向该适配错误。`toAdapterError`：入参已是 `AiSdkModelAdapterError` → `enrichContext({ ...statusContext, attempt, ...additional })`（B19 补缺语义）；否则新建 `AiSdkModelAdapterError(failure.code, failure.message, { cause: error, context: { ...statusContext, attempt, reason, retryReason, retryable, statusCode, retryAfterMs, ...additional } })`（`undefined` 值字段照写）。
- （依据：runner-retry.ts 1-90 行）

### B56 结果归一（用量、reasoning、流事件、工具调用/结果、来源）

- 输入：AI SDK 的 generate 结果或流式 chunk。
- 输出：契约层的 `ModelUsage`、reasoning 块、`ModelStreamEvent`、工具调用/结果、来源数组（空集合归一为 `undefined`）。
- 错误语义：不抛错（未知 chunk 类型返回 `undefined` 被丢弃）。
- 时序与并发：流事件逐条转换，顺序保持。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：仅工具入参归一失败时由 B33 warn。
- 语义常量：用量映射——`inputTokens`/`outputTokens`/`totalTokens` 直取；`cacheReadTokens`/`cacheWriteTokens` 取 `inputTokenDetails`；`reasoningTokens` 取 `outputTokenDetails`。reasoning 归一——只留有 `text` 或 `providerMetadata` 的块，`text ?? ""`，`providerMetadata` 为对象时映射为 `providerOptions`，全空返回 `undefined`。流事件映射（chunk `type` → 事件）——`start`→`start`；`text-start`/`text-end`→`text_start`/`text_end`（`id: String(value.id)`）；`text-delta`→`text_delta`（`id` 字符串否则 undefined、`text: String(text ?? delta ?? "")`）；`reasoning-start/-delta/-end`→对应事件（带 `providerMetadata`）；`tool-input-start`（`id: String(id ?? toolCallId)`、`toolName: String(toolName ?? "")`、`providerExecuted === true`）；`tool-input-delta`（`delta: String(delta ?? "")`）；`tool-input-end`；`tool-call`（`toolCallId ?? id ?? ""`，name 经 B43 的名字归一、input 经 B33）；`finish`（`finishReason: String(finishReason ?? "unknown")`、usage 取 `totalUsage`、带 `providerMetadata`）；`error`（`error` 原样）；其余 → `undefined`。工具调用归一（generate）——`id = toolCallId`、`name` 归一、`input` 归一（`source: "generateText"`）、`providerExecuted` 透传，空列表 → `undefined`。工具结果归一——`input` 优先取同 id 归一调用的 input、否则原值；空 → `undefined`。来源：非空原样，空 → `undefined`。
- （依据：runner-normalization.ts 1-164 行）

### B57 终局业务错误探测（范围外模块，经 runner 路径锁定）

- 输入：generate 结果或流的 raw chunk / finish 事件的 `providerMetadata`。
- 输出：`ProviderBusinessError` 或 `undefined`。
- 错误语义：不抛错。
- 时序与并发：流式探测在 finish 事件处理时执行（先 raw 后 `providerMetadata`，先命中先返回）。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：物理 attempt 的终局检查。
- 日志级别：不适用。
- 语义常量：体解析复用 B5；**显式失败条件** = 源对象 `success === false` **或** 提取出的 `providerCode` 非空（两者皆否则返回 `undefined`，避免把普通正文误判为失败）；`providerCode` 强制字符串化；`providerKind` 仅 `anthropic`/`openai` 保持，其余归 `openai-compatible`。模块 `provider-finish-business-error` **不在本包替换范围**，本条只锁定 runner 路径的可观察行为。
- （依据：provider-finish-business-error.ts 1-46 行）

### B58 流诊断计数与零输出补全判定

- 输入：流 chunk 序列 / 汇总输入（finishReason、reasoning 长度、文本长度、工具调用数、usage）。
- 输出：诊断计数器；布尔判定。
- 错误语义：不适用。
- 时序与并发：逐 chunk 累计。
- 幂等：计数器单调；判定同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：物理 attempt 的诊断对象。
- 日志级别：**debug**：`Model generate completed`（attempt、durationMs、requestId、toolCallCount、usage）、`Model stream completed`（attempt、durationMs、requestId、diagnostics）、`Ignored model stream chunk`（attempt、requestId、type）；**warn**：`Model stream failed`（attempt、canRetry、durationMs、reason、requestId、diagnostics）。
- 语义常量：零输出判定 = `textLength === 0 && reasoningLength === 0 && toolCallCount === 0 && !usage.inputTokens && !usage.outputTokens && !usage.totalTokens`（用量三项任一非零即不算零输出）；计数器语义——chunk 类型缺省记 `unknown`；`text-delta`/`reasoning-delta` 的字符数取 `text ?? delta ?? ""`；`finish` 记 `finishReason ?? ""` 与 `rawFinishReason`；`error` 计数并留最后一条；`tool-call` 计数；可疑判定 `isSuspiciousStreamDiagnostics` = 有 error chunk，或（无 finishReason 且字符与调用全为 0）。
- （依据：runner-diagnostics.ts 7-158 行）

### B59 归因头与会话类型（语义常量条目）

- 输入：状态上下文 / 显式会话类型 + `modelCall` 观察。
- 输出：归因 header 表；会话类型值；会话 id 归一值。
- 错误语义：不适用。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用（header 随请求）。
- 日志级别：不适用。
- 语义常量：会话 id 归一——`undefined`/`null` → `undefined`；字符串化后去掉开头 `sess_` 前缀；结果为空串 → `undefined`。会话类型——显式 `main`/`subagent`/`other` 直接采纳；否则 `actorKind === "subagent"` 或 `operation` 字符串含 `subagent` → `subagent`；`actorKind === "main"` → `main`；其余 → `other`。归因头（键名逐字）：恒有 `x-knorvia-request-id`、`x-knorvia-trace-id`（`String(traceId)`）、`x-knorvia-session-type`；`queryId` 真值时加 `x-knorvia-query-id`；归一后会话 id 非空时加 `x-knorvia-session-id`。
- （依据：runner-attribution.ts 1-42 行）

### B60 网络头脱敏（敏感头清单逐字）

- 输入：任意形状的 header 表。
- 输出：字符串值的 header 表，敏感头替换为 `[REDACTED]`。
- 错误语义：不适用（非对象输入返回 `{}`）。
- 时序与并发：不适用。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：敏感键正则（大小写不敏感）`^(authorization|proxy-authorization|x-api-key|api-key|cookie|set-cookie)$` → 值 `[REDACTED]`；非字符串值条目**丢弃**；非对象输入 → `{}`。
- （依据：runner-network-headers.ts 1-12 行）

### B61 attempt 级运行时头刷新

- 输入：`attempt`、请求（含可选 `refreshRuntimeHeadersBeforeAttempt`）、`resolveModel(requestAuth?)`。
- 输出：刷新后的 `ResolvedAiSdkModel`。
- 错误语义：刷新失败 → `RuntimeHeadersRefreshError`（`name = "RuntimeHeadersRefreshError"`，消息逐字 `Runtime model headers could not be refreshed`，cause 保留）；**取消优先**：入口或失败时信号已中止 → 直接抛 `signal.reason`。
- 时序与并发：事件序列「临时解析 → 刷新（带 accountAccess、attempt、reason、abortSignal、providerId、modelId、traceContext）→ 以 `refreshed.requestAuth` 重解析」。
- 幂等：每次 attempt 调用一次。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：物理 attempt。
- 日志级别：不适用。
- 语义常量：无刷新钩子时直接返回临时解析结果；`reason` 缺省 `"model-request"`。
- （依据：runner-runtime-headers.ts 1-35 行）

### B62 记录字段工具与失败遥测归因

- 输入：任意值 / 失败分类 + 错误 / 响应头。
- 输出：字段提取结果、`exceptionKind` 归因、`exceptionType`、provider 细节、provider 请求 id。
- 错误语义：不抛错。
- 时序与并发：不适用。
- 幂等：同输入同输出（`modelFailureStatusFields` 除外，它依赖 B25）。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：不适用。
- 日志级别：不适用。
- 语义常量：记录工具——`isRecord` 为「对象且非 null」（**含数组**）；`asRecord` 非记录回 `{}`；`stringProperty` 只取字符串；`numberProperty` 只取有限数；`stringMetadata` 只认字符串。失败归因——`errorPhase` 优先取显式入参，其次 `context.errorPhase`，再次错误本体 `errorPhase`（仅字符串）；`exceptionKind` 判定顺序：业务错误（B25）→ `provider_business`；`reason === "invalid_request"` → `protocol`；`reason` 属于 `network_error`/`proxy_error`/`tls_error`/`timeout`/`stream_idle_timeout`/`cancelled` → `transport`；其余 → `api_call`。`modelFailureStatusFields` = `{ errorCode, errorPhase, exceptionType, …provider 细节, retryAfterMs }`，`exceptionType` = `Error.name` 否则链上字符串 `code`。provider 请求 id 提取：header 名（大小写不敏感）首个命中 `^(x-request-id|request-id|x-amzn-requestid|cf-ray)$` 的值。
- （依据：runner-record.ts 1-22 行、runner-telemetry.ts 1-58 行）

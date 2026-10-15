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

# shared-02 行为规格（behavior.md）

本文件冻结 `packages/shared/src` 中 58 个继承文件（类型与协议常量为主）的对外行为。
编号 B1–B51，发布后编号不重用。每条按九个方面描述：输入、输出、错误语义、时序与并发、
幂等、资源释放、平台差异、状态所有者、日志级别。

**通用约定（适用全部条目）**

- 本包全部是**同步纯函数 / 常量表 / zod schema**：无 IO、无网络、无定时器、无异步；
  「时序与并发」= 无内部状态可被并发破坏（模块级捕获态见 B10，是仅有的例外并单列）；
  「资源释放」= 无资源需要释放；「状态所有者」= 无进程级状态（B10 除外）；
  「日志级别」= 本包不写任何日志（调用方自行决定）。
- 平台差异：除非条目单列，路径/换行/大小写差异不影响行为；涉及路径归一的条目
  （B35）同时覆盖 Windows 盘符/UNC 与 POSIX 形态。
- 数据格式红线：所有常量取值（环境变量名、错误码、枚举字面量、协议通道名、
  testid 字符串、URL、分隔符）逐字节不变，见各条目「输出」中的字面量。

---

## A. 标识、错误与日志工具

### B1 uuidv7：时间戳前缀 + v7 版本位

- 输入：`uuidv7(now?: number)`，`now` 默认 `Date.now()`（毫秒）。
- 输出：`8-4-4-4-12` 十六进制 UUID 字符串；前 48 位是 `now` 的大端毫秒时间戳；
  第 7 字节高 4 位固定 `0x7`（版本 7）；第 9 字节高 2 位固定 `10`（RFC 4122 变体）；
  其余 74 位来自 `crypto.getRandomValues`。
- 错误语义：无（不校验 `now` 范围，负数/超大数按 BigInt 截断 48 位）。
- 时序与并发：纯函数；同 `now` 两次调用因随机位不同而结果不同。
- 幂等：不幂等（随机源）。
- 资源释放：无。平台差异：无（`crypto.getRandomValues` 为 Web 标准）。
- 状态所有者：无。日志级别：不写日志。

### B2 createUuid：randomUUID 优先的 v4 格式 ID

- 输入：无参。
- 输出：`8-4-4-4-12` 格式 UUID。首选 `crypto.randomUUID()`；缺 `randomUUID` 但有
  `getRandomValues` 时自行拼装（版本位 `4`、变体位 `10`）；两者都缺时退回
  `Math.random` 字节（**版本/变体位仍被规范为 4 / 10**）。
- 错误语义：无。时序与并发：纯函数。幂等：不幂等。资源释放：无。
- 平台差异：移动端 WebView 缺 `randomUUID` 的降级路径即为本条设计目标。
- 状态所有者：无。日志级别：不写日志。

### B3 错误归一化族（errors.ts）

- 输入：`stringifyUnknownValue(value: unknown)`；`normalizeUnknownError(error: unknown)`；
  `isKnorviaFileLockTimeoutError(error: unknown)`；常量
  `KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE = "KNORVIA_FILE_LOCK_TIMEOUT"`（字面量不变）。
- 输出：
  - `stringifyUnknownValue`：字符串原样；`null→"null"`、`undefined→"undefined"`；
    number/boolean/bigint 走 `String()`；其余对象 `JSON.stringify`，序列化失败或
    返回 `undefined`（如函数）时退回 `String(value)`。
  - `normalizeUnknownError`：返回 `{ message, code? }`。若入参是含 `error` 键的记录且
    嵌套对象带 `message`/`code`，先解包嵌套。`Error` 实例：`message` 为空时依次退
    `name`、`String(error)`；`code` 只接受 string/number/bigint 并 `String()` 化，
    其它类型丢弃。普通记录：有 `message` 键则按 `stringifyUnknownValue` 处理，
    结果为 `"undefined"` 或空串时退回整个对象的字符串化。
  - `isKnorviaFileLockTimeoutError`：归一化后 `code === KNORVIA_FILE_LOCK_TIMEOUT_ERROR_CODE`。
- 错误语义：不抛错（对任意输入）。
- 时序与并发/幂等/资源释放/日志：纯函数、幂等、无资源、不写日志。
- 平台差异：无。状态所有者：无。

### B4 日志前缀格式（log-format.ts）

- 输入：`formatTimestamp(date = new Date())`；`formatLogPrefix(source, pid?)`。
- 输出：时间戳恒为本地时区 `YYYY-MM-DD HH:mm:ss.mmm`（各段补零）；前缀有 pid 时
  `[<ts>] [pid:<pid>] [<source>]`，无 pid 时 `[<ts>] [<source>]`。
- 错误语义：无。时序与并发：纯函数。幂等：对同一 `date` 幂等；`formatLogPrefix`
  不接 `date`，每次取当前时间。资源释放：无。平台差异：无（不读 `process.pid`，
  由调用方传入）。状态所有者：无。日志级别：本模块只产出日志文本，自身不写日志。

### B5 语义化版本比较与强制升级判定（forceUpdate.ts）

- 输入：`compareSemverVersions(left, right)`；`resolveForceUpdateRequirement({currentVersion, forceUpdate})`；
  类型 `ForceUpdateConfig { minimalVersion: string }`（自已删除的 coding plan 残留模块迁入，
  见 `known-differences.md` 第 3 节）。
- 输出：
  - `compareSemverVersions`：先 `trim` 并去 `v` 前缀；必须匹配
    `major(.minor(.patch(-prerelease))?)`，可带 `+build`（忽略）；简写补 0；
    返回 `-1|0|1`，prerelease 比较规则：数字段按数值、数字 < 字母、逐段比、
    短者为小；无 prerelease 的版本大于有 prerelease 的同号版本。
  - `resolveForceUpdateRequirement`：`minimalVersion` 缺失/空白 → `null`；
    当前版本无法解析或 ≥ 最低版本 → `null`；否则返回 `{currentVersion, minimalVersion}`
    （`minimalVersion` 为 trim 后的值）。
- 错误语义：解析失败返回 `null`，不抛错。
- 时序与并发/幂等/资源释放/日志：纯函数、幂等、无资源、不写日志。
- 平台差异：无。状态所有者：无。

## B. 运行时环境（env.ts / runtimeEnv.ts）

### B6 编译期环境身份（env.ts）

- 输入：`normalizeKnorviaEnv(value)`；`normalizeKnorviaProductFlavor(value, knorviaEnv)`；
  `mapKnorviaEnvToArmsRumEnv(runtimeEnv)`。
- 输出：
  - `normalizeKnorviaEnv`：`trim().toLowerCase() === "test"` → `"test"`，否则一律 `"production"`。
  - `normalizeKnorviaProductFlavor`：值为 `production`/`preview`（trim+小写后）原样返回；
    否则 `knorviaEnv === "production"` → `"production"`，其余 → `"preview"`。
  - `mapKnorviaEnvToArmsRumEnv`：`runtimeEnv !== "development" && KNORVIA_ENV === "production"`
    → `"prod"`，否则 `"local"`。
  - 常量：`KNORVIA_APP_VERSION_ENV = "KNORVIA_APP_VERSION"`、
    `KNORVIA_BUILD_COMMIT_ID_ENV = "KNORVIA_BUILD_COMMIT_ID"`（字面量不变）；
    `KNORVIA_TELEMETRY_ENABLED = false`、`KNORVIA_TELEMETRY_REPORT_ENDPOINT = ""`、
    `KNORVIA_ARMS_RUM_ENDPOINT = ""`（**产品无遥测服务，空串与 false 是硬事实**）。
  - `RUNTIME_KNORVIA_DEBUG`：进程存在时读 `process.env.KNORVIA_DEBUG`，否则 `undefined`。
- 错误语义：无。时序与并发：模块加载时求值一次，之后只读。幂等：幂等。
- 资源释放：无。平台差异：非 Node 环境（无 `process`）恒 `undefined`。
- 状态所有者：模块级常量（构建期 define 注入）。日志级别：不写日志。

### B7 运行时环境变量名单（runtimeEnv.ts，键名字面量）

- 输入：无（常量表）。
- 输出：以下导出名与取值逐字不变：
  `KNORVIA_RUNTIME_ENV_KEY="KNORVIA_RUNTIME_ENV"`、
  `KNORVIA_HTTP_PROXY_ENV_KEY="KNORVIA_HTTP_PROXY"`、
  `KNORVIA_NO_PROXY_ENV_KEY="KNORVIA_NO_PROXY"`、
  `KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY="KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY"`、
  `KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY="KNORVIA_REMOTE_HTTP_PROXY"`、
  `KNORVIA_REMOTE_NO_PROXY_ENV_KEY="KNORVIA_REMOTE_NO_PROXY"`、
  `KNORVIA_AGENT_CA_CERT_ENV_KEY="KNORVIA_AGENT_CA_CERT"`、
  `KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY="KNORVIA_TOOL_ENV_PASSTHROUGH_JSON"`、
  `KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV="KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED"`、
  `KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY="KNORVIA_CUA_PRODUCT_HELPER"`、
  `KNORVIA_CUA_BROKER_SOCKET_ENV_KEY="KNORVIA_CUA_PERMISSION_BROKER_SOCKET"`、
  `KNORVIA_CUA_NODE_REPL_HOST_ENV_KEY="KNORVIA_CUA_NODE_REPL_HOST"`、
  `KNORVIA_CUA_DEV_MODE_ENV_KEY="KNORVIA_CUA_DEV_MODE"`、
  `KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY="KNORVIA_CUA_PLUGIN_AUTHORITY"`。
- 其余七方面：常量表，无行为面（数据格式红线：这些环境变量名属于「一律不变」清单）。

### B8 运行时环境归一与 CUA 内部特性开关

- 输入：`normalizeKnorviaRuntimeEnv(value)`；`resolveKnorviaRuntimeEnv(env, fallback = "production")`；
  `isCuaDevModeRequested(env = process.env)`；`isKnorviaCuaInternalFeatureEnabled(env = process.env)`。
- 输出：
  - `normalizeKnorviaRuntimeEnv`：trim+小写后 ∈ {development, production, test} → 该值；
    否则 `undefined`。
  - `resolveKnorviaRuntimeEnv`：读 `env[KNORVIA_RUNTIME_ENV_KEY]` 归一，失败用 `fallback`。
  - `isCuaDevModeRequested`：`KNORVIA_CUA_DEV_MODE` trim+小写后为 `1|true|on` → true。
  - `isKnorviaCuaInternalFeatureEnabled`：dev 模式请求 → true；否则
    `KNORVIA_CUA_PRODUCT_HELPER` trim+小写后为 `0|false|off` → false，其余（含缺省）→ true。
- 错误语义：不抛错。时序与并发：纯函数（每次读传入 env，不缓存）。幂等：幂等。
- 资源释放：无。平台差异：默认参数 `process.env` 在非 Node 环境需显式传 env。
- 状态所有者：无。日志级别：不写日志。

### B9 运行时环境清洗（sanitize 族）

- 输入：`shouldSanitizeKnorviaRuntimeEnvKey(key)`；`sanitizeKnorviaRuntimeEnv(env)`；
  `sanitizeKnorviaRuntimeEnvInPlace(env)`。
- 输出：
  - 判定：键 `toUpperCase()` 后命中固定清洗名单（NODE*ENV、ELECTRON_RUN_AS_NODE、
    NODE_NO_WARNINGS、HTTP(S)\_PROXY、ALL_PROXY、NO_PROXY、NODE_EXTRA_CA_CERTS、
    SSL_CERT_FILE/DIR、REQUESTS_CA_BUNDLE、CURL_CA_BUNDLE、GIT_SSL_CAINFO、
    三个 KNORVIA_REMOTE*_、CUA broker 两键、KNORVIA*CUA_PLUGIN_AUTHORITY、
    OTEL*_ 八键、KNORVIA*MODEL_TELEMETRY_ENABLED、KNORVIA_TELEMETRY*\* 六键），
    或匹配包管理器代理模式 `^(npm_config|yarn|pnpm)_(http_proxy|https_proxy|proxy|all_proxy|no_proxy|cafile|ca)$`（大小写不敏感）。
  - `sanitizeKnorviaRuntimeEnv`：返回新对象，丢弃 `undefined` 值与命中键；调用前先执行
    B10 的两个捕获动作。`sanitizeKnorviaRuntimeEnvInPlace`：就地 `delete` 命中键，
    同样先捕获。
- 错误语义：不抛错。时序与并发：纯函数（捕获态见 B10）。幂等：幂等。
- 资源释放：无。平台差异：无。状态所有者：无（捕获态除外）。日志级别：不写日志。

### B10 凭据与遥测环境捕获（模块级唯一状态）

- 输入：`getCapturedKnorviaCuaBrokerCredentials()`；`resetCapturedKnorviaCuaBrokerCredentialsForTest()`；
  `readKnorviaAgentTelemetryEnv(env)`；`getCapturedKnorviaAgentTelemetryEnv()`；
  `resetCapturedKnorviaAgentTelemetryEnvForTest()`。
- 输出：
  - CUA broker 凭据：`sanitize*` 调用时读 env；`socket` 与 `pluginAuthority` **同时**
    trim 非空才冻结存下（含可选 `refreshMarker`）；只有其一 → 捕获态清为 `undefined`；
    getter 返回副本（无捕获时 `{socket: undefined, pluginAuthority: undefined}`）。
  - Agent 遥测环境：`readKnorviaAgentTelemetryEnv` 只收集 `OTEL_*`、`KNORVIA_TELEMETRY_*`
    前缀与 `KNORVIA_MODEL_TELEMETRY_ENABLED` 三个族的 trim 非空值；捕获是**累积合并**
    （`Object.assign`），getter 返回副本；两个 reset 分别清空。
- 错误语义：不抛错。时序与并发：模块级可变单例；同一进程内多次 sanitize 会覆盖/累积，
  调用方约定「启动时 sanitize 一次」；getter 永远给副本，外部改返回值不污染内部。
- 幂等：读操作幂等；写操作按上述覆盖/累积语义。资源释放：无。
- 平台差异：无。状态所有者：本模块（进程级两个捕获槽）。日志级别：不写日志。

### B11 工具环境透传（JSON 环境变量协议）

- 输入：`shouldCaptureKnorviaToolEnvPassthroughKey(key)`；`readKnorviaToolEnvPassthroughEnv(env)`；
  `buildKnorviaToolEnvPassthroughEnv(env)`。
- 输出：
  - 捕获判定：先排除遥测族（同 B9 的遥测前缀判定）与
    `NON_TOOL_PASSTHROUGH_RUNTIME_ENV_KEYS`（NODE*ENV、ELECTRON_RUN_AS_NODE、
    NODE_NO_WARNINGS、CUA broker 两键、KNORVIA_CUA_PLUGIN_AUTHORITY、三个 KNORVIA_REMOTE*\*），
    其余命中清洗名单的键可透传。
  - `read`：读 `KNORVIA_TOOL_ENV_PASSTHROUGH_JSON`，`JSON.parse`；非对象/数组/解析失败
    → `{}`；键必须匹配 `^[A-Za-z_][A-Za-z0-9_]*$` 且值为 string 且通过捕获判定。
  - `build`：`read` 的结果并入 env 中所有通过判定的键；非空时包装成
    `{ [KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY]: JSON.stringify(按键名 localeCompare 排序的对象) }`，
    空结果返回 `{}`。
- 错误语义：坏 JSON 静默返回 `{}`。时序与并发：纯函数。幂等：幂等（排序保证字节稳定）。
- 资源释放：无。平台差异：无。状态所有者：无。日志级别：不写日志。

## C. HTTP 错误与配置工具

### B12 ApiError（api.ts）

- 输入：`new ApiError({message, url, method?, status?, responseHeaders?, cause?})`。
- 输出：`name="ApiError"`；`method` 缺省 `"GET"` 并 `toUpperCase()`；`url/status/responseHeaders`
  原样保留（`status` 可 undefined）；`cause` 有值时传给 `Error` 构造。
- 错误语义：本身是错误类型。时序与并发：无状态实例。幂等：构造幂等。
- 资源释放：无。平台差异：无。状态所有者：实例。日志级别：不写日志。

### B13 sparseShape：覆盖型 schema 派生（config-schema.ts）

- 输入：`sparseShape(shape: Record<string, ZodType>)`。
- 输出：同键新对象，每个值为 `schema.nullable().optional()`；原 schema 不被修改。
- 错误语义：无。时序与并发：纯函数。幂等：幂等（结果等价）。
- 资源释放：无。平台差异：无。状态所有者：无。日志级别：不写日志。

### B14 数据目录错误码（settings-errors.ts）

- 输入：`isDataBaseDirForbiddenWindowsInstallDirError(error)`；常量
  `DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR_ERROR_CODE = "DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR"`。
- 输出：B3 归一化后 `code` 等于该码，**或** `message` 包含该码子串 → true。
- 错误语义：不抛错。其余七方面：纯函数、幂等、无资源、无状态、不写日志、无平台差异。

### B15 命令来源判别（command-types.ts）

- 输入：`isUserCommand(command)` / `isPluginCommand(command)`。
- 输出：按 `command.source === "user" | "plugin"` 收窄类型；不校验其余字段。
- 其余八方面：纯函数、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

## D. 媒体与存储常量

### B16 媒体预览格式表（media-preview.ts）

- 输入：`getMediaPreviewFormat(path)`；常量 `MEDIA_PREVIEW_FORMATS`。
- 输出：格式表 11 条（扩展名 → kind/mediaType）逐字不变：`.mp4 video/mp4`、
  `.mov video/quicktime`、`.webm video/webm`、`.m4v video/x-m4v`、`.mp3 audio/mpeg`、
  `.wav audio/wav`、`.m4a audio/mp4`、`.ogg audio/ogg`、`.opus audio/opus`、
  `.flac audio/flac`、`.weba audio/webm`。查找先把 `\` 归一为 `/` 并小写，后缀匹配，
  未命中返回 `null`。
- 其余八方面：纯函数、幂等、无资源、无平台差异（反斜杠兼容 Windows）、无状态、
  不写日志、不抛错。

### B17 存储分类与卷分组（storage.ts）

- 输入：`groupStorageRootsByVolume(roots)`；常量 `STORAGE_CATEGORY_IDS`、`STORAGE_MORE_ENTRIES_PATH`。
- 输出：
  - 分类 ID 表 11 项顺序与字面量不变：sessionStore、subagentTranscripts、toolOutputs、
    modelTrajectory、devTraces、logs、backups、exports、runtimes、config、other；
    `STORAGE_MORE_ENTRIES_PATH = "…"`（单个 U+2026）。
  - 分组：有 `volume` 的根按 `dev:<deviceId>` 同组，`volume` 为 null 的根按
    `path:<根路径>` 各自成组；组内保持输入顺序，`bytes` 累加；组间按 `bytes` 降序。
- 其余八方面：纯函数、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

## E. 遥测脱敏（telemetry.ts / telemetryRedaction.ts）

### B18 遥测主机名与事件详情消毒（telemetry.ts）

- 输入：`resolveSafeTelemetryHostname(value)`；`sanitizeTelemetryErrorMessage(value)`；
  `sanitizeTelemetryEventDetail(elementName, detail)`；`collectTelemetryRendererContext(options?)`。
- 输出：
  - 主机名：trim 后能 `new URL` 且协议仅 `http:/https:` → 小写 hostname；否则 `""`。
  - 错误消息：truthy → `"[redacted]"`，否则 `""`（**消息正文永不外传**）。
  - 事件详情：`error_msg` 键一律替换为上述 `[redacted]` 规则；`elementName === "app_login_ck"`
    且键为 `login_url` 时替换为「URL hostname 或裸主机名小写」；其余键值原样。
  - renderer 上下文：`timeZone` 缺省取 `Intl` 解析值再退 `"UTC"`；`clientLanguage` 同理退
    `"en-US"`；`screenResolution` 为 `"<width>x<height>"`，无屏退 `0x0`。
- 其余八方面：纯函数、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

### B19 文本脱敏管线（telemetryRedaction.ts）

- 输入：`redactTelemetryText(value, {maxLength?})`；常量 `TELEMETRY_TEXT_MAX_LENGTH = 2048`、
  `TELEMETRY_SAFE_BUILTIN_MODEL_IDS`。
- 输出：对字符串**依次**执行：截 4096 字符 → URL 整体脱敏（B20）→
  `authorization:` 头值 → `{redacted}` → 查询串 `api_key|token|access_token|authorization|
password|passwd|secret|cookie|session=` 值 → `{redacted}` → 键值对
  `api_key|token|access_token|password|passwd|secret|client_secret|cookie|set-cookie|session`
  的值 → `{redacted}` → `Bearer|Basic <token>` → `$1 {redacted}` →
  `sk|rk|pk-<12+>`、`gh[pousr]_<20+>`、`AKIA<16>`、`AIza<30+>` → `{secret}` →
  邮箱 → `{email}` → 本地路径（`/var/folders|/tmp`、`/Users|/home|/root|/workspace|
/workspaces|/Volumes` 开头、Windows 盘符路径）→ `{path}` → 控制字符压成空格 →
  空白折叠 → trim → 截断到 `maxLength`（默认 2048）。
  `TELEMETRY_SAFE_BUILTIN_MODEL_IDS` = 22 个官方 GLM ID 的小写 + 3 个 legacy ID
  （`charglm-4`、`codegeex-4`、`emohaa`）。
- 错误语义：非字符串/空串 → `""`。时序与并发：纯函数。
- 幂等：**非幂等（旧行为保持原样）**：`{redacted}` 占位符后紧跟 `}` 时，二次运行会再吃掉
  一个 `}`；其余输入通常稳定。测试按两次输出逐字断言（B19）。
- 资源释放：无。平台差异：Windows 盘符路径同样被脱敏。状态所有者：无。日志级别：不写日志。

### B20 URL 脱敏（telemetryRedaction.ts）

- 输入：`redactTelemetryUrl(value)`。
- 输出：空 → `"unknown"`；`blob:` → `"blob"`；`data:` → `"data"`；
  `file:` / Windows 盘符 / 以 `/` 开头 → `"local_file"`；能补成 URL 且有 host 的，
  输出 `协议//host<route>`，route 每段：含 `@`、纯 7+ 位数字、16+ 位十六进制、
  UUID 形态 → `{segment}`，其余截 128 字符；补不出 URL 或无 host → `"unknown"`。
- 其余八方面：纯函数、幂等、无资源、跨平台、无状态、不写日志、不抛错。

### B21 遥测模型标识收敛（telemetryRedaction.ts）

- 输入：`resolveTelemetryProviderScope(providerId)`；`resolveTelemetryModelId(scope, modelId)`；
  `sanitizeTelemetryModelValue(value)`。
- 输出：
  - scope：空 → `{providerId:"", providerScope:"unknown"}`；命中内置 6 个
    `account:*` ID 或可被 legacy 迁移改写的旧 builtin ID → `"builtin"`（原样保留 providerId）；
    其余一律 `{providerId:"custom", providerScope:"custom"}`（**自定义供应商 ID 不外传**）。
  - modelId：unknown scope 或空 → `""`；custom scope → `"custom"`；builtin scope 取
    裸模型名（`custom:` 值解码出 modelName；`provider/model` 取 `/` 后段）小写后
    命中安全名单 → 该小写名，否则 `"custom"`。
  - `sanitizeTelemetryModelValue`：`custom:` 前缀值 → 按解码出的 provider 归 scope 再算；
    `a/b` 形态 → `/` 前当 providerId、后当模型名；裸值按 builtin scope 处理。
- 其余八方面：纯函数、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

## F. 快捷键（shortcutCommands.ts）

### B22 默认快捷键表

- 输入：`SHORTCUT_COMMANDS`；`getDefaultShortcutBindings(id)`。
- 输出：23 条命令的 `id/channel/scope/defaultBindings` 逐字不变（含 `openCommandCenter`
  双绑定 `["CmdOrCtrl+k","CmdOrCtrl+Shift+p"]`、composer 域两条无修饰键绑定
  `Enter`/`Shift+Enter`）；未知 id 返回 `[]`。
- 其余八方面：常量表 + 纯查找、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

### B23 绑定解析/序列化往返

- 输入：`normalizeShortcutKey(rawKey)`；`parseShortcutBinding(binding)`；
  `serializeShortcutBinding(parsed)`；`isValidShortcutBinding(binding)`。
- 输出：
  - 键归一：别名 `Plus|Equal→"="`、`Minus→"-"`；单字符类 `[a-z0-9[\]=\-,./;'\\`]`原样；
命名键 ∈ {F1..F12, Arrow*, Home, End, PageUp, PageDown, Delete, Insert, Enter}；否则`null`。
  - 解析：按 `+` 切分，末段为键，前段修饰键 ∈ {CmdOrCtrl, Ctrl, Alt, Shift, AltGr}
    且不得重复；未知修饰键/空键 → `null`。
  - 序列化：按固定顺序 CmdOrCtrl→Ctrl→Alt→Shift→AltGr 输出 `A+B+key`；键归一失败 → `null`。
  - `isValidShortcutBinding`：解析成功且序列化结果与输入逐字相同。
- 其余八方面：纯函数、幂等（parse∘serialize 往返稳定）、无资源、无平台差异、无状态、
  不写日志、不抛错。

## G. 模型供应商与选择

### B24 内置供应商 ID 与判别函数（model-provider-types.ts）

- 输入：常量与 6 个判别函数。
- 输出：`BUILTIN_MODEL_PROVIDER_IDS` 六值逐字不变：`account:zai-individual-coding-plan`、
  `account:zai-team-coding-plan`、`account:zai-start-plan`、`account:bigmodel-individual-coding-plan`、
  `account:bigmodel-team-coding-plan`、`account:bigmodel-start-plan`；
  `BUILTIN_PROVIDER_TEMPLATE_IDS = {zai:"zai-api", bigmodel:"bigmodel-api"}`；
  `isBuiltinModelProviderId` 精确匹配六值；`isZaiCodingPlanProviderId`（zai 三档）、
  `isBigModelStartPlanProviderId`、`isStartPlanModelProviderId`（两档 Start Plan）、
  `isIndividualCodingPlanModelProviderId`（两档个人版，不含 Start/Team）、
  `isCodingPlanModelProviderId`（zai 三档 + bigmodel 三档）按字面量集合判定。
- 其余八方面：常量表 + 纯谓词、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

### B25 供应商家族规格与解析（model-provider-family.ts）

- 输入：`MODEL_PROVIDER_FAMILY_SPECS`；`getModelProviderFamilySpec(id)`；
  `resolveModelProviderFamilyIdByProviderId(pid)`；`resolveModelProviderFamilyIdByBaseURL(url)`；
  `resolveModelProviderFamilySpecByProviderId(pid)`；`resolveModelProviderFamilyLabelByProviderId(pid)`；
  `normalizeProviderFamilyDomain(value)`；`resolveProviderFamilyDomainFromOAuthProvider(p)`；
  `shouldShowModelProviderFamilyForDomain/ForActiveOAuth`；`shouldShowBuiltinModelProviderForDomain/ForActiveOAuth`。
- 输出：
  - 规格表两项逐字不变：zai（label `Z.ai`、rootDomain `z.ai`、manage URL
    `https://z.ai/manage-apikey/subscription`）、bigmodel（label `BigModel`、rootDomain
    `bigmodel.cn`、manage URL 由 `buildBigModelCodingPlanTeamManageUrl({KNORVIA_ENV})` 生成）；
    每项绑定三个 B24 的 ID。
  - providerId → family：六值查表；未命中 `null`。
  - baseURL → family：`new URL` 取 hostname 小写，等于 rootDomain 或以 `.`+rootDomain
    结尾 → 该 family；解析失败/空 → `null`。
  - domain 归一：仅 `zai|bigmodel`，其余 `null`；OAuth provider → domain 同理。
  - show 判定：domain 为 `null`（未限定）→ 全显示；否则只显示匹配 family。
- 其余八方面：常量表 + 纯查找、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

### B26 自定义模型值编解码（custom-model-value.ts）

- 输入：`encodeCustomModelValue(providerId, modelName?)`；`decodeCustomModelValue(value)`；
  常量 `CUSTOM_MODEL_VALUE_PREFIX = "custom:"`。
- 输出：编码为 `custom:<encodeURIComponent(providerId)>[:<encodeURIComponent(modelName)>]`；
  解码：无前缀 → `null`；无 `:` 分隔 → `{providerId: 安全解码}`；三段且首段 `builtin`
  → legacy 形态 `{providerId:"builtin:<第二段>", modelName: 解码余下}`（余下段用 `:` 连接再解码）；
  否则首段为 providerId、余下为 modelName（各自安全解码，解码失败保留原文）。
- 其余八方面：纯函数、编解码往返幂等、无资源、无平台差异、无状态、不写日志、不抛错。

### B27 供应商 key 构造（model-selection-key.ts）

- 输入：`normalizeSupplierBaseUrl(url)`；`buildNativeSupplierKey(knorviaProvider)`；
  `buildCustomSupplierKey(providerId)`；`buildGhostSupplierIdentity(raw)`；
  `buildGhostSupplierKey(knorviaProvider, reason, rawIdentity)`；
  `resolveSupplierKeyFromModelDisplayValue(knorviaProvider, value)`；
  常量 `NATIVE_SUPPLIER_KEY_PREFIX="native:"`、`CUSTOM_SUPPLIER_KEY_PREFIX="custom:"`、
  `GHOST_SUPPLIER_KEY_PREFIX="ghost:"`。
- 输出：
  - baseURL 归一：trim + 去尾部全部 `/`。
  - native/custom key：前缀 + provider/providerId（custom 的 providerId trim）。
  - ghost identity：`encodeURIComponent(trim || "unknown")`；编码后超过 160 字符时退化为
    `hash=<12 位 hex>`（两段不同种子的 FNV-1a 32 位拼接截断）。
  - ghost key：`ghost:<provider>:<reason>:<identity>`。
  - 从显示值解析：值能解码出 `custom:` 且带 providerId → `custom:<providerId>`，
    否则 `native:<provider>`。
- 其余八方面：纯函数、幂等（hash 稳定）、无资源、无平台差异、无状态、不写日志、不抛错。

### B28 模型选择 schema 与 picker 值（model-selection.ts / model-selection-types.ts）

- 输入：`modelSelectionSchema`；`formatModelPickerValue(selection)`；
  `parseModelPickerValue(value)`；常量 `KNORVIA_MODEL_REASONING_SEPARATOR = "$"`、
  `KNORVIA_AGENT_PROVIDER_NOT_READY_CODE = "KNORVIA_AGENT_PROVIDER_NOT_READY"`、
  `KNORVIA_AGENT_PROVIDER_NOT_READY_REASON = "provider_not_ready"`（字面量不变）。
- 输出：
  - schema：strict 对象，`providerId/modelId` trim 非空；`options` strict 且
    `reasoningLevel` 可选 trim 非空；未知键拒绝。
  - 格式化：`undefined` → `""`；`provider/model`；带 reasoningLevel 时追加 `$<level>`。
  - 解析：trim 后第一个 `/` 前为 providerId（`<=0` 位置 → 抛
    `Error("模型选择缺少 Provider: <原文>")`）；`$` 在模型段内且不在两端时拆出
    reasoningLevel；结果经 schema 校验（非法即抛 zod 错误）。
- 错误语义：缺 provider 抛中文消息 Error；非法字段抛 zod 错误。
- 其余七方面：纯函数、幂等（format∘parse 对合法值往返稳定）、无资源、无平台差异、
  无状态、不写日志。

### B29 旧模型供应商 ID 迁移（legacy-model-provider-identity.ts）

- 输入：`migrateLegacyModelProviderId(providerId)`；`migrateLegacyOfficialGlmModelId(providerId, modelId)`。
- 输出：
  - ID 迁移表逐字不变：`builtin:bigmodel→zai-api 对应 bigmodel-api`、`builtin:zai→zai-api`、
    `builtin:bigmodel-start-plan→account:bigmodel-start-plan`、`builtin:zai-start-plan→account:zai-start-plan`、
    `builtin:bigmodel-coding-plan→account:bigmodel-individual-coding-plan`、
    `builtin:zai-coding-plan→account:zai-individual-coding-plan`；其它 `builtin:` 开头 →
    `undefined`（未知旧格式）；非 builtin 开头 → 原值透传（自定义 ID 不迁移）。
  - GLM 模型 ID 迁移：仅当 providerId 匹配
    `builtin:(zai|bigmodel)(-start-plan|-coding-plan)?` 或
    `account:(zai|bigmodel)-(start-plan|individual-coding-plan|team-coding-plan)` 时，
    模型 ID 过 B30 归一，否则原样返回。
- 其余八方面：纯查表、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

### B30 官方 GLM 模型名单（official-glm-model-id.ts）

- 输入：`OFFICIAL_GLM_MODEL_IDS`；`normalizeOfficialGlmModelId(modelId)`。
- 输出：22 个官方 ID 列表逐字不变（GLM-5.3 起至 GLM-4V-Flash 止，含 Flash/FlashX/Turbo
  变体）；归一函数大小写不敏感查表，命中返回规范大小写，未命中返回原值。
- 其余八方面：常量表 + 纯查找、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

### B31 家族连接选择 schema（provider-family-connection-selection.ts）

- 输入：`providerFamilyConnectionSelectionSchema`；`providerFamilyConnectionSelectionSettingsSchema`。
- 输出：`kind` 判别联合三项（strict）：`start-plan`、`individual-coding-plan` 仅 kind；
  `team-coding-plan` 另需 `productId/organizationId/projectId` 三个 trim 非空字符串；
  settings schema 为 `{zai?, bigmodel?}` 整体 partial（可缺任一家族）。
- 其余八方面：schema 纯校验、幂等、无资源、无平台差异、无状态、不写日志、非法输入由 zod 报错。

### B32 账号不可用原因枚举（account-provider-state.ts）

- 输入：`accountProviderUnavailableReasonSchema`。
- 输出：四值枚举逐字不变：`not-authenticated`、`not-connected`、`credential-failed`、
  `not-entitled`（与严格协议共用，改一个字就会使旧协议帧被拒——数据格式红线）。
- 其余八方面：schema 纯校验、幂等、无资源、无平台差异、无状态、不写日志、非法值 zod 报错。

### B33 Provider 枚举 schema（providers.ts）

- 输入：`knorviaProviderSchema`。
- 输出：单值枚举 `["knorvia"]`；类型 `KnorviaProvider = "knorvia"`。
- 其余八方面：同 B32。

## H. 远程连接身份

### B34 远程目标 secret 剥离（remoteTarget.ts）

- 输入：`stripRemoteTargetSecrets(target)`。
- 输出：`ssh` 目标返回剔除 `password` 与 `privateKeyPassphrase` 的新对象（其余字段保留）；
  `wsl`/`docker` 原样返回（无 secret 字段）。
- 其余八方面：纯函数、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

### B35 SSH 远程主机身份键（remoteSshHostKey.ts）

- 输入：`buildSshRemoteHostKey(target)`。
- 输出：`JSON.stringify(["ssh:v1", host.trim().toLowerCase(), port ?? 22, username.trim(), authKind, normalizedKeyPath])`。
  authKind 判定优先级：`privateKeyPath` trim 非空 → `private-key`；有 `password` 字符串
  或 `passwordCredentialKey` trim 非空 → `password`；否则 `agent`。
  私钥路径词法归一：`\`→`/`；盘符（`X:` 开头且其后无行分隔符）字母大写并作为锚定前缀
  （`X:/` 或 `X:`）；UNC `//server/share/` 前两段受保护；`/` 锚定、`~/` 非锚定且**前缀保留**
  （`~/../k` 归一后仍是 `~/../k`）；空段与 `.` 丢弃；`..` 折叠上一段，锚定路径越过根后丢弃、
  非锚定保留。
  **密码与私钥口令永不进入键**（键只由上述六元组构成）。
- 其余八方面：纯函数、幂等（同输入同输出）、无资源、同时覆盖 Windows/UNC/POSIX 路径、
  无状态、不写日志、不抛错。

### B36 环境级身份键（remoteEnvironmentKey.ts）

- 输入：`buildRemoteEnvironmentKey(target)`。
- 输出：`ssh:` + B35 键；`wsl:` + `<distro|<default>>\0<user|<default>>`（`\0` 分隔，
  trim 后空用 `<default>`）；`docker:` + `container.trim()`。
- 其余八方面：同 B35（含 `\0` 字节为协议常量）。

### B37 远程资源安装模式（remoteAssetInstallMode.ts）

- 输入：`normalizeRemoteAssetInstallMode(mode)`；常量 `REMOTE_ASSET_INSTALL_MODES`、
  `DEFAULT_REMOTE_ASSET_INSTALL_MODE`。
- 输出：模式表 `["local-download-upload","remote-download"]`；默认 `"local-download-upload"`；
  归一：仅 `"remote-download"` 原样通过，其余（含 null/undefined/未知）→ 默认值。
- 其余八方面：纯函数、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

### B38 远程资源包集合（remoteResourcePackages.ts）

- 输入：7 个导出函数与 4 张常量表。
- 输出：ID 表 7 项（server-bundle、node-runtime、node-pty、knorvia、bfs、ripgrep、ugrep）；
  active = 全部 7 项；required = 前两项；optional = 其余五项；依赖表当前为空对象。
  `normalizeRemoteResourcePackageSelection` **忽略入参**，恒返回 active 全集的副本
  （历史 SSH 裁剪选择已无业务意义——旧行为保持原样）；其余判别函数按对应集合查表；
  `isRemoteResourcePackageSelectedAsDependency` 在「某被选包的依赖含目标包且目标包也在
  选集」时为 true（当前依赖表为空，恒 false）。
- 其余八方面：常量表 + 纯函数、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

### B39 平台常量与 open-in-editor 目标（platform.ts）

- 输入：`LOCAL_MEDIA_PREVIEW_SCHEME`、`buildLocalMediaPreviewUrl(path)`、
  `BROWSER_VIEW_RESTORE_BOOTSTRAP_URL`、`BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS`、
  `DesktopCommandIds`、`createOpenInEditorRemoteTarget(target)`。
- 输出：
  - `knorvia-media`、`knorvia-browser-restore://pending`、`3_000` 三个常量字面量不变。
  - 预览 URL：`knorvia-media://local/preview?path=<encodeURIComponent(path)>`（URL 构造，路径进查询参数）。
  - `DesktopCommandIds` 28 项键值逐字不变（newTask…getCuaOsSupport）。
  - open-in-editor 目标：ssh → 只保留 `kind/host/port/username`（**username 原样不 trim**，
    `sshConfigAlias` trim 非空才带）；wsl → `kind/distro`（`user` trim 非空才带）；
    docker → `kind/container`。**凭据字段（password/privateKeyPassphrase/privateKeyPath）
    一律不穿透**。
- 其余八方面：常量表 + 纯函数、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

## I. 定时/闲时/子代理领域

### B40 定时任务限制与 runId 解析（automation-types.ts）

- 输入：`AUTOMATION_CREATE_LIMIT`、`AUTOMATION_CREATE_LIMIT_ERROR_CODE`、
  `isAutomationCreateLimitError(error)`、`parseAutomationRunId(runId)`。
- 输出：`20`；`"AUTOMATION_CREATE_LIMIT_REACHED"`；判别接受 string 或 Error 的
  message 包含该码；runId 解析：第一个 `:` 前为 automationId（位置 `<=0` → `null`）；
  余段 `manual:<非空>` → `{automationId, trigger:"manual"}`（`manual:` 后为空 → `null`）；
  余段为正安全整数 → `{automationId, trigger:"schedule", scheduledAt}`；其余 → `null`。
- 其余八方面：常量 + 纯函数、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

### B41 闲时常量（off-peak-types.ts）

- 输入：`OFF_PEAK_TERMINAL_STATUSES`、`isOffPeakTerminalStatus(status)`、
  `OFF_PEAK_TICKET_EXPIRED_MARKER`、`OFF_PEAK_PROVIDER_IDS`、`resolveOffPeakProviderId(family)`。
- 输出：终态表 `["completed","failed","cancelled"]`；标记
  `"off-peak-ticket-expired"`（**跨进程错误文本传递用，全链路唯一且稳定，勿改**）；
  provider ID 两值 `account:zai-offpeak-idle-plan` / `account:bigmodel-offpeak-idle-plan`；
  按 family 精确取值。
- 其余八方面：常量表 + 纯谓词/查找、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

### B42 子代理 ID 与插件覆盖解析（subagents-types.ts）

- 输入：`parsePluginSubagentModelSelectionOverrides(value)`；`createAgentStateId(input)`；
  `createPluginAgentStateId(pluginId, agentName)`。
- 输出：
  - 覆盖解析：非对象/数组 → `{}`；只保留键以 `plugin:` 开头且值通过 `modelSelectionSchema`
    校验的条目，其余丢弃。
  - `createAgentStateId`：`<source>:<scope>:<name.trim().toLowerCase()>`。
  - `createPluginAgentStateId`：`plugin:<pluginId>:<agentName.trim().toLowerCase()>`
    （pluginId 含 `@<marketplace>`，不含版本——插件升级后 id 不变）。
- 其余八方面：纯函数、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

## J. 用量统计

### B43 用量常量与 schema（usage-stats.ts / usage-quota.ts）

- 输入：`ESTIMATED_TOKEN_CHAR_DIVISOR`、`APP_USAGE_RANGES`、`appUsage*Schema` 族、
  `MCP_USAGE_QUOTA_LIMIT_TYPE`。
- 输出：`3`；`["all","7d","30d"]`；`appUsageSnapshotSchema` 等 12 个 schema 的
  strictness 与字段名按源文件冻结（快照必填 `range/generatedAt/timeZone/source:"agent-db"`，
  四组数据键为 `summary/heatmap/dailyModelUsage/models/tools`）；
  `MCP_USAGE_QUOTA_LIMIT_TYPE = "MCP_USAGE_LIMIT"`。
- 其余八方面：常量 + schema、幂等、无资源、无平台差异、无状态、不写日志、非法输入 zod 报错。

## K. 校验 schema 家族（validation.ts / validationAppSettings.ts）

### B44 zod 错误格式化与基础 schema（validation.ts）

- 输入：`formatZodError(error)`；`nonEmptyStringSchema`、`stringArraySchema`、
  `credentialRecordSchema`、`credentialKeySchema`、`credentialValueSchema`、
  `sshConnectOptionsSchema`、`wslConnectOptionsSchema`、`dockerConnectOptionsSchema`、
  `helloMessageSchema`、`helloAckMessageSchema` 等。
- 输出：
  - 格式化：每个 issue 输出 `<path 点连接，空路径用 <root>>: <message>`，多 issue 用 `"; "` 连接。
  - `nonEmptyStringSchema`：trim 后非空；SSH 连接 schema：`kind:"ssh"` 判别、
    `host/username` trim 非空、`port` 正整数 ≤65535 可选；WSL/Docker 各自判别字段。
  - hello/ack：`type` 字面量 `knorvia-hello` / `knorvia-hello-ack`，version/platform/arch/pid
    与 version/clientId 必填。
- 其余八方面：纯 schema、幂等、无资源、无平台差异、无状态、不写日志、非法输入 zod 报错。

### B45 AppSettings schema（validationAppSettings.ts）

- 输入：`appSettingsSchema`、`appSettingsPatchSchema`、`appSettingsOccupationEnum`、
  `localeSchema`、`integratedTerminalShellSelectionSchema`、`postUpdateReleaseNotesPayloadSchema`。
- 输出：
  - 职业枚举 14 值顺序与字面量不变（office…other）。
  - locale 枚举与默认值：`DEFAULT_LOCALE = "zh-CN"`（B46）。
  - integratedTerminalShell：`mode` 判别联合（含 auto/dialect 等形态，strict）。
  - `appSettingsSchema`：完整设置对象校验（含家族连接选择等嵌套 schema）；对象**非 strict**：
    未知键被剥离而不是报错（旧行为保持原样，B45 测试断言）。`appSettingsPatchSchema`：
    同形状但整树可缺省/可 null（覆盖型 patch，由 B13 `sparseShape` 派生的部分），
    同样非 strict。
- 其余八方面：纯 schema、幂等、无资源、无平台差异（路径字段为字符串不解释）、无状态、
  不写日志、非法输入 zod 报错。

### B46 协议默认语言（protocol.ts）

- 输入：`DEFAULT_LOCALE`；其余为纯类型导出（FileEntry/FileStat/AppSettings 等 30+ 类型）。
- 输出：`DEFAULT_LOCALE: Locale = "zh-CN"`（字面量不变）；类型面见 `interface-appendix.md`。
- 其余八方面：常量、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

## L. 通信频道与测试 ID 常量

### B47 频道名常量表（channels.ts）

- 输入：`ServiceChannels`、`PlatformChannels`、`EmbeddedBrowserWebviewChannels`、
  `CodingPlanWebviewChannels`、`InternalChannels`、`HostMessageTypes`、`HostResponseTypes`、
  `KNORVIA_RPC_CLIENT_MODE_HEADER`、`KNORVIA_RPC_HOST_CAPABILITY_HEADER`。
- 输出：全部频道名字符串（如 `file`、`media-preview`、`agent-session`、`provider-settings`、
  `usage-stats` 等）与两个 RPC header 名**逐字不变**——它们是跨进程协议面，改一个字符
  即断连（数据格式红线）。各表的键集合与取值以 `interface-appendix.md` 与源文件为准，
  B48 测试抽样断言并做全表快照比对。
- 其余八方面：常量表、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

### B48 data-testid 常量与 testId()（test-ids.ts / test-ids-workflow.ts）

- 输入：`TID_*` 常量 362 + 37 项；`testId(base, suffix)`。
- 输出：全部 testid 字符串（`login-trigger`、`v4-composer-input`、`workflow-card-run` 等）
  **逐字不变**——UI 的 `data-testid` 与 E2E 断言依赖它们（计划书选择 7）；
  `testId(base, suffix)` = `` `${base}-${suffix}` ``。
- 其余八方面：常量表 + 纯函数、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

## M. 公开入口面

### B49 根 barrel 可达性（index.ts 不在本包，但其 re-export 面的一部分属本包）

- 输入：`@knorvia/shared`（源码 `packages/shared/src/index.ts` / dist `dist/index.js`）。
- 输出：本包 58 个文件的运行时导出中，**除 `sparseShape`（走 `config-schema` 子路径）与
  `integratedTerminalShellSelectionSchema`（仅包内使用，无公开入口）外**全部可从根 barrel
  取到（B50 测试逐名断言）。`index.ts` 文件本身归属后续 shared-04 包重写，
  本包只冻结「本包导出经 barrel 可达」这一事实。
- 其余八方面：组合面断言，无独立行为。

### B50 子路径入口（package.json exports）

- 输入：`@knorvia/shared/runtime-env`、`/model-selection`、`/account-provider-state`、
  `/config-schema` 四个子路径。
- 输出：四条子路径在源码与 dist 两侧都能 import，且导出面与对应源文件一致
  （`interface-appendix.md` 中该文件的运行时值集合）。
- 其余八方面：同 B49。

### B51 模块路径兼容面

- 输入：本包 58 个模块文件路径。
- 输出：替换阶段后，`packages/shared/src/<相对路径>.ts` 与 `tsc -b packages/shared` 产物
  `packages/shared/dist/<相对路径>.js` 必须仍然存在（`tests/surface.test.mjs` 断言）——
  跨包与测试经由这些路径加载。
- 其余八方面：路径存在性断言。

### B52 构建期版本常量（version.ts）

- 输入：`KNORVIA_VERSION`、`KNORVIA_COMMIT`、`KNORVIA_BUILD_TIME`。
- 输出：由各 bundler `define` 注入；非构建环境下三个常量的回退值逐字不变：
  `"0.0.0-dev"`、`"unknown"`、`"unknown"`（typeof 守卫避免 ReferenceError）。
- 其余八方面：模块常量、幂等、无资源、无平台差异、无状态、不写日志、不抛错。

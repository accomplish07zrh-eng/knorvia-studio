# shared-04 行为规格（v1）

范围：`packages/shared/src` 顶层继承剩余的 44 件（清单见 `README.md` §一.3 六簇）。
编号发布后不重用；每条在 README「条目 → 测试」对照表里至少有一个断言。

通用约定（适用于所有条目，条目内不再重复）：

- **时序与并发**：除注明的文件 IO 外全部为纯函数/短解析；无长驻定时器、无后台任务、无跨调用状态。
- **幂等**：纯函数天然幂等；带缓存的 registry 单列「再注册/再采样」结果。
- **资源释放**：本包不打开文件/网络句柄；registry 的 dispose 语义写在 B35。
- **日志级别**：本包**不写日志**，错误以返回值、`null` 或抛错交给调用方。
- **平台差异**：路径/换行/大小写差异写在条目里；其余在 Windows 与 POSIX 同语义。
- **状态所有者**：默认无状态；状态归调用方（services / CLI / desktop / ui）。
- **金样口径**：`fixtures/*.json` 由旧实现录制，两入口逐字段比较；错误只比 code/message。
- **schema 纪律**：标 strict 的 schema 拒绝未知键；标宽容的只校验已知键。

---

## R. remote/network（B1–B11）

### B1 安全端点主机名（`endpointHostname.ts`）

- 输入：`resolveSafeEndpointHostname(value)`（`string | null | undefined`）。
- 输出：仅当 `new URL(value)` 成功且协议是 `http:`/`https:` 时返回 `url.hostname`（标准库已小写）；
  其余（含 `ftp:`、裸主机、`" nope "`、空串、`null`、`undefined`）返回 `""`。
- 错误语义：不抛错。时序/并发：纯函数。幂等。资源：无。平台：URL 解析按 Node 标准库。
- 状态所有者：无。日志：无。

### B2 内网地址默认值（`intranetDefaults.ts`）

- 输入：`resolveIntranetMachineHost(env)`、`resolveIntranetDepsBaseUrl(env)`。
- 输出：
  - 主机名 = `env.INTRANET_MACHINE_HOST?.trim()`（缺省 `""`）；
  - deps 基址：`KNORVIA_DEPS_BASE_URL` trim + 去尾部 `/`；否则主机非空时 `http://<host>:12345/knorvia/deps`；
  - 常量：资产端口 `12345`、探测端口 `3850`、探测路径 `/api/intranet/probe`；
    基址常量在未配置 env 时为空串（模块加载时读取一次）
- 错误语义：主机与 deps 基址都为空时抛 `Error`，文案逐字：
  `Configure KNORVIA_DEPS_BASE_URL or INTRANET_MACHINE_HOST in .env before downloading internal dependencies`。
- 时序/并发：纯解析；幂等；无资源；平台无关；无状态；无日志。

### B3 内网探测类型（`intranetProbe.ts`，纯类型）

- 9 个纯类型：`IntranetProbeTcpTarget`、`IntranetProbeServiceTarget`、`IntranetProbeTarget`、
  `IntranetProbeRequest`、`IntranetProbeTcpTargetResult`、`IntranetProbeServiceTargetResult`、
  `IntranetProbeTargetResult`、`IntranetProbeResult`、`IntranetProbeServiceResponse`。
- 输出：无运行时导出（`Object.keys` 为空）；类型面由 `pnpm typecheck` 与消费方守住。
- 其余八项：无运行时行为。

### B4 远程工作区 identity 构造（`remote-workspace-identity.ts`）

- 输入：`buildRemoteWorkspaceIdentity(workspacePath, target)`。
- 输出：
  - 路径先 `\`→`/`、按 `/` 过滤空段、再拼成前导 `/` 的归一形态；
  - SSH：`remote:ssh:${host.trim().toLowerCase()}:${port ?? 22}:${username.trim()}:${path}`；
  - WSL：`remote:wsl:${distro.trim() || "default"}` +（`user.trim()` 非空时 `:${user}`）+ `:${path}`；
  - Docker：`remote:docker:${container}:${path}`；
  - 其它 kind 返回 `undefined`。
- 错误语义：不抛错。幂等；纯函数；无资源；Windows 路径已覆盖；无状态；无日志。

### B5 远程工作区 identity 解析（`remote-workspace-identity.ts`）

- 输入：`parseRemoteWorkspaceIdentity(identity)`、`isRemoteWorkspaceIdentity(identity)`。
- 输出：
  - 文法：
    - SSH `/^remote:ssh:[^:]+:[^:]+:[^:]+:(\/[\s\S]*)$/`
    - WSL `/^remote:wsl:[^:]+:(?:[^:/][^:]*:)?(\/[\s\S]*)$/`
    - Docker `/^remote:docker:[^:]+:(\/[\s\S]*)$/`
  - 命中返回 `{ kind, workspacePath }`（路径从首个 `/` 起完整保留，含冒号与换行）；否则 `null`；
  - `isRemoteWorkspaceIdentity` 等价于 `parse !== null`。
- 错误语义：不抛错；不暴露 host/port/user。纯函数；幂等；无资源；无状态；无日志。

### B6 远程用量遥测上下文与连接结果（`remoteUsageTelemetry.ts`）

- 输入：`resolveWorkspaceTelemetryDetail({workspaceIdentity?, remoteSessionId?})`；
  `buildRemoteWorkspaceConnectResultTelemetry({result, remoteKind, connectTrigger, error?})`。
- 输出：
  - `workspace_kind = (identity.trim() !== "" || remoteSessionId.trim() !== "") ? "remote" : "local"`；
  - `remote_kind` = identity 解析出的 `kind`，解析失败为 `""`（`local` identity 也按失败处理）；
  - 连接结果信封：
    `{ elementName:"remote_workspace_connect_result", eventRegion:"remote_workspace", eventType:"result",
eventExtraDetail:{ result, remote_kind, connect_trigger, error_category } }`；
    `error_category` 缺省 `""`（success）或 `"unknown"`（failure 无错误对象）。
- 错误语义：不抛错；非字符串 identity 视为空。纯函数；幂等；无资源；无状态；无日志。

### B7 远程错误分类（`remoteUsageTelemetry.ts`）

- 输入：`classifyRemoteUsageError(error)`（任意值）。
- 输出：把 `Error.message`、`code`、`name` 与结构化字段拼成小写文本，按以下优先序返回：
  `auth` → `deploy` → `host_start` → `attach` → `relay` → `connect` → `unknown`。
  先命中先返回（如 `"AUTH then connect"` → `auth`）。
  关键触发词包含 authentication/unauthorized/token、download/checksum/deploy、host start/spawn、
  attach、relay/websocket、connect/timeout 等（以 fixtures 为准）。
- 错误语义：不抛错；`undefined` → `unknown`。纯函数；幂等；无资源；无状态；无日志。

### B8 帮助与远端应用配置（`remoteAppConfig.ts`、`helpAppConfig.ts`）

- 输入：`remoteAppConfig` 的 7 个 getter；`resolveHelpAppConfig(remote, local)`。
- 输出：
  - URL 字段（`feedback_url`、`feedback_api_base`、community）只接受 trim 后非空字符串，原样返回（不 trim）；
  - `feedback_use_external_form` 仅 `true`/`"true"`；
  - `community_urls` 只读 `zh-CN`/`en-US` 两个键；
  - `getCommunityUrlFromConfigs` 远端键优先，缺失回退本地；
  - `forceUpdate.minimalVersion` 字符串 trim 后非空则返回 trim 值；
  - `resolveHelpAppConfig`：逐 locale（zh-CN/en-US）远端优先，`feedback_url` 远端非空优先；
    `feedback_use_external_form` 远端显式为 false 时结果为 false，**不回退**本地；
    非对象输入回退默认值（`{}` 形态）。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B9 服务端远控 schema（`server-remote.ts`）

- 输入：`serverRemoteInfoSchema`、`serverRemoteHostCapabilitySchema`、`serverRemoteWorkspaceInfoSchema`。
- 输出：
  - `SERVER_REMOTE_PROTOCOL_VERSION = 1`；
  - info strict：`serverId` 非空、`version` 非空、`protocolVersion` 必须为 1、`authRequired` 布尔、
    `workspaces` 数组（每项 `{path}` strict）、`capabilities` strict 且 `desktopContinuous`/`websocketRpc` 必填；
  - host capability strict：`{capability:string, expiresAt:number}`，上限/符号按 schema；
  - workspace strict：`{path:string, displayName?:string}`。
- 错误语义：`safeParse` 返回 `success:false`。纯解析；幂等；无资源；无状态；无日志。

### B10 OpenRouter 归因头（`openrouter-attribution.ts`）

- 输入：`isOpenRouterBaseUrl(baseUrl)`、`withOpenRouterAttributionHeaders(headers, baseUrl)`。
- 输出：
  - 仅 `https:` 且 hostname 为 `openrouter.ai` 或 `*.openrouter.ai` 时为真；
  - 命中时合入 `OPENROUTER_ATTRIBUTION_HEADERS`
    （`X-OpenRouter-Title: Knorvia Studio`、`X-OpenRouter-Categories: programming-app`），
    已有同名键不覆盖；未命中原样返回输入对象。
- 错误语义：不抛错；空串/未定义 → false。纯函数；幂等；无资源；无状态；无日志。

### B11 WSL 用户名校验（`wslUserValidation.ts`）

- 输入：`isValidWslUser(value)`、`wslUserSchema.safeParse(value)`。
- 输出：
  - `WSL_USER_MAX_LENGTH = 64`；
  - trim 后长度 1–64 且不含 `[\u0000-\u001f\u007f:/\\]`；
  - schema 先允许空串，再对非空值套用同一规则。
- 错误语义：`safeParse` 返回失败；`isValidWslUser` 返回 false。纯函数；幂等；无资源；
  Windows 路径分隔符按普通非法字符处理；无状态；无日志。

---

## P. plugins/mcp（B12–B18）

### B12 插件名展示（`plugin-display-name.ts`）

- 输入：`formatCanonicalPluginName(name, locale)`、`resolveLocalizedText(locale, base, map)`、
  `resolvePluginDisplayName(plugin, locale)`。
- 输出：
  - canonical：按 `[-_]+` 分词，丢弃空词，词首大写；缩写 `aws`→`AWS`、`mcp`→`MCP`、
    `knorvia`→`Knorvia Studio`；结果以空格连接；
  - 本地化：`map[locale]` → `map[language]` → base；只接受 trim 后非空值；
  - display：`listing.displayNameI18n` 优先，其次 `listing.displayName`（trim 非空），最后 canonical(name)。
- 错误语义：不抛错。纯函数；幂等；`locale` 大小写按传入精确匹配；无状态；无日志。

### B13 插件市场常量（`plugin-marketplaces.ts`）

- 输出：
  - 官方 id `knorvia-plugins-bundled`；
  - `DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS` 为 10 项 Set（browser-use、image-search、documents、pdf、
    presentations、spreadsheets、node-repl-host、skill-creator、plugin-creator、knorvia-guide，
    均 `@knorvia-plugins-bundled`；computer-use 不在内）；
  - `DEFAULT_PLUGIN_MARKETPLACES = []`；`PUBLIC_STORE_MARKETPLACE_IDS = [官方 id]`；
  - `isPublicStoreMarketplaceId` 按该数组精确匹配。
- 时序/并发：模块加载即固定；幂等；无资源；无状态；无日志。

### B14 商店排序配置解析（`pluginStoreOrder.ts`）

- 输入：`parsePluginStoreOrder(value)`。
- 输出：
  - 根 `{code?, work?}`；每个模式独立解析，失败 `.catch(undefined)`（不污染另一模式）；
  - `categoryOrder` 数组元素 trim、非空、去重保序；
  - `pluginOrder` 为 `Record<string, string[]>`，同样清洗；
  - 根非法（含 `null`/非对象）返回 `null`；空对象返回 `{}`。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B15 商店排序（`pluginStoreOrdering.ts`）

- 输入：`sortPluginStoreEntries(entries, getFields, locale, order?)`、
  `resolvePluginStoreCategory(category)`、`compareDocumentPluginPriority(leftId, rightId)`。
- 输出：
  - 分类序 `productivity, developer-tools, utilities, finance, legal, template`；
  - `guides`→`utilities`；空白/缺省→`undefined`→`other`；`other` 最后；同分类保持原序；
  - 自定义 `categoryOrder` 优先（未列出的按默认序）；`pluginOrder[category]` 内的 id 优先且按给定序；
  - 文档插件优先级：pdf 0、presentations 1、spreadsheets 2、documents 3、其它 4（只识别带
    `@knorvia-plugins-bundled` 后缀的 id）；再按 displayName `localeCompare(locale)`；最后原序。
- 错误语义：不抛错。纯函数；幂等；排序受运行环境 locale 影响（断言固定 en-US）；无状态；无日志。

### B16 技能目录扫描策略（`skill-scan-policy.ts`）

- 输出：
  - `SKILL_FILE_NAME = "SKILL.md"`；`MAX_SKILL_SCAN_DEPTH = 8`；
  - 排除目录 12 个：`.cache .next .turbo .venv __pycache__ build coverage dist node_modules out target vendor`；
  - `shouldWalkSkillDirectoryEntry(name)`：排除名单内（大小写敏感）→ false；
    以 `.` 开头的其它目录仅 `.system` 允许 → true，其余 false；普通目录 → true。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B17 MCP 请求头选择（`mcp.ts`）

- 输入：`getMcpServerRequestHeaders(config)`。
- 输出：`config.headers ?? config.http_headers`；两者都缺省时 `undefined`。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B18 MCP 服务器识别与转换（`mcp.ts`）

- 输入：`isKnorviaCuaMcpCommand`、`isKnorviaCuaMcpPackageArg`、`convertToKnorviaAgentMcpServer(name, config)`。
- 输出：
  - CUA 候选：`_`→`-` 后等于 `cua` 或以 `cua[`、`cua@`、`cua==`、`cua.` 开头；
  - 转换：有 `url` → http；有 `command` → stdio；Windows `cmd /c` 解包；空配置返回 `null`；
  - 保留 `args`/`env`/`cwd`/`timeoutMs`（仅正数）/`isolation`/`protocolVersion` 白名单；
  - OAuth 仅在 `type: "authorization_code"` 且 `clientId` trim 非空时接受；
    `client_credentials` 等其它类型不进入结果；
  - `headers` 经 B17 规则转成 entries。
- 错误语义：不抛错；未知字段忽略。纯函数；幂等；Windows 分支按传入命令字符串判断；无状态；无日志。

---

## C. config/UI（B19–B28）

### B19 公共客户端配置快照（`clientConfig.ts`）

- 输入：`parseClientConfigSnapshot(value)`。
- 输出：校验 `{code:0, data:{configs?:{pluginStoreOrder?}}}`；返回
  `{ configs: { pluginStoreOrder?: PluginStoreOrder } }`（非法 pluginStoreOrder 丢弃）；未知 configs 键忽略。
- 错误语义：结构不符抛 `Error("Invalid public client config response")`。
- 纯函数；幂等；无资源；无状态；无日志。

### B20 动态工作流开关（`dynamic-workflow-feature.ts`）

- 输入：`normalizeDynamicWorkflowMode(value)`、`resolveDynamicWorkflowClientConfig({remote?, env?})`、
  `createDynamicWorkflowClientConfig(mode)`、`isDynamicWorkflowModeEnabled(mode)`。
- 输出：
  - 模式 `disabled|onDemand|alwaysOn`；env `KNORVIA_DYNAMIC_WORKFLOW_MODE`；
  - 解析顺序：env trim 后有效值（source `override`）→ remote.mode 有效值（source `remote`）→
    默认 `disabled`（source `default`）；缺 remote 键等同默认；
  - 返回 `{mode, enabled: mode !== "disabled", source}`；
  - 归一化对非法输入返回 `undefined`；
  - `isDynamicWorkflowModeEnabled` 对任何非 `disabled` 值返回 true（含未知字符串）。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B21 运行时偏好广播（`app-runtime-preferences.ts`）

- 输出：频道 `settings:app-runtime-preferences`；env `KNORVIA_E2E_ASK_USER_QUESTION_CLOCK_SCALE`；
  payload strict：`askUserQuestionAutoResolutionEnabled: boolean` 必填，
  `modelIoFullRetentionEnabled: boolean` 可选、默认 `false`。
- 错误语义：`safeParse` 失败；`{}` 也失败（缺必填键）。纯解析；幂等；无资源；无状态；无日志。

### B22 E2E 桥开关（`e2e-test-bridge.ts`）

- 输入：`shouldEnableE2ETestBridge(env)`。
- 输出：`env.VITE_KNORVIA_E2E_STORE_BRIDGE === "1"` 且 `env.KNORVIA_E2E_RUN_ID?.trim()` 非空 → true；
  其余（含 `"true"`、缺 runId、空白 runId）→ false。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B23 启动标记（`launchMarks.ts`）

- 输出：查询键 `knorviaLaunchMarks`；`serializeLaunchMarks` 输出四字段 JSON（顺序
  `createdAt,mainStart,appReady,loadUrl`）；`parseLaunchMarks` 只接受解析后四项均为有限数字的对象，
  其它（空串、`null`、数组、字符串数字、缺项）返回 `null`。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B24 桌面菜单文案（`desktopMenu.ts`）

- 输出：`desktopMenuMessageIds` 50 个键；`desktopMenuMessages` 含 `zh-CN`/`en-US` 两套完整映射；
  `getDesktopMenuMessage(locale, id)` 未知 locale 回退 `DEFAULT_LOCALE`（zh-CN）；
  `formatDesktopMenuMessage` 用 `{name}` `replaceAll` 插值，缺值保持原样。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B25 服务权威模式（`serviceAuthority.ts`）

- 输出：env `KNORVIA_SERVICE_AUTHORITY_MODE`；三模式
  `desktop-local|desktop-attached-remote|standalone-server`；
  `parseServiceAuthorityMode(env)` 对已知值返回 `{mode}`，对未知非空值返回 `{mode:<原值>, invalidRawValue:<原值>}`，
  缺省返回 `{mode:<默认>}`（默认按调用方期望的 desktop-local）；
  `shouldUseProviderRegistrySourceForAuthorityMode(mode)`：除 `desktop-attached-remote` 外（含 undefined）为 true。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B26 更新结果类型（`update.ts`，纯类型）

- 3 个纯类型：`PostUpdateReleaseNotesPayload`、`UpdateCheckResultPayload`、`UpdateStatePayload`；
  无运行时导出。
- 其余八项：无运行时行为。

### B27 模块路径与导出面

- 44 个模块路径在源码与 dist 两侧都存在；每模块运行时导出名与 `interface-appendix.json` 逐名一致
  （`node.ts` 合并 `reexportNamed`）；根 barrel 可达除 `model-config`、`model-execution` 外的全部运行时名；
  `node` 子路径再导出 10 个运行时值与 3 个类型；三个纯类型模块 `Object.keys` 为空。
- 替换阶段的内部拆分不得改变模块路径、导出名或入口归属。

### B28 远端同步类型（`remote-sync.ts`，纯类型）

- 1 个纯类型 `RemoteSyncWriteAccessResult`；无运行时导出。
- 其余八项：无运行时行为。

---

## F. feedback/onboarding（B29–B31）

### B29 反馈工单常量（`feedback.ts`）

- 输出：
  - `FEEDBACK_TICKET_MODULES` 12 项且顺序固定（见 known-differences §2.4）；
  - `FEEDBACK_TICKET_TYPES` 4 项（bug/usage/feature/performance，中文标签逐字）；
  - `FEEDBACK_TICKET_SEVERITIES = ["P1-高","P2-中","P3-低"]`；
  - `DEFAULT_FEEDBACK_TICKET_FRAMEWORK = "agent"`；`FEEDBACK_FRAMEWORK_NONE = "none"`；
  - `FEEDBACK_TICKET_FRAMEWORK_OPTIONS = [{value:"agent",label:"Knorvia Studio Agent"}]`；
  - `FEEDBACK_TICKET_FRAMEWORKS = [{value:"none",label:"未指定"}, ...OPTIONS]`。
- 幂等；无资源；无状态；无日志。

### B30 反馈文本脱敏（`feedbackPrivacy.ts`）

- 输入：`redactFeedbackText(text, {diagnostic?})`。
- 输出：
  - 结构化 JSON：按键递归；敏感键始终 `[REDACTED]`；诊断键仅在 `diagnostic:true` 时脱敏；
    深度 >32 直接 `[REDACTED]`；
  - 混合文本：先脱敏 Authorization/Cookie/Set-Cookie、私钥块、Bearer，再按键值对、URL、用户路径；
  - URL：清空 username/password/query/hash；危险路径段改成 `/[REDACTED]`；Slack webhook 路径必脱敏；
  - 用户路径 `/Users/...`、`/home/...`、`C:\Users\...` → `[USER_PATH]`；
  - diagnostic 模式再把邮箱替换成 `[EMAIL]`；
  - 含敏感字段名的整行/整段（如 `messages: ...`、`input {...}`）替换成 `[REDACTED]`；
  - 保留的 `[REDACTED]` 片段不会被二次处理。
- 错误语义：不抛错；非字符串输入不在契约内。纯函数；幂等；无资源；无状态；无日志。

### B31 Onboarding 完成记录（`onboardingRecord.ts`）

- 输入：`onboardingRecordFileSchema`、`onboardingRecordEntrySchema`。
- 输出：
  - 文件：`{version:1, deviceMid:string(min 1), entries:Entry[]}`；
  - Entry：`userId` 非空字符串或 null；`occupation` 非空字符串或 null；
    `interfaceMode` `coding|office|null`；`memoryEnabled`/`proactiveSuggestionsEnabled` 布尔或 null；
    `completedAt` 非空字符串；`uploadState` 字面量 `"pending"`；
  - 空字符串 userId 不合法；version 2 不合法。
- 错误语义：`safeParse` 失败。纯解析；幂等；无资源；无状态；无日志。

---

## D. diagnostics/telemetry（B32–B40）

### B32 数据库启动错误分类（`database-startup.ts`）

- 输入：`classifyDatabaseStartupError(error)`。
- 输出：沿 `cause` 链最多 12 层（用 Set 防环），取 `errcode & 0xff` 与系统 `code`：
  - 13 / `ENOSPC` / `EDQUOT` → `storage_full`
  - 3、8 / `EACCES`、`EPERM` → `permission_denied`
  - 10 / `EIO` → `io_error`
  - 7 / `ENOMEM`、`ERR_WORKER_OUT_OF_MEMORY` → `out_of_memory`
  - 11、26 → `corrupt`
  - 14 → fallback `open_failed`；5 → fallback `lock_timeout`
  - 合法 `kind` 且非 `sql_failed` → 覆盖 fallback
  - 默认 `sql_failed`
- 错误语义：不抛错；非对象/空值走 fallback。纯函数；幂等；无资源；无状态；无日志。

### B33 启动错误详情与重试（`database-startup.ts`）

- 输入：`databaseStartupErrorDetails(error)`、`canRetryDatabaseStartup(state)`。
- 输出：
  - details 沿 cause 链保留最后一个合法 `sqliteCode`（安全整数）、`systemCode`（`^[A-Z_0-9]{1,64}$`）、
    `migrationId`（`^[a-zA-Z_0-9-]{1,128}$`）；不合法值不覆盖；
  - 重试：`phase === "failed"` 且 `failedPhase !== "starting_services"` 且 errorCode 不在
    `{corrupt, checksum_mismatch, newer_database, transport_closed, startup_status_timeout, unsupported_runtime}`
    （`undefined` 视作 `sql_failed`，可重试）。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B34 启动状态 schema（`database-startup.ts`）

- 输出：
  - `databaseStartupStateSchema` strict：`schemaVersion:1`、startupId/attemptId 1–128、sequence 非负整数、
    startedAt/updatedAt 非负有限数、phase 六值、可选 databasePhase/migration/finalDatabase/failedPhase/errorCode/
    sqliteCode/systemCode/migrationId、`disk` 数组最多 8 项；
  - `databaseStartupControlSchema`：`snapshot`、`exit`、`retry`（retry 必须带 attemptId）；
  - `databaseStartupPortPayloadSchema` strict：`{databaseStartupId:1..128}`；
  - `databaseMigrationIdSchema`：`^[a-zA-Z_0-9-]{1,128}$`；
  - `databaseMigrationFactsSchema`：executed/committed 非负、committed ≤ executed、none 时 executed 必须 0。
- 错误语义：`safeParse` 失败。纯解析；幂等；无资源；无状态；无日志。

### B35 内存诊断（`memoryDiagnostics.ts`）

- 输入：`createMemorySampleWriteGate(options)`、`createMemoryDiagnosticsRegistry()`、格式化辅助。
- 输出：
  - 常量 60000ms / 0.05 / 0.1 / 300000ms；
  - gate：首个样本 `"first"`；计数器任一变化 `"changed"`；内存增量严格大于
    `max(before, 1) * ratio` 时 `"changed"`；距上次写入 ≥ heartbeatMs 时 `"heartbeat"`；否则 `null`；
  - `bytesToKb` 四舍五入到 1 位小数（1536 → 1.5）；
  - `formatMemorySampleLine` 计数器按键排序、非有限值跳过；
  - registry：键 `namespace.key`；provider 抛错不影响其它 provider；重复注册同名替换旧 provider；
    dispose 只移除与注册时相同的 provider。
- 错误语义：不抛错；非有限内存值不产生计数。纯函数/内存注册表；幂等；无资源；无状态（registry 由调用方持有）；无日志。

### B36 本地 TTFT（`localTtft.ts`）

- 输出：
  - 常量：6 stages、15 buckets（1…300000）、maxDetails 64、preparation stages 7、pending 128、
    TTL 300000、clock error TTL 60000、clock error max 10；
  - `calibrateLocalTtftClock(start, end, facts)`：
    - 全部有限、`end ≥ start`、`sentAt ≥ receivedAt`、`network ≥ 0`、`network/2 ≤ 10` 才返回
      `{instanceId, offsetMs: Math.round((start+end-receivedAt-sentAt)/2), errorMs: Math.round(network/2), measuredAt:end}`；
    - 否则返回 `undefined`；
  - schema：detail/record/batch/facts strict，时间字段非负有限，`end ≥ start`。
- 错误语义：不抛错；`safeParse` 失败返回 false。纯函数；幂等；无资源；无状态；无日志。

### B37 会话调试（`session-debug.ts`）

- 输出：`SESSION_DEBUG_LIMITS = {rounds:200, network:100, dedupe:2000}`；
  `calculateOutputTps(outputTokens, durationMs)` 仅在 outputTokens 是有限数且 ≥0、durationMs 是有限数且 >0 时
  返回 `outputTokens / (durationMs / 1000)`，否则 `null`。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B38 渲染器动作追踪（`rendererActionTrace.ts`）

- 输出：
  - 常量：服务名 `knorvia-desktop-renderer`、采样上限 0.2、批量 32 spans / 262144 bytes；
    disabled 配置 `{enabled:false,sampleRatio:0,enabledGroups:[],configVersion:"disabled"}`；
  - config strict：sampleRatio 0–0.2、enabledGroups 6 值枚举最多 6 项、configVersion trim 1–128；
  - attributes strict：feature_id/action/surface 1–128、catalog_group 6 值、operation_kind 5 值、
    trigger 7 值、outcome 6 值、action_id UUID、可选枚举/布尔/64 字符值；
  - span：traceId 32 hex、spanId 16 hex、name `ui_action`、时间非负且 end ≥ start；
  - batch：version 1、rendererInstanceId 与 resource.rendererInstanceId 一致、spans ≤32。
- 错误语义：`safeParse` 失败。纯解析；幂等；无资源；无状态；无日志。

### B39 行变更统计与 Markdown 图片（`lineChangeStat.ts`、`markdown-artifact-images.ts`）

- `computeLineChangeStat(before, after)`：
  - 以 `\n` 切行，去掉末尾单个空行；`\r` 留在行内；
  - 公共前缀与公共后缀先 trim；剩余部分用 LCS 计数相同行；
  - 返回 `{added, removed}`；相同行不计；尾部换行不产生额外行；
  - 左右乘积 >400000 时按跨度计数（避免大矩阵）。
- `extractMarkdownArtifactImageRefs(markdown)`：只收反引号/波浪线 fence 之外、`![...](knorvia-artifact://...)`
  形式的 ref（允许 `<...>` 包裹）；
- `rewriteMarkdownArtifactImageSources`：把 ref 改写成 `/__knorvia_artifact_image__/<encodeURIComponent(ref)>`；
- `decodeMarkdownArtifactImageSource`：仅当解码结果是合法 artifact URI 时返回 ref，否则 `null`。
- 错误语义：不抛错；畸形百分号编码返回 `null`。纯函数；幂等；无资源；无状态；无日志。

### B40 会话创建遥测（`sessionCreateTelemetry.ts`）

- 输出：
  - `sessionCreateTelemetrySchema` strict：`elementName:"session_create"`、`eventRegion:"app"`、
    `eventType:"result"`、talkId/messageId 1–512、context strict、`eventExtraDetail` strict：
    `create_source: group|project|session`、`client_kind:"mobile"`、
    `workspace_kind: local|remote`、`remote_kind: ""|ssh|wsl|docker|server`；
  - `automationSessionCreateTelemetrySchema` 扩展：`create_source: automation_idle|automation_scheduled`、
    `client_kind:"desktop"`。
- 错误语义：`safeParse` 失败。纯解析；幂等；无资源；无状态；无日志。

---

## A. auth/model/provider（B41–B49）

### B41 官方 MCP 认证常量与保留头（`official-mcp-auth.ts`）

- 输出：
  - `OFFICIAL_MCP_AUTH_HEADER_NAMES` 5 项：
    `authorization→Authorization`、`codingPlanAuthorization→X-Bigmodel-Authorization`、
    `targetType→Bigmodel-Target-Type`、`organization→Bigmodel-Organization`、`project→Bigmodel-Project`；
  - `OFFICIAL_MCP_AUTH_META_KEY = "com.knorvia-studio/official-mcp-auth"`；
  - `OFFICIAL_MCP_RESERVED_HEADER_NAMES` 8 项小写：上述 5 项 + `x-coding-plan-api-key`、
    `mcp-session-id`、`mcp-protocol-version`；
  - `findOfficialMcpReservedHeaders(headers)`：键 trim + lowercase 后命中即收集，返回**原始键名**、
    按保留名单顺序的稳定结果；`undefined` → `[]`；
  - `isOfficialMcpReservedHeaderName(name)`：trim + lowercase 精确匹配。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B42 官方 MCP 身份摘要（`official-mcp-auth.ts`）

- 输入：`summarizeOfficialMcpIdentityHeaders(headers)`。
- 输出：只读取 organization/project/targetType 三个头（大小写不敏感），返回固定键序摘要；
  其它头忽略；缺省不产生键。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B43 官方 MCP 来源信任（`official-mcp-auth.ts`）

- 输入：`isOfficialMcpOriginTrusted({origin, pluginId, knorviaApiOrigin?, devTrustedOriginsRaw?})`、
  `createOfficialMcpTrustedOriginRegistry({resolveKnorviaApiOrigin, devTrustedOriginsRaw?})`。
- 输出：
  - origin trim 后非空且可解析，否则 `{trusted:false, detail:"invalid_input"}`；
  - 回环（localhost/127.0.0.1/[::1]）origin：必须与 dev 白名单逐项规范化后**精确**匹配，否则 mismatch；
  - https origin：与 `knorviaApiOrigin` 的 origin 比较（忽略 path），相等才 trusted；
  - `knorviaApiOrigin` 缺失/非法 → `{trusted:false, detail:"knorvia_origin_unresolved"}`；
  - registry 解析 API origin 抛错/返回 undefined → unresolved；命中返回 `{trusted:true, detail:"ok"}`。
- 错误语义：不抛错；返回结构化 detail。registry 短 IO/异步；幂等（同一 origin 结果稳定）；无资源；无状态；无日志。

### B44 官方 MCP 工具错误（`official-mcp-tool-error.ts`）

- 输入：`parseOfficialMcpToolError(text)`。
- 输出：仅 strict JSON 对象且 `error_code` 为 `quota_exceeded` 或 `coding_plan_required` 时返回
  `{code, message?, requestId?}`（message/request_id trim 后非空才保留）；其余（数组、前缀文本、未知码、
  额外键、非法 JSON）返回 `null`。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B45 OAuth 与凭据解密错误（`oauth.ts`）

- 输出：`BIGMODEL_PROVIDER_ID="bigmodel"`、`ZAI_PROVIDER_ID="zai"`、
  `CREDENTIAL_DECRYPT_ERROR_PREFIX="凭据解密失败："`、
  `CREDENTIAL_DECRYPT_ERROR_CODE="KNORVIA_CREDENTIAL_DECRYPT_FAILED"`；
  `isCredentialDecryptError(value)`：先看 `code`，再看 `message` 是否包含前缀；两者命中即 true。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

### B46 模型配置 schema（`model-config.ts`）

- 输出：
  - 顶层 `modelConfigDataSchema` 宽容：所有已知字段可选，未知键允许；
  - complete 系列（properties/inputFormat/outputFormat/optionSpecs/limit/enum）strict：
    inputFormat 五布尔必填、outputFormat `supportsText` 必填、properties 各布尔与 contextWindow 规则、
    optionSpecs 的 reasoningLevel（values 非空、map 非空）与 maxOutputTokens（max 正数、map 非空）；
  - `enumOptionSpecDataSchema`：values 非空字符串数组（可重复）、map 非空；
  - 14 个运行时 schema 都从 `@knorvia/shared/model-config` 入口导出。
- 错误语义：`safeParse` 失败。纯解析；幂等；无资源；无状态；无日志。

### B47 模型执行选择（`model-execution.ts`）

- 输出：`modelExecutionSchema` 接受 `{selectionScope:"execution"|"session"}`；
  `requestAuth.apiKey` 允许空串；其它 scope 拒绝。
- 错误语义：`safeParse` 失败。纯解析；幂等；无资源；无状态；无日志。

### B48 Provider 供给（`provider-provisioning.ts`）

- 输出：
  - `isProviderProvisioningAccountCredentialKey(key)`：正则 `^account-provider:.+:api-key$`，**不 trim**；
  - trigger 5 值：`environment-online`、`personal-config`、`configured-default`、`account-settings`、`credential`；
  - scope 2 值：`oauth-session`、`account-provider`；
  - envelope strict：`{schemaVersion:1, syncId 非空, personalConfig, accountSettings, credentials[]}`；
    personalConfig 与 accountSettings 各自 strict，result schema 同。
- 错误语义：`safeParse` 失败。纯解析；幂等；无资源；无状态；无日志。

### B49 套餐身份快照（`plan-identity.ts`）

- 输入：`resolvePlanIdentitySnapshot({providerFamilyDomain, codingPlanEntitlement, startPlanEntitlement,
now, entitlementCacheTtlMs})`。
- 输出：
  - coding plan：新鲜（now - generatedAt ≤ TTL）且 authenticated 且 quota → `planStatus:"coding_plan"`；
  - coding plan 为新鲜 `unavailableReason:"no_plan"` → `planStatus:"no_plan"`；
  - coding plan 未知（缺字段/过期/未认证）→ `planStatus:"unknown"` 且**短路**，不看 start plan；
  - coding plan 缺失/过期且无 unknown 短路时，start plan 新鲜且 authenticated → `planStatus:"start_plan"`，
    `planProductId = subscription.details[0].productId ?? ""`；
  - 其它 → `planStatus:"unknown"`；
  - 结果固定 `{generatedAt, planStatus, planProductId}`，`generatedAt` 取决策依据的时间。
- 错误语义：不抛错。纯函数；幂等；无资源；无状态；无日志。

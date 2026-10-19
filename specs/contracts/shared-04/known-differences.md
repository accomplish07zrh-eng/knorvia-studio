# shared-04 已知差异（v1）

替代路径：`specs/contracts/shared-04/README.md`。本文件是**替换阶段的红线清单**——
列出「新旧实现即使正确也必然不同」的差异面，以及「必须逐字保持」的取值面。

## 1. 预登记差异（允许的实现层差异）

| 面              | 旧实现                   | 新实现（要求）                           | 金样/断言口径                           |
| --------------- | ------------------------ | ---------------------------------------- | --------------------------------------- |
| 文件布局        | 44 个文件单模块组织      | 允许内部重组（拆合模块、重命名私有助手） | 模块路径与导出名不变（interface.md §3） |
| 注释与命名      | 旧注释/局部命名          | 全部自写、与旧不同                       | 相似度两门 < 阈值（替换阶段）           |
| 私有实现        | 旧内部结构               | 自由重写                                 | 只有公开导出面 + 金样受约束             |
| schema 构造     | 逐文件独立 zod 构造      | 允许共享 schema/helper                   | safeParse 结论逐例一致（fixtures）      |
| 错误对象        | 个别 `Error` 实例/字符串 | 允许用同 code/message 的新错误对象       | 断言只看 code/message 或返回值          |
| 剪贴板/URL 实现 | `new URL`/正则混合       | 允许改用等价标准库                       | 输出逐字一致（fixtures）                |

## 2. 必须逐字保持（红线清单，测试即守门）

### 2.1 remote/network（B1–B11）

1. `endpointHostname`：仅 `http:`/`https:`；输出 `url.hostname`（小写）；其余（含 `ftp:`、裸主机、空串、非字符串）返回 `""`。
2. `intranetDefaults`：环境变量名 `INTRANET_MACHINE_HOST`、`KNORVIA_DEPS_BASE_URL`；
   资产端口 `12345`、探测端口 `3850`、探测路径 `/api/intranet/probe`；
   `INTRANET_MACHINE_HOST` 默认 `""`；deps URL 去尾部斜杠；缺参抛
   `Configure KNORVIA_DEPS_BASE_URL or INTRANET_MACHINE_HOST in .env before downloading internal dependencies`。
3. identity 文法（构造 + 解析同源）：
   - SSH `remote:ssh:<host 小写>:<port|22>:<user>:<path>`；
   - WSL `remote:wsl:<distro|default>[:<user>]:<path>`（`user` 非空才出现）；
   - Docker `remote:docker:<container>:<path>`；
   - 路径 `\`→`/`、折叠空段、强制前导 `/`；解析只返回 `{kind, workspacePath}`，路径从首个 `/` 起保留冒号与换行；
   - 非法/非远程 identity 返回 `null`。
4. `remoteUsageTelemetry`：identity trim 非空或 remoteSessionId trim 非空 ⇒ `workspace_kind:"remote"`；
   `remote_kind` 取解析结果（ssh/wsl/docker），解析失败为 `""`；
   错误分类优先序 auth → deploy → host_start → attach → relay → connect → unknown；
   连接结果遥测信封字面量与字段名不改。
5. `remoteAppConfig`/`helpAppConfig`：`feedback_url`/`feedback_api_base` 只接受 trim 后非空字符串；
   `feedback_use_external_form` 仅 `true`/`"true"`；显式 false 不得回退本地；
   `community_urls` 只读 `zh-CN`/`en-US`；远端键优先；`forceUpdate.minimalVersion` trim 后非空。
6. `server-remote`：`SERVER_REMOTE_PROTOCOL_VERSION = 1`；info/hostCapability/workspace 三个 schema 均 strict，
   `capabilities.desktopContinuous`/`websocketRpc` 必填。
7. `openrouter-attribution`：仅 https 且 host 为 `openrouter.ai` 或 `*.openrouter.ai`；
   `X-OpenRouter-Title: Knorvia Studio`、`X-OpenRouter-Categories: programming-app`；已有同名头不覆盖。
8. `wslUserValidation`：trim 后长度 1–64；拒绝 `[\u0000-\u001f\u007f:/\\]`；schema 额外允许空串。

### 2.2 plugins/mcp（B12–B18）

9. canonical 名：按 `[-_]+` 分词；`aws`→`AWS`、`mcp`→`MCP`、`knorvia`→`Knorvia Studio`；其余词首字母大写。
10. 本地化文本：先精确 `locale`，再语言前缀；无匹配回退 base；blank 值不采用。
11. 官方市场 id `knorvia-plugins-bundled`；默认启用 10 个 id（含 `node-repl-host@…`，不含 `computer-use@…`）；
    公开市场段只含官方 id。
12. `pluginStoreOrder`：`code`/`work` 独立 `.catch(undefined)`；错误模式不污染另一模式；
    列表 trim、非空、去重保序；非法根返回 `null`。
13. `pluginStoreOrdering`：分类序 `productivity, developer-tools, utilities, finance, legal, template`；
    `guides`→`utilities`；未知分类归 `other` 且排最后；
    文档插件 rank：pdf 0、presentations 1、spreadsheets 2、documents 3、其它 4；
    之后按 displayName（localeCompare）与原序。
14. `skill-scan-policy`：`SKILL.md`；最大深度 8；排除目录 12 个：
    `.cache .next .turbo .venv __pycache__ build coverage dist node_modules out target vendor`；
    隐藏目录仅 `.system` 允许下钻。
15. `mcp`：`getMcpServerRequestHeaders` 取 `headers ?? http_headers`；
    CUA 命令/包名候选：`cua`、`cua[`、`cua@`、`cua==`、`cua.`（下划线先换连字符）；
    转换判别 stdio/http、Windows `cmd /c` 解包、OAuth 接受规则、timeoutMs 正整数、隔离/协议白名单。

### 2.3 config/UI（B19–B28）

16. `clientConfig`：信封 `{code:0,data:{configs:{pluginStoreOrder?}}}`；非法响应抛
    `Invalid public client config response`；未知 configs 键忽略。
17. `dynamic-workflow-feature`：模式 `disabled|onDemand|alwaysOn`；env `KNORVIA_DYNAMIC_WORKFLOW_MODE`；
    覆盖序 env > remote 有效值 > 默认 `disabled`；缺 remote 键 = `disabled`。
18. `app-runtime-preferences`：广播频道 `settings:app-runtime-preferences`；
    env `KNORVIA_E2E_ASK_USER_QUESTION_CLOCK_SCALE`；
    payload strict，`askUserQuestionAutoResolutionEnabled` 必填，`modelIoFullRetentionEnabled` 默认 false。
19. `e2e-test-bridge`：`VITE_KNORVIA_E2E_STORE_BRIDGE` 必须恰为 `"1"` 且 `KNORVIA_E2E_RUN_ID` trim 非空。
20. `launchMarks`：查询键 `knorviaLaunchMarks`；序列化为四字段 JSON；解析要求四项都是有限数字。
21. `desktopMenu`：50 个消息 id；`zh-CN`/`en-US` 两套完整文案；未知 locale 回退 `zh-CN`；
    `{name}` 用 replaceAll。
22. `serviceAuthority`：env `KNORVIA_SERVICE_AUTHORITY_MODE`；
    模式 `desktop-local|desktop-attached-remote|standalone-server`；
    非法值原样放进 `invalidRawValue`；provider registry 来源除 `desktop-attached-remote` 外均启用。
23. `update`、`remote-sync`、`intranetProbe`：纯类型模块，不得新增运行时导出。

### 2.4 feedback/onboarding（B29–B31）

24. 反馈模块 12 项与序（Plugin / MCP、Agent任务执行失败、模型配置 / API Key、模型调用报错、
    权限 / 配置保存、SSH连接失败、WSL连接失败、UI布局 / 交互、模型响应慢 / 额度、
    崩溃 / Internal Error、文档 / 使用咨询、其它）。
25. 类型 4 项（bug/usage/feature/performance，中文标签见 fixture）；严重度 `P1-高/P2-中/P3-低`；
    框架 `agent`，UI sentinel `none`，框架选项标签 `Knorvia Studio Agent`。
26. 脱敏：`[REDACTED]`、`[USER_PATH]`、`[EMAIL]`；
    敏感键（password/secret/token/apikey/authorization/cookie/credential 等）始终脱敏；
    诊断键（content/messages/prompt/request/response/body/payload/input/output/env/headers 等）仅 diagnostic；
    Authorization/Cookie/Set-Cookie、私钥块、Bearer 全脱敏；URL 用户名/密码/query/hash 清空，
    敏感路径段（reset/invite/download/signature/webhook 等）改成 `/[REDACTED]`；嵌套深度上限 32。
27. `onboardingRecord`：文件 version 1、deviceMid 非空、entries 数组；
    entry `userId` 非空或 null；occupation 非空或 null；interfaceMode `coding|office|null`；
    布尔可空；`uploadState` 只能是 `pending`。

### 2.5 diagnostics/telemetry（B32–B40）

28. `database-startup`：14 个错误码与 6 个 phase 逐字；
    errcode 取低 8 位：13→storage_full、3/8→permission_denied、10→io、7→out_of_memory、11/26→corrupt，
    14→open_failed、5→lock_timeout；系统码 ENOSPC/EDQUOT、EACCES/EPERM、EIO、ENOMEM、ERR_WORKER_OUT_OF_MEMORY；
    遍历 cause 最多 12 层；details 保留最后一次合法 sqliteCode/systemCode/migrationId；
    `starting_services` 与 corrupt/checksum_mismatch/newer_database/transport_closed/startup_status_timeout/unsupported_runtime 不可重试。
29. `memoryDiagnostics`：常量 60000/0.05/0.1/300000；首样本 `first`；计数器变化 `changed`；
    内存增量严格大于 `max(before,1)*ratio`；心跳；registry 键 `name.key`，非有限值丢弃，provider 抛错隔离，
    dispose 只移除同一 provider。
30. `localTtft`：6 stages、15 buckets、7 个 preparation stages、maxDetails 64、pending 128、
    TTL 300000、clock error TTL 60000、clock error max 10；
    校准 `network = end-start-(sentAt-receivedAt)`、偏移 `(start+end-receivedAt-sentAt)/2`、误差 `network/2`；
    所有 schema strict 且 `end ≥ start`。
31. `session-debug`：上限 200/100/2000；`calculateOutputTps` 仅在 outputTokens 有限 ≥0 且 duration 有限 >0 时返回比值。
32. `rendererActionTrace`：服务名 `knorvia-desktop-renderer`、采样上限 0.2、批量 32 spans / 262144 bytes；
    组 6 值；traceId 32 hex、spanId 16 hex；span `end ≥ start`；批次 rendererInstanceId 与 resource 一致。
33. `lineChangeStat`：按 `\n` 切逻辑行，去掉末尾单个空行；公共前后缀 trim；`\r` 保留在行内；
    相同行用 LCS 计数；乘积超过 400000 时返回跨度；尾部 LF 不计。
34. `markdown-artifact-images`：只处理反引号/波浪线 fence 之外的 `knorvia-artifact://` 图片；
    重写为 `/__knorvia_artifact_image__/<encodeURIComponent(ref)>`；解码要求 `isArtifactUri`。
35. `sessionCreateTelemetry`：手机 schema `client_kind:"mobile"`，自动化 schema `client_kind:"desktop"` 且
    `create_source` 仅 `automation_idle|automation_scheduled`；两者均 strict。

### 2.6 auth/model/provider（B41–B49）

36. `official-mcp-auth`：头名映射 5 项；保留头 8 项（小写）；
    `official_auth_unavailable`、`official_auth_plan_required`，端口失败理由再加 `official_mcp_origin_untrusted`；
    身份摘要只保留 organization/project/targetType；
    来源信任 detail：`ok`/`invalid_input`/`origin_mismatch`/`knorvia_origin_unresolved`；
    回环 origin 只在 dev 白名单精确匹配；https origin 比较忽略 path；registry 解析失败 → unresolved。
37. `official-mcp-tool-error`：只接受 strict JSON 对象，`error_code` 仅
    `quota_exceeded`/`coding_plan_required`；message/request_id trim；其余返回 null。
38. `oauth`：provider id `bigmodel`/`zai`；解密错误 code `KNORVIA_CREDENTIAL_DECRYPT_FAILED`、
    文案前缀 `凭据解密失败：`；code 优先、message 回退。
39. `model-config`：顶层 schema 宽容（可选字段）；complete 系列 strict；
    enum 选项 values 非空、map 非空；limit 选项 max/map 规则。
40. `model-execution`：`selectionScope` 仅 `execution|session`；`requestAuth.apiKey` 允许空串。
41. `provider-provisioning`：凭据键正则 `^account-provider:.+:api-key$`（不 trim）；
    trigger 5 值（environment-online/personal-config/configured-default/account-settings/credential）；
    scope 2 值（oauth-session/account-provider）；信封 strict。
42. `plan-identity`：coding plan active 状态优先；unknown 短路；TTL 外 start plan 生效；
    stale/no-plan 语义与 `subscription.details[0].productId` 取值不变。

## 3. 平台边界

- 路径类（B4/B5/B11/B39/B46）：Windows `\`、盘符、UNC 与 POSIX 双语义已入金样与断言；
- `localeCompare` 排序（B15）受运行环境 locale 影响，断言用金样（en-US）；
- `new URL` 的 hostname 小写与 IPv6 括号行为按 Node 标准库（B1/B10/B30）；
- 文件/网络 IO：本包无长驻句柄；纯函数与短解析为主。

## 4. 不在此列

协议常量/字段/数据格式：**一字不改**（本包 schema 全部是 wire 契约，strict 面未知字段即拒）；
金样文件内容（fixtures/\*.json）：替换阶段只读不改。

# shared-04 接口面（interface.md）

本文件列出 44 个模块路径的**兼容所需**信息：模块路径、公开入口、导出面来源。
它是相似度声明模式（`--declaration --interface <本文件>`）的剔除依据，也是替换阶段
「导出集合与附录一致」脚本比对的口径。逐文件完整导出清单（机器生成）见
[`interface-appendix.md`](interface-appendix.md) / [`interface-appendix.json`](interface-appendix.json)。

## 1. 公开入口（实测口径）

`packages/shared/package.json` 的 `exports` 是正式入口面；44 件按入口分五类：

| 入口类                                | 文件                                     | 说明                                                            |
| ------------------------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| 根 barrel `@knorvia/shared`           | 38 件（除下列四项与纯类型件外）          | `index.ts` 再导出可达；测试逐名断言                             |
| 子路径 `@knorvia/shared/model-config` | `model-config`                           | 14 个运行时 schema 只经此入口                                   |
| 子路径 `@knorvia/shared/mcp`          | `mcp`                                    | 同时经根桶可达                                                  |
| 子路径 `@knorvia/shared/node`         | `node`                                   | 再导出 `./node/*`（shared-01 实现）的 10 个运行时值；根桶也可见 |
| 协议/内部消费                         | `model-execution`                        | 仅 `packages/shared/src/protocol*` 内部消费；不进根桶           |
| 纯类型（无运行时）                    | `update`、`remote-sync`、`intranetProbe` | 只提供类型；模块路径仍是兼容面                                  |

**实测修正**：`node.ts` 的运行时值是具名再导出，机器附录把它们放在 `reexportNamed`
而不是 `runtime`；`surface.test.mjs` 合并两者后比对。

## 2. 模块路径面（44 个）

`packages/shared/src/<相对路径>.ts` 与 `dist/<相对路径>.js` 两侧替换后必须仍然存在
（内部怎么拆由替换 Agent 定，路径上的导出面必须保持）。

| 组                    | 文件                                                                                                                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| remote/network        | `endpointHostname.ts`、`intranetDefaults.ts`、`intranetProbe.ts`、`remote-workspace-identity.ts`、`remoteUsageTelemetry.ts`、`remoteAppConfig.ts`、`helpAppConfig.ts`、`server-remote.ts`、`openrouter-attribution.ts`、`wslUserValidation.ts`、`remote-sync.ts` |
| plugins/mcp           | `plugin-display-name.ts`、`plugin-marketplaces.ts`、`pluginStoreOrder.ts`、`pluginStoreOrdering.ts`、`skill-scan-policy.ts`、`mcp.ts`                                                                                                                            |
| config/UI             | `clientConfig.ts`、`dynamic-workflow-feature.ts`、`app-runtime-preferences.ts`、`e2e-test-bridge.ts`、`launchMarks.ts`、`desktopMenu.ts`、`serviceAuthority.ts`、`update.ts`、`node.ts`                                                                          |
| feedback/onboarding   | `feedback.ts`、`feedbackPrivacy.ts`、`onboardingRecord.ts`                                                                                                                                                                                                       |
| diagnostics/telemetry | `database-startup.ts`、`memoryDiagnostics.ts`、`localTtft.ts`、`session-debug.ts`、`rendererActionTrace.ts`、`lineChangeStat.ts`、`markdown-artifact-images.ts`、`sessionCreateTelemetry.ts`                                                                     |
| auth/model/provider   | `official-mcp-auth.ts`、`official-mcp-tool-error.ts`、`oauth.ts`、`model-config.ts`、`model-execution.ts`、`provider-provisioning.ts`、`plan-identity.ts`                                                                                                        |

## 3. 导出面规则

1. **名字集合不变**：每模块导出名（运行时 + 纯类型）与 `interface-appendix.json` 逐名一致；
   替换阶段用脚本比对，不靠目测。总量：**运行时 204 项 / 纯类型 152 项**。
2. **运行时值取值不变**：`behavior.md` B 条目「语义常量（逐字冻结）」清单 + 金样（fixtures）双重锁定。
3. **签名不变**：参数顺序、返回类型、抛错语义不变（behavior 单列的除外）。
4. **纯类型 152 项**：靠 `pnpm typecheck` 与本附录守住；替换后类型面必须仍可编译出同样消费方式。
5. **具名再导出**：`node.ts` 的 10 个运行时值与 3 个类型经 `./node/*` 再导出；再导出路径与名字同样是兼容面。
6. **schema 对象本身是运行时值**：zod schema 的 `safeParse` 接受/拒绝结论由金样锁定，内部构造可重写。
7. 声明模式相似度：以上名字（含再导出）即剔除清单；剔除后残留按行/结构两道门槛计分。

## 4. 纯数据常量表（声明模式计分）

键名与取值由合同写死的纯数据表集中放在 `<原模块名>-data.ts`；原模块 import 后，属于公开面的
常量按原样再导出，仅内部使用的常量不再导出（导出面仍以 §3 与机器附录为准）。
下列常量名是这些数据文件的全部声明，也是 `--declaration` 计分的剔除清单；数据文件内不得出现
函数、条件、计算、split、展开或模板插值。取值按 B 条目逐字冻结，此处只登记名字与条目数。

### `packages/shared/src/localTtft-data.ts`

- `LOCAL_TTFT_STAGES`：6 段流水线，顺序即因果顺序
- `LOCAL_TTFT_PREPARATION_STAGES`：7 个请求准备子步骤，按执行顺序
- `LOCAL_TTFT_BUCKETS_MS`：15 个分桶上界，1…300000 毫秒
- `LOCAL_TTFT_MAX_DETAILS`：64
- `LOCAL_TTFT_MAX_PENDING`：128
- `LOCAL_TTFT_TTL_MS`：300000
- `LOCAL_TTFT_CLOCK_MAX_ERROR_MS`：10
- `LOCAL_TTFT_CLOCK_TTL_MS`：60000
- `LOCAL_TTFT_DETAIL_EXTRA_STAGES`：3 个额外阶段
- `NORMALIZED_ID_FIELDS`：9 个归一化标识字段名
- `DETAIL_OUTCOMES`：4 个取值
- `DETAIL_ROLES`：2 个取值
- `OBSERVATION_SOURCES`：2 个取值
- `OUTPUT_KINDS`：3 个取值
- `SEND_MODES`：3 个取值
- `TERMINAL_OUTCOMES`：5 个取值
- `EXCLUSION_REASONS`：5 个取值
- `ALIGNED_SOURCES`：3 个取值
- `RECORD_KINDS`：6 个取值
- `RECORD_OUTCOMES`：16 个取值
- `RECORD_QUALITIES`：3 个取值
- `VISIBILITY_STATES`：3 个取值

### `packages/shared/src/pluginStoreOrdering-data.ts`

- `FALLBACK_PLUGIN_STORE_CATEGORY`：other
- `PLUGIN_STORE_CATEGORY_ORDER`：6 个分类，按默认展示顺序
- `LEGACY_CATEGORY_ALIASES`：1 条迁移，guides 归入 utilities
- `DOCUMENT_PLUGIN_SLUGS`：4 个文档类插件短名，按优先级

### `packages/shared/src/skill-scan-policy-data.ts`

- `SKILL_FILE_NAME`：SKILL.md
- `MAX_SKILL_SCAN_DEPTH`：8
- `SKILL_SCAN_EXCLUDED_DIRECTORY_NAMES`：12 个跳过目录名
- `SKILL_SCAN_DOT_DIRECTORY_ALLOWLIST`：1 个放行的点目录

### `packages/shared/src/official-mcp-auth-data.ts`

- `OFFICIAL_MCP_AUTH_HEADER_NAMES`：5 条逻辑名 → 真实头名，顺序即登记顺序
- `OFFICIAL_MCP_SESSION_HEADER_NAMES`：3 个只能由框架写入的会话/协议头
- `OFFICIAL_MCP_AUTH_FAILURE_REASONS`：2 个通用失败原因
- `OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS`：3 个端口层失败原因
- `OFFICIAL_MCP_LOOPBACK_HOSTS`：3 个回环主机名

### `packages/shared/src/provider-provisioning-data.ts`

- `PROVIDER_PROVISIONING_TRIGGERS`：5 个触发来源
- `PROVIDER_PROVISIONING_CREDENTIAL_SCOPES`：2 个凭据范围
- `PROVIDER_PROVISIONING_RESULT_STATUSES`：5 个回执终态
- `PROVIDER_PROVISIONING_FAMILY_DOMAINS`：2 个 Provider 域

### `packages/shared/src/rendererActionTrace-data.ts`

- `RENDERER_ACTION_TRACE_SERVICE_NAME`：knorvia-desktop-renderer
- `RENDERER_ACTION_TRACE_MAX_SAMPLE_RATIO`：0.2
- `RENDERER_ACTION_TRACE_MAX_BATCH_SPANS`：32
- `RENDERER_ACTION_TRACE_MAX_BATCH_BYTES`：262144
- `RENDERER_ACTION_TRACE_GROUPS`：6 个目录分组，按采样配置顺序
- `RENDERER_ACTION_TRACE_RESULT_SOURCES`：6 个结果来源
- `RENDERER_ACTION_TRACE_STATE_AFTER`：2 个动作后状态
- `RENDERER_ACTION_TRACE_WORKSPACE_KINDS`：2 个工作区类型
- `RENDERER_ACTION_TRACE_REMOTE_KINDS`：4 个远程连接类型
- `RENDERER_ACTION_TRACE_ADMISSION_RESULTS`：6 个准入结果
- `RENDERER_ACTION_TRACE_AUTOMATION_KINDS`：2 个自动化类型
- `RENDERER_ACTION_TRACE_OPERATION_KINDS`：5 个操作种类
- `RENDERER_ACTION_TRACE_TRIGGERS`：7 个触发方式
- `RENDERER_ACTION_TRACE_OUTCOMES`：6 个动作结果
- `RENDERER_ACTION_TRACE_SPAN_STATUSES`：3 个 span 状态
- `RENDERER_ACTION_TRACE_DEPLOYMENT_ENVIRONMENTS`：3 个部署环境
- `DISABLED_RENDERER_ACTION_TRACE_CONFIG`：关闭采样时的 4 字段固定配置

## 5. 不在本包的相邻面

`index.ts` 根 barrel（shared-04 末批）；`node/**`、`protocol-v4/**`（shared-01）；shared-02 的 58 件；
shared-03 的 34 件；`unreviewed` 21 件（M0-2/M0-3 口径，不入本包）。

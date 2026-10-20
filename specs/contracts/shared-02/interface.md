# shared-02 接口面（interface.md）

本文件列出 `packages/shared/src` 58 个继承文件（本包范围）的**兼容所需**信息：
模块路径、公开入口、导出面来源。它是相似度声明模式
（`node scripts/provenance/similarity.mjs --declaration --interface <本文件>`）的剔除依据，
也是替换阶段「导出集合与 interface.md 完全一致」脚本比对的口径。

逐文件完整导出清单（机器生成）见 [`interface-appendix.md`](interface-appendix.md) /
`interface-appendix.json`；本文件只写人要读的骨架与规则。

## 1. 公开入口

| 入口                                     | 源文件                                          | dist 文件（`tsc -b packages/shared` 产物）       |
| ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| `@knorvia/shared`（根 barrel）           | `packages/shared/src/index.ts`                  | `packages/shared/dist/index.js`                  |
| `@knorvia/shared/runtime-env`            | `packages/shared/src/runtimeEnv.ts`             | `packages/shared/dist/runtimeEnv.js`             |
| `@knorvia/shared/model-selection`        | `packages/shared/src/model-selection.ts`        | `packages/shared/dist/model-selection.js`        |
| `@knorvia/shared/account-provider-state` | `packages/shared/src/account-provider-state.ts` | `packages/shared/dist/account-provider-state.js` |
| `@knorvia/shared/config-schema`          | `packages/shared/src/config-schema.ts`          | `packages/shared/dist/config-schema.js`          |

- 根 barrel `index.ts` **文件本身不属本包**（归属后续 shared-04），但本包 58 个文件的
  运行时导出中除下述两个例外都经它 re-export 可达；替换阶段不得改变这一可达性（B49/B50）。
- 两个例外：
  - `sparseShape`（`config-schema.ts`）：走 `@knorvia/shared/config-schema` 子路径；
  - `integratedTerminalShellSelectionSchema`（`validationAppSettings.ts`）：仅包内消费
    （`validation.ts` 与 `protocol/index.ts`），无公开入口，仍须保留在模块路径上（B51）。

## 2. 模块路径面（58 个）

模块路径是跨包兼容面的一部分：替换后 `packages/shared/src/<相对路径>.ts` 与
`packages/shared/dist/<相对路径>.js` 必须仍然存在（内部文件怎么拆由替换 Agent 定，
但这些路径上的导出面必须保持）。逐路径清单见 `scope-files.json` 的 `files[].path`
（不含已删除的两个 coding plan 残留）。

按功能分组：

| 组             | 文件（`packages/shared/src/` 下）                                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 标识/错误/日志 | `uuid.ts`、`errors.ts`、`log-format.ts`、`api.ts`、`forceUpdate.ts`、`settings-errors.ts`、`version.ts`                                                                                                                                                                                                                                          |
| 运行时环境     | `env.ts`、`runtimeEnv.ts`                                                                                                                                                                                                                                                                                                                        |
| 校验 schema    | `validation.ts`、`validationAppSettings.ts`、`config-schema.ts`、`providers.ts`、`provider-family-connection-selection.ts`、`account-provider-state.ts`、`model-selection.ts`                                                                                                                                                                    |
| 协议类型与常量 | `protocol.ts`、`channels.ts`、`handshake.ts`、`storage.ts`、`platform.ts`、`media-preview.ts`、`test-ids.ts`、`test-ids-workflow.ts`、`telemetry.ts`、`telemetryRedaction.ts`                                                                                                                                                                    |
| 模型供应商     | `model-provider-types.ts`、`model-provider-family.ts`、`model-selection-types.ts`、`model-selection-key.ts`、`custom-model-value.ts`、`legacy-model-provider-identity.ts`、`official-glm-model-id.ts`                                                                                                                                            |
| 远程连接       | `remoteTarget.ts`、`remoteSshHostKey.ts`、`remoteEnvironmentKey.ts`、`remoteAssetInstallMode.ts`、`remoteResourcePackages.ts`                                                                                                                                                                                                                    |
| 领域类型       | `task-realtime.ts`、`automation-types.ts`、`off-peak-types.ts`、`subagents-types.ts`、`command-types.ts`、`hooks.ts`、`git.ts`、`settings-source.ts`、`settings-sync.ts`、`skills-types.ts`、`skill-sync.ts`、`plugin-types.ts`、`plugin-sync.ts`、`mcp-sync.ts`、`cuaAccessibilitySettings.ts`、`workspacePurpose.ts`、`sessionCreateSource.ts` |
| 用量统计       | `usage-stats.ts`、`usage-quota.ts`                                                                                                                                                                                                                                                                                                               |
| 其它           | `shortcutCommands.ts`                                                                                                                                                                                                                                                                                                                            |

## 3. 导出面规则

1. **名字集合不变**：每个模块路径上的导出名（运行时值 + 纯类型）与
   `interface-appendix.md` 完全一致；替换阶段用脚本比对，不靠目测。
2. **运行时值的取值不变**：常量表、枚举字面量、错误码、环境变量名、频道名、
   testid、URL、分隔符逐字节不变（各条目见 `behavior.md`）；schema 的
   strictness/字段名/默认值不变。
3. **签名不变**：函数的参数顺序、返回类型、抛错语义不变（`behavior.md` 单列的除外）。
4. **纯类型 456 项**：`type/interface` 无运行时值，靠 `pnpm typecheck` 与本附录守住；
   替换后类型面必须仍可编译出同样的消费方式。
5. 声明模式相似度计算时，以上名字（含再导出）即剔除清单；剔除后残留行按
   行/结构两道门槛计分（见 `README.md` 第九节计分口径）。

## 4. 不在本包的相邻面

- `packages/shared/src/index.ts`（根 barrel 文件）→ shared-04。
- `packages/shared/src/node/**`、`protocol-v4/**` → shared-01（已合并，合同
  `specs/contracts/shared-01/`）。
- `packages/shared/src/browser-use/**`、`endpoint.ts`、`mcp.ts`、`oauth.ts`、
  `protocol/**` 等其余目录/文件 → shared-03/04。
- `packages/shared/test/**`（现有包内测试）→ 不属任何替换包，删除残留时已验证其全过。

## 5. 纯数据常量表

合同写死键名与数值的纯数据常量表按规则拆在同名声明文件 `<原名>-data.ts` 里：只放普通数组、
`z.enum([...])` 逐项一行的取值表与普通对象字面量（可 `as const`），不含函数、条件、计算、
`split`、展开或模板插值。原文件 import 这些常量，行为与导出面不变。声明模式计分时，
下列名字（连同它们所在的整块声明）按本文件剔除：

- `packages/shared/src/official-glm-model-id-data.ts`：`OFFICIAL_GLM_MODEL_ID_TABLE`
- `packages/shared/src/shortcutCommands-data.ts`：`SHORTCUT_CHANNEL_VALUES`、`SHORTCUT_SCOPE_VALUES`、
  `SHORTCUT_ROWS`、`MODIFIER_TABLE`、`KEY_ALIASES`、`NAMED_KEY_LIST`
- `packages/shared/src/runtimeEnv-data.ts`：`KNORVIA_RUNTIME_ENV_KEY`、`KNORVIA_HTTP_PROXY_ENV_KEY`、
  `KNORVIA_NO_PROXY_ENV_KEY`、`KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY`、
  `KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY`、`KNORVIA_REMOTE_NO_PROXY_ENV_KEY`、`KNORVIA_AGENT_CA_CERT_ENV_KEY`、
  `KNORVIA_TOOL_ENV_PASSTHROUGH_ENV_KEY`、`KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV`、
  `KNORVIA_CUA_PRODUCT_HELPER_ENV_KEY`、`KNORVIA_CUA_BROKER_SOCKET_ENV_KEY`、
  `KNORVIA_CUA_NODE_REPL_HOST_ENV_KEY`、`KNORVIA_CUA_DEV_MODE_ENV_KEY`、
  `KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY`、`RUNTIME_ENV_VALUES`、`CUA_DEV_MODE_TRUTHY_TOKENS`、
  `CUA_HELPER_FALSY_TOKENS`、`HOST_PROCESS_KEYS`、`TELEMETRY_STATIC_KEYS`、`REMOTE_AND_CUA_KEYS`、
  `NON_TOOL_PASSTHROUGH_KEYS`、`BROKER_REFRESH_MARKER_KEY`、`TELEMETRY_KEY_PREFIXES`、
  `TELEMETRY_SINGLETON_KEY`
- `packages/shared/src/telemetryRedaction-data.ts`：`REDACTION_LIMITS`、`LEGACY_BUILTIN_MODEL_IDS`、
  `PROVIDER_SCOPE_TABLE`、`TEXT_REDACTION_STAGES`、`SEGMENT_SENSITIVE_PATTERNS`、`HOST_LIKE_PATTERN`、
  `CONTROL_CHARS_PATTERN`、`WHITESPACE_RUN_PATTERN`、`NON_HTTP_URL_PREFIXES`、`LOCAL_PATH_PATTERNS`
- `packages/shared/src/validationAppSettings-data.ts`：`OCCUPATION_CHOICE_VALUES`、
  `LOCALE_CHOICE_VALUES`、`LOCALE_PREFERENCE_CHOICE_VALUES`、`INTERACTION_BEHAVIOR_CHOICE_VALUES`、
  `RELEASE_CHANNEL_CHOICE_VALUES`、`PROVIDER_FAMILY_DOMAIN_CHOICE_VALUES`、
  `STUDIO_FIRST_RUN_GUIDE_STATUS_VALUES`、`WORKSPACE_PURPOSE_VALUES`、`CONNECTION_STATUS_VALUES`、
  `SETTINGS_NUMERIC_BOUNDS`、`SANITIZED_FIELD_NAMES`、`MIGRATION_MARKER_FIELDS`

这些常量只在上述声明文件里定义、由原文件 import 使用，不属于 §2 的模块路径面，也不改变
§3 的导出名集合。

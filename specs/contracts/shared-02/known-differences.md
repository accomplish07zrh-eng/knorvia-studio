# shared-02 与旧实现的已知差异（合同阶段）

合同阶段**不改任何产品源码**（除了一次性的已移除功能残留删除，见第 2 节），
只新增合同产物。本文件记录「新旧实现之间被允许的差异」「必须逐字保留的部分」
以及本包观察到的旧行为特征，供替换阶段自查与审查复核。

## 1. 预登记差异：无

本合同全部 81 个用例都在旧实现上通过（源码入口与 dist 入口各 81/81，
见 `gate-old.json`），**没有**任何断言放宽或跳过，因此没有需要预登记的
「旧实现缺陷 / 有意改进」条目。若替换阶段发现某条断言确实要改，
必须先回到 `behavior.md` 升版本并重跑旧门，不得就地放宽。

## 2. 合同前的残留删除（选择 3：已移除功能直接删，单独提交，不进合同）

提交 `19230bae`（合同分支首个提交，早于本合同任何文件）删除了两个为已移除
coding plan 订阅/重置功能服务的残留模块：

| 删除文件                                          | 依据                                                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/coding-plan-reset.ts`        | 全仓（除自身与 barrel re-export）**零引用**；9 个 `CodingPlanReset*` 类型无任何消费者                                             |
| `packages/shared/src/coding-plan-subscription.ts` | 68 个导出中仅 `ForceUpdateConfig` 被 `forceUpdate.ts` 引用（type-only）；其余 67 个（订阅/支付/Stripe/Paypal/企业套餐类型）零引用 |

配套改动：

- `ForceUpdateConfig` 接口迁入唯一使用方 `forceUpdate.ts`（导出面经 barrel 不变，
  测试 `shared-error-version-config-digest-boundaries.test.mjs` 全过）。
- `index.ts` 桶删除两行 `export *`。
- 删除后 `pnpm typecheck` 0 / `pnpm lint` 0 error / `packages/shared` 全部 789 例包内测试通过。

**账号类残留（`account-provider-state.ts`）保留**：`packages/provider` 与
`packages/shared/src/protocol/index.ts` 都在消费它（`AccountProviderUnavailableReason`
四值枚举是严格协议面的一部分，改一个字旧协议帧即被拒）——按默认裁决
「不确定是否还有用 → 保留并写进合同」处理，见 B32。

## 3. 替换阶段允许改变的部分

- 模块内部组织：文件拆分、命名、常量表组织、私有辅助函数、算法实现。
- 注释与日志文案：本包不写日志（`behavior.md` 通用约定），注释可整段重写。
- `index.ts` 桶文件本身**不在本包**（归 shared-04）；本包只冻结「本包导出经
  barrel 可达」这一事实（B49），桶内部的 re-export 顺序与分组可变。

## 4. 必须逐字保留的部分（金样与断言以此为准）

1. **环境变量名**：`runtimeEnv.ts` 的 14 个 `KNORVIA_*_ENV_KEY` 常量、
   `env.ts` 的 `KNORVIA_APP_VERSION_ENV`/`KNORVIA_BUILD_COMMIT_ID_ENV`，
   以及 `SANITIZED_RUNTIME_ENV_KEYS`/`NON_TOOL_PASSTHROUGH_RUNTIME_ENV_KEYS`
   两张名单的键集合（B7/B9/B11）。
2. **错误码**：`KNORVIA_FILE_LOCK_TIMEOUT`、`DATA_BASE_DIR_FORBIDDEN_WINDOWS_INSTALL_DIR`、
   `AUTOMATION_CREATE_LIMIT_REACHED`、`SKILL_SYNC_SIZE_LIMIT_EXCEEDED`、
   `KNORVIA_AGENT_PROVIDER_NOT_READY` / `provider_not_ready`、`MCP_USAGE_LIMIT`（B3/B14/B40/B43）。
3. **协议通道名与 RPC header**：`channels.ts` 全部频道名字符串与两个
   `KNORVIA_RPC_*_HEADER`（跨进程协议面，改一个字符即断连；B47 全表快照断言）。
4. **data-testid 字符串**：`test-ids.ts` 362 项 + `test-ids-workflow.ts` 37 项
   （UI `data-testid` 与 E2E 断言依赖；B48 全量快照断言）。
5. **供应商与模型 ID**：`BUILTIN_MODEL_PROVIDER_IDS` 六值、`BUILTIN_PROVIDER_TEMPLATE_IDS`、
   `OFFICIAL_GLM_MODEL_IDS` 22 项、`OFF_PEAK_PROVIDER_IDS` 两值、
   `OFF_PEAK_TICKET_EXPIRED_MARKER = "off-peak-ticket-expired"`（跨进程错误文本标记，勿改；
   B24/B30/B41）。
6. **身份键格式**：`ssh:v1` 六元组 JSON（B35）、`wsl:`/`docker:` 环境键与 `\0` 分隔符（B36）、
   `native:`/`custom:`/`ghost:` 供应商 key 前缀与 `custom:` 模型值前缀（B26/B27）。
7. **限额与宽限类语义常量**：`TELEMETRY_TEXT_MAX_LENGTH = 2048`、扫描上限 4096、
   路由段上限 128、ghost identity 上限 160、`AUTOMATION_CREATE_LIMIT = 20`、
   `BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS = 3000`、
   `ESTIMATED_TOKEN_CHAR_DIVISOR = 3`、`KNORVIA_MODEL_REASONING_SEPARATOR = "$"`、
   `DEFAULT_LOCALE = "zh-CN"`、`STORAGE_MORE_ENTRIES_PATH = "…"`（B19/B20/B27/B40/B39/B43/B28/B46/B17）。
8. **遥测关闭事实**：`KNORVIA_TELEMETRY_ENABLED = false`、两个上报端点恒空串（B6）。

## 5. 观察到的旧行为特征（看起来奇怪，但按默认裁决「保持原样」）

| 行为                                                                         | 旧实现事实（断言为准）                                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `redactTelemetryText` **非幂等**（B19）                                      | `{redacted}` 后紧跟 `}` 时二次运行会再吃掉一个 `}`；测试按两次输出逐字断言 |
| `appSettingsSchema` / `appSettingsPatchSchema` 非 strict（B45）              | 未知键被**剥离**而不是报错                                                 |
| `normalizeRemoteResourcePackageSelection` 忽略入参（B38）                    | 恒返回 active 全集副本；历史 SSH 裁剪选择已无业务意义                      |
| `isRemoteResourcePackageSelectedAsDependency` 恒 false（B38）                | 依赖表 `REMOTE_RESOURCE_PACKAGE_DEPENDENCIES` 为空对象                     |
| `createOpenInEditorRemoteTarget` 的 username 不 trim（B39）                  | 其余字段（user/sshConfigAlias）都 trim                                     |
| `buildSshRemoteHostKey` 的 `~/../k` 归一后不变（B35）                        | `~/` 前缀保留，非锚定 `..` 不折叠出前缀                                    |
| `resolveTelemetryProviderScope` 对自定义 provider **改写 providerId**（B21） | 返回 `{providerId:"custom"}` 而不是原值（隐私收敛设计）                    |

以上均按任务书「旧行为看起来奇怪 → 保持原样」处理，**不作为缺陷登记**。

## 6. 与计划书红线的对照

- 不改用户数据格式、协议字段、`KNORVIA_` 环境变量与 `.knorvia-studio` 数据目录
  （第 4 节 1–8 项即这四类的逐字清单）。
- 金样全部由旧实现录制（临时脚本 `.scratch-exec4/s02-record-fixtures.mjs` 按 Lead 的
  临时脚本口径留在执行工作区，不入库）；`constants-snapshot.json`、
  `test-ids-snapshot.json`、`old-write/*` 均为旧实现导出值/规范化结果的直接落盘。
- 夹具只含合成数据（`/tmp/demo`、`Example.COM`、`p-1`/`o-1`/`pr-1` 等自造值），
  无凭据、无真实用户数据、无内部地址。

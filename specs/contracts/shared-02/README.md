# shared-02 合同（`packages/shared/src` 其余继承文件 · 58 个）

**合同版本：v1**（旧门基线以 [`gate-old.json`](gate-old.json) 的 `commit` 字段为准；
此后合同任何改动都要重跑旧门并升版本）

本目录是 M3 `shared-02` 的**兼容合同**：先冻结公开行为与签名，再按合同独立实现
（替换阶段见计划书「每包流程」四、五）。

- 分支：`contract/shared-02`（合同 PR 分支；工作树 `wt/exec-4-s02`，基于 main `24b9d47f`）
- 依据：《Knorvia 独立替换任务计划书》「每包流程」一～三、分包总表 `shared-02` 行、
  「M1 复盘结论与调整」（类型型包可接近 60 继承文件上限）、
  「共享、服务与服务端」区域做法
- 前包边界：`shared-01`（`node/`、`protocol-v4/`）已合并（PR #152/#160），
  **不在本包**；本包 = `packages/shared/src` 其余继承文件

## 一、范围与边界

范围 = `licensing/current-files.json` 中 `packages/shared/src`（除 `node/`、`protocol-v4/`）
的继承文件里，按依赖重切出的 **58 个**（选包 60 个减去 2 个已删除的 coding plan 残留）。

| 继承分类             | 文件数 | 本包处置                               |
| -------------------- | -----: | -------------------------------------- |
| `upstream-modified`  |     35 | 按合同重写                             |
| `upstream-unchanged` |     23 | 按合同重写                             |
| **继承文件小计**     | **58** | 类型型包，接近 60 上限（M1 复盘口径）✓ |

选包前的 60 个文件里有 2 个是已移除功能（coding plan 订阅/重置）的残留模块，
按计划书选择 3 在合同前单独删除（提交 `19230bae`，**不进合同**）：
`coding-plan-reset.ts`（全仓零引用）、`coding-plan-subscription.ts`（67/68 导出零引用）。
账号类残留 `account-provider-state.ts` 因 `packages/provider` 与 `protocol/index.ts`
仍在消费而保留进合同（B32）。详见 [`known-differences.md`](known-differences.md) 第 2 节。

逐文件清单（含分类、sha256、上游关系）见机器生成的 [`scope-files.json`](scope-files.json)。

**不在范围**：`packages/shared/src/index.ts`（根 barrel 文件，归 shared-04）；
`node/`、`protocol-v4/`（shared-01）；`browser-use/`、`endpoint.ts`、`mcp.ts`、`oauth.ts`、
`protocol/**` 等其余目录/文件（shared-03/04）；`packages/shared/test/**`（现有包内测试，
删除残留后已验证全过）。

## 二、兼容面（公开入口）

| 子路径                                   | 源文件                                          | dist 文件（`tsc -b packages/shared` 产物）       |
| ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| `@knorvia/shared`（根 barrel）           | `packages/shared/src/index.ts`（不在本包）      | `packages/shared/dist/index.js`                  |
| `@knorvia/shared/runtime-env`            | `packages/shared/src/runtimeEnv.ts`             | `packages/shared/dist/runtimeEnv.js`             |
| `@knorvia/shared/model-selection`        | `packages/shared/src/model-selection.ts`        | `packages/shared/dist/model-selection.js`        |
| `@knorvia/shared/account-provider-state` | `packages/shared/src/account-provider-state.ts` | `packages/shared/dist/account-provider-state.js` |
| `@knorvia/shared/config-schema`          | `packages/shared/src/config-schema.ts`          | `packages/shared/dist/config-schema.js`          |

本包 58 个文件的运行时导出共 **719 个**，除两个例外全部可从根 barrel 取到
（B49）；两个例外是 `sparseShape`（走 `config-schema` 子路径）与
`integratedTerminalShellSelectionSchema`（仅包内消费，走模块路径）。
逐文件完整导出清单见机器生成的 [`interface-appendix.md`](interface-appendix.md) /
`interface-appendix.json`（58 文件 / 运行时 719 / 纯类型 456）。

## 三、调用方

[`callers.md`](callers.md)：静态 import 扫描，全仓 **1,180 条「文件 × 入口」引用**——
根 barrel 1,157 个文件、`model-selection` 16、`runtime-env` 5、
`account-provider-state` 1、`config-schema` 1。替换时逐条核对导出仍然可用。

工具证据：`pnpm architecture:context shared` → `owner: unassigned / managed: false`
（无受控契约，选包核对以 `architecture:check` 全量 0 违规 + 静态 import 扫描为准）；
`pnpm dep:refs --list-exports <file>` 抽样核对（如 `uuid.ts` 2 个导出）与
`interface-appendix.json` 一致。

## 四、语义常量红线（M1 复盘教训的落实）

M1 复盘：shared-01 曾丢 `MAX_METADATA_LEEWAY_MS` 宽限常量，靠 lint 未使用告警才逮到。
本包落实：**语义常量/宽限/上限/白名单逐条进 `behavior.md` 条目 → 金样快照 → 测试对照**。
逐字清单见 [`known-differences.md`](known-differences.md) 第 4 节（8 组），
金样落在 `fixtures/constants-snapshot.json` 与 `fixtures/test-ids-snapshot.json`，
`tests/surface.test.mjs` 与 `tests/domain-constants.test.mjs` 做全表比对。

## 五、合同文件

| 文件                          | 内容                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `README.md`                   | 本文件：范围、条目 → 测试对照表、旧门结论                                        |
| `behavior.md`                 | B1–B52：输入/输出/错误语义/时序与并发/幂等/资源释放/平台差异/状态所有者/日志级别 |
| `interface.md`                | 公开入口、模块路径面、导出面规则（相似度声明模式的剔除依据）                     |
| `interface-appendix.md/.json` | 逐文件完整导出清单（机器生成，勿手改）                                           |
| `callers.md`                  | 静态 import 扫描的全量调用方                                                     |
| `tests/`                      | 8 个黑盒契约测试文件（`entry.mjs` 支持源码/dist 两入口，81 个用例）              |
| `fixtures/`                   | 旧实现录制的常量快照、test-ids 快照、旧写设置金样（`old-write/`）                |
| `stubs/`                      | 58 个继承模块的最小桩（import 即抛）+ `build-stubs.mjs` + `targets.txt`          |
| `known-differences.md`        | 预登记差异、残留删除、必须逐字保留的部分、旧行为特征                             |
| `acceptance.md`               | 验收记录：范围、旧门两入口、桩替换、门禁、未覆盖项                               |
| `gate-old.json`               | 旧门报告（`scripts/contract-gate.mjs` 生成）                                     |
| `scope-files.json`            | 58 个继承文件的机器生成清单                                                      |

机器生成器（`build-scope-files.mjs` / `build-interface-appendix.mjs` / `build-callers.mjs`）
按 shared-01 先例（其 `callers.md` 同注「生成脚本不提交」）留在执行工作区
`.scratch-exec4/`，不入库；三个产物均可由生成器重现。

## 六、条目 → 测试对照表

| 条目                        | 测试（`tests/` 下，只走公开入口）                                                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 uuidv7                   | `identity-tools.test.mjs`「B1 uuidv7：48 位时间戳前缀、版本位 7、变体位 10」                                                                                                                                                                    |
| B2 createUuid               | 「B2 createUuid：8-4-4-4-12 且版本位 4、变体位 10」                                                                                                                                                                                             |
| B3 错误归一化族             | 「B3 stringifyUnknownValue…」「B3 normalizeUnknownError…」「B3 isKnorviaFileLockTimeoutError 与错误码常量」                                                                                                                                     |
| B4 日志前缀格式             | 「B4 formatTimestamp / formatLogPrefix：固定格式与 pid 段」                                                                                                                                                                                     |
| B5 版本比较/强制升级        | 「B5 compareSemverVersions…」「B5 resolveForceUpdateRequirement…」                                                                                                                                                                              |
| B6 编译期环境身份           | `runtime-env.test.mjs`「B6 normalizeKnorviaEnv…」「B6 环境身份常量：遥测关闭与端点为空是硬事实」                                                                                                                                                |
| B7 运行时环境变量名单       | 「B7 运行时环境变量名单：14 个键名字面量」                                                                                                                                                                                                      |
| B8 运行时归一/CUA 开关      | 「B8 运行时环境归一与 CUA 开关判定」                                                                                                                                                                                                            |
| B9 环境清洗                 | 「B9 清洗判定…」「B9 sanitizeKnorviaRuntimeEnv…」「B9 sanitizeKnorviaRuntimeEnvInPlace…」                                                                                                                                                       |
| B10 凭据/遥测捕获           | 「B10 CUA broker 凭据捕获…」「B10 遥测环境读取/捕获/复位…」                                                                                                                                                                                     |
| B11 工具环境透传            | 「B11 工具透传读取…」「B11 工具透传构建…」                                                                                                                                                                                                      |
| B12 ApiError                | `identity-tools.test.mjs`「B12 ApiError：name、method 缺省 GET 且大写、字段透传」                                                                                                                                                               |
| B13 sparseShape             | `model-provider.test.mjs`「B13 sparseShape（config-schema 子路径入口）：每项 nullable+optional」                                                                                                                                                |
| B14 数据目录错误码          | `domain-constants.test.mjs`「B14 数据目录错误码判定：code 或 message 包含」                                                                                                                                                                     |
| B15 命令来源判别            | 「B15 命令来源判别」                                                                                                                                                                                                                            |
| B16 媒体预览格式            | `shortcuts-storage.test.mjs`「B16 媒体预览格式表 11 项与查找语义」                                                                                                                                                                              |
| B17 存储分类/卷分组         | 「B17 存储分类 11 项、折叠占位与卷分组」                                                                                                                                                                                                        |
| B18 遥测主机名/详情消毒     | `telemetry-redaction.test.mjs`「B18 resolveSafeTelemetryHostname…」「B18 sanitizeTelemetryErrorMessage…」「B18 collectTelemetryRendererContext…」                                                                                               |
| B19 文本脱敏管线            | 「B19 脱敏长度常量与安全名单构成」「B19 redactTelemetryText：URL、令牌、邮箱、路径、控制字符与截断」「B19 redactTelemetryText 重跑…（旧实现字面行为）」                                                                                         |
| B20 URL 脱敏                | 「B20 redactTelemetryUrl：协议哨兵、local_file、路由段脱敏与长度上限」                                                                                                                                                                          |
| B21 遥测模型标识收敛        | 「B21 供应商 scope 收敛…」「B21 模型 ID 收敛…」「B21 sanitizeTelemetryModelValue：三种输入形态」                                                                                                                                                |
| B22 默认快捷键表            | `shortcuts-storage.test.mjs`「B22 默认快捷键表 23 条与查表语义」                                                                                                                                                                                |
| B23 绑定解析/序列化往返     | 「B23 键归一：别名、单字符类、命名键与拒绝」「B23 解析/序列化往返与拒绝语义」「B23 isValidShortcutBinding：parse∘serialize 逐字往返」                                                                                                           |
| B24 内置供应商 ID/判别      | `model-provider.test.mjs`「B24 内置供应商 ID 六值与模板 ID 逐字不变」「B24 判别函数：内置六值与各档位集合」                                                                                                                                     |
| B25 家族规格/解析           | 「B25 家族规格表：两项、标签、域名、manage URL 与三档 ID 绑定」「B25 providerId/baseURL/domain 解析与显示判定」                                                                                                                                 |
| B26 自定义模型值编解码      | 「B26 自定义模型值编解码往返与 legacy builtin 形态」                                                                                                                                                                                            |
| B27 供应商 key 构造         | 「B27 供应商 key 前缀、baseURL 归一与 ghost 摘要退化」                                                                                                                                                                                          |
| B28 模型选择 schema/picker  | 「B28 modelSelectionSchema：strict、trim 非空、未知键拒绝」「B28 formatModelPickerValue / parseModelPickerValue 往返与错误语义」「B28 供应商未就绪常量（model-selection-types）」                                                               |
| B29 旧供应商 ID 迁移        | 「B29 旧供应商 ID 迁移表与 builtin: 未知返回 undefined」「B29 migrateLegacyOfficialGlmModelId：只对内置/账号 provider 生效」                                                                                                                    |
| B30 官方 GLM 名单           | 「B30 官方 GLM 名单 22 项与大小写不敏感归一」                                                                                                                                                                                                   |
| B31 家族连接选择 schema     | 「B31 家族连接选择 schema：team 三字段必填、strict、settings 整体 partial」                                                                                                                                                                     |
| B32 账号不可用原因枚举      | 「B32 账号不可用原因四值枚举（子路径入口同面）」                                                                                                                                                                                                |
| B33 Provider 枚举 schema    | 「B33 knorviaProviderSchema 单值枚举」                                                                                                                                                                                                          |
| B34 secret 剥离             | `remote-identity.test.mjs`「B34 stripRemoteTargetSecrets：ssh 剔除 password/passphrase，wsl/docker 原样」                                                                                                                                       |
| B35 SSH 主机身份键          | 「B35 buildSshRemoteHostKey：六元组 JSON…」「B35 私钥路径词法归一：盘符大写、点段折叠、锚定与 UNC、~ 非锚定」                                                                                                                                   |
| B36 环境级身份键            | 「B36 环境键：ssh 前缀、wsl 默认占位与 \0 分隔、docker 取 container」                                                                                                                                                                           |
| B37 远程资源安装模式        | 「B37 安装模式：默认 local-download-upload、仅 remote-download 透传」                                                                                                                                                                           |
| B38 远程资源包集合          | 「B38 资源包集合：7 项、required 前两项、normalize 恒返回全集」                                                                                                                                                                                 |
| B39 平台常量/open-in-editor | 「B39 平台常量与本地媒体预览 URL」「B39 DesktopCommandIds 28 项键值逐字不变」「B39 createOpenInEditorRemoteTarget：凭据不穿透、空值字段不带」                                                                                                   |
| B40 定时任务限制/runId      | `domain-constants.test.mjs`「B40 定时任务限制与 runId 解析」                                                                                                                                                                                    |
| B41 闲时常量                | 「B41 闲时常量：终态表、票据标记与 provider ID」                                                                                                                                                                                                |
| B42 子代理 ID/覆盖解析      | `model-provider.test.mjs`「B42 子代理覆盖解析与状态 ID」                                                                                                                                                                                        |
| B43 用量统计常量/schema     | `domain-constants.test.mjs`「B43 用量统计常量与快照 schema」                                                                                                                                                                                    |
| B44 zod 错误/基础 schema    | 「B44 formatZodError 与基础 schema」                                                                                                                                                                                                            |
| B45 AppSettings schema      | 「B45 AppSettings：默认值与旧写输入规范化（金样往返）」「B45 旧写 → 新读 → 新写 → 旧读：AppSettings 往返字节稳定」「B45 appSettingsPatchSchema…」「B45 职业枚举 14 值」「B45 integratedTerminalShellSelectionSchema（模块路径面，仅包内使用）」 |
| B46 协议默认语言            | 「B46/B52 DEFAULT_LOCALE 与构建期版本常量（非构建环境回退值）」                                                                                                                                                                                 |
| B47 频道名常量表            | `surface.test.mjs`「B47 频道名与 RPC header 常量快照逐字一致」＋「B47/B48 其余常量快照…逐字一致」                                                                                                                                               |
| B48 data-testid 常量        | 「B48 test-ids 快照：全部字符串常量逐字一致且无重复值」                                                                                                                                                                                         |
| B49 根 barrel 可达性        | 「B49 根 barrel 可达性：本包全部运行时导出（除两个例外）逐名存在」「B49 两个例外…」                                                                                                                                                             |
| B50 子路径入口              | 「B50 四个子路径入口导出面与附录一致」                                                                                                                                                                                                          |
| B51 模块路径兼容面          | 「B51 模块路径兼容面：58 个模块在当前入口侧全部存在」                                                                                                                                                                                           |
| B52 构建期版本常量          | 「B46/B52 DEFAULT_LOCALE 与构建期版本常量（非构建环境回退值）」                                                                                                                                                                                 |

B1–B52 全部有条目、全部有测试（无空行）。

## 七、旧门（旧实现上的结论，v1，2026-10-15）

```powershell
node scripts/contract-gate.mjs --contract specs/contracts/shared-02 --tests "*.test.mjs" `
  --dist-env KNORVIA_SHARED_02_ENTRY=dist `
  --stub-root specs/contracts/shared-02/stubs --stub-targets specs/contracts/shared-02/stubs/targets.txt
```

- 源码入口（`src`，`--import tsx`）：tests=81 **pass=81** fail=0
- dist 入口（`KNORVIA_SHARED_02_ENTRY=dist`，前置 `tsc -b packages/shared`）：tests=81 **pass=81** fail=0
- 桩替换（58 个目标文件，import 即抛 `not implemented: shared-02`）：8 个测试文件
  **pass=0** fail=8 → `allFail=true`：契约测试确实测到公开行为
- 预登记差异：**无**；跳过：0；详细输出见 [`gate-old.json`](gate-old.json)
- 基线：Node **v24.14.0**、`commit` = `2bfceaf1`（合同分支合入最新 main
  `7d280b0e` 后的合并提交；58 个合同文件与 `origin/main` 逐字节一致，
  `scope-files.json` 的 sha256 可复核）。

## 八、运行契约测试（两个入口）

```powershell
# Node 24.14.0（mise.toml 固定版本），仓库根目录
$env:TSX_TSCONFIG_PATH = "<repo>/packages/ui/tsconfig.json"

# 源码入口（pnpm test:studio 用的就是这一档）
node --import tsx --test "specs/contracts/shared-02/tests/*.test.mjs"

# dist 入口（先 tsc -b packages/shared 生成 packages/shared/dist）
$env:KNORVIA_SHARED_02_ENTRY = "dist"
node --import tsx --test "specs/contracts/shared-02/tests/*.test.mjs"
```

## 九、计分口径（替换阶段）

- 本包以**类型与常量**为主：全部 58 个文件按「运行时值 + 常量表」与「纯声明」两类计分。
- 运行时逻辑文件（`uuid.ts`、`errors.ts`、`forceUpdate.ts`、`runtimeEnv.ts`、
  `telemetryRedaction.ts`、`remoteSshHostKey.ts`、`shortcutCommands.ts` 等）：
  相似度工具**普通模式**（行 + 结构两道门槛）。
- 纯声明与常量表文件（`git.ts`、`settings-sync.ts`、`task-realtime.ts`、
  `test-ids.ts`、`channels.ts` 等）：`--declaration --interface
specs/contracts/shared-02/interface.md`（逐文件导出名按 `interface-appendix.json` 剔除）。
- 逐文件的计分模式与两道实测值在替换阶段写进
  `docs/knorvia-shared-02-acceptance.md`（M1 复盘硬要求①）。

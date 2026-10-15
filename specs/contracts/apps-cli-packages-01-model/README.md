# apps-cli-packages-01-model 合同（v1）

`apps/cli/packages/adapters/src/model` 的替换合同。计划书「每包流程」第一步的产物。

- 分支：`contract/apps-cli-packages-01-model`（从 `origin/main` @ `18c7f743` 检出；替换分支 `replace/apps-cli-packages-01-model`）
- 工作树：`wt/apps-model`
- 状态：**选包完成，合同在写**。版本线：v1（本文件）。
- 范围来源：`apps-cli-packages-01` 合同 v3 第十一节的移出裁定（Lead 裁决 2026-10-15，issue #149 评论）；分包总表新行已在替换 PR #166 描述备案。

## 一、候选范围与继承判定

数据来源：`licensing/current-files.json` 的登记分类 + 两道相似度对上游固定提交 `zcode-872ad960`
（`D:/knorvia studio开发/cache/zcode-872ad960`，6,973 文件比较集）的复扫实测（逐文件值见
[`scope.json`](./scope.json)，口径见下）。

| 范围                    | 全部文件 | 列入本包  | 说明                                                                                    |
| ----------------------- | -------- | --------- | --------------------------------------------------------------------------------------- |
| `adapters/src/model/**` | 51       | **44**    | 44 个普通模式未过线；其余 7 个两道门槛达标，**不动**（AGENTS.md「不重复改已独立候选」） |
| 行数                    | 5,052    | **4,823** | 含空行与注释的物理行数                                                                  |

**44 的口径（如实记录三种数字）**：

- **44 继承** = 普通模式两道门槛未过线的文件数（与替换 PR #166「model 44 继承」、Lead 派单一致）；
- **43** = 普通 + 声明两种模式都未过线的文件数（替换 PR #166「model 43 个三模式均未过线」的数字；
  `--sql-freeze` 模式对本目录与普通模式等价，无 SQL 可剔除）；
- 差额 1 个是 `model/model-option-map-fetch.ts`：普通模式未过线（containment 0.375），声明模式过线（残留 0 行）。
  它仍属继承口径（普通模式是实现文件的计分模式），重写时按声明模式的剥离集复检。

**登记分类的现状与处置**：51 个文件在 `licensing/current-files.json` 均登记为 `independent-replacement`
（历史隔离批次「model adapter v10」的整批认定，basis 见 `licensing/reviews.json`），但其中 44 个对上游固定
提交的实测未过两道门槛。按 M0-2「不过的并入对应替换包」与 `mcp/` 3 个历史件的先例（替换 PR #166），
这 44 个按**继承**处理：并入本包重写，替换完成后按计划书模板重新登记 `original`（basis 如实写明作者读过
被替换的实现并附实测值）。7 个达标文件的既有登记不动。

## 二、M1 分档口径（合同体量取向）

按 M1 复盘的分档口径，本包是**类型型偏多**的混合包：44 个文件里 28 个纯逻辑/类型型（纯函数、类型、规则表、
投影），16 个运行时/状态型（流、重试、准入、调试持久化）。合同体量按两档之间的口径组织：

| 档            | 文件 | behavior 体量参考             | B 条目参考     | 用例参考       |
| ------------- | ---- | ----------------------------- | -------------- | -------------- |
| 纯逻辑/类型型 | 28   | 233 字节/文件（contracts-01） | 0.42/文件      | 0.46/文件      |
| 运行时/状态型 | 16   | 1.5–1.9 KB/文件               | 1.19–2.75/文件 | 2.06–2.53/文件 |

**M1 教训的硬要求**：模型选择/路由类的**语义常量**（模型 id 映射、provider 路由、重试/退避默认值、
off-peak 特例、预算上限、debug/rollout 限额）不许只写「行为不变」，必须显式进「条目 → 测试」对照表，
每条有断言锁值。

## 三、本包的 44 个继承文件清单

`[plain]` = 普通模式计分（实现文件）；`[decl-ok]` = 声明模式已过线（重写后按剥离集复检）。

```text
model/anthropic-reasoning-metadata.ts  纯逻辑/类型型  [plain]  18 行
model/anthropic-request-metadata.ts  运行时/状态型  [plain]  28 行
model/anthropic-stream-compat.ts  运行时/状态型  [plain]  176 行
model/empty-completion-retry.ts  运行时/状态型  [plain]  54 行
model/errors.ts  纯逻辑/类型型  [plain]  51 行
model/failure-ai-sdk-provider-error.ts  纯逻辑/类型型  [plain]  27 行
model/failure-classifier.ts  纯逻辑/类型型  [plain]  225 行
model/failure-inspection.ts  纯逻辑/类型型  [plain]  127 行
model/failure-provider-business-codes.ts  纯逻辑/类型型  [plain]  142 行
model/media-transform-policy.ts  纯逻辑/类型型  [plain]  31 行
model/model-execution.ts  运行时/状态型  [plain]  318 行
model/model-option-map-fetch.ts  纯逻辑/类型型  [decl-ok]  35 行
model/model-request-headers.ts  纯逻辑/类型型  [plain]  16 行
model/model.ts  纯逻辑/类型型  [plain]  116 行
model/offpeak-retry.ts  纯逻辑/类型型  [plain]  28 行
model/openai-responses-json-compat.ts  运行时/状态型  [plain]  36 行
model/opencode-session.ts  纯逻辑/类型型  [plain]  12 行
model/reasoning-history-normalization.ts  纯逻辑/类型型  [plain]  68 行
model/request-admission.ts  运行时/状态型  [plain]  42 行
model/retry-budget.ts  纯逻辑/类型型  [plain]  28 行
model/retry-policy.ts  纯逻辑/类型型  [plain]  54 行
model/runner-attribution.ts  纯逻辑/类型型  [plain]  43 行
model/runner-debug.ts  运行时/状态型  [plain]  306 行
model/runner-diagnostics.ts  纯逻辑/类型型  [plain]  159 行
model/runner-generate.ts  运行时/状态型  [plain]  379 行
model/runner-network-headers.ts  纯逻辑/类型型  [plain]  13 行
model/runner-normalization.ts  纯逻辑/类型型  [plain]  165 行
model/runner-options.ts  纯逻辑/类型型  [plain]  85 行
model/runner-record.ts  纯逻辑/类型型  [plain]  23 行
model/runner-retry.ts  运行时/状态型  [plain]  91 行
model/runner-runtime-headers.ts  运行时/状态型  [plain]  36 行
model/runner-runtime.ts  运行时/状态型  [plain]  60 行
model/runner-status.ts  运行时/状态型  [plain]  207 行
model/runner-stream.ts  运行时/状态型  [plain]  413 行
model/runner-telemetry.ts  纯逻辑/类型型  [plain]  59 行
model/runner.ts  纯逻辑/类型型  [plain]  250 行
model/stream-idle-timeout.ts  运行时/状态型  [plain]  98 行
model/stream-retry-boundary.ts  运行时/状态型  [plain]  142 行
model/streaming-tool-call-assembler.ts  纯逻辑/类型型  [plain]  80 行
model/tool-input-normalization.ts  纯逻辑/类型型  [plain]  26 行
model/tool-result-media-projection.ts  纯逻辑/类型型  [plain]  107 行
model/tool-transform.ts  纯逻辑/类型型  [plain]  129 行
model/transform.ts  纯逻辑/类型型  [plain]  207 行
model/workflow-model-failure-policy.ts  纯逻辑/类型型  [plain]  113 行
```

**不在范围的相邻文件（接口默认不可变，本包不动）**：

```text
model/failure-tls.ts               31 行   两道门槛达标（0.167/3/0.100）
model/index.ts                     11 行   两道门槛达标（0.000/0/0.000），./model 桶面
model/provider-finish-business-error.ts 47 行 两道门槛达标（0.171/3/0.042），声明模式亦过线
model/runner-debug-redaction.ts    23 行   两道门槛达标（0.188/3/0.000）
model/strict-tool-schema.ts        70 行   两道门槛达标（0.071/1/0.025）
model/system-message-compat.ts     25 行   两道门槛达标（0.167/3/0.067）
model/tool-call-validation.ts      22 行   两道门槛达标（0.143/1/0.000）
```

其余相邻面：`apps/cli/packages/contracts/src/model/**`（契约包自己的模型类型，另包范围）、
`@knorvia/model-option-map`（独立包，只读依赖）。两者的接口都不在本包改动。

## 四、风险与要点（写合同时必须覆盖）

- **模型选择与路由的语义常量**：provider 种类（Anthropic Messages / OpenAI Responses / OpenAI Compatible）
  的路由判定、模型 id 归一、header 合并大小写规则、metadata 归因键名——值与键名不变，逐条进对照表。
- **重试与退避**：默认有界重试上限、`Retry-After` 优先级、workflow unbounded 策略、off-peak 特例、
  空补全重试、输出提交门（已提交输出后不再重放）——时序用事件序列断言，不用 sleep 凑。
- **流式边界**：idle timeout 阈值、重试边界（compact 的 replay boundary 与 output commit boundary 分开）、
  工具调用装配（空名闭合、跨 chunk 拼接）、迟到结果与取消的清理路径。
- **准入与状态**：`queued/admitted/started/completed/failed/retry_scheduled` 事件顺序、按对象身份去重的
  状态接收端、票据在所有终止路径释放（含退避前）。
- **调试持久化**：test runtime 关闭、其余默认启用；development 用 debugDir 或 data-root/cli/debug，
  其余用 data-root/cli/rollout；生产 3 个 session 文件上限、单文件 64 MiB（开发 256 MiB）；
  脱敏（headers、Anthropic user id、媒体原始数据）不因「全量保留」豁免。**记录格式是持久化数据，
  必须有旧写 → 新读 → 新写 → 旧读往返金样**。
- **错误归一**：保留原始 cause 与安全归一，`ProviderBusinessError` 业务码与 body 提取、TLS/网络分类——
  错误文案属对外可见字符串，需要逐字保留处写进 `known-differences.md`。
- **数据格式红线**：调试记录 JSON 字段、模型配置键、`KNORVIA_*` 环境变量、数据目录（`.knorvia-studio`）
  一律不变（计划书选择 8）。
- **技术选型红线**：不复制、不改名照搬、不逐行改写；不放宽测试；不推 main、不合并 PR。

## 五、后续步骤（一步一提交）

1. ✅ 范围与继承判定、M1 分档、文件清单（本文 + `scope.json`）。
2. `interface.md`（机器生成：`tests/build-interface.mjs`，TypeScript 编译器 API 逐字提取导出签名）。
3. `callers.md`（导出与调用方清单；`pnpm dep:refs` 对 `adapters` 报「源文件未加载到 project」，
   改用编译器 API / 全仓 import 检索并写明方法）。
4. 本包内 knip 无用代码复核（单独小节，见第六节）。
5. `behavior.md`（B 编号，分批提交；语义常量显式成条）。
6. `tests/` + `fixtures/`（公开模块路径入口、源码 + dist 双入口、无 sleep；往返金样由旧实现生成）。
7. `stubs/` + 旧门（两入口全过）→ `gate-old.json` → `known-differences.md` / `acceptance.md` →
   登记（fmt → register → provenance report/check）→ PR `contract: apps-cli-packages-01-model v1`。

门禁顺序：`fmt` → `fmt:check` → `provenance:report` → `provenance:check` → commit。

## 六、本包内 knip 无用代码复核（结论：不删，留待重写时逐符号确认）

命令：`pnpm knip`（Node 24.14.0）。只看本包范围（`adapters/src/model/**`）的结果：

**knip 的 `Unused files` 与本包相交的 2 个**：`model/runner-runtime-headers.ts`、`model/runner-telemetry.ts`。
全仓检索显示两者都被 `apps/cli/packages/adapters/test/model-subsystem-contract/cases/*.test.ts` 以
`@target/<模块>` 别名导入（`runner-generate.test.ts`、`helper-behavior.test.ts`），是测试可达的公开兼容
helper；替换 PR #166 的验收记录也把它们记为「公开兼容 helper，当前 CLI 未引用」。按默认裁决表
「不确定某段代码是否还有用 → 保留并写进合同，不删」：**保留**，行为写进 `behavior.md`，重写时保留导出。

**knip 报的「无用导出」落在本包 44 个文件里的**（同样不删，留待重写时逐符号确认；导出集合以
`interface.md` 为准，删导出即改兼容面）：`runner-record.ts`（`asRecord`、`stringProperty`、
`numberProperty`、`stringMetadata`）、`reasoning-history-normalization.ts`
（`repairReasoningHistoryAfterSignatureRejection`）、`failure-classifier.ts`（`inspectProviderFailure`、
`isRetryableFailure`）、`retry-budget.ts`（`UNBOUNDED_RETRY_MAX_ATTEMPTS`、`retryAttemptLoopContinues`）、
`runner-status.ts`（`normalizeModelSessionIdForAttribution`、`resolveModelRequestSessionType`、
`publishModelTelemetryMilestone`）等。

**结论：第 4 步没有可安全删除的文件或导出，本次提交只记录证据与决定，不删任何文件。**

## 七、条目 → 测试对照表

每个 B 条目至少一个用例；表由 `node specs/contracts/apps-cli-packages-01-model/tests/build-case-map.mjs`
生成（`--check` 在缺条目或表落后时退出码非 0）。

<!-- CASE-MAP:START -->

| 条目 | 测试文件                                                         | 用例                                                                        |
| ---- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| B1   | [tests/model-core.test.ts](./tests/model-core.test.ts)           | B1 provider API 格式到 SDK 种类的路由                                       |
| B2   | [tests/model-core.test.ts](./tests/model-core.test.ts)           | B2 请求期鉴权与 header 合并（大小写不敏感、后者覆盖前者）                   |
| B3   | [tests/model-core.test.ts](./tests/model-core.test.ts)           | B3 三种 provider 的 SDK 构造与 baseURL 归一                                 |
| B4   | [tests/model-core.test.ts](./tests/model-core.test.ts)           | B4 选项映射 fetch 包装（请求体改写与原始体捕获）                            |
| B5   | [tests/model-core.test.ts](./tests/model-core.test.ts)           | B5 provider 业务错误体的提取（readProviderBusinessFailureFromBody）         |
| B6   | [tests/model-core.test.ts](./tests/model-core.test.ts)           | B6 非 2xx 响应转 ProviderBusinessError（含清理路径）                        |
| B7   | [tests/model-core.test.ts](./tests/model-core.test.ts)           | B7 模型对象的不可变绑定与 bind 合并                                         |
| B8   | [tests/model-core.test.ts](./tests/model-core.test.ts)           | B8 选项校验与默认值（语义常量）                                             |
| B9   | [tests/model-core.test.ts](./tests/model-core.test.ts)           | B9 请求能力校验（工具、结构化输出、输入媒体）                               |
| B10  | [tests/model-core.test.ts](./tests/model-core.test.ts)           | B10 OpenCode Go base URL 判定                                               |
| B11  | [tests/retry-admission.test.ts](./tests/retry-admission.test.ts) | B11 重试选项解析与默认值（语义常量）                                        |
| B12  | [tests/retry-admission.test.ts](./tests/retry-admission.test.ts) | B12 重试预算（有界 / workflow 无界）的判定                                  |
| B13  | [tests/retry-admission.test.ts](./tests/retry-admission.test.ts) | B13 空补全重试：条件、事件与等待                                            |
| B14  | [tests/retry-admission.test.ts](./tests/retry-admission.test.ts) | B14 attempt 准入（admission）的排队与票据释放                               |
| B15  | [tests/retry-admission.test.ts](./tests/retry-admission.test.ts) | B15 off-peak 特例（票据过期与重新排队）                                     |
| B16  | [tests/retry-admission.test.ts](./tests/retry-admission.test.ts) | B16 workflow 模型失败裁决表（语义常量）                                     |
| B17  | [tests/retry-admission.test.ts](./tests/retry-admission.test.ts) | B17 重试许可的双轨裁决                                                      |
| B18  | [tests/retry-admission.test.ts](./tests/retry-admission.test.ts) | B18 workflow 侧失败检视（inspectWorkflowModelFailure）                      |
| B19  | [tests/errors.test.ts](./tests/errors.test.ts)                   | B19 错误对象体系与本地 provider 配置错误上下文                              |
| B20  | [tests/errors.test.ts](./tests/errors.test.ts)                   | B20 错误链检视工具（cause 链遍历与字段提取）                                |
| B21  | [tests/errors.test.ts](./tests/errors.test.ts)                   | B21 Retry-After 响应头解析（语义常量）                                      |
| B22  | [tests/errors.test.ts](./tests/errors.test.ts)                   | B22 provider 业务码映射表（逐码锁定）                                       |
| B23  | [tests/errors.test.ts](./tests/errors.test.ts)                   | B23 业务错误的网络/超时可重试判定                                           |
| B24  | [tests/errors.test.ts](./tests/errors.test.ts)                   | B24 AI SDK 错误到业务错误的兜底映射                                         |
| B25  | [tests/errors.test.ts](./tests/errors.test.ts)                   | B25 业务错误定位与 provider 细节提取                                        |
| B26  | [tests/errors.test.ts](./tests/errors.test.ts)                   | B26 失败分类裁决表（classifyModelFailure）                                  |
| B27  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（默认 provider）                                       |
| B27  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（openai-compatible 文本化路径）（另有用例）            |
| B27  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（stripMedia 路径）（另有用例）                         |
| B27  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27 tool 消息缺标识即抛（含空串）（另有用例）                               |
| B28  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（默认 provider）                                       |
| B28  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（openai-compatible 文本化路径）（另有用例）            |
| B28  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（stripMedia 路径）（另有用例）                         |
| B28  | [tests/projection.test.ts](./tests/projection.test.ts)           | B28 连续 tool 媒体合并（防 MissingToolResultsError 的既有修复）（另有用例） |
| B29  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（默认 provider）                                       |
| B29  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（openai-compatible 文本化路径）（另有用例）            |
| B29  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（stripMedia 路径）（另有用例）                         |
| B29  | [tests/projection.test.ts](./tests/projection.test.ts)           | B29 空占位与塌缩规则（另有用例）                                            |
| B30  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（默认 provider）                                       |
| B30  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（openai-compatible 文本化路径）（另有用例）            |
| B30  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（stripMedia 路径）（另有用例）                         |
| B30  | [tests/projection.test.ts](./tests/projection.test.ts)           | B30 data URL 解析与不支持媒体占位文案（语义常量）（另有用例）               |
| B31  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（默认 provider）                                       |
| B31  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（openai-compatible 文本化路径）（另有用例）            |
| B31  | [tests/projection.test.ts](./tests/projection.test.ts)           | B27–B31 消息投影金样（stripMedia 路径）（另有用例）                         |
| B31  | [tests/projection.test.ts](./tests/projection.test.ts)           | B31 工具结果媒体与 CUA 帧引用邻接（另有用例）                               |
| B32  | [tests/projection.test.ts](./tests/projection.test.ts)           | B32 工具契约到 AI SDK 工具集（金样 + 两个错误面）                           |
| B33  | [tests/projection.test.ts](./tests/projection.test.ts)           | B33 工具入参归一（含 warn 日志）                                            |
| B34  | [tests/projection.test.ts](./tests/projection.test.ts)           | B34 reasoning 块的 providerOptions 透传                                     |
| B35  | [tests/projection.test.ts](./tests/projection.test.ts)           | B35 Anthropic 元数据与脱敏（金样）                                          |
| B36  | [tests/projection.test.ts](./tests/projection.test.ts)           | B36 reasoning 历史归一与签名拒绝修复                                        |
| B37  | [tests/stream-compat.test.ts](./tests/stream-compat.test.ts)     | B37 流空闲超时的额度与错误形状（语义常量）                                  |
| B38  | [tests/stream-compat.test.ts](./tests/stream-compat.test.ts)     | B38 关联取消与带空闲计时的迭代读取                                          |
| B39  | [tests/stream-compat.test.ts](./tests/stream-compat.test.ts)     | B39 compact 流边界映射                                                      |
| B40  | [tests/stream-compat.test.ts](./tests/stream-compat.test.ts)     | B40 重放安全前奏事件的判定                                                  |
| B41  | [tests/stream-compat.test.ts](./tests/stream-compat.test.ts)     | B41 compact 体失败后的重试许可                                              |
| B42  | [tests/stream-compat.test.ts](./tests/stream-compat.test.ts)     | B42 流清理与被放弃流的关闭                                                  |
| B43  | [tests/stream-compat.test.ts](./tests/stream-compat.test.ts)     | B43 流式工具调用装配器（状态机）                                            |
| B44  | [tests/stream-compat.test.ts](./tests/stream-compat.test.ts)     | B44 Anthropic 兼容 fetch：请求体归一                                        |
| B45  | [tests/stream-compat.test.ts](./tests/stream-compat.test.ts)     | B45 Anthropic 兼容 fetch：响应侧修补                                        |
| B46  | [tests/stream-compat.test.ts](./tests/stream-compat.test.ts)     | B46 OpenAI Responses JSON 兼容                                              |
| B47  | [tests/runner-core.test.ts](./tests/runner-core.test.ts)         | B47 适配器构造、默认值与状态接收端组合                                      |
| B48  | [tests/runner-core.test.ts](./tests/runner-core.test.ts)         | B48 请求准备：鉴权刷新与 reasoning 归一                                     |
| B49  | [tests/runner-core.test.ts](./tests/runner-core.test.ts)         | B49 SDK 请求选项装配（语义常量）                                            |
| B50  | [tests/runner-core.test.ts](./tests/runner-core.test.ts)         | B50 运行时端口默认实现                                                      |
| B51  | [tests/runner-core.test.ts](./tests/runner-core.test.ts)         | B51 runGenerateText 的 attempt 状态机（事件序列）                           |
| B51  | [tests/runner-core.test.ts](./tests/runner-core.test.ts)         | B51 空补全重试（事件序列）（另有用例）                                      |
| B51  | [tests/runner-core.test.ts](./tests/runner-core.test.ts)         | B51 鉴权缺失 pre-start 原样抛出（不补 failed 事件）（另有用例）             |
| B52  | [tests/runner-core.test.ts](./tests/runner-core.test.ts)         | B52 runStreamText 的 attempt 状态机（前奏缓冲与提交门）                     |
| B52  | [tests/runner-core.test.ts](./tests/runner-core.test.ts)         | B52 输出提交门：可见后失败不再重放（另有用例）                              |
| B53  | [tests/runner-support.test.ts](./tests/runner-support.test.ts)   | B53 状态上下文、attempt 上下文与事件发布                                    |
| B54  | [tests/runner-support.test.ts](./tests/runner-support.test.ts)   | B54 调试持久化往返：旧写金样 → 新读 → 新写 → 旧读                           |
| B55  | [tests/runner-support.test.ts](./tests/runner-support.test.ts)   | B55 重试延迟、退避等待与适配错误                                            |
| B56  | [tests/runner-support.test.ts](./tests/runner-support.test.ts)   | B56 结果归一（用量、reasoning、流事件、工具、来源）                         |
| B57  | [tests/runner-support.test.ts](./tests/runner-support.test.ts)   | B57 终局业务错误探测                                                        |
| B58  | [tests/runner-support.test.ts](./tests/runner-support.test.ts)   | B58 流诊断计数与零输出判定                                                  |
| B59  | [tests/runner-support.test.ts](./tests/runner-support.test.ts)   | B59 归因头与会话类型（语义常量）                                            |
| B60  | [tests/runner-support.test.ts](./tests/runner-support.test.ts)   | B60 网络头脱敏（敏感头清单）                                                |
| B61  | [tests/runner-support.test.ts](./tests/runner-support.test.ts)   | B61 attempt 级运行时头刷新                                                  |
| B62  | [tests/runner-support.test.ts](./tests/runner-support.test.ts)   | B62 记录字段工具与失败遥测归因                                              |

<!-- CASE-MAP:END -->

## 八、旧门与桩替换（结果见 `gate-old.json` / `stub-gate.json`）

命令（仓库根目录，Node 与 `mise.toml` 一致）：

```text
pnpm build:cli-packages
node --import tsx specs/contracts/apps-cli-packages-01-model/tests/run-old-gate.mjs --with-stubs
```

# shared-02 替换验收（replace/shared-02）

对应计划书「每包流程」五与「替换验收」清单。合同：`specs/contracts/shared-02/`（v1）；
逐文件计分实测汇总自 `.scratch-exec4\s02-scorecard.md`（替换过程中逐簇记录）。

## 1. 范围

`packages/shared/src`（除 `node/`、`protocol-v4/`）58 个继承文件全部重写完成：
`upstream-modified` 35 + `upstream-unchanged` 23（`scope-files.json` 口径）。
`platform.ts` 按设计拆出 `internal-s02/platform-{browser-view,desktop,editor,service}.ts`
四个新模块（登记 original），公开模块路径与导出面不变（B51）。

## 2. 契约与旧门

- 旧门（合同 v1）：源码 81/81、dist 81/81、桩替换 58 目标全失败（`gate-old.json`）。
- 新实现：**契约测试源码入口与 dist 入口各 81/81，0 跳过**（每簇收尾均重跑，最终全绿）。
- B45 金样往返（AppSettings 旧写→新读→新写→旧读）逐字节保持；B47 频道名/RPC header、
  B48 test-ids 快照（362+37）、`ssh:v1` 六元组、环境键、语义常量等 `known-differences.md` §4
  八组逐字清单全部保持；测试断言与金样零改动。

## 3. 相似度两门实测（normal / decl：containment/run/structural）

计分模式口径（Lead 裁决 2026-10-15）：纯声明与常量表文件按 decl 计分（两门都跑都记实测值）；
运行时逻辑文件按 normal；个别常量/声明文件 normal 畸高降级 decl 并标注理由。

| 文件 | 计分模式 | normal | decl | 簇 |
| --- | --- | --- | --- | --- |
| uuid.ts | normal | 0.113/4/0.000 | 0.133/4/0.033 | C1 |
| errors.ts | normal | 0.109/3/0.190 | 0.109/3/0.190 | C1 |
| log-format.ts | normal | 0.111/1/0.000 | 0.067/1/0.000 | C1 |
| api.ts | normal | 0.061/1/0.067 | 0.061/1/0.067 | C1 |
| settings-errors.ts | decl | 0.000/0/0.000 | 0.000/0/0.000 | C1 |
| version.ts | decl | 0.000/0/0.000 | 0.000/0/0.000 | C1 |
| env.ts | decl | 0.078/2/0.031 | 0.093/2/0.040 | C2 |
| runtimeEnv.ts | normal | 0.103/2/0.204 | 0.108/2/0.207 | C2 |
| forceUpdate.ts | normal | 0.070/1/0.269 | 0.078/1/0.176 | C3 |
| config-schema.ts | normal | 0/0/0 | 0/0/0 | C3 |
| command-types.ts | decl | 0/0/0.111 | 0/0/0.040 | C3 |
| account-provider-state.ts | decl | 0.071/1/0 | 0.077/1/0 | C3 |
| providers.ts | decl | 0/0/0 | 0/0/0 | C3 |
| media-preview.ts | normal | 0/0/0.071 | 0/0/0.083 | C4 |
| storage.ts | normal | 0.041/1/0.100 | 0.047/1/0.024 | C4 |
| git.ts | decl | 0.051/7/0.099 | 0.055/7/0.065 | C4 |
| task-realtime.ts | decl | 0.073/5/0.246 | 0.075/5/0.164 | C4 |
| telemetry.ts | normal | 0.112/2/0.219 | 0.119/2/0.200 | C5 |
| telemetryRedaction.ts | normal | 0.115/2/0.272 | 0.123/2/0.127 | C5 |
| shortcutCommands.ts | normal | 0.015/2/0.061 | 0.020/2/0.051 | C6 |
| custom-model-value.ts | normal | 0.167/2/0.059 | 0.186/2/0.063 | C6 |
| model-selection-key.ts | normal | 0.091/1/0.174 | 0.114/1/0.200 | C7 |
| model-selection-types.ts | normal | 0.094/1/0 | 0.103/1/0 | C7 |
| model-selection.ts | normal | 0.059/2/0.038 | 0.049/2/0 | C7 |
| model-provider-types.ts | normal | 0.017/1/0.040 | 0.020/1/0 | C8 |
| model-provider-family.ts | normal | 0.077/2/0.275 | 0.088/2/0.184 | C8 |
| legacy-model-provider-identity.ts | normal | 0.043/1/0.083 | 0.043/1/0 | C8 |
| **official-glm-model-id.ts** | **decl**（降级理由：22 项取值逐字冻结常量表，值+结构被迫相似，normal 0.200/2/0.429 畸高） | 0.200/2/0.429 | 0.167/2/0 | C8 |
| provider-family-connection-selection.ts | normal | 0.107/1/0.067 | 0.111/1/0.067 | C8 |
| remoteTarget.ts | normal | 0.133/1/0.125 | 0.138/1/0 | C9 |
| remoteSshHostKey.ts | normal | 0.045/1/0.174 | 0.048/1/0.143 | C9 |
| remoteEnvironmentKey.ts | normal | 0.059/1/0.250 | 0.059/1/0.250 | C9 |
| remoteAssetInstallMode.ts | normal | 0.176/1/0 | 0.176/1/0 | C9 |
| remoteResourcePackages.ts | normal | 0.092/2/0.176 | 0.103/2/0.167 | C9 |
| cuaAccessibilitySettings.ts | normal | 0.056/1/0.125 | 0.063/1/0 | C10a |
| workspacePurpose.ts | normal | 0/0/0 | 0/0/0 | C10a |
| sessionCreateSource.ts | normal | 0/0/0 | 0/0/0 | C10a |
| handshake.ts | normal | 0/0/0 | 0/0/0 | C10a |
| platform.ts（壳） | normal | 0/0/0 | 0/0/0 | C10b |
| internal-s02/platform-browser-view.ts | normal | 0.166/4/0.304 | 0.175/4/0.159 | C10b |
| internal-s02/platform-desktop.ts | normal | 0.099/2/0.138 | 0.106/2/0.104 | C10b |
| internal-s02/platform-editor.ts | normal | 0.047/1/0.070 | 0.053/1/0.059 | C10b |
| internal-s02/platform-service.ts | normal | 0.109/4/0.322 | 0.198/5/0.202 | C10b |
| **automation-types.ts** | **decl**（降级理由：常量+类型为主、仅两个小判别函数，normal structural 0.430 畸高） | 0.116/2/0.430 | 0.127/2/0.368 | C11 |
| off-peak-types.ts | normal | 0.153/6/0.321 | 0.166/6/0.159 | C11 |
| subagents-types.ts | normal | 0.135/7/0.323 | 0.117/4/0.106 | C11 |
| usage-stats.ts | normal | 0.122/5/0.335 | 0.121/5/0.282 | C11 |
| usage-quota.ts | normal | 0.054/1/0.316 | 0.061/1/0.294 | C11 |
| hooks.ts | normal | 0.078/3/0.324 | 0.046/1/0.250 | C11 |
| settings-sync.ts | normal | 0.022/1/0.134 | 0.025/1/0.143 | C12 |
| settings-source.ts | normal | 0/0/0 | 0/0/0 | C12 |
| plugin-types.ts | normal | 0.016/1/0.357 | 0.019/1/0.120 | C12 |
| plugin-sync.ts | normal | 0.032/1/0.138 | 0.038/1/0.037 | C12 |
| skills-types.ts | normal | 0.108/2/0.154 | 0.118/2/0.167 | C12 |
| skill-sync.ts | normal | 0.056/1/0.050 | 0.063/1/0.063 | C12 |
| mcp-sync.ts | normal | 0/0/0 | 0/0/0 | C12 |
| **validation.ts** | **decl**（降级理由：zod schema 全量 token 骨架被迫相似，normal structural 1.000） | 0.129/6/1.000 | 0.134/6/0.259 | C13 |
| **validationAppSettings.ts** | **decl**（同上理由） | 0.172/6/0.454 | 0.168/6/0.389 | C13 |
| channels.ts | normal | 0.019/1/0.034 | 0.037/6/0.073 | C14 |
| **protocol.ts** | **decl**（降级理由：纯声明类型面，normal structural 0.430） | 0.113/3/0.430 | 0.131/3/0.301 | C14 |
| **test-ids.ts** | **decl**（362 项快照常量表，值逐字冻结，normal structural 1.000） | 0.059/3/1.000 | 0.089/2/0.200 | C15 |
| **test-ids-workflow.ts** | **decl**（同上，37 项快照） | 0.031/1/1.000 | 0.091/1/0 | C15 |

全部 58 个目标文件 + 4 个新增域件均通过其计分模式门槛；两门实测值全部在案。

## 4. 首次失败与修正（代表性）

- shared-01 教训复现：整段保留旧 JSDoc 被 run=9 逮（C2）→ 注释全部改写为 `//` 行与行内注解。
- 脚本化陷阱四处（C13）：头注粘连吞 import（tsc 抓）、注释状态机误吞定义行（tsc 抓）、
  全局改名伤 `value` 字段键（grep 审计发现并修回）、fmt 挪 `foo?(` 后注释（改放闭合行尾）。
- test-ids-workflow 一条导出被注释折叠吞并（B48/B49 断言抓）→ 修复后 81/81。
- z.enum 字面量联合装载时先误用字符联合类型 → 改类型别名保字面量联合（tsc + 快照断言双确认）。

## 5. 未覆盖 / 说明

- 计分降级的 6 个文件（表中加粗）按裁决标注理由，两门实测均在案。
- `platform.ts` 拆分产生的 `internal-s02/*` 四件登记 `original`（basis 见 `licensing/reviews.json`）。
- 门禁输出摘要与 CI 记录见 PR 描述；`gate-old.json` 为合同阶段旧门产物，不再重跑。

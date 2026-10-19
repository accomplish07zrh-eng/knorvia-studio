# shared-04 合同（`packages/shared/src` 顶层继承剩余 · 44 个）

**合同版本：v1**（八件套齐、旧门三绿，见 [acceptance.md](acceptance.md)）

本目录是 M3 `shared-04` 第一批的**兼容合同**：先冻结公开行为与签名，再按合同独立实现（替换阶段见计划书「每包流程」四、五）。

- 分支：`contract/shared-04`（工作树 `/workspace/wt-shared04`）；认领 issue：**#190**
- 依据：《Knorvia 独立替换任务计划书》「每包流程」、M1 切包规则（运行时为主 ≤35–40 / 类型重 ≤60）
- 前包边界：`shared-01`（`node/`、`protocol-v4/`）与 `shared-02`（58 件）已合并；`shared-03` 已合并 34 件；
  `index.ts` 根桶按 shared-03 README 归 **shared-04 末批**，不在本批

## 一、选包实测（2026-10-19）

### 1. 口径与池子

`licensing/current-files.json` 的分类是历史账（就地重写不翻类，最终靠 review 登记收口）。
计算式（`packages/shared/src` 顶层，不含 `node/`、`protocol-v4/`）：

```
顶层 162
− unreviewed 21（不在选包口径，等 M0-2/M0-3 复核）
− original 38（含 shared-03 已合并的 34 件）
= 继承给本包系列 103
− shared-02 已替换 58
− index.ts 根桶（shared-04 末批）
= 第一批 44
```

`scope-files.json` 由 `licensing/current-files.json` 逐文件摘录 path/sha256/upstream/分类，共 44 件：
**upstream-modified 34 / upstream-unchanged 10**。本批不超过 60，故不再切包；`index.ts` 留到末批。

### 2. 三模式扫描

| 扫描                           | 结论                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `pnpm knip`                    | 范围内无删除项；契约测试与金样是新增文件                                                             |
| `pnpm dep:refs --list-exports` | 44 件导出名与 `interface-appendix.json` 一致（204 运行时 / 152 纯类型）                              |
| 静态 import 调用面             | **550 处 / 252 文件**（`import`、`export … from`、相对直引、子路径入口都计入；`docs/evidence` 不计） |

重消费方：`packages/shared/src/index.ts`（根桶）、`packages/services`、`packages/ui`、`packages/desktop`、
`apps/cli`（bootstrap/core/runtime）。逐模块统计见 [callers.md](callers.md)。

### 3. 分簇（依赖叶子先行）

| 簇                      | 文件                                                                                                                                                                                                                            | 内部边                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| R remote/network        | `endpointHostname`、`intranetDefaults`、`intranetProbe`、`remote-workspace-identity`、`remoteUsageTelemetry`、`remoteAppConfig`、`helpAppConfig`、`server-remote`、`openrouter-attribution`、`wslUserValidation`、`remote-sync` | usage → identity；help → remoteAppConfig |
| P plugins/mcp           | `plugin-display-name`、`plugin-marketplaces`、`pluginStoreOrder`、`pluginStoreOrdering`、`skill-scan-policy`、`mcp`                                                                                                             | ordering → marketplaces/order            |
| C config/UI             | `clientConfig`、`dynamic-workflow-feature`、`app-runtime-preferences`、`e2e-test-bridge`、`launchMarks`、`desktopMenu`、`serviceAuthority`、`update`、`node`                                                                    | clientConfig → order                     |
| F feedback/onboarding   | `feedback`、`feedbackPrivacy`、`onboardingRecord`                                                                                                                                                                               | —                                        |
| D diagnostics/telemetry | `database-startup`、`memoryDiagnostics`、`localTtft`、`session-debug`、`rendererActionTrace`、`lineChangeStat`、`markdown-artifact-images`、`sessionCreateTelemetry`                                                            | —                                        |
| A auth/model/provider   | `official-mcp-auth`、`official-mcp-tool-error`、`oauth`、`model-config`、`model-execution`、`provider-provisioning`、`plan-identity`                                                                                            | —                                        |

实测内部依赖边 5 条，无跨簇环。

## 二、公开入口

`packages/shared/package.json` 的 `exports` 是正式入口面：

| 入口类                                | 文件                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| 根 barrel `@knorvia/shared`           | 除 `model-config`、`model-execution` 外全部运行时导出可达（`node` 的 10 个运行时值也在根桶） |
| 子路径 `@knorvia/shared/model-config` | `model-config`                                                                               |
| 子路径 `@knorvia/shared/mcp`          | `mcp`                                                                                        |
| 子路径 `@knorvia/shared/node`         | `node`（再导出 `./node/*`，shared-01 实现）                                                  |
| 协议/内部消费                         | `model-execution`（protocol 内部）、`update`/`remote-sync`/`intranetProbe`（纯类型）         |

逐文件导出面见 [interface.md](interface.md) 与机器附录；测试 `surface.test.mjs` 逐名比对。

## 三、完成度

| 步骤                                    | 状态                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------- |
| 选包实测（分类 + 三模式扫描 + 分簇）    | ✅ §一                                                                 |
| `behavior.md`（B 条目九项）             | ✅ B1–B49 六簇                                                         |
| `interface.md` + 导出附录               | ✅ 204 运行时 / 152 纯类型（机器生成）                                 |
| `callers.md`                            | ✅ 550 处 / 252 文件                                                   |
| `tests/`（黑盒契约，两入口）            | ✅ 8 文件 51 断言，两入口 51/51                                        |
| `fixtures/`（金样六组）                 | ✅ 旧实现录制（remote/plugins/config/feedback/diagnostics/auth-model） |
| `stubs/`（44 目标）                     | ✅ import 即抛，桩替换 8 文件全失败                                    |
| `known-differences.md`、`acceptance.md` | ✅ 红线清单 + 旧门实测                                                 |
| 旧门 `gate-old.json`                    | ✅ 51/51 × 2 + allFail=true                                            |
| PR `contract: shared-04 v1`             | ⬜（协调 Agent 提交）                                                  |

## 四、条目 → 测试对照

| 条目    | 主题                           | 测试            |
| ------- | ------------------------------ | --------------- |
| B1      | endpointHostname               | remote-identity |
| B2      | intranetDefaults               | remote-identity |
| B3      | intranetProbe 纯类型           | surface         |
| B4–B5   | remote identity 构造/解析      | remote-identity |
| B6–B7   | remoteUsageTelemetry           | remote-identity |
| B8      | remoteAppConfig/helpAppConfig  | remote-identity |
| B9      | server-remote                  | misc            |
| B10     | openrouter-attribution         | remote-identity |
| B11     | wslUserValidation              | remote-identity |
| B12–B13 | plugin display/marketplaces    | plugins         |
| B14–B15 | pluginStoreOrder/Ordering      | plugins         |
| B16     | skill-scan-policy              | plugins         |
| B17–B18 | mcp headers/CUA/convert        | plugins         |
| B19     | clientConfig                   | config          |
| B20     | dynamic-workflow-feature       | config          |
| B21     | app-runtime-preferences        | config          |
| B22     | e2e-test-bridge                | config          |
| B23     | launchMarks                    | config          |
| B24     | desktopMenu                    | config          |
| B25     | serviceAuthority               | config          |
| B26     | update 纯类型                  | surface         |
| B27     | 模块路径/导出面/根桶/node 桶   | surface         |
| B28     | remote-sync 纯类型             | surface         |
| B29     | feedback 常量                  | feedback        |
| B30     | feedbackPrivacy                | feedback        |
| B31     | onboardingRecord               | feedback        |
| B32–B34 | database-startup               | diagnostics     |
| B35     | memoryDiagnostics              | diagnostics     |
| B36     | localTtft                      | diagnostics     |
| B37     | session-debug                  | diagnostics     |
| B38     | rendererActionTrace            | diagnostics     |
| B39     | lineChangeStat/markdown images | diagnostics     |
| B40     | sessionCreateTelemetry         | misc            |
| B41–B43 | official-mcp-auth              | auth-model      |
| B44     | official-mcp-tool-error        | auth-model      |
| B45     | oauth                          | auth-model      |
| B46     | model-config                   | auth-model      |
| B47     | model-execution                | auth-model      |
| B48     | provider-provisioning          | auth-model      |
| B49     | plan-identity                  | auth-model      |

**红线**：协议常量/字段/数据格式一字不改；金样按旧实现录制；不改测试断言口径迁就新写法；SPDX 头。

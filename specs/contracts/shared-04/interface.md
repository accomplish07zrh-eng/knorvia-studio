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

## 4. 不在本包的相邻面

`index.ts` 根 barrel（shared-04 末批）；`node/**`、`protocol-v4/**`（shared-01）；shared-02 的 58 件；
shared-03 的 34 件；`unreviewed` 21 件（M0-2/M0-3 口径，不入本包）。

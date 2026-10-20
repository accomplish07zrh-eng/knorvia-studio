# kernel-bridge-legacy 验收

## 一、完成定义

本包完成 = 合同 PR 合并 + 实现 PR 合并 + 默认引擎零回归 + `dsh` 引擎在**同一套旧协议契约测试**上全过 + 桩门全失败 + 复用清单中的测试继续通过 + 来源登记 + Linux/Windows CI 全绿。

默认引擎切换不在本包（`kernel-switch`）。

## 二、合同阶段（PR「contract: kernel-bridge-legacy v1」）

| 项                      | 判据                                                                | 状态     |
| ----------------------- | ------------------------------------------------------------------- | -------- |
| 范围与不在范围          | [README.md](README.md) §一                                          | ✅       |
| 现状与缺口实测          | README §二（74/59/14/7 清单、8 个方法实测 -32601、Host 消费 63 键） | ✅       |
| 锁定不变量              | README §三 L1–L9                                                    | ✅       |
| 复用清单                | README §四（含“无第二套运行时级旧协议用例”的实测结论）              | ✅       |
| B 条目                  | [behavior.md](behavior.md) B1–B16                                   | ✅       |
| 接口（含 02/03 注册面） | [interface.md](interface.md)                                        | ✅       |
| 调用方                  | [callers.md](callers.md)                                            | ✅       |
| 已知差异                | [known-differences.md](known-differences.md) D1–D7                  | ✅       |
| 合同测试                | `tests/*.test.mjs` 全部经公开协议入口；不 import 内部模块           | ✅       |
| 旧门（默认引擎）        | `node .../run-gate.mjs`：全过                                       | ✅ 10/10 |
| 桩门                    | 同一运行器：`pass=0 && fail>0`                                      | ✅ 0/10  |
| 格式 / Lint / 类型      | `pnpm fmt:check`、`pnpm lint`、`pnpm typecheck`                     | ⬜       |
| 来源                    | `licensing/reviews.json` 程序化追加；`provenance:report` / `check`  | ⬜       |
| CI                      | Linux + Windows 全绿                                                | ⬜       |

合同阶段产物：

| 文件                          | 内容                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| `gate-old.json`               | 默认引擎运行记录（tests/pass/fail、Node 版本、命令）         |
| `stub-gate.json`              | 桩运行记录与 `allFail` 判据                                  |
| `gate-dsh.json`               | 合同阶段新运行时基线（1/10：缺口未实现，实现阶段须转 10/10） |
| `fixtures/request-script.mjs` | 59 个客户端方向方法的固定请求脚本 + 方向清单                 |
| `tests/entry.mjs`             | 入口解析与引擎判定（只用产品开关）                           |
| `tests/_protocol.mjs`         | 黑盒 NDJSON 驱动、环境隔离、结果分类                         |
| `tests/run-gate.mjs`          | 旧门 / 新运行时门 / 桩门运行器                               |
| `stubs/app-server-stub.mjs`   | 只复述 transport 外壳；证明用例非自证                        |

## 三、实现阶段（PR「replace: kernel-bridge-legacy（旧协议方法与通知）」）

### 1. 功能

- [ ] `KNORVIA_KERNEL_ENGINE=dsh` 时 59 个客户端方向方法全部被应答；默认引擎输出与基线一致。
- [ ] `node specs/contracts/kernel-bridge-legacy/tests/run-gate.mjs --engine dsh`：B1–B16 全过，生成 `gate-dsh.json`。
- [ ] 旧门继续全过；桩门继续 `pass=0 && fail>0`。
- [ ] 7 个通知 + 1 个借名通知按 B14 表有触发点；`interaction/providerRuntimeHeadersCancelled` 在中止/超时时发出。
- [ ] `interaction/*` 六方法的方向、结果 schema、取消与超时语义保持；`requestProviderRuntimeHeaders` 的凭据只用于本次请求。
- [ ] 执行端口按 [interface.md](interface.md) §四 冻结；`kernel-bridge-02/03` 通过 `registerLegacyExecutionPort` 注册；未注册时 B10 生效。
- [ ] `entry.ts` 只新增 default 委派（[interface.md](interface.md) §五）。
- [ ] `packages/shared/src/protocol/**` 与 `protocol-v4/**` 无字段改动；`shared-01` 全过。
- [ ] 默认路径不加载任何 `@deepseek-ai/*`；不改 DSH 源或 node_modules。
- [ ] stdin EOF/SIGTERM 后释放并退出 0；失败路径退出 1，不悬挂。

### 2. 方法组验收矩阵

| 方法组         | 方法                                                                                                                                                       | 离线验收                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 能力与进程     | `runtime/capabilities`、`process/childProcesses`                                                                                                           | 形状与旧运行时一致（B3）                                                  |
| workspace 只读 | `workspace/readPresentation`、`session/list`                                                                                                               | 空白工作区形状（B4）                                                      |
| 会话只读       | `session/read`、`messages`、`events`、`debug`、`subagents`、`usage`                                                                                        | 空白会话空数组；不存在会话 `-32004`（B5/B7）                              |
| 会话生命周期   | `session/create`、`resume`、`close`                                                                                                                        | create→list 闭环（B6）；resume/close 走端口或既有错误                     |
| 回合           | `session/send`、`stop`、`cancelBackgroundTask`、`compact`、`fork`、`goal`、`subscribe`                                                                     | 端口未注册 → `-32031`（B10）；真实回合归 02/03                            |
| 配置           | `session/setModel`、`setThoughtLevel`、`setMode`                                                                                                           | 同上；参数校验与 CAS 语义不变                                             |
| workspace 策略 | `updateInteractionPreferences`、`updateModelIoPreferences`、`updateOffPeakToolPolicy`、`updateDynamicWorkflowPolicy`、`generateText`、`cancelGenerateText` | 应答面（B5）；generateText 需模型，归 `kernel-switch`                     |
| Hook 信任      | `workspace/hooks/trustGrant`                                                                                                                               | 摘要校验与既有拒绝码（B5）                                                |
| 凭据/模型      | `provider/updateAccountConfig`、`provider/testModelConnectivity`                                                                                           | 协议边界（B5）；真实凭据归 `kernel-plugin-credentials` 与 `kernel-switch` |
| MCP/插件/技能  | `mcp/list`、`plugins/*`（18）、`skills/referenceCatalog`                                                                                                   | 目录事实来自本地配置；无配置时返回空目录或既有错误（B5）                  |
| 工作流         | `workflows/*`（6）                                                                                                                                         | 空白工作区空列表（B5）                                                    |
| 弃用兼容       | `usage/stats`、`session/usage`                                                                                                                             | 必须被应答（D6/B5）                                                       |
| 反向下行       | `session/requestRuntimePreferences`、`automation/*`、`offPeak/*`、`interaction/*`                                                                          | 方向不可反（B8）；反向发起与超时（B11/B12）                               |
| 借名通知       | `computer-use/operation-event`                                                                                                                             | 作为 CLI→Host 通知发出（B15）                                             |

- “能力缺席”必须使用既有 `-32031` / `fault.*` 词表，不得新增 reasonCode 或静默 accepted。
- 真实模型轮、工具调用、附件字节流、工作流实际执行：实现 PR 给出可复现命令或明确标注归 `kernel-switch`。

### 3. 复用清单回归

| 套件                                                                      | 实现阶段要求                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------- |
| `specs/contracts/kernel-bridge-01`                                        | 旧门与 `--engine dsh` 全过（本包不改 v4 面）       |
| `specs/contracts/shared-01`                                               | source 与 dist 全过；无 schema 改动                |
| `specs/contracts/kernel-dsh-00/tests/engine-selection.test.mjs`           | 全过；默认路径不加载 DSH                           |
| `specs/contracts/contracts-*`、`shared-02/03/04`、`apps-cli-packages-01*` | 全过；期望不变                                     |
| `apps/cli/packages/bootstrap/test/**`                                     | 按复用情况复跑；未复用的模块随旧包删除并在 PR 说明 |

### 4. 门禁（实现 PR 贴全表）

| 检查         | 命令                                                                                            | 结果 |
| ------------ | ----------------------------------------------------------------------------------------------- | ---- |
| 类型         | `pnpm typecheck`                                                                                | ⬜   |
| Lint         | `pnpm lint`                                                                                     | ⬜   |
| 格式         | `pnpm fmt:check`                                                                                | ⬜   |
| 架构（全量） | `pnpm architecture:check`                                                                       | ⬜   |
| 构建         | `pnpm build:cli-packages`                                                                       | ⬜   |
| 离线回归     | `pnpm test:studio`（含本目录测试自动发现）                                                      | ⬜   |
| 旧门         | `run-gate.mjs`                                                                                  | ⬜   |
| 新运行时门   | `run-gate.mjs --engine dsh`                                                                     | ⬜   |
| 桩门         | 同一运行器（默认即跑）                                                                          | ⬜   |
| 未使用       | `pnpm knip`                                                                                     | ⬜   |
| 来源         | `pnpm provenance:report` + `pnpm provenance:check`                                              | ⬜   |
| 相似度       | 新增桥代码登记 original；对旧 `bootstrap/src/protocol/**`、`core/**` 与上游 `872ad960` 跑两道门 | ⬜   |
| CI           | Linux + Windows 全绿                                                                            | ⬜   |

## 四、演示缺口（不在本包）

- v4 之外的 DSH 表面（ACP/SDK/Web）不接入产品。
- 回合实现（sendText/queue/steer/cancel/回合帧）归 `kernel-bridge-02`；其余 v4 命令归 `kernel-bridge-03`。
- 工具/权限/Hook/凭据/记忆/技能/MCP 客户端/目标/子 Agent/压缩的内部能力归 `kernel-plugin-*` 与 `kernel-dsh-builtins`。
- 旧会话库导入归 `kernel-legacy-sessions`。
- 默认引擎切换与旧运行时删除归 `kernel-switch`。
- 安装版/便携版、macOS 实机、真实模型冒烟、网络抓包归 `kernel-switch`。

## 五、随旧包删除的旧端口测试

以下套件直接 import `apps/cli/packages/core/src/**` 或旧 runtime/tool handler 内部端口，**不迁移到新运行时**，随 `core` 包删除；这里登记以保证删除时有据可查：

| 套件                                                  |
| ----------------------------------------------------- |
| `specs/contracts/core-01`                             |
| `specs/contracts/core-02`                             |
| `specs/contracts/core-03`                             |
| `specs/contracts/core-hooks`                          |
| `specs/contracts/core-runtime-helpers-01`             |
| `specs/contracts/core-runtime-methods-01`             |
| `specs/contracts/core-runtime-methods-02`             |
| `specs/contracts/core-tool-01`                        |
| `specs/contracts/core-tool-handlers-bash-01`          |
| `specs/contracts/core-tool-handlers-workflow-01`      |
| `specs/contracts/core-tool-handlers-workflow-runs-01` |
| `apps/cli/packages/core/test/**`                      |

另外，`apps/cli/packages/bootstrap/test/**` 里直接测旧 `protocol/**` 模块结构的用例（如 `interaction-preparation.test.ts`、`resident-pool-contract.test.ts`）随旧 `protocol/**` 删除时一并移除，删除清单在 `kernel-switch` 的验收文档确认。

## 六、首轮失败与修正

合同阶段的首次失败记录（实测，如实保留）：

| #   | 首次失败                            | 原因                                                             | 修正                                                                                                                                                                                                  |
| --- | ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 固定脚本 16 条参数被 `-32602` 拒绝  | 我按方法名猜 schema 形状，没读真实 schema                        | 逐条打印 `@knorvia/shared` 的 ParamsSchema 形状后重写脚本（`session/goal` 的 `action` 是 `z.enum`、`workspace/hooks/trustGrant` 的摘要必须 64 位十六进制、`plugins/install` 必须带 `marketplace` 等） |
| 2   | 桩门上 B16/B8/B9 通过（应失败）     | 断言没有触达行为：EOF 与「方向不可反」在空实现上也成立           | 加**正向对照**：先断言 `runtime/capabilities` 不是 `-32601`，再断言 EOF/方向；B9 也加一次真实调用                                                                                                     |
| 3   | dsh 模式下测试进程不退出（Windows） | 子进程管道滞留；且我用的是 PATH 上的 Node 26（仓库固定 24.14.0） | 改用 `toolchain/node-v24.14.0-win-x64/node.exe`，门禁运行器加 `--test-force-exit`，`close()` 无条件释放句柄                                                                                           |

不得通过删测试、放宽断言、调门槛解决。

## 七、未覆盖

- **回合类方法的真实执行**：`session/send|stop|compact|fork|goal|resume|subscribe|setModel|setThoughtLevel|setMode` 的实际副作用由 `kernel-bridge-02/03` 的端口承担；本包合同只冻结「映射 + capability 缺席语义」（B10）。这是 D5 记录的临时态，`kernel-switch` 前必须关闭。
- **`workspace/generateText`、`provider/testModelConnectivity`**：需要真实模型与凭据，离线只能断言协议边界；实机归 `kernel-switch`。
- **通知的完整触发序列**：`process/mcpTelemetry` 等依赖 MCP 与资源采样器，合同阶段只冻结通知名与形状；触发点覆盖在实现阶段补 B14。
- **分片帧与 flow control**：v4 面，归 `kernel-bridge-01`。
- **旧会话库读写**：归 `kernel-legacy-sessions`。
- **macOS 实机**：未验证，如实标注。

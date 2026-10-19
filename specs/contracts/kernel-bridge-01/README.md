# kernel-bridge-01 合同（DSH 运行时 v4 协议桥）

**合同版本：v1**（2026-10-19）

本目录是 M2 接入包 `kernel-bridge-01` 的合同。它冻结新运行时（`KNORVIA_KERNEL_ENGINE=dsh`）对 v4 公开协议面的等价实现：命令经 `CommandInbox` 裁决后映射为 DSH 会话操作，DSH 会话事件映射为 v4 snapshot/deltas 与帧；**字段、ACK、序号、快照与双链路语义一字不改**。合同阶段只写断言，不接线。

- 分支：`contract/kernel-bridge-01`（基线 `main` `2ff49565`，已含 `kernel-dsh-00` #198）；认领 issue：**#205**
- 前置合同：[`kernel-dsh-00`](../kernel-dsh-00/README.md) v1（新运行时能启动并就绪；G5 明确“没有 v4 协议表面”）
- 依据：`specs/knorvia-builtin-kernel-dsh.md`、`specs/knorvia-internal-plugins.md`、计划书「内核方案调整」「接入包流程」、`docs/knorvia-kernel-dsh-00-acceptance.md`
- 事实来源：现有旧运行时的实测行为（默认引擎）、`@deepseek-ai/dsh@0.2.0-rc.2` 公开类型与 `kernel-dsh-00` §二.6 的会话/事件入口。不读、不改 DSH 源码。

## 一、范围

### 1. 本包做什么

1. 在 `KNORVIA_KERNEL_ENGINE=dsh` 下，让 `knorvia app-server --stdio` 提供与旧运行时**逐字段相同**的 v4 NDJSON 入口。
2. 命令 → DSH 会话操作：`createSession`、配置类命令、行定位/CAS 命令等按现有 `CommandInbox` 裁决顺序执行；ACK 状态与 `reasonCode` 不变。
3. DSH 事件 → v4 数据面：会话事件经既有 projection 产出 snapshot/deltas；v4 `seq` 连续、`(fromSeq, toSeq]` 区间成立。
4. 保留两条链路的协议语义：`desktop-continuous` 与 `web-remote-replayable` 共用同一 publisher、同一帧、同一序号；`connection flow` 只影响投递。
5. 合同测试全部走 v4 公开协议入口（spawn `app-server --stdio`，只读写 NDJSON），不 import 桥或 bootstrap 内部模块。
6. 合同阶段登记本包新增文件来源；实现阶段只新增桥代码，不改协议与 DSH 源。

### 2. 本包不做什么

- 不修改 `packages/shared/src/protocol-v4/**` 的任何字段、schema、常量或导出；不改命令 payload、ACK 形状、通知外壳、错误码。
- 不切换默认引擎、不删除旧运行时（`kernel-switch`）。
- 不改 DSH 源码、不 fork、不 vendor；DSH 无法直接满足的语义由桥补齐，缺口记录到执行工件 `bridge01-gaps.md`，不向上游提修改。
- 不迁移旧会话库、不双写旧 `db.sqlite`（`kernel-legacy-sessions`）。
- 不做工具、权限、Hook、凭据、记忆、技能来源、MCP 配置、目标、子 Agent、动态工作流插件的完整能力（`kernel-plugin-*`）；已存在命令的公开 ACK 语义仍须保持。
- 不新增 UI 或 renderer 调用面；桌面/手机客户端代码不变。

## 二、锁定的不变量

实现阶段以下任何一条变化都视为破坏合同，必须升版本并重录旧门。

| #   | 不变量       | 内容                                                                                                                                                                                                                                                                  | 断言位置                                |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| L1  | 引擎门       | 仅 `KNORVIA_KERNEL_ENGINE` 去空白后严格等于 `dsh` 走新桥；缺省/其他值逐字节保持旧运行时                                                                                                                                                                               | 旧门（默认引擎）+ 实施期 `--engine dsh` |
| L2  | 物理协议面   | UTF-8 NDJSON；request `{id,method,params?,trace?}`、response `{id,result}`、error `{id,error:{code,message,data?}}`、notification `{method,params?,trace?}`；strict、无 `jsonrpc` 字段                                                                                | 全部测试；`shared-01` schema 套件       |
| L3  | CommandInbox | 解析拒绝、会话存在性、CAS 缺失、`logEpoch`/`revision` 失配、行定位裁决的顺序与结果不变；全局 `createSession` 幂等桶、settled 查询不回退为 unknown                                                                                                                     | B3–B7                                   |
| L4  | 序号         | `seq` 是事件水位：每个被投影的源事件 +1（含 0 delta 的同值事件）；帧区间 `(fromSeq,toSeq]`，同一订阅 `next.fromSeq = prev.toSeq`；`toSeq - fromSeq` 是区间内事件数，deltas 数组可更短或为空；snapshot `fromSeq=0` 且 `snapshot.seq = frame.toSeq`；不得跳号/重号/乱序 | B8–B11                                  |
| L5  | 快照身份     | `protocolVersion/sessionId/logEpoch/seq/revision/control/rows/goal/plan/config` 字段与语义不变；`revision` 只随用户可见状态变更递增                                                                                                                                   | B8–B10                                  |
| L6  | 双链路       | 两个 `clientMode` 产生相同帧内容与序号；差异只在投递/缓冲；`flow` 只暂停指定 connection                                                                                                                                                                               | B12–B14                                 |
| L7  | 会话生命周期 | 订阅响应先于 initial frame；resync 在同一 subscription 上回到 recovery snapshot；unsubscribe 只影响自身；stdin EOF 后退出 0                                                                                                                                           | B8/B11/B16                              |

## 三、已有契约测试的复用

计划书「接入包流程」要求列出“走 v4 公开协议入口、对新运行时同样适用”的既有契约测试。

**结论（实测）：本包之前没有任何 `specs/contracts/*` 用例启动真实 `app-server --stdio` 并发送 v4 请求/帧。** `kernel-bridge-01/tests` 是第一套运行时级 v4 契约。现有套件按适用性分类：

| 套件                                                                                                                                            | 入口                                                          | 是否走 v4 运行时入口 | 对新运行时的要求                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| `specs/contracts/shared-01`                                                                                                                     | `@knorvia/shared/protocol-v4` schema                          | 否（纯编解码）       | **继续全过**。它是 v4 字段/帧/schema 的权威；桥必须复用同一入口，测试同时以 source 与 dist 跑。       |
| `specs/contracts/apps-cli-packages-01-model`                                                                                                    | bootstrap 协议纯函数（源码/dist）                             | 否（模块级）         | **继续全过**。bridge 若复用 mapping/projection/snapshot 模块，这些断言就是模块级回归；实现 PR 重跑。  |
| `apps/cli/packages/bootstrap/test/session-projection-contract.test.ts` 等                                                                       | bootstrap projection/snapshot 模块                            | 否（模块级）         | **继续全过**。新桥复用同一 projection/reducer 时作为实现阶段回归；不假设桥内部结构。                  |
| `specs/contracts/kernel-dsh-00/tests/engine-selection.test.mjs`                                                                                 | CLI 进程引擎选择                                              | 否                   | 继续通过；证明默认路径不加载 DSH。                                                                    |
| `specs/contracts/contracts-01/02/03`、`shared-02/03`、`dynamic-workflow-*`、`apps-cli-packages-01`                                              | 包级纯模块/边界合同                                           | 否                   | 与运行时无关，期望不变。                                                                              |
| `specs/contracts/core-*`（core-01/02/03、core-hooks、core-runtime-helpers-01、core-runtime-methods-01/02、core-tool-01、core-tool-handlers-\*） | **旧内部端口**（直接 import `apps/cli/packages/core/src/**`） | 否                   | **不迁移**。只测旧 runtime/tool handler 实现，随旧包删除；清单见 [acceptance.md](acceptance.md) §五。 |

- 本包自己的测试是唯一通过 `KNORVIA_BRIDGE_ENGINE=dsh`（映射为产品开关 `KNORVIA_KERNEL_ENGINE=dsh`）在**同一套断言**上跑新运行时的套件；旧门默认引擎必须全过，桩必须全失败。
- 不把“schema 套件通过”当作“运行时通过”；两者在 [acceptance.md](acceptance.md) 分列。

## 四、条目 → 测试对照表

测试文件在 `specs/contracts/kernel-bridge-01/tests/`，由 `scripts/test-studio.mjs` 自动发现；`node` 直接运行 `.test.mjs`，无构建步骤依赖（但默认入口要求先 `pnpm build:cli-packages`）。

| 条目 | 测试文件 · 用例                                                         | 覆盖不变量 |
| ---- | ----------------------------------------------------------------------- | ---------- |
| B1   | 旧门默认引擎全过；实施期 `run-old-gate.mjs --engine dsh` 全过           | L1         |
| B2   | 全部用例对严格 NDJSON 的读写；`shared-01` schema 套件                   | L2         |
| B3   | `command-inbox-contract.test.mjs` · createSession 全局幂等 + query      | L3         |
| B4   | 同上 · CAS 缺 `baseRevision` → rejected `proto.invalidPayload`          | L3         |
| B5   | 同上 · 过期 `baseRevision` → stale `proto.staleRevision` 且不落状态     | L3         |
| B6   | 同上 · 重复 commandId 回放首次 ACK                                      | L3         |
| B7   | 同上 · 未知会话、非法 payload、行定位 stale `baseLogEpoch`              | L3         |
| B8   | `sequence-snapshot-contract.test.mjs` · initial snapshot 身份与草稿形态 | L4/L5      |
| B9   | 同上 · 事件水位连续、revision 递增、同值 no-op 为空帧且不递增           | L4/L5      |
| B10  | 同上 · 有效 base resume；无效 base 回落 snapshot                        | L4/L5      |
| B11  | 同上 · resync forceSnapshot → recovery；unsubscribe 隔离                | L5/L7      |
| B12  | `two-links-contract.test.mjs` · 两 profile 帧外壳与快照身份同构         | L6         |
| B13  | 同上 · 同一状态变更在两链路产生相同 seq 与 deltas                       | L6         |
| B14  | 同上 · saturated 暂停、drained 原序补发                                 | L6         |
| B15  | 同上 · 非法 `clientMode` 在请求边界拒绝                                 | L2/L6      |
| B16  | `lifecycle-contract.test.mjs` · stdin EOF 后退出 0，stdout 只有协议行   | L7         |

## 五、旧门与桩门

```bash
# 仓库根目录；先 pnpm build:cli-packages
node specs/contracts/kernel-bridge-01/tests/run-old-gate.mjs            # 默认引擎 + transport 桩
node specs/contracts/kernel-bridge-01/tests/run-old-gate.mjs --engine dsh  # 实施阶段：DSH 真实入口
```

| 门                     | 入口                                                   | 判据                     | 产物             |
| ---------------------- | ------------------------------------------------------ | ------------------------ | ---------------- |
| 旧门（合同阶段）       | `apps/cli/packages/cli/dist/knorvia.cjs`（默认引擎）   | 全部用例通过，0 fail     | `gate-old.json`  |
| 桩门                   | `stubs/app-server-stub.mjs`（只回 `Method not found`） | `pass === 0 && fail > 0` | `stub-gate.json` |
| 新运行时门（实施阶段） | 同一 dist + `KNORVIA_BRIDGE_ENGINE=dsh`                | 与旧门相同的用例全部通过 | `gate-dsh.json`  |

- 桩只实现 `app-server --stdio` 的 transport 签名（读 NDJSON、按 `id` 回错误），不含任何 v4 方法或帧语义；用例若在桩上通过，说明断言没有真正触达行为。
- 测试入口仅由 `KNORVIA_BRIDGE_ENTRY` 覆盖；产品开关只在测试进程设置 `KNORVIA_BRIDGE_ENGINE=dsh` 时写入，避免开发机环境泄漏。
- 子进程环境清除 `DSH_*` 与供应商凭据，隔离 HOME/数据目录；测试不依赖模型、网络或用户配置。

当前录制结果（2026-10-19，Node v24.14.0）：

| 门   | 结果                                   |
| ---- | -------------------------------------- |
| 旧门 | 20/20 pass, 0 fail（`gate-old.json`）  |
| 桩门 | 0/10 pass, 10 fail（`stub-gate.json`） |

## 六、计分与来源

- 合同阶段新增文件（本目录）登记 `original`、`Apache-2.0`；旧门与桩门结果作为行为证据，不是源码复制。
- 实现阶段新增桥代码登记 `original`；若出现对旧 `bootstrap/src/protocol-v4/**` 文件的替换，按该包既有相似度门槛（行相似度包含率 < 0.20、最长相同段 < 8 行、结构相似度 < 0.40）单独计分。
- 复用旧模块（`CommandInbox`、publisher、projection）不重写、不登记原创；DSH 包按第三方依赖登记，不跑相似度。
- `licensing/reviews.json` 通过 `scripts/provenance/model.mjs` 程序化追加，核条目数量；`pnpm provenance:report` 与 `pnpm provenance:check` 必须通过。

## 七、完成度

| 步骤                                  | 状态 |
| ------------------------------------- | ---- |
| 旧运行时 v4 行为侦察与复用清单（§三） | ✅   |
| `behavior.md` B1–B16                  | ✅   |
| `interface.md`                        | ✅   |
| `tests/`（含旧门/桩门运行器）         | ✅   |
| `known-differences.md` / `callers.md` | ✅   |
| `acceptance.md`                       | ✅   |
| 来源登记与门禁                        | ✅   |
| 实现 PR（DSH 协议桥）                 | ⬜   |

## 八、缺口清单（DSH 无法直接满足）

执行期的完整缺口与处置写入工作区工件 `bridge01-gaps.md`（不随仓库提交）；以下是影响合同边界的摘要。

| #   | 缺口                                                                                                            | 影响                                                    | 处置                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| G1  | DSH 没有 v4 协议表面（只有 ACP/SDK/Web）                                                                        | 开关打开后不产出任何 v4 帧                              | 桥实现 v4 入口；本包合同即其行为边界                                                                   |
| G2  | DSH 事件与 v4 源事件不是一一对应：一个 DSH 事件可能投影为 0..N 个 v4 delta，或需要多个 DSH 事件合成一个 v4 事件 | 不能按 delta 数推断 `seq`，也不能直接复用 `Session.seq` | 桥按“每个被投影的源事件 +1”独立记账，0 delta 事件也占位；见 [interface.md](interface.md) §六           |
| G3  | DSH 没有 `logEpoch` 概念                                                                                        | resume 的 base 校验缺权威代际                           | 桥在会话元数据中持久化 epoch；失配回落 snapshot（B10）                                                 |
| G4  | DSH 不提供 v4 命令语义（CAS、queue/guide、行定位、ACK 状态）                                                    | 命令不能直接透传                                        | 继续使用既有 `CommandInbox` + 命令处理层；桥只实现执行端口                                             |
| G5  | DSH 的会话存储是自有 JSONL，不含 v4 projection 词表                                                             | 无法直接回放 v4 snapshot                                | 桥从 DSH 事件派生 projection；重放/冷恢复由桥重建                                                      |
| G6  | DSH 只有 `buildForkSeed`，没有 v4 分支/行/文件回退语义                                                          | `editUserQuery`/`forkAssistant` 无法直译                | 桥构造 seed；文件回退等保持旧命令语义，能力不足时按既有 fault 返回                                     |
| G7  | DSH 的 MCP 是启动期组合，不是 per-session 命令面                                                                | `createSession.mcpServers` 不能动态挂载                 | 桥/后续插件决定；本包保持 ACK 语义，不新增字段                                                         |
| G8  | DSH 无 v4 附件、flow control、后台工作查询等宿主能力                                                            | 相关方法与投递控制缺失                                  | 桥保留既有宿主实现（附件事务、flow、查询），不依赖 DSH                                                 |
| G9  | DSH 是预发布 SDK（0.2.0-rc.2）                                                                                  | 升级可能破坏桥                                          | 锁定确切版本；升级单独合同与验收                                                                       |
| G10 | 工具/权限/Hook/凭据/记忆/技能/目标/子 Agent 能力不在本包                                                        | 命令面可能返回能力缺席                                  | 按既有 `fault.*`/capability 错误返回；由 `kernel-plugin-*` 补齐                                        |
| G11 | DSH 没有关闭全部 DSH 品牌/账号文案的运行时开关（`kernel-dsh-00` G4）                                            | 工具错误与状态文案可能透出 DSH 字样                     | 桥把用户可见错误/状态文字映射为 Knorvia 中英文文案，不透出 DSH 包名或账号提示；原始原因只进 debug 日志 |

**红线**：以上缺口一律在桥侧适配或在后续包补齐，**不改 DSH 源码**，不放宽本包断言。

## 九、接口与调用方

见 [interface.md](interface.md)、[behavior.md](behavior.md) 与 [callers.md](callers.md)。本包不新增公开模块路径或协议字段；新增的只有 DSH 引擎分支内部的桥实现。

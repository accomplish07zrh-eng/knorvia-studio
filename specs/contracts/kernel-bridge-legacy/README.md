# kernel-bridge-legacy 合同（旧协议 74 方法 / 7 通知在新引擎下的实现）

**合同版本：v1**（2026-10-20）

本目录是 M2 接入包 `kernel-bridge-legacy` 的合同。它冻结 `KNORVIA_KERNEL_ENGINE=dsh` 下旧 Knorvia Protocol 面的等价实现：74 个方法、7 个通知、`interaction/*` 宿主回调；**方法名、参数键、结果形状、错误码与通知名一字不改**。合同阶段只写断言，不改产品代码。

- 分支：`contract/kernel-bridge-legacy`（基线 `origin/main` `526825db`，已含 `kernel-dsh-00` #198 与 `kernel-bridge-01` #218）
- 认领 issue：**#221**
- 前置合同：[`kernel-dsh-00`](../kernel-dsh-00/README.md) v1（新运行时能启动并就绪）、[`kernel-bridge-01`](../kernel-bridge-01/README.md) v1（v4 命令面与帧面）
- 依据：`specs/knorvia-builtin-kernel-dsh.md`、`specs/knorvia-internal-plugins.md`、计划书「内核方案调整」「接入包流程」，以及 2026-10-20 kernel-bridge-01 审查结论
- 事实来源：默认引擎（旧运行时）在 `526825db` 构建产物上的**实测**行为；`@deepseek-ai/dsh@0.2.0-rc.2` 公开类型。不读 DSH 源码、不改 DSH。

## 一、范围

### 1. 本包做什么

1. 在 `KNORVIA_KERNEL_ENGINE=dsh` 下，让 `knorvia app-server --stdio` 应答旧协议**全部 74 个方法**：方法名、参数键、结果形状（共享 `@knorvia/shared` 的 schema 为准）、既有错误码族不变。
2. **7 个服务端通知**在新引擎下按既有触发点发出，并保留 1 个借用方法名的 CLI→Host 通知（`computer-use/operation-event`）。
3. **`interaction/*` 宿主回调链路**：桥 → Host 的反向 request（`interaction/requestPermission`、`requestUserInput`、`requestProviderRuntimeHeaders`、`requestOfficialMcpAuthHeaders`、`browserList`、`browserExecute`），含按请求获取供应商凭据；Host 应答、取消与超时语义不变。
4. 为回合类方法提供**单一执行端口**：本包定义并冻结接口，实现由 `kernel-bridge-02/03` 注册（依赖方向 02/03 → 本包，不得反向）。端口未注册时按既有 `fault`/capability 词表返回，不新增错误码。
5. 合同测试全部走**公开协议入口**（spawn `app-server --stdio`，只读写 NDJSON），不 import 桥或 bootstrap 内部模块；同一套用例对默认引擎（旧门）与 `dsh` 引擎（新运行时门）各跑一遍，桩上必须全失败。

### 2. 本包不做什么

- **不挂载 DSH 现成能力**（内置工具、压缩、goal、plan-mode、subagent、MCP 客户端、sandbox/approval、系统提示与运行环境快照）——`kernel-dsh-builtins`。
- **不实现 v4 命令面与回合**（`v4/command`、`sendText`、排队、steer、取消、审批交互、回合帧）——`kernel-bridge-01/02/03`。本包对 `session/send|stop|compact|fork|goal|setModel|setThoughtLevel|setMode|resume|subscribe` 只做旧协议到执行端口的映射与结果整形。
- **不改协议与数据**：`packages/shared/src/protocol/**`、`packages/shared/src/protocol-v4/**` 零字段改动；旧会话库、`.knorvia-studio`、`KNORVIA_` 环境变量不动。
- **不切换默认引擎、不删除旧实现**：旧 `bootstrap/src/protocol/**`、`protocol-v4/**` 继续服务默认引擎，随 `kernel-switch` 删除。实现阶段只新增桥侧代码 + `entry.ts` 的一处 default 委派。
- **不改 DSH 源码**、不 fork、不 vendor；DSH 满足不了的记缺口上报。
- 不做旧会话库导入（`kernel-legacy-sessions`）、不做凭据/权限/Hook/记忆/技能等插件的内部能力（`kernel-plugin-*`）。

## 二、现状与缺口（2026-10-20 本机实测，`526825db` 构建产物）

### 1. 旧协议面清单

`packages/shared/src/protocol/index.ts` 实测 **74 个方法 / 7 个通知**，按命名空间分组：

| 命名空间        | 数量 | 方法                                                                                                                                                                                                                                            |
| --------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session/*`     | 21   | create、resume、list、subagents、requestRuntimePreferences、read、messages、events、debug、subscribe、send、stop、cancelBackgroundTask、fork、compact、goal、close、setModel、setThoughtLevel、setMode、usage                                   |
| `plugins/*`     | 18   | list、referenceCatalog、referenceCatalogWithCategory、resolveSuggestedReference、setEnabled、overview、marketplace/{add,remove,update}、install、cancelOperation、uninstall、update、restoreBuiltin、configure、resetConfig、validate、describe |
| `workspace/*`   | 8    | readPresentation、hooks/trustGrant、updateInteractionPreferences、updateModelIoPreferences、updateOffPeakToolPolicy、updateDynamicWorkflowPolicy、generateText、cancelGenerateText                                                              |
| `workflows/*`   | 6    | list、get、updateMeta、delete、runs、move                                                                                                                                                                                                       |
| `interaction/*` | 6    | requestPermission、requestUserInput、requestProviderRuntimeHeaders、requestOfficialMcpAuthHeaders、browserList、browserExecute                                                                                                                  |
| `automation/*`  | 5    | create、update、checkTaskBinding、list、delete                                                                                                                                                                                                  |
| `offPeak/*`     | 2    | create、list                                                                                                                                                                                                                                    |
| `provider/*`    | 2    | updateAccountConfig、testModelConnectivity                                                                                                                                                                                                      |
| 单方法          | 6    | `runtime/capabilities`、`computer-use/operation-event`、`mcp/list`、`skills/referenceCatalog`、`usage/stats`、`process/childProcesses`                                                                                                          |

按**方向**分成三类（这个划分决定实现与断言，见 [behavior.md](behavior.md)）：

| 方向                        | 数量   | 含义                                                                                                                            |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 客户端 → CLI 请求           | **59** | Host 现有调用面；必须被应答                                                                                                     |
| CLI → Host 反向请求         | **14** | `session/requestRuntimePreferences`、`automation/*`（5）、`offPeak/*`（2）、`interaction/*`（6）；客户端反向发来时必须是 -32601 |
| CLI → Host 通知（借方法名） | **1**  | `computer-use/operation-event`                                                                                                  |

Host 侧实际消费的方法键：`packages/services/src/agent/**` 扫描实测 **63 个**（59 个客户端方向中除 `computer-use/operation-event` 等借名项外的全部 + 反向下行）。

### 2. 现状缺口（dsh 引擎）

- `apps/cli/packages/bootstrap/src/kernel-bridge/entry.ts` 的 `route()` 只处理 `V4_METHODS`，其余方法一律回 `-32601 Method not found`。
- 实测（`KNORVIA_KERNEL_ENGINE=dsh`，dist 构建产物）：`runtime/capabilities`、`session/list`、`session/create`、`mcp/list`、`plugins/list`、`workspace/readPresentation`、`process/childProcesses`、`usage/stats` 全部 `-32601`；stderr 只有 `knorvia-kernel-ready engine=dsh dsh=0.2.0-rc.2`；stdout 纯净；stdin EOF 后退出 0。
- 默认引擎（同构建）同批请求正常返回，且带 27 条 `startup/storageState` 通知（`checking → migrating×22 → committing → ready`）。
- **结论**：Host 现有旧协议调用在新引擎下全部不可用，这就是本包的缺口；`kernel-bridge-01` 只覆盖 v4 面。

### 3. 与旧运行时的已知差异（必须在实现阶段如实保留）

| #   | 差异                                                                                                                                                                              | 依据                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| D1  | dsh 引擎启动不写 `<数据根>/cli/db/db.sqlite`，因此不发 `startup/storageState` 通知；Host 侧 `KnorviaStorageStartupGate` 只在 `requireStorageStartup` 时等待它，dsh 路径不设该标志 | 实测 + `packages/services/src/agent/storageStartupGate.ts`             |
| D2  | 旧运行时在若干域错误上把内部异常折叠成 `-32603`（如插件不存在、marketplace 源非法、provider 缺失）；新实现必须给出**同一错误码语义**，不得改写成成功                              | 实测（见 behavior B7）                                                 |
| D3  | 旧引擎对不存在会话的只读面回 `-32004`（`Session is not active` / `Session not found`），不同方法文案不同                                                                          | 实测                                                                   |
| D4  | `session/requestRuntimePreferences` 是 CLI→Host 反向请求，`reannounceIntervalMs` 与 `-32022` 超时语义属冻结面                                                                     | `bootstrap/src/protocol/interaction-broker.ts`、`server-operations.ts` |

## 三、锁定的不变量

实现阶段以下任何一条变化即视为破坏合同，必须升版本并重录旧门。

| #   | 不变量     | 内容                                                                                                                                                                                                               | 断言位置                                       |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| L1  | 引擎门     | 仅 `KNORVIA_KERNEL_ENGINE` 去空白后严格等于 `dsh` 走新实现；缺省/其他值逐字节保持旧运行时                                                                                                                          | `run-gate.mjs` 旧门                            |
| L2  | 物理协议面 | UTF-8 NDJSON；request `{id,method,params?,trace?}`、response `{id,result}`、error `{id,error:{code,message,data?}}`、notification `{method,params?,trace?}`；strict、无 `jsonrpc` 字段；`-32700`/`-32600` 入口不变 | B1                                             |
| L3  | 方法覆盖面 | 59 个客户端方向方法全部被应答，永不 `-32601`；59+14+1 = 74                                                                                                                                                         | B5/B8/B9                                       |
| L4  | 方向不可反 | 14 个 CLI→Host 方法在客户端方向保持 `-32601`                                                                                                                                                                       | B8                                             |
| L5  | 结果形状   | 同一请求在两种引擎上产生**同一 schema** 可解析的结果；会话身份闭环（create → list）                                                                                                                                | B6/B7                                          |
| L6  | 错误码族   | 只用既有码：`-32003/-32004/-32009/-32010/-32018/-32031`、`-32603` 折叠、`-32601` 未知方法；不新增、不改写                                                                                                          | B5/B7                                          |
| L7  | 通知名     | 7 个服务端通知名 + 1 个借名通知冻结；不改字面量                                                                                                                                                                    | B9                                             |
| L8  | 生命周期   | stdin EOF 后退出 0；stdout 只有协议行；stderr 不承载协议消息                                                                                                                                                       | B16                                            |
| L9  | 默认路径   | 无 `dsh` 开关时不加载任何 `@deepseek-ai/*`，不创建 DSH 对象                                                                                                                                                        | 旧门（默认引擎）+ `kernel-dsh-00` 引擎选择套件 |

## 四、已有契约测试的复用

计划书「接入包流程」要求列出“走公开协议入口、对新运行时同样适用”的既有契约测试。

**结论（实测）：除 `kernel-bridge-01` 自己的 v4 用例，本仓库没有第二套启动真实 `app-server --stdio` 并驱动旧协议方法的运行时级契约。** 现有套件按适用性分类：

| 套件                                                                               | 入口                                                          | 走旧协议运行时入口 | 对新运行时的要求                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------- |
| `specs/contracts/kernel-bridge-01`                                                 | v4 公开协议（spawn）                                          | 部分（只 v4 方法） | **继续全过**；本包不改 v4 面，实现 PR 复跑旧门与 `--engine dsh`         |
| `specs/contracts/shared-01`                                                        | `@knorvia/shared/protocol-v4` schema                          | 否（纯编解码）     | **继续全过**；本包不改 v4 schema                                        |
| `specs/contracts/kernel-dsh-00/tests/engine-selection.test.mjs`                    | CLI 进程引擎选择                                              | 否                 | 继续通过；证明默认路径不加载 DSH                                        |
| `specs/contracts/contracts-01/02/03`、`shared-02/03/04`、`apps-cli-packages-01*`   | 包级纯模块/边界合同                                           | 否                 | 与运行时无关，期望不变                                                  |
| `specs/contracts/core-*`（core-01/02/03、core-hooks、core-runtime-_、core-tool-_） | **旧内部端口**（直接 import `apps/cli/packages/core/src/**`） | 否                 | **不迁移**；随 `core` 包删除，清单见 [acceptance.md](acceptance.md) §五 |
| `apps/cli/packages/bootstrap/test/**`                                              | bootstrap 模块级                                              | 否                 | 实现阶段按复用情况复跑；本包不假设桥内部结构                            |

- 不把「schema 套件通过」当作「运行时通过」；两者在 [acceptance.md](acceptance.md) 分列。

## 五、条目 → 测试对照表

测试在 `specs/contracts/kernel-bridge-legacy/tests/`，由 `scripts/test-studio.mjs` 自动发现（`specs/contracts/*/tests/*.test.mjs`）。

| 条目 | 测试文件 · 用例                                                                                             | 覆盖不变量 |
| ---- | ----------------------------------------------------------------------------------------------------------- | ---------- |
| B1   | `protocol-surface.test.mjs` · 「NDJSON 严格外壳：jsonrpc 字段被拒、非法 JSON 回 -32700、stdout 只有协议行」 | L2         |
| B2   | 同上 · 「未知方法仍是 -32601，旧协议方法名不得落入该分支」                                                  | L2/L3      |
| B3   | 同上 · 「runtime/capabilities 与 process/childProcesses 的形状保持」                                        | L5         |
| B4   | 同上 · 「workspace 级只读方法在空白工作区可用且形状稳定」                                                   | L5         |
| B5   | `legacy-methods.test.mjs` · 「客户端方向 59 个方法全部被应答：结果或既有错误码，永不 -32601」               | L3/L6      |
| B6   | 同上 · 「session/create → session/list 的会话身份闭环」                                                     | L5         |
| B7   | 同上 · 「空白会话的只读面返回空数组形状，不泄漏内部状态」                                                   | L5         |
| B8   | 同上 · 「Host 方向的 14 个方法在客户端方向仍是 -32601，且同连接上客户端方向方法可用」                       | L4         |
| B9   | 同上 · 「方法表与方法名清单自洽：74 = 59 + 14 + 1，且清单非平凡」                                           | L3/L7      |
| B10  | `implementation-behavior.test.mjs` · 「端口未注册时回合方法回 -32031 + 既有 capability 词表，不伪造成功」   | L6         |
| B11  | 同上 · 「create 发起 runtime-materialization 反向请求并在应答后完成」                                       | L5         |
| B12  | 同上 · 「interaction 六方法方向不可反，同连接上客户端方法可用」                                             | L4         |
| B13  | 同上 · 「plugins/operationProgress 通知形状与触发点」                                                       | L7         |
| B14  | 同上 · 「通知名冻结 7 个，本包触发点确有发出」                                                              | L7         |
| B15  | 同上 · 「computer-use/operation-event 在客户端方向是 -32601」                                               | L4/L7      |
| B16  | `protocol-surface.test.mjs` · 「stdin EOF 后退出 0，stderr 只承载日志不承载协议行」                         | L8         |
| B17a | `reverse-reply.test.mjs` · 「create 触发反向请求并在应答后完成（dsh 下应答可含 method 键）」                | L2         |
| B17b | 同上 · 「顶层带 method 的行按 request 处理，同连接上请求仍被应答」                                          | L2         |
| B17c | 同上 · 「无法匹配的在途应答被安全处置，连接继续可用」                                                       | L2/L6      |

B10–B15 与 B17a–c 为实现阶段补齐（Lead 2026-10-20 要求：`behavior.md` 每条都必须有测试、对照表不得留空）。
两引擎**各自断言自己的真实行为**，不使用 `t.skip`——`run-gate.mjs` 的判据是 `tests === pass`，
skip 会让门禁判 FAIL，且「有跳过」本身就是合同缺测的信号。

## 六、门禁与旧门/桩门

```bash
# 仓库根目录；先 pnpm build:cli-packages
node specs/contracts/kernel-bridge-legacy/tests/run-gate.mjs              # 默认引擎 + 桩
node specs/contracts/kernel-bridge-legacy/tests/run-gate.mjs --engine dsh # 新运行时 + 桩
```

| 门                     | 入口                                                   | 判据                     | 产物             |
| ---------------------- | ------------------------------------------------------ | ------------------------ | ---------------- |
| 旧门（合同阶段）       | `apps/cli/packages/cli/dist/knorvia.cjs`（默认引擎）   | 全部用例通过，0 fail     | `gate-old.json`  |
| 桩门                   | `stubs/app-server-stub.mjs`（只回 `Method not found`） | `pass === 0 && fail > 0` | `stub-gate.json` |
| 新运行时门（实现阶段） | 同一 dist + `KNORVIA_KERNEL_ENGINE=dsh`                | 与旧门相同的用例全部通过 | `gate-dsh.json`  |

- 桩只复述 NDJSON transport 外壳（按 `id` 回 `Method not found`），不含任何旧协议方法或通知语义；用例若在桩上通过，说明断言没有真正触达行为。
- 测试入口只由 `KNORVIA_BRIDGE_ENTRY` 覆盖（桩门专用）；**引擎只用产品开关 `KNORVIA_KERNEL_ENGINE`**，不新造变量。
- 子进程环境清掉 `DSH_*` 与供应商凭据，隔离 HOME/数据目录；测试不依赖模型、网络或用户配置。
- 测试夹具自己保证自然退出：清理统一走 `app.registerCleanup(t, [home])`（收子进程与删临时目录在同一 after 钩子内各自 try/catch），删目录带 `maxRetries`；**不用** `--test-force-exit`。理由与实测见 [known-differences.md](known-differences.md) D7 —— CI 的 `test:studio` 直接收集这些 `.test.mjs`，夹具一处挂死会让 main 的 Windows CI 永久红。

当前录制结果（2026-10-20，Node v24.14.0）：

| 门                | 结果                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| 旧门（默认引擎）  | **10/10 pass, 0 fail**（`gate-old.json`）                              |
| 桩门              | **0/10 pass, 10 fail**（`stub-gate.json`）                             |
| 新运行时门（dsh） | **1/10 pass, 9 fail**（`gate-dsh.json`）——合同阶段应然状态：缺口未实现 |

## 七、完成度

| 步骤                                     | 状态          |
| ---------------------------------------- | ------------- |
| 旧协议面侦察与方向分类（§二）            | ✅            |
| `behavior.md`                            | ✅            |
| `interface.md`（含执行端口冻结面）       | ✅            |
| `callers.md`                             | ✅            |
| `tests/`（含旧门/桩门运行器）            | ✅            |
| `known-differences.md` / `acceptance.md` | ✅            |
| 旧门 + 桩门录制                          | ✅            |
| 来源登记                                 | ⬜（合同 PR） |
| 实现 PR（旧协议方法与通知）              | ⬜            |

## 八、缺口清单（DSH 无法直接满足）

| #   | 缺口                                                                                           | 影响                          | 处置                                                             |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| G1  | DSH 没有 Knorvia 旧协议表面                                                                    | Host 现有调用全部 -32601      | 本包实现旧协议入口；合同即其行为边界                             |
| G2  | DSH 无旧运行时的 `app` 运行时对象（`createKnorviaApp`、session record、goal/compact 等执行栈） | 依赖它的方法不能直译          | 执行端口（§九）+ 既有错误码；端口由 02/03 实装                   |
| G3  | DSH 无 `startup/storageState` 的数据来源（不写旧 sqlite）                                      | 通知缺席                      | 登记 D1；Host 侧 `requireStorageStartup` 不置位，行为等价        |
| G4  | DSH 无插件市场/已保存工作流/技能目录的产品语义                                                 | 目录类方法需要 Knorvia 侧事实 | 由 Knorvia 插件提供事实源；本包只做协议映射                      |
| G5  | DSH 无旧协议的自动化与 Off-Peak 端口                                                           | 反向请求链路缺宿主            | 端口在本包定义，Host 侧已实现应答；CLI 侧按既有方向发起          |
| G6  | DSH 是预发布 SDK（0.2.0-rc.2）                                                                 | 升级可能破坏桥                | 锁版本；升级单独验收                                             |
| G7  | DSH 无关闭全部 DSH 品牌文案的运行时开关                                                        | 用户可见文案可能透出 DSH      | 桥把用户可见错误文案映射为 Knorvia 文案；原始原因只进 debug 日志 |

**红线**：以上缺口一律在桥侧适配或由后续包补齐，**不改 DSH 源码**，不放宽本包断言。

## 九、接口与调用方

见 [interface.md](interface.md)（含执行端口与反向请求的冻结面）、[behavior.md](behavior.md)、[callers.md](callers.md)。

## 十、与相邻包的接缝（2026-10-20 Lead 裁决）

1. **回合类方法**：本包含 legacy 路由器 + 全部非回合方法 + interaction 回调整形 + 单一执行端口。`kernel-bridge-02/03` 通过 `registerLegacyExecutionPort`（见 interface.md §四）在组合根注册，**依赖方向 02/03 → 本包**，不得反向 import。
2. **端口未注册时**：一律按既有 capability 错误族返回（`-32031` + 既有 `fault.command.capabilityUnsupported` 词表），**不新增错误码**；该临时态登记在 [known-differences.md](known-differences.md) D-soft 与验收文档「未覆盖」。
3. **`entry.ts` 委派**：本包只在 `entry.ts` 的 `route()` default 分支加一处委派（交给 legacy 路由器），其余不动；该 hunk 归本包，02/03 只扩自己的方法注册表。
4. **`kernel-switch` 准入**：回合类方法必须由 02/03 实装到端口、legacy 侧评测转绿后，才允许切默认引擎。

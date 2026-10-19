# apps-cli-packages-02 合同（v1）

`apps/cli/packages/` 中五个 M2 替换包的行为合同。计划书「每包流程」第一步的产物；
替换合同 PR 标题固定为 `contract: apps-cli-packages-02 v1`。

- 分支：`contract/apps-cli-packages-02`（基线 `origin/main` @ `575acf91`）
- 工作树：`/workspace/wt-acp02`
- 认领：issue #189（M2 替换包，`apps-cli-packages-02`）
- 状态：v1 合同完成（行为、契约测试、旧门、桩门均在本目录留档）

## 一、范围

数据来源：`licensing/current-files.json` 的登记分类实测（逐文件分类见下表），文件路径与
分类以该快照为准。

| 包                         | 继承文件 | 其中源码/配置                 | 说明                                                          |
| -------------------------- | -------- | ----------------------------- | ------------------------------------------------------------- |
| `dynamic-workflow-runtime` | 8        | 7 源码 + 1 配置               | 沙箱 harness；只依赖 `@knorvia/dynamic-workflow` 的冻结公开面 |
| `i18n`                     | 7        | 6 源码 + 1 配置               | 语言探测、解析与 en-US / zh-CN 两套目录                       |
| `telemetry`                | 12       | 11 源码 + 1 配置              | 模型/Agent 遥测；公共入口只有 `src/index.ts`                  |
| `shared-types`             | 3        | 1 源码 + 2 配置               | 纯类型包；运行期导出为空                                      |
| `node-repl-host`           | 5        | 3 源码/清单 + 1 测试 + 1 配置 | 本包只锁工具契约与发布面；宿主实现不在重写范围                |
| 合计                       | **35**   |                               | 6,761 行（含空行与注释的物理行）                              |

> 行数分布：`dynamic-workflow-runtime` 1,400、`i18n` 1,030、`telemetry` 3,944、
> `shared-types` 89、`node-repl-host` 298。`telemetry` 的 3,944 行中 `agent-trace-runtime.ts`
> 一个文件 1,686 行，是测量口径上的最大单文件。

**与派单数字的差异（如实记录）**：

1. 派单说 `node-repl-host` 继承 4 个文件，实测 5 个：额外的
   `test/runtime.test.mjs` 在 `licensing/current-files.json` 登记为 `unreviewed`。派单明确
   要求「按实测」，故以 5 为准；该测试不属于行为兼容面，替换阶段删除或重写（见
   `known-differences.md` §二）。
2. `debug` 实测 0 个继承文件：该包已在 `f47d5717`（M0-5，继承 -95）删除，仓库中不存在
   `apps/cli/packages/debug`。本包无 `debug` 条目。
3. `node-repl-host` 其余 51 个文件（26 个 `independent-replacement`、23 个 `original`、
   2 个 `reviewed-retained`）已独立或已达标，按 AGENTS.md「不重复改已独立候选项」不动。
4. `node-repl-host/src/broker-transaction.ts`（`independent-replacement`）的相似度返工由
   #197 单独处理，**不在本包合同与重写范围**；本目录的行为、测试与桩都不覆盖它。

**明确不在范围**：

- `apps/cli/packages/dynamic-workflow`（编译器/引擎，本包只读其冻结公开导出）；
- `@knorvia/contracts`、`@knorvia/contracts/telemetry`、`@knorvia/contracts/model`（类型来源；
  接口不变）；
- `@knorvia/shared/node`（`resolveKnorviaDataRoot` 等运行期依赖）；
- `node-repl-host` 的宿主实现、构建脚本与既有测试；
- 根 `package.json`、turbo/pnpm 配置（只在发布面引用这些包）。

## 二、逐文件清单

`[u]` = `upstream-modified`；`[u0]` = `upstream-unchanged`；`[ur]` = `unreviewed`。

```text
dynamic-workflow-runtime/README.md                        [u]   58 行
dynamic-workflow-runtime/package.json                     [u]   28 行
dynamic-workflow-runtime/tsconfig.json                    [u0]  20 行
dynamic-workflow-runtime/src/child-entry-file.ts          [u]   88 行
dynamic-workflow-runtime/src/child-source.ts              [u]  378 行
dynamic-workflow-runtime/src/harness.ts                   [u]  592 行
dynamic-workflow-runtime/src/index.ts                     [u]   37 行
dynamic-workflow-runtime/src/protocol.ts                  [u]  199 行

i18n/package.json                                         [u]   25 行
i18n/tsconfig.json                                        [u0]  17 行
i18n/src/index.ts                                         [u]   32 行
i18n/src/locale.ts                                        [u]   80 行
i18n/src/locales/en-US.ts                                 [u]  311 行
i18n/src/locales/zh-CN.ts                                 [u]  308 行
i18n/src/types.ts                                         [u]  257 行

telemetry/package.json                                    [u]   36 行
telemetry/tsconfig.json                                   [u0]  16 行
telemetry/src/agent-metrics.ts                            [u]  248 行
telemetry/src/agent-trace-runtime.ts                      [u] 1686 行
telemetry/src/agent-trace-support.ts                      [u]  423 行
telemetry/src/bootstrap.ts                                [u]  424 行
telemetry/src/compatibility-adapters.ts                   [u]   88 行
telemetry/src/error-sanitizer.ts                          [u0] 176 行
telemetry/src/index.ts                                    [u0]    5 行
telemetry/src/model-api-recorder.ts                       [u]  448 行
telemetry/src/otlp-exporter.ts                            [u]  295 行
telemetry/src/provider-endpoint.ts                        [u]   99 行

shared-types/package.json                                 [u]   22 行
shared-types/tsconfig.json                                [u0]  16 行
shared-types/src/index.ts                                 [u0]  51 行

node-repl-host/.knorvia-plugin/plugin.json                [u]    9 行
node-repl-host/package.json                               [u]   36 行
node-repl-host/tsconfig.json                              [u0]  18 行
node-repl-host/src/tool-contract.ts                       [u]   15 行
node-repl-host/test/runtime.test.mjs                      [ur]  220 行
```

`interface.md` 由 `tools/extract-interface.mjs` 用 TypeScript 编译器 API 从上述 22 个源码模块
逐字生成（22 模块 = `u-modified` 19 + `u-unchanged` 3）。生成器只列为导出声明，不代替行为合同。

## 三、合同取向

本包是**运行时型为主、类型面为界**的混合包：`dynamic-workflow-runtime` 与 `telemetry` 是流、
子进程、时序与遥测旁路；`i18n` 是纯函数 + 数据目录；`shared-types` 是纯类型；`node-repl-host`
只锁清单与工具契约。

写合同的硬要求：

- `behavior.md` 每条 B 条目写输入、输出、错误语义、时序与并发、幂等、资源释放、平台差异、
  状态所有者、日志级别；可观察常量逐条列出。
- 旧门在源码与 dist 两种入口上都全过、零跳过、零放宽；桩替换后全部用例失败（`stub-gate.json`）。
- 协议字段、环境变量键（`KNORVIA_*`、`OTEL_*`）、数据目录（`.knorvia-studio`、`knorvia-workflow-runs`）
  一律不变（计划书选择 8）。
- `i18n` 的译文文本不作为逐字兼容面：重写允许用自己的话重述，但键集合、参数语义、数量/重试/
  中断等含义必须保持；测试锁语义不锁人类语言原文（见 `known-differences.md` §三）。
- 不复制、不改名照搬、不逐行改写；替换阶段两道相似度门槛照常执行（合同阶段只登记口径）。

## 四、风险与要点（写合同时已覆盖）

1. **沙箱边界**：子进程通过 stdio NDJSON 与父进程通信；`create-actor` 是即发即忘，依赖
   stdio FIFO 在任何引用该句柄的 ask 之前到达。`report` / `declare-artifact` / `phase-entered`
   也走事件通道，到达顺序承重。任何把事件通道异步化的改动都会破坏 journal 顺序。
2. **失败分类**：脚本抛错 → `errored`（`DriverError`）；宿主侧故障（spawn 失败、协议损坏、
   崩溃、超时）→ `stopped(interrupted)`；abort 是唯一「真取消」→ `stopped(user/model/superseded)`。
   两类失败都不得被吞掉。
3. **入口文件**：payload 不经过命令行（Windows 32,767 字符上限）。项目目录不可写时回落
   `os.tmpdir()/knorvia-workflow-runs/` 并告警；回落再失败才抛。
4. **运行期禁令**：沙箱内 `Date.now()`、无参 `new Date()`、`Math.random()` 必须抛错；
   脚本可用的 `args` 是 context 内 `JSON.parse` 出的浅冻结对象。
5. **遥测旁路**：遥测失败不得影响模型/Agent 主链路。`prepareModelTelemetryEnv` 只在
   `KNORVIA_MODEL_TELEMETRY_ENABLED=1` 且存在合法 OTLP trace endpoint 时启用；否则不 import
   OTel SDK。设备 MID 持久化失败只缺匿名关联。
6. **遥测容量与生命周期**：`AgentExecutionTelemetryRuntime` 默认 5,000 个活跃 writer，超限只告警
   一次并回退 noop；`ModelApiTelemetryStatusSink` 默认 30 分钟调用龄、1,000 个活跃调用，过期/容量
   清理不得抛错。
7. **脱敏**：错误正文先有界截断再清洗 URL、鉴权头、查询键、token 形态、邮箱与路径；同一异常沿
   cause 链只认领一次，避免父 Span 复制正文。
8. **i18n 探测**：环境键顺序 `LC_ALL` → `LC_MESSAGES` → `LANG` → `LANGUAGE`；`LANGUAGE` 以冒号
   分隔并逐个尝试；剥离 `.encoding` 与 `@modifier`；`_` 归一为 `-`；忽略 `C`/`POSIX`；未知值
   回落 `en-US`。
9. **node-repl-host**：包 `exports` 直接指向 `src/*.ts`，构建只产出 `dist/mcp/server.js` 单文件
   bundle；`tool-contract` 的版本、超时与两段文本是插件发布面。
10. **dist 入口事实**：`node-repl-host` 没有逐模块 `dist` 镜像，dist 模式仍加载同一份
    `src/tool-contract.ts`（在 `known-differences.md` §四说明）；其余四包的 `dist` 由
    `pnpm build:cli-packages` 生成。

## 五、方法

1. 范围：`licensing/current-files.json` 实测，逐包与派单核对（差异见 §一）。
2. 接口：`tools/extract-interface.mjs` → `interface.md`；22 个模块、导出声明逐字。
3. 调用方：全仓 import 检索（`@knorvia/<pkg>`、包内相对引用）并人工核对，见 `callers.md`。
4. 行为：直接阅读当前实现，按可观察面写 `behavior.md`（B1–B38）；不写实现结构。
5. 测试：`tests/*.test.mjs` 经公开入口或包内模块路径加载；`KNORVIA_ACP02_ENTRY=source|dist`
   切换四包的源码/构建产物入口；`tests/entry.mjs` 统一解析。
6. 旧门：`tests/run-old-gate.mjs` 跑两种入口并落 `gate-old.json`；`--with-stubs` 应用
   `stubs/apply.mjs`（22 个模块）后重跑并落 `stub-gate.json`，要求 0 通过。
7. 登记：`pnpm fmt:check`、`pnpm lint`、`pnpm typecheck`、`pnpm i18n:check`、
   `pnpm provenance:check`；结果写 `acceptance.md`。

## 六、条目 → 测试对照表

由 `tests/build-case-map.mjs` 从 `behavior.md` 的 `### B<n>` 标题与测试用例名生成；
`--check` 在缺条目或表落后时退出码非 0。

<!-- CASE-MAP:START -->

| 条目 | 测试文件                                                         | 用例                                     |
| ---- | ---------------------------------------------------------------- | ---------------------------------------- |
| B1   | [tests/shared-i18n.test.mjs](./tests/shared-i18n.test.mjs)       | B1 shared-types 运行期面为空且类型名固定 |
| B2   | [tests/shared-i18n.test.mjs](./tests/shared-i18n.test.mjs)       | B2 shared-types 结构与可选性             |
| B3   | [tests/shared-i18n.test.mjs](./tests/shared-i18n.test.mjs)       | B3 locale 常量与大小写敏感谓词           |
| B4   | [tests/shared-i18n.test.mjs](./tests/shared-i18n.test.mjs)       | B4 detectLocale 按固定顺序探测并归一     |
| B5   | [tests/shared-i18n.test.mjs](./tests/shared-i18n.test.mjs)       | B5 resolveLocale 解析、auto 与回落       |
| B6   | [tests/shared-i18n.test.mjs](./tests/shared-i18n.test.mjs)       | B6 getKnorviaCopy 选择与对象身份         |
| B7   | [tests/shared-i18n.test.mjs](./tests/shared-i18n.test.mjs)       | B7 两套目录递归同构且无空叶子            |
| B8   | [tests/shared-i18n.test.mjs](./tests/shared-i18n.test.mjs)       | B8 参数语义（两种语言都保留事实）        |
| B9   | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B9 包公开面与协议类型面                  |
| B10  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B10 目录与入口文件命名                   |
| B11  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B11 入口文件、.gitignore 与覆写          |
| B12  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B12 项目目录失败回落与二次失败           |
| B13  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B13 renderChildEntry 生成自包含 ESM      |
| B14  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B14 childMain 宿主面、消息顺序与实参     |
| B15  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B15 运行期禁令与编译失败                 |
| B16  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B16 完成、响应错误与收尾                 |
| B17  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B17 执行体选择、元数据转交与入口载荷     |
| B18  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B18 宿主事件桥接                         |
| B19  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B19 create-actor 句柄映射与 ask          |
| B20  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B20 脚本抛错 → errored                   |
| B21  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B21 宿主故障 → stopped(interrupted)      |
| B22  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B22 墙钟超时                             |
| B23  | [tests/dwf-runtime.test.mjs](./tests/dwf-runtime.test.mjs)       | B23 abort 归因                           |
| B24  | [tests/telemetry.test.mjs](./tests/telemetry.test.mjs)           | B24 包导出面与无 Owner noop              |
| B25  | [tests/telemetry.test.mjs](./tests/telemetry.test.mjs)           | B25 Owner 委托与关闭语义                 |
| B26  | [tests/telemetry.test.mjs](./tests/telemetry.test.mjs)           | B26 OTLP 端点与 header                   |
| B27  | [tests/telemetry.test.mjs](./tests/telemetry.test.mjs)           | B27 启用开关、设备 MID 与旁路            |
| B28  | [tests/telemetry.test.mjs](./tests/telemetry.test.mjs)           | B28 错误消息脱敏与截断                   |
| B29  | [tests/telemetry.test.mjs](./tests/telemetry.test.mjs)           | B29 结构化错误与认领                     |
| B30  | [tests/telemetry.test.mjs](./tests/telemetry.test.mjs)           | B30 Provider 端点脱敏与 LRU              |
| B31  | [tests/telemetry.test.mjs](./tests/telemetry.test.mjs)           | B31 Status Sink 生命周期与状态映射       |
| B32  | [tests/telemetry.test.mjs](./tests/telemetry.test.mjs)           | B32 Status Sink 容量、过期与旁路         |
| B33  | [tests/telemetry.test.mjs](./tests/telemetry.test.mjs)           | B33 Runtime 创建、容量与错误分类         |
| B34  | [tests/telemetry.test.mjs](./tests/telemetry.test.mjs)           | B34 Writer run 上下文与终结              |
| B35  | [tests/telemetry.test.mjs](./tests/telemetry.test.mjs)           | B35 指标口径与兼容属性                   |
| B36  | [tests/telemetry.test.mjs](./tests/telemetry.test.mjs)           | B36 OTel Runtime 懒加载与资源属性        |
| B37  | [tests/node-repl-host.test.mjs](./tests/node-repl-host.test.mjs) | B37 包清单、导出面与发布面               |
| B38  | [tests/node-repl-host.test.mjs](./tests/node-repl-host.test.mjs) | B38 工具契约常量与文本                   |

<!-- CASE-MAP:END -->

## 七、旧门与桩替换

```text
pnpm build:cli-packages
node --import tsx specs/contracts/apps-cli-packages-02/tests/run-old-gate.mjs --with-stubs
```

结果见 [`gate-old.json`](./gate-old.json) 与 [`stub-gate.json`](./stub-gate.json)；
验收汇总见 [`acceptance.md`](./acceptance.md)。

## 八、后续步骤（替换阶段，不在本合同）

1. 按 `behavior.md` 重写 35 个继承文件，保留 `interface.md` 的公开面与协议/数据目录。
2. 替换 `node-repl-host/test/runtime.test.mjs`（unreviewed）并处理 #197 的
   `broker-transaction.ts` 返工（独立范围）。
3. 跑两道相似度门槛、`pnpm test:studio`、Linux + Windows CI；
   新文件登记 `original`，basis 如实写明作者读过被替换实现并附实测值。
4. 提替换 PR `replace: apps-cli-packages-02（继承 -35）`。

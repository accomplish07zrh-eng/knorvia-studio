# services-01 合同验收（v1）

对应重写计划书「合同八件套」验收清单与质量门禁要求。旧门产物见 [`gate-old.json`](gate-old.json)。

## 1. 范围与真源

本包范围严格依据 `licensing/current-files.json` 实测并冻结在 [`scope-files.json`](scope-files.json)：

- 包含 `packages/services/src` 下 7 个核心目录（`agent/`、`broadcast/`、`commands/`、`conversation-telemetry/`、`credential/`、`cua-permission-broker/`、`file/`）；
- 共 **60 个继承文件**（36 unreviewed + 23 upstream-modified + 1 upstream-unchanged），21,682 行 / 829,825 字节；
- 包含 58 个 TypeScript 实现文件（顶层导出 336 项）与 2 份继承规范文档（`agent/STDERR-OWNER-SPEC-20261003.md`、`file/FILTER-SPEC-20261002.md`）。

## 2. 八件套交付完成度

| 交付件       | 文件路径                                       | 状态 | 说明                                                                               |
| :----------- | :--------------------------------------------- | :--: | :--------------------------------------------------------------------------------- |
| **范围账本** | [`scope-files.json`](scope-files.json)         |  ✅  | 实测冻结 60 继承文件真源清单与度量                                                 |
| **接口面**   | [`interface.md`](interface.md)                 |  ✅  | AST 机器提取 58 模块 336 条顶层公开导出面                                          |
| **调用方**   | [`callers.md`](callers.md)                     |  ✅  | 三通道扫描（`dep-refs` + grep + AST），附带 [`callers-raw.json`](callers-raw.json) |
| **行为规格** | [`behavior.md`](behavior.md)                   |  ✅  | B1–B63 涵盖 7 个功能簇全部行为、时序、幂等与九项约定                               |
| **目标结构** | [`design.md`](design.md)                       |  ✅  | 契约对齐服务层功能模块约定、三处组合根清单与大文件拆分边界                         |
| **验收报告** | [`acceptance.md`](acceptance.md)               |  ✅  | 本文档，记录旧门实测、首败与修正过程                                               |
| **已知差异** | [`known-differences.md`](known-differences.md) |  ✅  | 红线清单（协议/数据格式/环境一字不改）与实现层允许差异                             |
| **黑盒测试** | [`tests/`](tests/)                             |  ✅  | 12 个测试套件，267 个独立测试断言（源码 + dist 双入口通过）                        |
| **合同桩**   | [`stubs/`](stubs/)                             |  ✅  | 生成器 `build-stubs.mjs` + 58 个 import-and-throw 桩与 `targets.txt`               |
| **旧门**     | [`gate-old.json`](gate-old.json)               |  ✅  | 双入口 100% 绿灯，桩替换 100% 失败验证通过（见 §3）                                |

## 3. 旧门实测结果（gate-old.json）

| 运行入口                                   | 测试文件数 | tests | pass | fail | skipped | exitCode | allFail  |
| :----------------------------------------- | :--------: | :---: | :--: | :--: | :-----: | :------: | :------: |
| **源码入口**                               |     12     |  267  | 267  |  0   |    0    |    0     |    —     |
| **dist 入口** (`KNORVIA_SVC01_ENTRY=dist`) |     12     |  267  | 267  |  0   |    0    |    0     |    —     |
| **桩替换验证** (58 目标文件)               |     12     |  12   |  0   |  12  |    0    |    1     | **true** |

- **`allFail=true` 说明**：桩替换 58 个目标源码后，12 个测试套件在文件加载或执行阶段 100% 抛出 `not implemented: services-01`，证明全部 12 个测试套件均真实依赖本包公开导出面，防刷与空测验证完全达标。
- **环境隔离说明**：遵循 shared-03 复盘经验，dist 入口通过 `--dist-env` 注入环境变量，确保桩替换在源码环境下真实执行并全部拦截。

## 4. 首败与修正（代表性调试与行为判定）

在黑盒契约编写与双入口实跑过程中，发现并对齐了以下代表性实现细节（回写测试与 behavior.md）：

1. **Host 命令队列 Drain 状态机（`A56`）**：出队（drain）由上游 ready 事件驱动触发发送，发送后处于 `status: "running"` 状态；只有收到终端终态或后续 ready 事件时才真正移出 `pendingCommands` 队列。
2. **命令 Promote 优先级（`A56`）**：`promote` 将命令移至队首后，若原运行中命令未收口，队列快照同时包含处于 running 状态的执行项与 accepted 状态的排队项。
3. **工作区身份透传（`A57` / `A59`）**：`setMode` 与 `closeSession` 调用严格透传会话已绑定的 `workspaceIdentity`，避免在跨工作区或远端桌面会话下失去租户隔离。
4. **模型选项快照事实源（`A57`）**：`setModel` 调用后投影的配置项列表以当前会话快照中的模型选项为准；测试 mock harness 初始化时需注入模型选项快照以验证结构化分流。
5. **目标记忆前置校验（`A57`）**：`goalSession`、`stopGeneration` 等操作依赖前置已加载的工作区会话目标记忆，未加载目标时统一抛出稳定的 `KNORVIA_SESSION_TARGET_NOT_FOUND`。
6. **助手消息反馈幂等性（`A515`）**：`setAssistantMessageFeedback` 属于视图层的临时标记映射，适配层不写回底层不可变快照，跨调用不保留未持久化修改。

## 5. 说明

- **测试断言与红线**：严禁放宽测试断言，协议字段、数据目录与错误码逐字保持；
- **持续维护**：新写的 7 个功能模块（`design.md`）将在阶段二接入阶段依据本合同八件套执行，确保无感平替。

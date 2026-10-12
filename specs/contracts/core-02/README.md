# core-02 合同（`@knorvia/core`：memory / model / permission / plugin-reference / runtime-task / session-context / subagent）

**合同版本：v1**（旧门基线：主仓 `c2f79503`；此后合同任何改动都要重跑旧门并升版本）

本目录是 `@knorvia/core` 第二个区域的**兼容合同**：先冻结公开行为与签名，再按合同独立实现（替换阶段见计划书「每包流程」四、五）。

- 范围：`apps/cli/packages/core/src` 下 `memory`（10 继承，含 `memory/recall` 3）、`model`（1）、`permission`（3）、`plugin-reference`（4）、`runtime-task`（5）、`session-context`（4）、`subagent`（31），共 **58 个继承文件**（`licensing/current-files.json` 继承口径实测；单包 ≤60 ✓）。
- 不在本包：包根 `src/index.ts`、`workflow` 及其子目录（core-03）；`agent`/`compact`/`context`/`embedded-search`/`mcp`（core-01）；`hooks`（试点 1）；`tool`/`runtime`（各自的包）；已登记 `independent-replacement`/`original` 的文件（`permission` 9、`runtime-task` 2 等）不动。
- 与计划书分包总表的关系：原表 `core-02` 行范围单元格被截断在 `sessio`、文件数 52 / 行数 5,091；六域实测 27 文件 / 2,624 行，加上 `subagent`（31 文件 / 3,363 行）= **58 文件 / 5,987 行**，与计划书行数口径吻合且 ≤60（Lead 裁定按此执行）。

## 文件

| 文件                    | 内容                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `README.md`             | 本文件：范围、条目 → 测试对照表、旧门结论                                                   |
| `behavior.md`           | B1–B12：输入/输出/错误语义/时序与并发/幂等/资源释放/平台差异/状态所有者/日志级别 + 可测断言 |
| `interface.md`          | 58 个模块路径 + 导出名与类型（相似度工具声明模式的剔除依据；由 TypeScript 类型检查器生成）  |
| `callers.md`            | 区域桶与包根再导出的调用点（入口级文本搜索）+ `dep:refs` 抽样核对                           |
| `tests/`                | 契约测试（`entry.mjs` 支持源码/dist 两入口；`api-surface.test.mjs` + `behavior.test.mjs`）  |
| `fixtures/samples.json` | 测试语料（引用抽取、会话引用、通知输入、草稿路径等）                                        |
| `stubs/`                | 7 个模块路径的最小桩（import 即抛 `not implemented: core-02`）+ `targets.txt`               |
| `known-differences.md`  | 与旧实现已知差异                                                                            |
| `acceptance.md`         | 验收记录：旧门两入口、桩替换、门禁、未覆盖项                                                |
| `gate-old.json`         | 旧门报告（`scripts/contract-gate.mjs` 生成）                                                |

## 条目 → 测试对照表

| 条目                            | 测试                                                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 模块导出面                   | `tests/api-surface.test.mjs`「interface.md 覆盖 58 个模块…」「每个模块列出的运行时名字都能从该模块取到」「区域桶都能载入并导出该区域的代表性名字」「subagent 区的模块与再导出桶都可用」   |
| B2 记忆项目根                   | `tests/behavior.test.mjs`「B2 memory：项目记忆根可确定、随工作区身份区分」                                                                                                                |
| B3 记忆索引内容                 | 「B3 memory：索引内容的裁剪与提示」                                                                                                                                                       |
| B4 记忆提取与召回类型           | 「B4 memory：提取提示与召回类型常量」                                                                                                                                                     |
| B5 辅助模型选项                 | 「B5 model：辅助调用的档位与输出预算」                                                                                                                                                    |
| B6 权限草稿路径与 broker        | 「B6 permission：草稿目录免确认判定的边界（含 Windows 语义）」「B6 permission：默认拒绝的 broker 与区域桶导出」                                                                           |
| B7 插件引用                     | 「B7 plugin-reference：稳定 id 校验与引用抽取」                                                                                                                                           |
| B8 运行任务与会话上下文         | 「B8 runtime-task：密封子代理通知抑制的判定表」「B8 runtime-task：注册表生命周期与终态判定」「B8 runtime-task：通知文案的转义与截断」「B8 session-context：会话引用、部件投影与工具函数」 |
| B9 子代理工具面                 | 「B9 subagent：子代理工具面强制剔除 plan 工具」                                                                                                                                           |
| B10 子代理交互来源              | 「B10 subagent：交互来源的形状与可选键」                                                                                                                                                  |
| B11 子代理通用提示与档案选择    | 「B11 subagent：通用提示与档案模型选择」                                                                                                                                                  |
| B12 子代理消息 steer 与完成通知 | 「B12 subagent：消息 steer 与完成通知」                                                                                                                                                   |

B1–B12 全部有条目且都有测试（无空行）。未被行为条目覆盖的导出（纯类型、以及只在运行器内部使用的模块）在 `acceptance.md` 的「未覆盖项」中列出。

## 旧门（旧实现上的结论）

```
node scripts/contract-gate.mjs --contract specs/contracts/core-02 --tests "*.test.mjs" \
  --dist-env KNORVIA_CORE_ENTRY=dist \
  --stub-root specs/contracts/core-02/stubs --stub-targets specs/contracts/core-02/stubs/targets.txt
```

- 源码入口：tests=19 pass=19 fail=0
- dist 入口：tests=19 pass=19 fail=0
- 桩替换（7 个目标文件）：tests=5 **pass=0 fail=5**（`allFail=true`）→ 契约测试确实测到公开行为
- 详细输出见 `gate-old.json`

## 计分口径（替换阶段）

- 运行时/实现文件：相似度工具**普通模式**（行 + 结构两道门槛）。
- 纯声明/桶文件（`*-types.ts`、`index.ts`、`runtime-task-registry.ts` 等）：`--declaration --interface specs/contracts/core-02/interface.md`。
- 已登记 `independent-replacement`/`original` 的文件不在范围内，替换阶段不动。

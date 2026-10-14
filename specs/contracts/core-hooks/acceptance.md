// SPDX-License-Identifier: Apache-2.0

# core-hooks 合同验收记录（v1.1）

## 一、范围与口径

- 目录 `apps/cli/packages/core/src/hooks/` 共 26 个文件；**重写与删除范围 = 16 个继承文件**
  （`upstream-modified` 14 + `upstream-unchanged` 2，逐文件见 `behavior.md`）。
- 另 10 个文件已登记 `independent-replacement`，按 AGENTS.md「不重复改已独立候选」不动；
  它们拥有的行为列在 `behavior.md` 附录 A，不进入本包测试。
- 计划书分包总表的「文件/行数」按**继承文件口径**计（与 `core-tool-handlers-saved-workflows-01`
  的 4/640、`tool` 的 32 继承同口径）；本包继承 16 个文件，16 ≤ 60，不需要拆包。
- 不在范围的相邻文件：`core/src` 下其余子目录（`agent/`、`compact/`、`context/`、`mcp/`、
  `memory/`、`model/`、`permission/`、`runtime/`、`tool/`、`workflow/` 等）、
  `core/src/index.ts`、`packages/services/src/hooks/**`（设置侧 Hook 服务）、
  `apps/cli/packages/bootstrap/src/app/workspace-hook-*`（信任装配与审核控制）、
  `apps/cli/packages/adapters/src/storage/**`（Trust store 文件实现）。
  这些只作为调用方在 `callers.md` 出现，不在本包重写范围。

## 二、旧门结果（v1.1，`gate-old.json`）

| 项目                                                                  | 结果                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------- |
| 用例数                                                                | 33                                                       |
| 源码入口（`core/src/hooks/index.ts`）                                 | 33 通过 / 0 失败                                         |
| dist 入口（`core/dist/hooks/index.js`，先 `pnpm build:cli-packages`） | 33 通过 / 0 失败                                         |
| 跳过                                                                  | 0                                                        |
| 预登记差异                                                            | 0（`known-differences.md` 为空）                         |
| 桩替换验证（16 个继承文件替换为 `stubs/hooks/*.ts`）                  | 0 通过 / **33 失败**                                     |
| 主仓提交号                                                            | 见 `gate-old.json` 的 `commit`                           |
| Node                                                                  | 见 `gate-old.json` 的 `node`（`mise.toml` 固定 24.14.0） |

命令：

```sh
pnpm build:cli-packages
node specs/contracts/core-hooks/tests/run-old-gate.mjs --with-stubs
```

## 三、首次失败与修正（过程记录）

1. 夹具最初用 `import { createWorkspaceHookBundleSnapshot } from "@knorvia/contracts"` 失败：
   合同目录不属于任何 workspace 包，根 `node_modules` 没有该依赖链接 → 改为按
   `apps/cli/packages/contracts/dist/index.js` 的 dist 入口导入，并在 README 写明先构建。
2. 事件类型断言最初用枚举名（`HookRunStarted`），实际协议值是 `hook_run_started` 等 → 改用协议值。
3. `admission` 求值次数断言最初写死 1 次，实际运行器按生命周期在预扫描/开始前/发布后共求值 3 次
   ——这是附录 A.3 已独立候选文件的行为，本包合同只要求每次调用都携带同一份摘要与 item 标识 →
   断言改为「至少一次且每次入参一致」。
4. `makeSnapshot` 覆盖 `type: "command"` 时残留 `args` 键导致 schema 拒绝 → 夹具在 command 类型下
   删除 `args` 键。

## 四、本机门禁（Node 24.14.0）

契约 PR 只新增 `specs/contracts/core-hooks/**`，不触碰产品源码；本机跑快门禁并在 PR 描述里贴输出：
`typecheck`、`lint`、`fmt:check`、`architecture:check`、`build:cli-packages`、`knip`、
`provenance:report`、`provenance:check`。全量 `pnpm test:studio` 由 PR CI 提供证据
（Windows + Linux）。

## 五、未覆盖与后续

1. 类型层的兼容面（`WorkspaceHookRuntimeAdmissionPort` 等仅类型导出）不在运行时断言内，
   由替换步骤的 `pnpm typecheck` 与 `interface.md` 对照脚本覆盖。
2. 真实 Hook 命令、真实 Trust store 文件、真实客户端交互不在本包测试内：契约测试只用
   内存夹具与假执行端口（`specs/knorvia-tool-hook-boundary.md` 的同一约定）。
3. 附录 A 的 9 类行为由既有 `apps/cli/packages/core/test/hook-*.test.ts` 等存量测试与它们的
   先行规格保护；替换实现 PR 必须保证这些存量测试继续全过。
4. 两份 `pnpm-lock.yaml`、`licensing/current-files.json` 等共享生成物与本包无关；
   替换 PR 再按计划书登记新文件来源（`licensing/reviews.json`，只追加）。

## 六、使用的默认裁决

| 情况                                      | 裁决                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 10 个文件已登记 `independent-replacement` | AGENTS.md「不重复改已独立候选」，不重写、只保留其调用方合同                                       |
| 计划书分包总表与目录实际文件数不一致      | 以**继承文件口径**为准（Lead 2026-10-11 确认），本包继承 16                                       |
| 某段行为是否属于本包                      | 不确定时归入附录 A 并在本文第五节写明，不写进 B 条目（默认裁决「不确定是否还有用 → 保留、不删」） |
| 合同与既有 `specs/` 规格冲突              | 以本合同 B 编号为准并登记；当前无冲突                                                             |

## v1.1 旧门复跑记录

- 触发原因：v1.1 新增两个兼容面导出类型名（`WorkspaceHookEntryEvaluationInput`、`SessionMailboxRegistrationOptions`），供声明模式的兼容行剔除使用；公开签名与行为条目不变。
- 复跑命令：`node specs/contracts/core-hooks/tests/run-old-gate.mjs`
- 结果：源码入口 **33/33**、dist 入口 **33/33**、fail 0；commit `f9b34ee9...`、node `v24.14.0`；详见 `gate-old.json`。

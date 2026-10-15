# core-tool-01 验收（acceptance.md）

v2。对应计划书「合同审查」与「每包流程」二、三步：本合同是**试点 2（M0-13）**的合同（v1，2026-10-11），验收对象是「合同 + 旧门」，不是替换实现。v2（2026-10-15）= v1 按 Lead 裁决 C（2026-10-14，issue #148）的收尾修订：删桩、B88 oracle 改指 `interface.md` 导出声明块（断言方向与强度逐字不变，登记于 `known-differences.md` K4），并按 core-hooks v1.1 先例对旧实现重跑旧门（记录见文末「v2 旧门复跑记录」）。

## 1. 范围

| 项目             | 值                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 在范围           | `apps/cli/packages/core/src/tool` 直接子文件 17 个 + `tool/executor` 直接子文件 15 个 = **32 文件 / 3,914 行**                                                                                    |
| 不在范围         | 同目录 66 个已登记 `independent-replacement` 文件（含它们的既有缺陷，本包不补偿）                                                                                                                 |
| 不在范围的相邻面 | `tool/handlers/**`（`core-tool-handlers-01/02`）、`tool/registry/**`、`tool/repl/**`、`tool/scheduler/**`、`tool/schema-validation/**`、`tool/validation-display/**`、`tool/validation-issues/**` |
| 主仓基线         | `6ea4cbe7`（分支 `contract/core-tool-01` 的检出点）                                                                                                                                               |

## 2. 交付物清单

| 产物                 | 位置                                                                                                  | 状态                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 范围与边界           | `README.md`「范围与边界」                                                                             | 完成                                                                                                                |
| 行为规格 B1–B88      | `behavior.md`                                                                                         | 完成                                                                                                                |
| 接口声明 134 个导出  | `interface.md`                                                                                        | 完成                                                                                                                |
| 最小桩 32 个模块路径 | `stubs/apps/cli/packages/core/src/tool/**`                                                            | v1 完成（语法 32/32；桩替换后契约 0/9 通过，证据留存 `gate-old.json` 的 `stubReplacement`）；**v2 已按裁决 C 删除** |
| 契约测试 81 例       | `tests/pure.test.ts`、`tests/executor.test.ts`、`tests/misc.test.ts`、`tests/deps-and-timers.test.ts` | 完成（两入口各 81/81）                                                                                              |
| dist 入口钩子        | `dist-entry-loader.mjs`                                                                               | 完成                                                                                                                |
| 条目 → 测试对照表    | `README.md` 文末                                                                                      | 完成，无空行                                                                                                        |
| 调用方               | `callers.md`                                                                                          | 完成（覆盖 dep:refs 的全部结果）                                                                                    |
| 已知差异             | `known-differences.md`                                                                                | 完成（K1–K3，各有一条用例）                                                                                         |
| 夹具                 | `fixtures/`                                                                                           | 完成（测试实际读取）                                                                                                |
| 旧门结果             | `gate-old.json`                                                                                       | 完成                                                                                                                |

## 3. 旧门（两个入口，v1 首跑；v2 复跑见文末记录）

命令（仓库根目录，Node 24.14.0，`TSX_TSCONFIG_PATH=packages/ui/tsconfig.json`、`KNORVIA_ENV=test`）：

```text
# 源码入口
node <node24> --import tsx --test specs/contracts/core-tool-01/tests/*.test.ts

# dist 入口（先 pnpm build:cli-packages）
node <node24> --import tsx --import ./specs/contracts/core-tool-01/dist-entry-loader.mjs \
  --test specs/contracts/core-tool-01/tests/*.test.ts
```

| 入口                                           | 用例 | 通过 | 失败 | 跳过 |
| ---------------------------------------------- | ---- | ---- | ---- | ---- |
| 源码 `apps/cli/packages/core/src/tool/**`      | 81   | 81   | 0    | 0    |
| 构建产物 `apps/cli/packages/core/dist/tool/**` | 81   | 81   | 0    | 0    |

dist 入口用解析钩子把测试对 `src/tool/**` 的引用改写到 `dist/tool/**`（含 `.ts` → `.js` 的产物扩展名），
所以两个入口跑的是**同一份**测试代码，不存在两份用例漂移。钩子生效的实测证据：

```text
$ node --import tsx --input-type=module -e "console.log(import.meta.resolve('./apps/cli/packages/core/src/tool/executor/impl.js'))"
file:///.../apps/cli/packages/core/src/tool/executor/impl.ts
$ node --import tsx --import ./specs/contracts/core-tool-01/dist-entry-loader.mjs --input-type=module -e "同上"
file:///.../apps/cli/packages/core/dist/tool/executor/impl.js
```

预登记差异：**0 条**。两个入口的断言集合完全一致，没有为了过门而放宽任何断言。

> v2 复跑（2026-10-15，删桩 + B88 oracle 改指 `interface.md` 后对旧实现重跑）：源码入口 **81/81**、dist 入口 **81/81**、fail 0、skipped 0，预登记差异仍为 0 条。方法与命令见文末「v2 旧门复跑记录」，机器可读结果已刷新进 `gate-old.json`。

## 4. 条目覆盖

B1–B88 每条至少一个断言，对照表见 `README.md` 文末；`gate-old.json` 的 `coverage` 段给出机器可读的映射。
K1–K3 各有一条「证明现在就是这个行为」的用例（K1 在 B43、K2 在 B46、K3 在 B33/B34）。

## 5. 门禁（合同 PR）

| 检查                    | 结果                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`        | 见 PR 描述                                                                                                                                                                                   |
| `pnpm lint`             | 退出码 0；206 条 warning 全部来自 `stubs/**`（只含签名的桩必然有未使用导入/参数），另 1 条是 main 上已有的 `scripts/packaged-runtime-evidence.mjs`；**没有改任何 lint 配置、没有加免检注释** |
| `pnpm fmt:check`        | 见 PR 描述                                                                                                                                                                                   |
| `pnpm provenance:check` | 见 PR 描述（合同、测试、桩与钩子已登记 `original`）                                                                                                                                          |
| 全量 `pnpm test:studio` | 交给 PR 的 CI（本机不跑全量）                                                                                                                                                                |

## 6. 替换阶段的验收点（由替换 PR #153 覆盖，结果见其 PR 描述与 `docs/knorvia-core-tool-01-acceptance.md`）

1. 用 `stubs/` 覆盖 32 个目标文件后，契约测试 **0/81 通过、9 个测试级条目失败**（常量桩在求值时抛错，测试文件在导入阶段中止），每条失败信息都是 `not implemented: core-tool-01`；实测记录见 `gate-old.json` 的 `stubReplacement`。（历史项：桩已按裁决 C 随替换删除，该验证不再可复跑，仅作留证。）
2. 按合同写实现后，两个入口的契约测试 81/81 全过。
3. 删旧文件与桩，不留回退路径；契约测试**留在** `specs/contracts/core-tool-01/tests/` 由 M0-10 机制接入 `test:studio`（裁决 C 附带同意：「移入包 test/」视为被 M0-10 收录口径取代，与 4 个已合并替换 PR 一致）。
4. 两道相似度门槛（对旧文件与上游固定提交 `872ad960`）全过。
5. 新文件登记 `original`，basis 写实测值。

## v2 旧门复跑记录（2026-10-15，裁决 C）

- 触发原因：v2 按 Lead 裁决 C（2026-10-14，issue #148）删桩并把 B88 的 oracle 从 `stubs/<路径>` 改指 `interface.md` 的 ```ts 导出声明块（断言方向与强度逐字不变，登记于 `known-differences.md` K4）。按 core-hooks v1.1 先例，合同改动后对**旧实现**重跑更新后的契约测试。
- 旧实现引用树：工作树 `wt/exec-4-tool`（分支 `contract/core-tool-01-cont`，提交 `4b53a0b7`）。旧实现 32 文件与合同基线 `6ea4cbe7`、以及复跑当日 `origin/main`（`5a129165`）两两 `git diff -- apps/cli/packages/core/src/tool` 均为空——三处字节一致。相对 v1，该树上只覆盖了 2 个更新文件（`interface.md`、`tests/executor.test.ts`，`git status` 佐证）。
- 复跑命令（Node 24.14.0，`TSX_TSCONFIG_PATH=packages/ui/tsconfig.json`、`KNORVIA_ENV=test`）：

```text
node specs/contracts/core-tool-01/tests/run-old-gate.mjs
node specs/contracts/core-tool-01/tests/run-old-gate.mjs --entry dist   # dist 为 6ea4cbe7..4b53a0b7 旧实现构建产物
```

| 入口                               | 用例 | 通过 | 失败 | 跳过 | 退出码 |
| ---------------------------------- | ---- | ---- | ---- | ---- | ------ |
| 源码 `core/src/tool/**`（旧实现）  | 81   | 81   | 0    | 0    | 0      |
| dist `core/dist/tool/**`（旧实现） | 81   | 81   | 0    | 0    | 0      |

- 结论：预登记差异仍为 **0** 条，断言集合与 v1 完全一致（仅 B88 的 oracle 换了读取对象）；`gate-old.json` 已随本次复跑刷新（`oldGateReRun` 段）。
- 新实现同轮验证（PR #153 分支）：源码入口 81/81、dist 入口 81/81，见 PR 描述。

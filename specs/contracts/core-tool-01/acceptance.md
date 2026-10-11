# core-tool-01 验收（acceptance.md）

v1。对应计划书「合同审查」与「每包流程」二、三步：本合同是**试点 2（M0-13）**的合同 PR，验收对象是「合同 + 旧门」，不是替换实现。

## 1. 范围

| 项目             | 值                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 在范围           | `apps/cli/packages/core/src/tool` 直接子文件 17 个 + `tool/executor` 直接子文件 15 个 = **32 文件 / 3,914 行**                                                                                    |
| 不在范围         | 同目录 66 个已登记 `independent-replacement` 文件（含它们的既有缺陷，本包不补偿）                                                                                                                 |
| 不在范围的相邻面 | `tool/handlers/**`（`core-tool-handlers-01/02`）、`tool/registry/**`、`tool/repl/**`、`tool/scheduler/**`、`tool/schema-validation/**`、`tool/validation-display/**`、`tool/validation-issues/**` |
| 主仓基线         | `6ea4cbe7`（分支 `contract/core-tool-01` 的检出点）                                                                                                                                               |

## 2. 交付物清单

| 产物                 | 位置                                                                                                  | 状态                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 范围与边界           | `README.md`「范围与边界」                                                                             | 完成                                                       |
| 行为规格 B1–B88      | `behavior.md`                                                                                         | 完成                                                       |
| 接口声明 134 个导出  | `interface.md`                                                                                        | 完成                                                       |
| 最小桩 32 个模块路径 | `stubs/apps/cli/packages/core/src/tool/**`                                                            | 完成（语法 32/32；覆盖后契约测试必须全失败，在替换阶段做） |
| 契约测试 81 例       | `tests/pure.test.ts`、`tests/executor.test.ts`、`tests/misc.test.ts`、`tests/deps-and-timers.test.ts` | 完成（两入口各 81/81）                                     |
| dist 入口钩子        | `dist-entry-loader.mjs`                                                                               | 完成                                                       |
| 条目 → 测试对照表    | `README.md` 文末                                                                                      | 完成，无空行                                               |
| 调用方               | `callers.md`                                                                                          | 完成（覆盖 dep:refs 的全部结果）                           |
| 已知差异             | `known-differences.md`                                                                                | 完成（K1–K3，各有一条用例）                                |
| 夹具                 | `fixtures/`                                                                                           | 完成（测试实际读取）                                       |
| 旧门结果             | `gate-old.json`                                                                                       | 完成                                                       |

## 3. 旧门（两个入口）

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

## 6. 替换阶段的验收点（本合同 PR 不覆盖）

1. 用 `stubs/` 覆盖 32 个目标文件后，契约测试 81/81 **全部失败**，且失败原因是 `not implemented: core-tool-01`。
2. 按合同写实现后，两个入口的契约测试 81/81 全过。
3. 删旧文件与桩，不留回退路径；契约测试移入 `apps/cli/packages/core/test/` 并接入 `test:studio`。
4. 两道相似度门槛（对旧文件与上游固定提交 `872ad960`）全过。
5. 新文件登记 `original`，basis 写实测值。

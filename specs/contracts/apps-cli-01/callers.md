# apps-cli-01 调用方（callers.md）

版本 v1（第 2 步）。方法：

1. **导出**：`interface.md`，按旧实现的实际可调用形状记录（三个脚本都没有 `.d.ts`）。
2. **调用方**：`pnpm dep:refs --list-exports apps/cli/scripts/count-ts-lines.mjs` 失败，
   报 `错误: 源文件未加载到 project: apps/cli/scripts/count-ts-lines.mjs`——`.mjs` 脚本不在
   dep-refs 的 TypeScript project 内。改用 `pnpm knip` 与全仓引用扫描
   （`grep -rn` 覆盖 `.json`、`.mjs`、`.ts`、`.yml`、`.md`、`.toml`），再按文件归并。
   冻结的 `licensing/evidence/**` 历史快照不计入运行期调用方。

## 一、`clean-dist.mjs`

`node ../../scripts/clean-dist.mjs` 出现在 12 个包的 `clean` 脚本里：

| 调用方                                                    | 脚本    |
| --------------------------------------------------------- | ------- |
| `apps/cli/packages/adapters/package.json`                 | `clean` |
| `apps/cli/packages/bootstrap/package.json`                | `clean` |
| `apps/cli/packages/browser-use-plugin/package.json`       | `clean` |
| `apps/cli/packages/cli/package.json`                      | `clean` |
| `apps/cli/packages/contracts/package.json`                | `clean` |
| `apps/cli/packages/core/package.json`                     | `clean` |
| `apps/cli/packages/dynamic-workflow-runtime/package.json` | `clean` |
| `apps/cli/packages/dynamic-workflow/package.json`         | `clean` |
| `apps/cli/packages/i18n/package.json`                     | `clean` |
| `apps/cli/packages/shared-types/package.json`             | `clean` |
| `apps/cli/packages/telemetry/package.json`                | `clean` |
| `apps/cli/packages/tui/package.json`                      | `clean` |

另外 `apps/cli/package.json` 的 `clean` 是 `turbo run clean`，会经由 turbo 调度上述包脚本。
兼容面：脚本路径与“删除 cwd 下 `dist`”的语义不能变。

## 二、`count-ts-lines.mjs`

| 调用方                  | 入口                                             |
| ----------------------- | ------------------------------------------------ |
| `apps/cli/package.json` | `lint:count` = `node scripts/count-ts-lines.mjs` |

仓库根 `package.json`、CI 工作流和 turbo 任务都没有引用它；它是开发者手动运行的度量命令。
兼容面：脚本路径、`lint:count` 名称、报告格式与失败前缀。

## 三、`generate-bash-command-registry.mjs`

| 调用方                                              | 入口                                                                         |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/cli/package.json`                             | `registry:check` = `node scripts/generate-bash-command-registry.mjs --check` |
| `apps/cli/package.json`                             | `registry:generate` = `node scripts/generate-bash-command-registry.mjs`      |
| `apps/cli/package.json`                             | `check` = `pnpm registry:check && turbo run typecheck`                       |
| 生成文件自己的错误文案                              | 提示运行 `pnpm --dir apps/cli registry:generate`                             |
| `docs/knorvia-third-party-verification-20261011.md` | 记录生成器归属与固定上游版本；不是运行期调用方                               |

生成物的消费方是 `apps/cli/packages/core`（`bash-command-registry.ts`），属于
`core-tool-handlers-01`；本包只保证生成器重新生成后的**字节与已提交文件一致**。

## 四、保留项的历史引用（合同不删，清理留待替换 PR 评估）

- `apps/cli/tools/prompt-trajectory`：目录已在 M0-5 的 `f47d5717` 随基线删除（早于本合同）。本分支
  `66bf2194` 曾删除 `apps/cli/package.json` 指向它的两个入口，现由 `0d656a91` 还原保留；这两个入口的
  `--filter @knorvia/prompt-trajectory` 已指向不存在的包，是否清理留待替换 PR 评估。嵌套的
  `apps/cli/pnpm-lock.yaml` 仍留有 importer 行（过期锁文件，见 `known-differences.md`）。
- `apps/cli/scripts/shadow-replay.mjs`：`06ed43f4` 曾删除，现由 `5cba59a1` 还原保留。全仓运行期引用为 0，
  `pnpm knip` 因此仍把它列为 `apps/cli/scripts/**` 的未使用文件；除冻结的 `licensing/evidence/**` 与
  `licensing/current-files.json` 历史快照外没有其它命中。是否在替换 PR 删除，留待替换阶段评估并写明依据。

## 结论

三个脚本都是**开发/构建工具**，没有包内导入方；兼容面是**文件路径 + npm 脚本名 + CLI 行为**。
`interface.md` 列出的模块路径与导出名在重写后必须继续可用，内部结构可以重组。

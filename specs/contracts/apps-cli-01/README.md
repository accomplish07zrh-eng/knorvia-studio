# apps-cli-01 合同（v1：范围与边界）

`apps/cli` 开发脚本与 `tools/prompt-trajectory` 的替换合同。计划书「每包流程」第一步的产物。

- 分支：`contract/apps-cli-01`（从 `origin/main` @ `1f05d362` 检出；替换分支 `replace/apps-cli-01`）
- 工作树：`/workspace/wt-ac01`
- 状态：**范围已定**。删除项已在合同前完成；旧门在旧实现上双入口全过，桩替换全失败。

## 一、候选范围与实测

数据来源：`licensing/current-files.json`（2026-10-19 实测）与仓库内引用扫描。

| 范围                                                  | 文件数 | 继承文件 | 处理                                                                   |
| ----------------------------------------------------- | ------ | -------- | ---------------------------------------------------------------------- |
| `apps/cli/scripts/clean-dist.mjs`                     | 1      | 1        | **写合同**（`upstream-unchanged`）                                     |
| `apps/cli/scripts/count-ts-lines.mjs`                 | 1      | 1        | **写合同**（`upstream-modified`）                                      |
| `apps/cli/scripts/generate-bash-command-registry.mjs` | 1      | 1        | **写合同**（`upstream-modified`）                                      |
| `apps/cli/scripts/shadow-replay.mjs`                  | 1      | 0        | 已删（`06ed43f4`，knip 无引用）                                        |
| `apps/cli/tools/prompt-trajectory/**`                 | 14     | 0        | M0-5 已删（`f47d5717`）；本分支清理 `apps/cli/package.json` 的失效入口 |
| **合同范围合计**                                      | **3**  | **3**    | **≤ 60，不需要重切**                                                   |

三个脚本的实测规模：

| 路径                                                  | 行  | 字节 | 分类                 | 上游对应                                        |
| ----------------------------------------------------- | --- | ---- | -------------------- | ----------------------------------------------- |
| `apps/cli/scripts/clean-dist.mjs`                     | 7   | 158  | `upstream-unchanged` | `apps/zcode-cli/scripts/clean-dist.mjs`（相同） |
| `apps/cli/scripts/count-ts-lines.mjs`                 | 173 | 5117 | `upstream-modified`  | `apps/zcode-cli/scripts/count-ts-lines.mjs`     |
| `apps/cli/scripts/generate-bash-command-registry.mjs` | 230 | 7971 | `upstream-modified`  | 同名脚本                                        |

`apps/cli/tools/prompt-trajectory` 的 14 个文件为 11 个 `src/*.ts` 加 `README.md`、`package.json`、`tsconfig.json`，全部在 `f47d5717` 删除；本分支 `66bf2194` 只删除 `apps/cli/package.json` 中指向它的 `prompt-trajectory:model-io` 与 `prompt-trajectory:prompt` 两个已失效脚本入口。

**删除 `shadow-replay.mjs` 的依据：** `pnpm knip` 报其为未使用文件；仓库内没有代码、`package.json` 或工作流引用它；命中的只有冻结的 `licensing/evidence/**` 与 `licensing/current-files.json` 历史快照。它从旧运行时 `dist` 导入内部实现，不在任何构建或测试入口上。

## 二、不在范围

- `apps/cli/tools/typescript`：工作区里的 TypeScript 工具包，不是本计划行所说的 `tools/prompt-trajectory`。
- `apps/cli/packages/core/src/tool/handlers/generated/bash-command-registry.ts`：生成物属于 `core-tool-handlers-01`。本包只约束**生成器的输入、模板、路径与输出字节**。
- `apps/cli/packages/**` 的其他脚本调用方只作为调用方登记（`callers.md`），不在这里重写。

## 三、入口语义（没有 dist 构建）

三个目标都是直接由 Node 执行的 `.mjs`，没有 `dist` 产物，因此旧门用两种入口跑同一组断言：

| 入口     | 开关                          | 方式                                                                 |
| -------- | ----------------------------- | -------------------------------------------------------------------- |
| 源码入口 | `KNORVIA_CLI01_ENTRY=source`  | 测试进程内 `import` 脚本，直接调用导出并观察导入副作用               |
| 进程入口 | `KNORVIA_CLI01_ENTRY=process` | 子进程执行脚本文件，与 `package.json` 脚本、人工调用和 CI 的方式一致 |

进程入口在 `gate-old.json` 中仍记为 `dist`（门禁脚本的字段名），但语义是**执行未构建的脚本文件**，不是从构建产物导入。CLI 行为（参数、标准输出/错误、退出码）在两种入口下都通过子进程断言。

## 四、条目 → 测试对照表

17 个用例覆盖 B1–B19；每个 B 至少有一个断言。

| 条目 | 行为摘要                                            | 测试文件                                         |
| ---- | --------------------------------------------------- | ------------------------------------------------ |
| B1   | 删除 cwd 下的 `dist`，兄弟文件保留                  | `clean-dist.test.mjs` 的 B1                      |
| B2   | `dist` 不存在时成功且无输出                         | `clean-dist.test.mjs` 的 B2                      |
| B3   | 只处理 cwd，不碰父目录或脚本目录的 `dist`           | `clean-dist.test.mjs` 的 B3                      |
| B4   | `countLines` 的空文件、尾换行与 CRLF 归一           | `count-ts-lines.test.mjs` 的 B4                  |
| B5   | `isTestSourceFile` 的测试目录段与测试后缀           | `count-ts-lines.test.mjs` 的 B5                  |
| B6   | `isCountedSourceFile` 只计 `.ts`/`.tsx` 且排除测试  | `count-ts-lines.test.mjs` 的 B6                  |
| B7   | `collectTypeScriptFiles` 的排序、忽略目录与测试目录 | `count-ts-lines.test.mjs` 的 B7/B8               |
| B8   | `collectTypeScriptFiles` 跳过符号链接、路径用 `/`   | `count-ts-lines.test.mjs` 的 B7/B8               |
| B9   | `measureTypeScriptFiles` 的行数与 UTF-8 字节数      | `count-ts-lines.test.mjs` 的 B9                  |
| B10  | `formatReport` 的排序、列宽、合计、空输入与换行     | `count-ts-lines.test.mjs` 的 B10                 |
| B11  | CLI 根参数决定扫描目录                              | `count-ts-lines.test.mjs` 的 B11/B12             |
| B12  | CLI 默认使用 cwd，多余参数被忽略                    | `count-ts-lines.test.mjs` 的 B11/B12             |
| B13  | CLI 失败时的 stderr 前缀、退出码与空 stdout         | `count-ts-lines.test.mjs` 的 B13                 |
| B14  | 导入模块不触发扫描，导出函数可直接调用              | `count-ts-lines.test.mjs` 的 B14                 |
| B15  | `--check` 逐字节比较并输出摘要                      | `generate-bash-command-registry.test.mjs` 的 B15 |
| B16  | `--output` 写文件、相对 cwd 解析并创建父目录        | `generate-bash-command-registry.test.mjs` 的 B16 |
| B17  | 生成幂等：两次 `--output` 字节一致                  | `generate-bash-command-registry.test.mjs` 的 B17 |
| B18  | 输出模板、内容哈希、版本常量与结尾换行              | `generate-bash-command-registry.test.mjs` 的 B18 |
| B19  | 默认输出路径固定相对脚本位置，不写 cwd              | `generate-bash-command-registry.test.mjs` 的 B19 |

## 五、旧门结果

命令（仓库根目录，Node v24.14.0）：

```text
node scripts/contract-gate.mjs \
  --contract specs/contracts/apps-cli-01 \
  --tests "*.test.mjs" \
  --env KNORVIA_CLI01_ENTRY=source \
  --dist-env KNORVIA_CLI01_ENTRY=process \
  --stub-root specs/contracts/apps-cli-01/stubs \
  --stub-targets specs/contracts/apps-cli-01/stubs/targets.txt \
  --json specs/contracts/apps-cli-01/gate-old.json
```

| 项                    | 结果                                     |
| --------------------- | ---------------------------------------- |
| 用例数                | **17**（3 个测试文件）                   |
| 源码入口              | **17 / 17 通过**，0 失败，0 跳过，0 todo |
| 进程入口（`dist` 槽） | **17 / 17 通过**，0 失败，0 跳过，0 todo |
| 预登记差异            | **0**（没有为通过而登记的差异）          |
| 断言放宽              | **无**                                   |
| 桩替换（3 个脚本）    | **0 通过 / 17 失败**（`allFail: true`）  |

详细输出见 `gate-old.json`。旧门必须在每次合同改动后重跑并升版本。

## 六、测试只走公开入口

- 源码入口：`tests/entry.mjs` 的 `importScript` 只导入 `apps/cli/scripts/*.mjs`；`count-ts-lines` 的导出签名见 `interface.md`。
- 进程入口：`runScript` 用 `process.execPath` 执行同一脚本，参数、cwd 与环境与真实调用一致。
- 生成器测试不读取实现内部：只读 `--check`/`--output` 的结果、摘要行和已提交的生成物。

## 七、风险与交接

1. **生成器内容哈希跨平台差异**：旧实现按原生路径分隔符拼接相对路径，Windows 与 POSIX 会得到不同哈希；POSIX 上生成的字节与已提交文件一致。替换实现统一用 `/`，Windows 会改为 POSIX 哈希（有意修复），详见 `known-differences.md`。
2. **`clean-dist` 的删除失败分支**没有黑盒测试（权限/平台相关）；替换实现必须保持“错误不被吞掉”。
3. **嵌套 `apps/cli/pnpm-lock.yaml` 已过期**：仍含 `tools/prompt-trajectory`、`packages/debug` 等已删除 importer；离线无法重算（缺 `@knorvia/cua` 工作区包）。不新增引用，不在本包修复。
4. **B7/B8 的符号链接半边**在 Windows 上创建符号链接失败时会退化为“只收集普通文件”的断言；POSIX 分支持续覆盖跳过逻辑。

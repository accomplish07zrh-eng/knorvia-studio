# apps-cli-01 已知差异（known-differences.md）

旧门要求：**源码入口与进程入口都必须 100% 通过、0 跳过**。本包两种入口全部通过，因此
`gate-old.json` 的预登记失败清单为空；这里登记的是**审查时容易误判、但必须原样保留**的既有行为、
一处有意的跨平台修复，以及环境事实。没有为通过而放宽任何断言。

## 一、必须原样保留的既有行为

| #   | 行为                                                                                                                         | 为什么容易误判                                     | 合同条目 |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------- |
| 1   | `generate-bash-command-registry.mjs` 的默认输出相对**脚本目录**解析，不相对 cwd                                              | 大多数 CLI 的默认写入相对 cwd                      | B19      |
| 2   | `count-ts-lines.mjs` 导入时**不扫描**；只有 `argv[1]` 是脚本自身才执行 CLI                                                   | 文件末尾有类似 `main()` 的调用，容易被删守卫       | B14      |
| 3   | `formatReport` 的列宽下限是 5（`"Lines"`/`"Bytes"` 的长度）、数字右对齐、报告以单个 `\n` 结尾、空输入也打印表头              | 空列表或窄列时看起来像多余空白                     | B10      |
| 4   | `countLines("\n") === 1`、`countLines("a\n") === 1`：先去掉一个结尾换行再分段                                                | 与“按换行符个数计行”的直觉不同                     | B4       |
| 5   | CLI 失败统一写 `lint:count failed: <message>` 到 stderr 并设 `process.exitCode = 1`，stdout 保持为空                         | 常见实现会用 `process.exit(1)` 或把错误写到 stdout | B13      |
| 6   | `collectTypeScriptFiles` **跳过所有符号链接**（文件和目录），并把 `relativePath` 统一为 `/`                                  | 链接通常会被跟随                                   | B7/B8    |
| 7   | 生成器固定 `@withfig/autocomplete@2.692.3`；版本不符即中止；摘要里的 `roots=707`、`loadSpecNodes=522` 等计数是固定输入的结果 | 升级依赖时容易直接改版本号                         | B15/B18  |
| 8   | `--check` 与 `--output` 同时出现时 `--check` 生效；未知参数被忽略                                                            | 参数解析看起来过于宽松                             | B15      |

## 二、有意的跨平台修复（替换实现必须做）

**生成器内容哈希的路径分隔符。** 旧实现 `hashBuildFiles` 用
`filePath.slice(directory.length + 1)` 作为哈希输入，保留平台原生分隔符：

- POSIX：`commands/git.js` → 已提交的哈希 `1b0d34b4…`；
- Windows：`commands\git.js` → 不同哈希，已提交文件无法通过 `--check`。

替换实现统一把相对路径规范化为 `/` 再哈希。**POSIX 输出字节不变**（B15/B16/B18 继续锁定已提交文件），
Windows 会从“永远 stale”变为与 POSIX 一致的 `1b0d34b4…`。这是有意的缺陷修复，不登记为测试差异，
也不放宽任何断言；Windows 上的实际重建留给 CI/替换阶段验证。

## 三、未覆盖的分支（行为必须保留，但没有黑盒测试）

1. **`clean-dist` 的删除失败**：权限不足、文件被占用等导致 `rm` 拒绝时，错误不被捕获。测试只覆盖
   成功与“不存在”，因为失败注入依赖平台与权限；替换实现不得吞掉错误。
2. **生成器的中止分支**：依赖版本不符、生成物超过 3 MiB、构建文件导入失败计数增加。测试锁定的是
   固定版本下的成功路径与摘要；这些分支需要篡改 `node_modules` 或上游数据才能构造，不在黑盒范围内。
3. **B7/B8 的符号链接半边**：Windows 上无创建符号链接权限时，测试退化为“只收集普通文件”的断言；
   POSIX 分支持续覆盖跳过逻辑。替换实现必须始终跳过链接。
4. **Windows 上的生成器重建**：本机只在 POSIX 运行，哈希修复的 Windows 行为未实机执行（见 §二）。

## 四、环境与门禁事实

1. **没有 dist 构建**：三个脚本都由 Node 直接执行。`gate-old.json` 的 `dist` 槽实际是
   `KNORVIA_CLI01_ENTRY=process` 的子进程入口；两个入口跑同一组 17 个用例。
2. **Node 版本**：契约测试与旧门在 **Node v24.14.0**（`mise.toml` 固定值）上跑通；PATH 上的
   Node 26 不作为判据。
3. **嵌套锁文件过期**：`apps/cli/pnpm-lock.yaml` 仍含 `tools/prompt-trajectory`、`packages/debug`
   等已删除 importer。离线运行 `pnpm --dir apps/cli install --lockfile-only --offline` 会因缺少
   工作区包 `@knorvia/cua` 失败；该锁文件在 `main` 上就已过期，本包不修复、也不新增引用。
4. **`pnpm knip` 的全仓退出码**：`main` 上就因无关的未使用导出/配置提示而为 1。本合同保留
   `shadow-replay.mjs`（`06ed43f4` 已由 `5cba59a1` 还原），故 knip 仍把它列为 `apps/cli/scripts/**` 的未使用
   文件；此外没有本合同新增的 knip 条目。是否在替换 PR 删除留待替换阶段评估并写明依据。
5. **`test:studio` 会收集合同测试**（M0-10）：`specs/contracts/apps-cli-01/tests/*.test.mjs` 随
   `pnpm test:studio` 运行，测试运行器并发为 2。`B19` 会以确定性内容重写仓库内的生成文件
   （与已提交字节相同）；只有生成器测试文件触碰该文件，文件内用例串行执行。
6. **`pnpm dep:refs` 不覆盖 `.mjs`**：对这些脚本报“源文件未加载到 project”，调用方分析改用
   `knip` + 全仓引用扫描（见 `callers.md`）。

## 五、相似度门槛的交接（重写阶段用）

替换阶段按计划书与 `GATE-PLAYBOOK.md` 执行：不要沿用旧文件边界、不要保留同一语句序列，
注释/日志/错误文案全部重写。必要重合只限于：

- 外部可见字符串：`lint:count failed: `、生成文件头四行、stale 提示；
- 固定常量：`@withfig/autocomplete@2.692.3`、3 MiB 上限、默认输出相对路径；
- npm 脚本名：`lint:count`、`registry:check`、`registry:generate`。

门槛不因此放宽；两个目标脚本（`count-ts-lines.mjs`、`generate-bash-command-registry.mjs`）是
`upstream-modified`，`clean-dist.mjs` 是 `upstream-unchanged`，都要对旧文件与上游固定提交跑两道相似度。

# apps-cli-01 行为规格（behavior.md）

版本 v1 · 2026-10-19 · 基线 `1f05d362` · 分支 `contract/apps-cli-01`

本文描述三个脚本的可观察行为，是重写依据。编号 B1、B2…发布后不重用；条目 → 测试对照见 `README.md` §四。

**状态所有者总览：** 三个脚本都不拥有持久状态。`clean-dist.mjs` 的操作对象是文件系统；`count-ts-lines.mjs` 只读文件系统并产出报告；`generate-bash-command-registry.mjs` 的输入是 `@withfig/autocomplete` 安装内容，输出是单个生成文件。没有跨进程队列、缓存或数据库。

---

## A. `apps/cli/scripts/clean-dist.mjs`

### B1 删除当前工作目录下的 `dist`

- 来源：`clean-dist.mjs`（`upstream-unchanged`，7 行）。
- 输入：无参数；所有命令行参数被忽略。目标是 `resolve(process.cwd(), "dist")`。
- 输出：递归、强制删除 `<cwd>/dist` 整棵子树（含嵌套文件）；成功时不写 stdout/stderr。
- 错误语义：`rm` 的拒绝不被捕获，进程以非零码退出并在 stderr 输出堆栈。该分支依赖文件权限与平台，未纳入黑盒断言（见 `known-differences.md`）。
- 时序与并发：模块顶层执行一次 `await rm(...)`，脚本在删除完成后退出；没有并发写。
- 幂等：是（见 B2）。
- 资源释放：无显式句柄；`node:fs/promises` 的调用自行完成。
- 平台差异：只用 `resolve` 与 Node 的递归删除；Windows 与 POSIX 语义一致。
- 状态所有者：文件系统。
- 日志级别：无日志。
- 可测断言：`B1`（递归删除成功、兄弟文件保留、退出码 0）。

### B2 `dist` 不存在时成功且无输出

- 来源：`clean-dist.mjs`。
- 输入：cwd 下没有 `dist`。
- 输出：无；进程退出码 0。
- 错误语义：`force: true` 使“不存在”不报错。
- 时序与并发：同上，单次调用。
- 幂等：重复执行结果相同。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：文件系统。
- 日志级别：无日志。
- 可测断言：`B2`（退出码 0、stdout/stderr 为空、其他文件不变）。

### B3 只看当前工作目录

- 来源：`clean-dist.mjs`。
- 输入：cwd 为某子目录；其父目录与脚本所在目录也可能存在 `dist`。
- 输出：只删除 `<cwd>/dist`；父目录与脚本目录的 `dist` 不受影响。
- 错误语义：无额外错误路径。
- 时序与并发：同上。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：文件系统。
- 日志级别：无日志。
- 可测断言：`B3`（父目录 `dist` 保留）。

---

## B. `apps/cli/scripts/count-ts-lines.mjs`

### B4 `countLines` 的行数口径

- 来源：`count-ts-lines.mjs` 导出 `countLines(source)`。
- 输入：字符串。
- 输出：先把 `\r\n` 归一为 `\n`；去掉**一个**结尾换行后按 `\n` 分段计数；空串为 0；`"\n"` 为 1；`"a\n"` 为 1；`"a\nb"` 为 2。
- 错误语义：非字符串输入未定义（实现直接访问 `.length`），不在兼容面。
- 时序与并发：同步纯函数，无共享状态。
- 幂等：是。
- 资源释放：无。
- 平台差异：CRLF 与 LF 都得到同一结果。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`B4`（7 组样例）。

### B5 `isTestSourceFile` 的测试文件判定

- 来源：导出 `isTestSourceFile(filePath)`。
- 输入：路径字符串。
- 输出：按 `/` 或 `\` 分段；任一段是 `tests` 或 `__tests__` → `true`；或文件名以 `.spec.ts`、`.spec.tsx`、`.test.ts`、`.test.tsx` 结尾 → `true`；否则 `false`。后缀比较区分大小写。
- 错误语义：无（非字符串按实现会抛错，不在兼容面）。
- 时序与并发：同步纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：两种路径分隔符都识别；返回值与平台无关。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`B5`（目录段、后缀、Windows 分隔符、近义文件名）。

### B6 `isCountedSourceFile` 的计数范围

- 来源：导出 `isCountedSourceFile(filePath)`。
- 输入：路径字符串。
- 输出：扩展名为 `.ts` 或 `.tsx`，且 `isTestSourceFile` 为 `false` 时为 `true`；`.mts`、`.cts`、`.js` 等为 `false`。
- 错误语义：无。
- 时序与并发：同步纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：使用 `node:path.extname`，与平台无关。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`B6`（7 组样例，含测试文件排除）。

### B7 `collectTypeScriptFiles` 的遍历与排序

- 来源：导出 `collectTypeScriptFiles(rootDirectory)`（异步）。
- 输入：根目录路径（相对路径按进程 cwd 解析）。
- 输出：`{absolutePath, relativePath}[]`；只收普通文件且满足 B6；按树内文件名用普通字符串比较排序（非 `localeCompare`）；深度优先、目录先按名称排序。
- 错误语义：`readdir` 失败直接拒绝（缺失根目录 → `ENOENT`）。
- 时序与并发：串行遍历；返回顺序确定。
- 幂等：同一目录同一时刻内容相同 → 结果相同。
- 资源释放：无。
- 平台差异：`relativePath` 统一把分隔符替换为 `/`；`absolutePath` 保留平台原生形式。
- 状态所有者：文件系统（只读）。
- 日志级别：无。
- 可测断言：`B7/B8`（顺序、忽略目录、测试目录排除、`/` 路径、符号链接跳过）。

### B8 符号链接与忽略目录

- 来源：`collectTypeScriptFiles`。
- 输入：目录树中含文件/目录符号链接，以及 `.git`、`.next`、`.turbo`、`build`、`coverage`、`dist`、`node_modules`、`out` 与测试目录。
- 输出：符号链接（文件和目录）都不被收集/不进入；忽略目录整棵跳过；测试目录整棵跳过。
- 错误语义：创建符号链接失败属于测试环境问题，不是实现错误。
- 时序与并发：同上。
- 幂等：是。
- 资源释放：无。
- 平台差异：Windows 上创建符号链接可能因权限失败；POSIX 分支持续覆盖跳过逻辑。
- 状态所有者：文件系统（只读）。
- 日志级别：无。
- 可测断言：`B7/B8`（链接目录与链接文件都不出现在结果中）。

### B9 `measureTypeScriptFiles` 的行数与字节数

- 来源：导出 `measureTypeScriptFiles(rootDirectory)`（异步）。
- 输入：根目录路径。
- 输出：在 `collectTypeScriptFiles` 的结果上追加 `{bytes, lines}`；`bytes` 是文件原始 UTF-8 字节数，`lines` 用 B4 口径；顺序与收集顺序一致。
- 错误语义：读取失败直接拒绝。
- 时序与并发：`Promise.all` 并发读取，但按输入顺序返回。
- 幂等：是。
- 资源释放：`readFile` 自行释放句柄。
- 平台差异：字节数与换行归一后的行数都与平台无关。
- 状态所有者：文件系统（只读）。
- 日志级别：无。
- 可测断言：`B9`（4 个文件的 `{relativePath, lines, bytes}` 精确值，含 CRLF 与 UTF-8 多字节）。

### B10 `formatReport` 的报告格式

- 来源：导出 `formatReport(measurements)`。
- 输入：`measureTypeScriptFiles` 形状的数组（也接受空数组）。
- 输出：
  - 先按 `lines` 降序，再按 `relativePath` 普通字符串升序；
  - 头部三行：`TypeScript file lengths (.ts, .tsx)`、`Files: <n>`、`Total lines: <n>`、`Total bytes: <n>`，随后一个空行；
  - 表头 `Lines  Bytes  File`；列宽为 `max(5, 该列最宽值)`，右对齐数字；
  - 每行 `"<lines>  <bytes>  <relativePath>"`；
  - 整个报告以**一个** `\n` 结尾；空输入也输出头部与表头（合计为 0）。
- 错误语义：无（数组元素缺字段未定义）。
- 时序与并发：同步纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无（输出固定 LF）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`B10`（夹具逐字比对 + 空输入逐字比对）。

### B11 CLI 的根参数

- 来源：脚本主入口。
- 输入：`node scripts/count-ts-lines.mjs <root>`。
- 输出：把 `root` 作为扫描根，报告写到 stdout；退出码 0；stderr 为空。
- 错误语义：见 B13。
- 时序与并发：一次扫描，结束即退出。
- 幂等：是。
- 资源释放：无。
- 平台差异：参数可含平台原生分隔符。
- 状态所有者：无。
- 日志级别：无（结果即 stdout）。
- 可测断言：`B11/B12`（指定根与 cwd 不同仍扫描指定根）。

### B12 CLI 的默认根与多余参数

- 来源：脚本主入口。
- 输入：无参数 → 使用 `process.cwd()`；多余参数被忽略。
- 输出：与 B11 相同的报告；退出码 0。
- 错误语义：见 B13。
- 时序与并发：同上。
- 幂等：是。
- 资源释放：无。
- 平台差异：`resolve` 处理 cwd。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`B11/B12`（无参数与额外参数）。

### B13 CLI 失败语义

- 来源：脚本主入口的 `catch`。
- 输入：根目录不存在或不可读。
- 输出：stdout 为空；stderr 为 `lint:count failed: <错误消息>\n`；退出码 1。
- 错误语义：任何扫描/读取错误都走同一前缀；错误消息包含底层原因（缺失目录时含路径）。
- 时序与并发：错误在扫描完成后立即抛出。
- 幂等：是。
- 资源释放：无。
- 平台差异：错误文案中的路径分隔符随平台。
- 状态所有者：无。
- 日志级别：错误写 stderr。
- 可测断言：`B13`（前缀、退出码、空 stdout、消息含缺失目录名）。

### B14 导入无副作用

- 来源：脚本的入口守卫：仅当 `process.argv[1]` 解析后等于脚本自身路径时才执行主流程。
- 输入：`import` 模块，不执行 CLI。
- 输出：模块加载成功，导出可调用；不扫描 cwd，不写输出。
- 错误语义：无。
- 时序与并发：加载同步完成。
- 幂等：是。
- 资源释放：无。
- 平台差异：路径比较经过 `resolve`，Windows 与 POSIX 都可命中。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`B14`（子进程导入后只调用 `countLines`，stdout 仅含调用结果）。

---

## C. `apps/cli/scripts/generate-bash-command-registry.mjs`

### B15 `--check`：重新生成并与已提交文件逐字节比较

- 来源：生成器主流程。
- 输入：`--check`（可在任意位置）；依赖 `@withfig/autocomplete` 的安装内容（从脚本位置解析），版本必须为 `2.692.3`。
- 输出：成功时 stdout 一行 JSON 摘要（键顺序 `bytes`、`figVersion`、`hash`、`roots`、`skipped{dynamicSubcommands,imports,invalidNodes,loadSpecNodes}`，结尾换行），退出码 0；不修改仓库文件。`--check` 与 cwd 无关。
- 错误语义：
  - 安装版本不符 → 抛出 `Expected @withfig/autocomplete@2.692.3, received <version>`；
  - 生成物超过 3 MiB → 抛出超限错误；
  - 与默认输出不一致 → 抛出 `Generated Bash command registry is stale. Run \`pnpm --dir apps/cli registry:generate\`.`；
  - 以上都以非零码退出并把堆栈写到 stderr。
- 时序与并发：先完整生成到内存，再写临时目录比较；临时目录在 `finally` 删除。
- 幂等：是（只读检查）。
- 资源释放：临时目录必删。
- 平台差异：见 B18 的路径分隔符说明。
- 状态所有者：`@withfig/autocomplete` 安装内容 + 已提交的生成文件（只读）。
- 日志级别：成功时 stdout 一行摘要；无其他日志。
- 可测断言：`B15`（临时 cwd 中的同名干扰文件不影响检查；摘要逐字匹配夹具）。

### B16 `--output`：写到指定路径

- 来源：生成器主流程。
- 输入：`--output <path>`；相对路径按进程 cwd 解析。
- 输出：生成同一份注册表，创建缺失的父目录，覆盖已有文件；stdout 摘要与 B15 相同；退出码 0。
- 错误语义：写文件失败直接抛出（非零退出）。
- 时序与并发：单进程顺序写入。
- 幂等：同一输入 → 同字节（B17）。
- 资源释放：无长期句柄。
- 平台差异：父目录按平台规则创建。
- 状态所有者：目标文件。
- 日志级别：stdout 一行摘要。
- 可测断言：`B16`（绝对路径创建多级父目录、相对路径落盘、结果与仓库文件逐字节相同）。

### B17 生成幂等

- 来源：生成器主流程。
- 输入：同一安装内容，执行两次 `--output`（不同目标）。
- 输出：两个文件逐字节一致。
- 错误语义：同 B16。
- 时序与并发：两次独立执行，无共享状态。
- 幂等：是。
- 资源释放：无。
- 平台差异：同一平台内一致。
- 状态所有者：目标文件。
- 日志级别：stdout 摘要。
- 可测断言：`B17`（两次输出字节比较）。

### B18 输出模板、版本与内容哈希

- 来源：生成器的 `renderGeneratedModule` 与 `hashBuildFiles`。
- 输入：`@withfig/autocomplete@2.692.3` 的构建文件。
- 输出：文件按以下顺序与内容写出（LF 换行，结尾一个 `\n`）：
  1. `/* eslint-disable */`
  2. `// 此文件由 scripts/generate-bash-command-registry.mjs 确定性生成，请勿手改。`
  3. `// Source: @withfig/autocomplete@2.692.3 (ISC); hash: <sha256>.`
  4. `// Skipped: imports=<n>, dynamicSubcommands=<n>, invalidNodes=<n>, loadSpecNodes=<n>.`
  5. `export type BashCommandRegistryOption = readonly [readonly string[], 0 | 1];`
  6. `export type BashCommandRegistryNode = readonly [readonly string[], readonly BashCommandRegistryOption[], number, readonly BashCommandRegistryNode[]];`
  7. `export const BASH_COMMAND_REGISTRY_VERSION = "fig-2.692.3";`
  8. `export const BASH_COMMAND_REGISTRY_HASH = "<sha256>";`
  9. `export const BASH_COMMAND_REGISTRY: Readonly<Record<string, BashCommandRegistryNode>> = <单行 JSON>;`
- 哈希口径：递归列出构建目录的全部文件（按名称排序），依次哈希“相对路径 + `\0` + 文件字节 + `\0`”，相对路径使用**原生分隔符**（旧实现的平台差异，见 `known-differences.md`）。
- 错误语义：版本不符/超限时中止（见 B15）。
- 时序与并发：顺序读取与哈希。
- 幂等：同一安装内容 → 同字节。
- 资源释放：无长期句柄。
- 平台差异：POSIX 上哈希与已提交文件一致；Windows 旧实现会得到不同哈希。替换实现统一 `/`，Windows 改为 POSIX 哈希。
- 状态所有者：生成文件。
- 日志级别：stdout 摘要。
- 可测断言：`B18`（表头四行逐字、哈希与版本常量、结尾换行；摘要来自夹具）。

### B19 默认输出路径

- 来源：生成器的 `DEFAULT_RELATIVE_PATH` 解析。
- 输入：无 `--output`（`--check` 之外）。
- 输出：写 `apps/cli/packages/core/src/tool/handlers/generated/bash-command-registry.ts`，路径**相对脚本所在目录**解析，与 cwd 无关；cwd 中同名结构的文件不被写入。
- 错误语义：同 B16。
- 时序与并发：写一次。
- 幂等：是（内容确定）。
- 资源释放：无。
- 平台差异：路径拼接使用平台分隔符；目标在仓库内。
- 状态所有者：生成文件。
- 日志级别：stdout 摘要。
- 可测断言：`B19`（cwd 干扰文件保持原样、仓库文件内容不变、摘要正确）。

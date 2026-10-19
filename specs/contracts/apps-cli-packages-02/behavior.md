# apps-cli-packages-02 行为（behavior.md）

编号 B1、B2…；发布后不重排、不复用。每条写输入、输出、错误语义、时序与并发、幂等、资源释放、
平台差异、状态所有者、日志级别；可观察常量逐条列出。条目 → 测试对照见 README 第六节。

状态所有者总纲（全包适用）：`shared-types` 只有编译期事实，没有运行期状态；`i18n` 的目录对象
按 locale 各一份、进程内稳定；`dynamic-workflow-runtime` 的状态分属父进程 harness（spawn、
映射、结算收敛）与子进程沙箱（`__host`、pending 表、冻结 args）；`telemetry` 的进程级状态归
`AgentExecutionTelemetryRuntime` / `ModelApiTelemetryStatusSink` / `prepareModelTelemetryEnv` 的
单例 Owner，会话只借用；`node-repl-host` 的清单与常量是发布面，没有运行期状态。

## 批次 A：shared-types（纯类型包）

### B1 运行期面为空，类型面固定

- 输入：`import` / `import type` `@knorvia/shared-types`（源码 `src/index.ts` 或 `dist/index.js`）。
- 输出：运行期命名空间**没有任何导出名**；类型面恰好为 `JsonValue`、`RunContext`、`GlobalLocale`、
  `GlobalDetectedLocale`、`GlobalOutputFormat`、`GlobalOptions`、`RuntimeInfo`。
- 错误语义：不适用（无运行期代码）。
- 时序与并发：模块求值无副作用；并发导入同一实例。
- 幂等：是。
- 资源释放：不适用。
- 平台差异：类型引用 `NodeJS.WriteStream`/`ReadStream`/`Architecture`/`Platform`/`ProcessVersions`，
  只在编译期存在。
- 状态所有者：无。
- 日志级别：不适用。
- 语义常量：`JsonValue = boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue }`。
- 测试约束：纯类型模块不产生可失败的运行期用例，故该条目与 B2 的断言并入调用 `@knorvia/i18n`
  的用例；桩替换后同一用例因 i18n 桩抛错而失败（见 `known-differences.md` §二）。

### B2 结构与可选性

- 输入：类型消费方的赋值/读取（编译期）。
- 输出：
  - `RunContext = { argv: string[]; stderr: NodeJS.WriteStream; stdin: NodeJS.ReadStream; stdout: NodeJS.WriteStream }`；
  - `GlobalLocale = "auto" | "en-US" | "zh-CN"`；`GlobalDetectedLocale = Exclude<GlobalLocale, "auto">`；
  - `GlobalOutputFormat = "text" | "json" | "stream-json"`；
  - `GlobalOptions` 必有 `force`、`json`、`noColor`、`verbose`；可选 `browserExecutable?`、
    `browserUse?: "headless"`、`detectedLocale?`、`locale?`、`memoryBench?`、`outputFormat?`；
  - `RuntimeInfo = { arch: NodeJS.Architecture; cwd: string; execPath: string; node: string;
platform: NodeJS.Platform; sea: boolean; versions: NodeJS.ProcessVersions }`。
- 错误语义：不适用。
- 时序与并发：不适用。
- 幂等：不适用。
- 资源释放：不适用。
- 平台差异：`RuntimeInfo` 的 `arch`/`platform` 允许全部 Node 平台值，不裁剪。
- 状态所有者：无。
- 日志级别：不适用。
- 语义常量：`GlobalOptions` 未声明 `detectedLocale` 以外的运行期推断字段；`json` 与
  `outputFormat` 并存，后者是前者的细化，不在本包运行期归一。
- 测试约束：运行期只能验证 `GlobalLocale` 的取值被 `isUiLocale`/`resolveLocale` 接受（B3/B5）。

## 批次 B：i18n（语言探测、解析与目录）

### B3 常量与判定

- 输入：任意 `string | undefined`。
- 输出：`DEFAULT_LOCALE === "en-US"`；`SUPPORTED_LOCALES` 恰为 `["en-US", "zh-CN"]`（顺序固定）；
  `isSupportedLocale(v)` 仅对精确的 `"en-US"`/`"zh-CN"` 为真；`isUiLocale(v)` 对 `"auto"` 与两者为真。
- 错误语义：不适用（谓词不抛错）。
- 时序与并发：纯函数。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：无。
- 日志级别：不适用。
- 语义常量：`"en"`、`"en-us"`、`"EN-US"`、`"zh"`、`"zh-cn"`、`""`、`undefined` 都**不是**
  `isSupportedLocale`；`isUiLocale("AUTO")` 为假（大小写敏感）。

### B4 detectLocale 探测顺序与归一

- 输入：`{ env?: Record<string, string | undefined>; intlLocale?: string | null }`，缺省 `{}`。
- 输出：`"en-US" | "zh-CN" | undefined`。
- 错误语义：不抛错；无法识别的候选被跳过。
- 时序与并发：按固定顺序求值，无共享可变状态。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用（只读传入的 env 对象，不读 `process.env`）。
- 状态所有者：无。
- 日志级别：不适用。
- 语义常量：
  1. 环境键顺序 `LC_ALL` → `LC_MESSAGES` → `LANG` → `LANGUAGE`；每个键为空/纯空白时跳过。
  2. `LANGUAGE` 按 `:` 切分，逐项去空白、丢弃空项后依次尝试；其余键整串一个候选。
  3. 候选先 trim，再在第一个 `.` 处截断（去 `.UTF-8` 等编码），再在第一个 `@` 处截断（去修饰符），
     然后把全部 `_` 换成 `-`。
  4. 截断后为空，或小写为 `c`/`posix` 的候选忽略。
  5. 精确命中所支持值直接返回；否则小写等于 `en` 或以 `en-` 开头 → `en-US`；等于 `zh` 或以
     `zh-` 开头 → `zh-CN`；其余继续下一个候选。
  6. 环境候选全部失败后才尝试 `intlLocale`；仍失败返回 `undefined`。
- 依据：`locale.ts` 16-80 行。

### B5 resolveLocale 解析与回落

- 输入：`requested: UiLocale | string | undefined`，可选 `detected?: string | null`。
- 输出：`SupportedLocale`。
- 错误语义：不抛错；非法输入回落 `DEFAULT_LOCALE`。
- 时序与并发：纯函数。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：无。
- 日志级别：不适用。
- 语义常量：
  - `requested === "auto"` 时取 `detected` 作为候选；其余（含 `undefined`）直接用 `requested`；
    **`requested` 缺省时不会使用 `detected`**。
  - 候选走与 B4 相同的归一（trim、去 `.encoding`/`@modifier`、`_`→`-`、`C`/`POSIX` 忽略、
    `en*`→`en-US`、`zh*`→`zh-CN`）。
  - 归一失败 → `"en-US"`。
  - `"auto"` 且 `detected` 为 `null`/`undefined`/非法 → `"en-US"`。
- 依据：`locale.ts` 24-49 行。

### B6 getKnorviaCopy 选择与对象身份

- 输入：`locale?: UiLocale | string`、`detected?: string | null`。
- 输出：与 `resolveLocale(locale, detected)` 对应的 `KnorviaCopy`。
- 错误语义：不抛错；未知 locale 回落 en-US。
- 时序与并发：纯查表；同一 locale 每次返回**同一对象引用**。
- 幂等：是。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：两个目录对象由模块持有，调用方只读。
- 日志级别：不适用。
- 语义常量：`getKnorviaCopy()` 无参调用返回 en-US；返回对象的 `locale` 字段等于所选键
  （`"en-US"` 或 `"zh-CN"`），不得与内容错配。
- 依据：`index.ts` 25-32 行。

### B7 两套目录的键集合与结构一致

- 输入：`getKnorviaCopy("en-US")` 与 `getKnorviaCopy("zh-CN")`。
- 输出：两份对象递归同构：同一路径集合、同一叶子类型（`string` 或 `function`），函数元数一致
  （`length` 相同）；没有任何空字符串叶子。
- 错误语义：不适用。
- 时序与并发：目录是冻结内容，只读。
- 幂等：是。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：模块级目录。
- 日志级别：不适用。
- 语义常量：顶层恰为 `cli`、`locale`、`tui`；`tui` 含 `copy`、`effort`、`input`、
  `modelConfigurationRequired`、`model`、`sidebar`、`status`、`terminal`、`transcript`、
  `selection`、`fileMention`、`slash`；`sidebar` 含 `subagents`、`api`、`cache`、`context`、
  `modifiedFiles`、`mcp`、`request`、`status`、`run`、`sections`、`shellSubtitle`、`title`、
  `todos`；`transcript` 含 `compact`、`roles`、`thought`、`title`、`workflow`。
- 依据：`types.ts` 5-257 行、两份目录。

### B8 参数语义（不锁人类语言原文）

- 输入：目录中的函数叶子与代表值。
- 输出：每条函数返回非空字符串，并把调用方给的语义事实放进结果。
- 错误语义：不适用。
- 时序与并发：纯函数。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：无。
- 日志级别：不适用。
- 语义常量（含义必须保持，措辞可重写）：
  - `model.retryScheduled` 的进度分母是 `Math.max(1, maxAttempts - 1)`；结果含 `attempt/分母`、
    `delay` 与 `reason`。
  - `model.responseReceivedWithTokens` 含 token 数字。
  - `transcript.workflow.interruptedNotice` 含 label、runId，并给出 `/dwf resume <runId>`。
  - `transcript.compact.retrying`：`maxAttempts > 0` 时含 `attempt/maxAttempts`；否则是基础重试文案。
  - `selection.disabled(reason)` 含 reason；`selection.filterLine` 含筛选词与帮助（缺省帮助为
    `defaultHelp`），空筛选显示 `noFilter`。
  - `sidebar.mcp.tools(count)` 含 count，且英文单复数不同（1 与 2 的结果不相等）。
  - `sidebar.mcp.summary` 含 `connected/total`；`cache.readWrite` 含 read/write；
    `status.permissionRequested/Resolved` 含工具名；`status.targetChanged` 含 action。
  - `sidebar.request.errorWithStatus` 含状态码；`sidebar.run.draftChars` 含字符数；
    `sidebar.todos.more`/`modifiedFiles.more`/`api.more`/`subagents.ended` 含数量。
  - `transcript.workflow.collapsed` 含 label、status 与 `nodesSettled/nodesTotal`；`nodes`、`usage`、
    `actorRow`、`error`、`result` 含各自实参。
  - `input.queuedTitle`/`queuedMore`/`restoredPreviousInputWithAttachments` 含数量；
    `fileMention.row` 与 `slash.row` 用不同前缀标记 `selected`。
  - `cli.errors.localeUnsupported(value)` 含 value 与三种可接受值（`en-US`、`zh-CN`、`auto`）。
  - `cli.help(version)` 含版本号，并逐项提到命令 `app-server`、`commands`、`doctor`、`plugins`、
    `skills`、`tui`、`version` 与选项 `--prompt`、`--resume`、`--locale`、`--mode`。
- 依据：`locales/en-US.ts`、`locales/zh-CN.ts`、`types.ts`。

## 批次 C：dynamic-workflow-runtime

### B9 包公开面

- 输入：`import` 包入口。
- 输出：运行期导出恰为 7 个：`childEntryFileName`、`childMain`、`fallbackWorkflowRunsDir`、
  `renderChildEntry`、`runWorkflowScript`、`workflowRunsDir`、`writeChildEntryFile`；协议全是类型，
  不产生运行期导出。
- 错误语义：不适用。
- 时序与并发：导入无副作用。
- 幂等：是。
- 资源释放：不适用。
- 平台差异：包入口指向 `dist/index.js`（ESM）。
- 状态所有者：无。
- 日志级别：不适用。
- 语义常量：包名 `@knorvia/dynamic-workflow-runtime`、版本 `0.1.0`、`"type": "module"`。
- 依据：`index.ts`、`package.json`。

### B10 目录与文件名

- 输入：`cwd`、`runId`。
- 输出：`workflowRunsDir(cwd) = <cwd>/.knorvia-studio/workflow-runs`；
  `fallbackWorkflowRunsDir() = <os.tmpdir()>/knorvia-workflow-runs`；
  `childEntryFileName(runId)` 把 `[^A-Za-z0-9._-]` 逐字符换成 `_` 后追加 `.mjs`。
- 错误语义：不适用（纯拼接）。
- 时序与并发：纯函数。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：使用 `node:path` 的 `join`，Windows 反斜杠由平台决定；`os.tmpdir()` 跟随
  `TMPDIR`/`TMP`/`TEMP` 的当前值。
- 状态所有者：无。
- 日志级别：不适用。
- 语义常量：`.`、`_`、`-` 保留；`/`、`\`、`:`、空格、非 ASCII 字符替换为 `_`；空 runId →
  `".mjs"`；替换后仍可能以 `.` 开头（不做额外防穿越，目录由调用方给定）。
- 依据：`child-entry-file.ts` 45-58 行。

### B11 入口文件写入、`.gitignore` 与覆写

- 输入：`{ cwd, runId, source, onWarning? }`。
- 输出：`{ path, location: "project" }`；文件内容为 `source`；目录内 `.gitignore` 内容为 `"*\n"`。
- 错误语义：项目目录不可创建/不可写时进入 B12 回落；回落也失败则抛原始文件系统错误。
- 时序与并发：同步 I/O；同 runId 的第二次调用原位覆写入口文件。
- 幂等：`.gitignore` 只以 `wx` 创建一次，已存在（`EEXIST`）被忽略且**不改写**；入口文件可重复覆写。
- 资源释放：无打开的句柄（`mkdirSync`/`writeFileSync`）。
- 平台差异：路径分隔符由 `path.join` 决定；Windows 上 `EEXIST` 判定一致。
- 状态所有者：文件系统；模块不保留缓存。
- 日志级别：不适用（告警经 `onWarning` 回调，不直接打日志）。
- 语义常量：目录名 `.knorvia-studio/workflow-runs`；忽略文件文本 `*\n`；文件名规则见 B10。
- 依据：`child-entry-file.ts` 60-88 行。

### B12 项目目录失败回落与二次失败

- 输入：项目目录不可用的 `cwd`（不存在、无权限、`.knorvia-studio` 是普通文件、`cwd` 本身是文件等）。
- 输出：成功时 `{ path: <tmpdir>/knorvia-workflow-runs/<name>.mjs, location: "tmpdir" }`，
  并在回落前调用一次 `onWarning({ kind: "entry_file_fallback", projectDir, fallbackDir, error })`；
  `error` 是原始异常的 `message`（非 Error 用 `String`）。
- 错误语义：回落目录也写不进时，`writeChildEntryFile` **抛出**回落写入的错误；`onWarning`
  已先被调用一次，不会重试第三次。
- 时序与并发：同步；每次调用独立，不缓存失败。
- 幂等：告警次数固定为每次回落一次；回落目录的 `.gitignore` 同样只创建一次。
- 资源释放：不适用。
- 平台差异：`fallbackWorkflowRunsDir` 读 `os.tmpdir()`（见 B10）。
- 状态所有者：文件系统。
- 日志级别：告警回调由 bootstrap 落 warn；模块自身不打日志。
- 语义常量：`kind` 固定 `"entry_file_fallback"`；`projectDir` 是原本要写的项目目录，
  `fallbackDir` 是实际回落目录。
- 依据：`child-entry-file.ts` 60-75 行。

### B13 renderChildEntry 生成自包含 ESM

- 输入：`payload`（`lowered`、可选 `args`、可选 `maxOldSpaceSizeMb`）与 `{ runId }`。
- 输出：一段可被 Node 作为 ESM 加载的源码：`export const payload = <JSON 字面量>`、
  `export const start = (deps) => main({ ...deps, payload })`，`main` 是 `childMain.toString()` 的内嵌；
  仅当 `maxOldSpaceSizeMb` 是有限正数且 `process.execArgv` 中没有以 `--max-old-space-size` 开头的项时，
  以 `v8.setFlagsFromString` best-effort 设置（失败被吞掉）；`process.argv[1]` 与本文件
  `realpath` 相同才自启（`start({ vm, createInterface, stdin, stdout })`）。
- 错误语义：payload 不可 JSON 序列化时 `JSON.stringify` 抛错（由调用方承担）；生成本身不抛。
- 时序与并发：纯字符串拼接；自启只在作为进程入口时发生。
- 幂等：同 payload/runId 生成同文本（属性顺序由 JSON.stringify 决定）。
- 资源释放：不适用。
- 平台差异：`realpath` 比较吸收 macOS `/var` → `/private/var` 符号链接；Windows 路径由
  `fileURLToPath`/`realpathSync` 处理。
- 状态所有者：生成文本无状态；加载后的模块持有 `payload`。
- 日志级别：v8 旗标失败静默（best-effort）。
- 语义常量：头注释含净化后的 runId；导入 `node:fs`、`node:readline`、`node:url`、`node:v8`、
  `node:vm`；payload 是**内嵌字面量**，不经 argv/base64。
- 依据：`child-source.ts` 337-378 行。

### B14 childMain 的宿主面与消息顺序

- 输入：`deps = { vm, createInterface, stdin, stdout, payload }`。
- 输出：在独立 vm context 中建立 `__host`，成员恰为 `args`、`createActor`、`ask`、`worldRead`、
  `publishArtifact`、`declareArtifact`、`report`、`log`、`enterPhase`；脚本结束后向 stdout 写一条
  `complete` 并关闭 reader。
- 错误语义：见 B15/B16。
- 时序与并发：
  - `createActor` 同步返回 `local#1`、`local#2`…，并在返回前写出 `{ kind: "create-actor", localId,
siteId, name?, persona? }`；同一 FIFO 上的后续 ask 必然晚于它。
  - `ask`/`worldRead`/`publishArtifact` 返回 Promise，写出 `{ kind: "request", id: "r1", type, ... }`；
    `id` 在每个 child 内从 `r1` 单调递增，ask 与 world-read 共用一个计数器，publish 也共用。
  - `log`/`enterPhase`/`declareArtifact`/`report` 即发即忘走事件通道，按调用顺序写出；
    `report` 的 `artifactId` 为 `undefined` 时该键在 JSON 中缺席。
  - `args` 在 context 内用 `JSON.parse` 构造并 `Object.freeze`（浅冻结）；`payload.args` 缺席按 `{}`。
  - 入站每行的空行被忽略；`__deliver` 只处理 `kind === "response"`，未知 id 忽略。
- 幂等：每次 `childMain` 调用独立计数；响应只结算对应 pending 一次并删除。
- 资源释放：脚本 settle（成功或抛错）后 `reader.close()` 恰好一次；编译失败时不创建 reader。
- 平台差异：不适用（stdio 抽象由 deps 提供）。
- 状态所有者：context 内的 `__nextLocal`/`__nextReq`/`__pending`；外层只有 reader。
- 日志级别：不适用。
- 语义常量：local 句柄前缀 `local#`；请求 id 前缀 `r`；事件 `type` 为 `log`、`phase-entered`、
  `declare-artifact`、`report`；`complete` 为 `{ kind, ok, value? , error? }`。
- 依据：`child-source.ts` 81-314 行。

### B15 运行期禁令与编译失败

- 输入：lowered 脚本代码。
- 输出：`Date.now()`、无参 `new Date()`、`Math.random()` 在沙箱内抛错；编译失败时写一条
  `complete(ok:false)` 并正常返回。
- 错误语义：
  - `Date.now()` → `Error("Date.now() is disabled in workflows")`；
  - 无参 `new Date()` → `Error("argless new Date() is disabled in workflows")`；
  - `Math.random()` → `Error("Math.random() is disabled in workflows")`；
  - `new Date(ms)`、`Date.parse`、`Date.UTC` 保留原生行为；
  - lowered 体语法错误 → 写出 `{ kind: "complete", ok: false, error: { name: "SyntaxError",
message, stack? } }`，不调用 `process.exit`、不创建 reader，返回已兑现的 Promise。
- 时序与并发：禁令在脚本执行前安装；编译发生在 `__execute` 之前。
- 幂等：每次 child 独立安装。
- 资源释放：编译失败路径没有 reader/timer。
- 平台差异：不适用。
- 状态所有者：context 的 `globalThis.Date`/`Math.random` 被替换。
- 日志级别：不适用。
- 语义常量：三条错误文本逐字固定（脚本可按文本 try/catch）。
- 依据：`child-source.ts` 227-248、277-300 行。

### B16 完成、响应错误与收尾

- 输入：脚本返回值/抛错；父进程 response 行。
- 输出：
  - 成功：`{ kind: "complete", ok: true, value }`（`value` 为 `undefined` 时键仍在，值被 JSON 丢弃）；
  - `Error`：`{ name, message, stack?, code?, violations?, finalText? }`；
  - 非 `Error` 抛出值：`{ name: "Error", message: String(value) }`；
  - response 成功：resolve `value`；失败：在 context 内重建 `Error`，按需带 `name`、`code`、
    `violations`、`finalText`，缺省 message 为 `"workflow host error"`。
- 错误语义：上述重建错误由脚本自己 catch；未被 catch 时转为 error-complete。
- 时序与并发：`__execute` 永远 resolve（错误已转成 complete），便于外层关 reader。
- 幂等：同一 response id 只结算一次；重复 response 被忽略。
- 资源释放：成功与失败路径都 `reader.close()`；pending 表随 context 丢弃。
- 平台差异：不适用。
- 状态所有者：context 内的 pending 表。
- 日志级别：不适用。
- 语义常量：`wire.name` 缺省不设置（仍是 `Error`）；`code` 只在线形态显式给出时设置。
- 依据：`child-source.ts` 175-225、309-313 行。

### B17 runWorkflowScript 执行体选择与元数据转交

- 输入：`RunWorkflowOptions`。
- 输出：`Promise<RunSettlement>`；`lowered` 优先于 `scriptText` 作为执行体；`scriptText` 始终作为
  run 元数据落库。
- 错误语义（同步抛出/拒绝，不启动子进程）：
  - 两者都缺：`Error("runWorkflowScript: pass either scriptText or lowered")`；
  - 仅给脏 `scriptText`：`Error("runWorkflowScript: the script failed compilation/analysis and is not
run degraded: <line:column message; …>")`。
- 时序与并发：每次调用新建 Engine/Driver sink 转发代理与独立子进程；元数据 verbatim 转交
  `EngineConfig`，不加工、不推断。
- 幂等：不同 `runId` 独立；同 `runId` 由引擎的 resume 规则裁决（不在本包）。
- 资源释放：子进程在结算后由 bridge 的 finalize kill；timer/reader/listener 一并清理。
- 平台差异：默认 spawn `process.execPath --max-old-space-size=<N> <entry>`；`childSpawn.argsPrefix`
  给出时 spawn `process.execPath [...argsPrefix, <entry>]` 且不带 Node 旗标；两条路都注入
  `ELECTRON_RUN_AS_NODE=1`。默认堆上限 `256` MB。
- 状态所有者：`WorkflowEngine` 持有 run 裁决与 journal；harness 只做桥接与子进程清理。
- 日志级别：不适用（`onWarning` 只用于入口文件回落）。
- 语义常量：转交字段为 `scriptText`、`name`、`args`、`scriptHash`、`parentSessionId`、`toolCallId`、
  `resumedFrom`、`launch`、`importedCache`、`inheritedTokens`、`cwd`；缺省字段保持缺席；`cwd`
  缺省 `process.cwd()` 且同时作为子进程 cwd；payload 含 `lowered`、`args`（若有）、
  `maxOldSpaceSizeMb`（默认 256）。
- 依据：`harness.ts` 172-271 行。

### B18 宿主事件桥接（world-read、产物、日志、阶段）

- 输入：child 的 `event` 与 `request` 消息。
- 输出：
  - `report` → `engine.report(siteId, item, artifactId)`；
  - `declare-artifact` → `engine.declareArtifact(siteId, op, args)`；
  - `phase-entered` → `engine.enterPhase(name)`；
  - 其余 `event` → `engine.log(message)`；
  - `world-read` → `engine.worldRead(siteId, op ?? "read", args ?? [])`；
  - `publish-artifact` → `engine.publishArtifact(siteId, artifactOp, args ?? [])`。
- 错误语义：`publish-artifact` 缺 `artifactOp` 时不编默认值，回结构化拒绝
  `WorkflowError("DriverError", "publish-artifact request is missing artifactOp (site <site>)")`；
  request 的 rejection 被转成 wire error 回给脚本。
- 时序与并发：事件**同步**分派，保持 stdio FIFO 与 journal 顺序（带标签的 report 必须晚于声明）；
  request 异步等待引擎 promise，结算后写 response；子进程已退出/不可写时静默丢弃 response。
- 幂等：同一事件按到达一次分派一次；引擎自身负责 report/声明去重与 replay。
- 资源释放：无额外句柄。
- 平台差异：不适用。
- 状态所有者：`WorkflowEngine`（journal/节点/产物）；harness 无第二份状态。
- 日志级别：不适用。
- 语义常量：`world-read` 的 `op` 缺省 `"read"`、`args` 缺省 `[]`；publish 的 `args` 缺省 `[]`。
- 依据：`harness.ts` 435-566 行、`child-source.ts` 113-153 行。

### B19 create-actor 同步句柄与 ask 映射

- 输入：child 的 `create-actor` 与随后引用其 `localId` 的 `ask`。
- 输出：`engine.createActor(siteId, name, persona)` 同步执行并把 `localId` 映射到引擎 `ActorId`；
  `ask` 用映射后的句柄调用 `engine.ask(siteId, actorId, instructions ?? "")`。
- 错误语义：映射缺失 → 拒绝 `WorkflowError("UnknownActor", "Unknown subagent handle: <actor>")`；
  `engine.createActor` 抛错 → 整个 run 失败（`WorkflowError` 原样，否则包成
  `DriverError("createActor failed at site <site>")`）。
- 时序与并发：`create-actor` 必须同步处理，依赖 stdio FIFO 保证 ask 之前映射就绪。
- 幂等：同一 `localId` 后到覆盖映射（正常流程不重复）；ask 不重试。
- 资源释放：映射表随 bridge 生命周期释放。
- 平台差异：不适用。
- 状态所有者：bridge 的 `actorMap`；引擎持有真实 Actor 状态。
- 日志级别：不适用。
- 语义常量：local 句柄格式由 child 决定（`local#N`）；persona 原样转交（字符串化由引擎负责）。
- 依据：`harness.ts` 305-309、439-459、518-529 行。

### B20 脚本抛错 → errored

- 输入：child 的 `{ kind: "complete", ok: false, error }`。
- 输出：`engine.fail(new WorkflowError("DriverError", err.message ?? "The workflow script threw an
error", { cause: err.stack ?? err.name }))`；最终 `RunSettlement` 为
  `{ status: "errored", error }`，journal 记 failed + failure。
- 错误语义：错误详情来自沙箱；无 message 时用固定文案。
- 时序与并发：`fail` 与 complete/stop 一样 first-wins；在飞 ask 被中止。
- 幂等：重复 complete 只有第一条生效。
- 资源释放：引擎 dispose 恰一次；bridge 清理子进程。
- 平台差异：不适用。
- 状态所有者：引擎结算。
- 日志级别：不适用。
- 语义常量：错误 `code === "DriverError"`，`name === "WorkflowError"`；`cause` 是字符串
  （stack 或 name），不是原始对象。
- 依据：`harness.ts` 474-486 行。

### B21 宿主故障 → stopped(interrupted)

- 输入：spawn 同步抛错/`error` 事件、非 NDJSON 行、子进程无 complete 退出。
- 输出：`engine.stop("interrupted", WorkflowError("Interrupted", message))`；结算
  `{ status: "stopped", reason: "interrupted", error }`。
- 错误语义（消息逐字）：
  - 启动同步抛错：`Could not start the workflow sandbox process: <message>`；
  - `error` 事件：同一文案；
  - 坏行：`The workflow sandbox process emitted a line that is not valid NDJSON: <line>`；
  - 无 complete 退出：有 stderr（截尾 64 KiB）时用 `stderr.trim()`，否则
    `The workflow sandbox process exited (code=<code>, signal=<signal>) before completing`。
- 时序与并发：finalize 是 single-writer，先到者胜；结算后 kill 子进程并移除 abort 监听。
- 幂等：后续故障/complete 被 `finalized` 挡掉。
- 资源释放：清 timer、关 reader、移除 abort listener、kill child；stdin 挂 error 监听吞 EPIPE。
- 平台差异：Node 只把部分 spawn 失败转成 error 事件，其余（ENAMETOOLONG、E2BIG 等）同步抛，
  两者归并到同一结算。
- 状态所有者：引擎结算；bridge 只清理。
- 日志级别：不适用。
- 语义常量：`reason === "interrupted"`；错误 `name === "WorkflowError"`、`code === "Interrupted"`。
- 依据：`harness.ts` 230-268、298-425 行。

### B22 墙钟超时

- 输入：`timeoutMs` 正数。
- 输出：到点 `engine.stop("interrupted", WorkflowError("Interrupted", "The workflow sandbox process
exceeded its wall-clock timeout of <timeoutMs>ms"))`。
- 错误语义：超时是宿主故障，不是脚本错误，结算 stopped(interrupted)。
- 时序与并发：timer `unref`；结算后清除；与 complete/abort/close 竞争由 first-wins 收敛。
- 幂等：只触发一次。
- 资源释放：finalize 清 timer 并 kill 子进程。
- 平台差异：不适用。
- 状态所有者：bridge 的 timer。
- 日志级别：不适用。
- 语义常量：消息逐字含 `wall-clock timeout of <N>ms`。
- 依据：`harness.ts` 379-386 行。

### B23 abort 归因

- 输入：`AbortSignal` 的 `reason`。
- 输出：
  - `{ superseded: "<newRunId>" }`（非空字符串）→ `engine.stop("superseded", undefined, newRunId)`；
  - 字面 `"interrupted"` → `stop("interrupted", WorkflowError("Interrupted",
"dynamic workflow run <runId> was interrupted: the owning session closed before the run settled"))`；
  - 字面 `"model"` → `stop("model")`；
  - 其余（含 `"user"`、未知值、非对象）→ `stop("user")`。
- 错误语义：只有 superseded 带 `supersededBy`；只有 interrupted 带 error。
- 时序与并发：signal 已 abort 时立即结算而不 spawn 后续流程；监听 `{ once: true }`，结算时移除。
- 幂等：只处理一次。
- 资源释放：finalize 移除监听并 kill 子进程。
- 平台差异：不适用。
- 状态所有者：引擎结算。
- 日志级别：不适用。
- 语义常量：runId 文本逐字进 interrupted 消息；`superseded` 原因只认非空字符串。
- 依据：`harness.ts` 340-377 行。

## 批次 D：telemetry

### B24 公共导出面与无 Owner 的 noop bootstrap

- 输入：`createModelTelemetry()` 或 `{ owner?, sessionId? }`，且进程内没有已准备的 Owner。
- 输出：无 Owner 时返回 `{ agentExecution, enabled: false, modelExecution, shutdown }`，其中
  `agentExecution === modelExecution`（同一个 `NoopAgentExecutionTelemetry` 实例），`statusSink`
  缺席；`shutdown()` 立即兑现。
- 错误语义：不抛错。
- 时序与并发：同步返回；noop 实例模块级单例。
- 幂等：多次调用返回新包装对象但 noop 实例相同。
- 资源释放：无资源。
- 平台差异：不适用。
- 状态所有者：模块级 `noopExecution`。
- 日志级别：不适用。
- 语义常量：包入口运行期导出恰为 17 个（B33 的 Runtime、B24 的 bootstrap 函数、
  `NoopAgentExecutionTelemetry`、B30/B28 的脱敏器、`ModelApiTelemetryStatusSink`、
  `ProviderEndpointIdentityCache`）：
  `AgentExecutionTelemetryRuntime`、`ModelApiTelemetryStatusSink`、`NoopAgentExecutionTelemetry`、
  `PROVIDER_ENDPOINT_SANITIZER_VERSION`、`ProviderEndpointIdentityCache`、
  `claimSanitizedTelemetryError`、`createModelTelemetry`、`normalizeTelemetryDeviceMid`、
  `parseOtlpHeaders`、`prepareModelTelemetryEnv`、`resolveOtlpMetricEndpoint`、
  `resolveOtlpTraceEndpoint`、`sanitizeErrorMessage`、`sanitizeProviderEndpoint`,
  `sanitizeTelemetryError`、`shutdownPreparedModelTelemetry`、`updatePreparedTelemetryIdentity`。
  `createOwnedAgentTelemetryRuntime` **不在**入口导出（延迟加载）。
- 依据：`bootstrap.ts` 40-65 行、`index.ts`。

### B25 Owner 委托与关闭语义

- 输入：`createModelTelemetry({ owner, sessionId? })`。
- 输出：透传 `owner.agentExecution`、`owner.enabled`、`owner.modelExecution`、`owner.statusSink`；
  `shutdown()` 在给出 sessionId 时先 `owner.abandonSession(sessionId)`，然后**总是**
  `owner.flush({ timeoutMs: 1_500 })`；不调用 `owner.shutdown`。
- 错误语义：owner 方法抛错会向外传播（调用方负责旁路）。
- 时序与并发：shutdown 的顺序固定（abandon → flush）；多个会话可共享 Owner。
- 幂等：不保证（每次 shutdown 都 flush）；调用方按会话生命周期只调一次。
- 资源释放：Session 只借用进程 Owner，不关闭 Provider/Exporter/Context Manager。
- 平台差异：不适用。
- 状态所有者：进程级 Owner；会话不持有。
- 日志级别：不适用。
- 语义常量：flush 超时 `1_500` ms。
- 依据：`bootstrap.ts` 40-65 行。

### B26 OTLP 端点与 header 解析

- 输入：环境记录中的 `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`、`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`、
  `OTEL_EXPORTER_OTLP_ENDPOINT`、`OTEL_EXPORTER_OTLP_TRACES_HEADERS`、
  `OTEL_EXPORTER_OTLP_METRICS_HEADERS`、`OTEL_EXPORTER_OTLP_HEADERS`。
- 输出：
  - trace：专用端点存在（trim 后非空）时只看专用端点：合法 `http:`/`https:` URL 返回其规范化
    字符串，非法 → `undefined`，**不回落公共端点**；专用端点缺席时取公共端点，去掉路径末尾 `/`
    后追加 `/v1/traces`；公共端点非法/缺席 → `undefined`；
  - metric：专用端点存在时同样只看专用端点（非法 → `undefined`，不回落）；专用端点缺席且公共
    端点存在时追加 `/v1/metrics`（公共端点非法 → `undefined`）；专用与公共端点都缺席时**回落到
    `resolveOtlpTraceEndpoint(env)`**（共享接入点）；
  - header：按 `,` 分割，每项在第一个 `=` 处分键/值，分别 trim 并 `decodeURIComponent`（解码失败
    保留原串）；键或值为空/分隔符 ≤ 0 的项跳过；结果为空 → `undefined`。
- 错误语义：非法 URL 不抛错，返回 `undefined`。
- 时序与并发：纯函数，每次读取传入对象。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：无。
- 日志级别：不适用。
- 语义常量：追加路径 `/v1/traces`、`/v1/metrics`；header 值中的 `=` 保留（只按首个 `=` 分割）。
- 依据：`bootstrap.ts` 76-115 行。

### B27 启用开关、设备 MID 与旁路

- 输入：`prepareModelTelemetryEnv(env, options)`。
- 输出：
  - 仅当 `KNORVIA_MODEL_TELEMETRY_ENABLED === "1"` 且存在合法 trace endpoint 时继续；否则
    **原样返回传入的 env 对象**并且不创建 Owner；
  - 合法已有 `KNORVIA_TELEMETRY_DEVICE_MID`（trim 后匹配 `^[A-Za-z0-9._:-]{1,128}$`）直接沿用；
    否则从状态文件读取或生成 UUID，并写回返回的 env；
  - 状态文件路径：`<KNORVIA_HOME>/v2/telemetry-state.json`，`KNORVIA_HOME` 缺席时
    `<resolveKnorviaDataRoot()>/v2/telemetry-state.json`；目录自动创建；写入用临时文件 + rename；
  - 锁文件 `telemetry-state.lock`（同目录），`wx` 打开并写 `{ createdAt, pid }`；`EEXIST` 时若锁
    文件 mtime 距今 < 5 分钟且持锁 pid 存活则放弃本次（读取现有 MID 或 undefined），否则删除后
    重试一次；
  - 同一状态文件的并发解析在进程内单飞（共享同一个 Promise）；
  - 任何文件/锁错误被吞掉：本次只是缺少匿名 device 关联，返回不含 MID 的 env；
  - 启用且首次准备时创建进程 Owner（动态 `import("./otlp-exporter.js")`）；构造失败经
    `onWarning("Agent telemetry runtime initialization failed", { errorType })` 后返回 undefined。
- 错误语义：不向调用方抛错。
- 时序与并发：异步；`preparedOwner` 只创建一次；`preparingOwner` 复用；Disable 路径不加载 OTel SDK。
- 幂等：同一 env 重复准备返回同一 MID；`shutdownPreparedModelTelemetry()` 清空单例后再次准备可重建。
- 资源释放：`shutdownPreparedModelTelemetry()` 关闭 Owner（`timeoutMs: 1_500`）并清空状态；
  `updatePreparedTelemetryIdentity(snapshot)` 在存在 Owner 时委托 `owner.updateIdentity`，否则 no-op。
- 平台差异：锁的存活判断用 `process.kill(pid, 0)`，`ESRCH` 视为已死；文件系统语义跨平台一致。
- 状态所有者：模块级 `preparedOwner`/`preparingOwner`/单飞 Map；文件系统持久化 MID。
- 日志级别：`onWarning` 由调用方落 warn；本模块不打日志。
- 语义常量：启用值精确 `"1"`；锁过期 `5 * 60_000` ms；状态文件名 `telemetry-state.json`、
  `telemetry-state.lock`；最大重试 2 次；flush 超时 `1_500` ms。
- 依据：`bootstrap.ts` 117-356 行。

### B28 错误消息脱敏与截断

- 输入：任意错误消息字符串（可选）。
- 输出：清洗后的字符串或 `undefined`。
- 错误语义：不抛错。
- 时序与并发：纯函数；先取前 4,096 字符再清洗，最终再截到 2,048 字符。
- 幂等：同输入同输出。
- 资源释放：不适用。
- 平台差异：POSIX（`/Users`、`/home`、`/root`、`/workspace(s)`、`/Volumes`、`/tmp`、
  `/var/folders`）与 Windows 盘符路径都被替换为 `{path}`。
- 状态所有者：无。
- 日志级别：不适用。
- 语义常量（清洗顺序）：
  1. URL → `protocol//host` + 逐段清洗的路由（去掉 query/hash/凭据；含 `@`、≥7 位数字、
     ≥16 位 hex、UUID 形态的段换 `{segment}`；其余段截 128）；
  2. `authorization` 头值 → `{redacted}`；
  3. query 键（`api_key`、`token`、`access_token`、`authorization`、`password`、`passwd`、
     `secret`、`cookie`、`session`、`x-arms-license-key`）→ `{redacted}`；
  4. 键值对形态的同类秘密 → `{redacted}`（已是 `{redacted}` 的不重复）；
  5. `Bearer`/`Basic` 凭证 → `{redacted}`；
  6. `sk-`/`rk-`/`pk-` 长串、`gh[pousr]_`、`AKIA…`、`AIza…`、`<user>@<12+hex>` → `{secret}`；
  7. 邮箱 → `{email}`；
  8. POSIX/Windows/tmp 路径 → `{path}`；
  9. 控制字符换空格、连续空白压成一个、trim；
  10. 空结果 → `undefined`。
- 依据：`error-sanitizer.ts` 54-90、152-176 行。

### B29 结构化错误与认领

- 输入：`sanitizeTelemetryError(error)` 或 `claimSanitizedTelemetryError(error)`。
- 输出：
  - sanitized：`{ type, code?, message?, cause? }`；`type` 取 `record.type` → `record.name` →
    Error.name，清洗为 128 字符内 `[A-Za-z0-9_.:-]+`，否则 `"UnknownError"`；`code` 去控制字符/
    压空白/截 128；`message` 走 B28；
  - `cause` 只在对象链长度 > 1 时出现，取链上**最深**一个可清洗对象，同样含 type/code/message；
  - 对象链沿 `cause` → `adapterError` → `error` 中第一个对象前进，最多 8 层，遇环停止；
  - claim：若链上任一对象已被认领，返回 `undefined`；否则把整条链登记并返回 sanitized。
- 错误语义：不抛错；非对象错误按空记录处理（`type: "UnknownError"`，通常无 message）。
- 时序与并发：WeakSet 只认对象身份；不延长生命周期；并发认领同一对象只有一个返回非 undefined。
- 幂等：claim 对同一链第二次返回 `undefined`（这是预期，不是错误）。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：模块级 `claimedErrorObjects` WeakSet。
- 日志级别：不适用。
- 语义常量：最大链深 8；`cause` 只记最深节点；`error.type`/`error.message` 等属性由 Writer 侧写。
- 依据：`error-sanitizer.ts` 16-52、92-150 行。

### B30 Provider 端点脱敏与 LRU 缓存

- 输入：`sanitizeProviderEndpoint(baseURL)`；`ProviderEndpointIdentityCache.resolve(providerKind,
baseURL)`。
- 输出：`{ origin, route, sanitizerVersion: "1" }` 或 `undefined`。
- 错误语义：非 http(s)、URL 非法、输入长度 > 4,096 → `undefined`；不抛错。
- 时序与并发：纯函数；缓存非线程安全但同步使用。
- 幂等：同输入同输出。
- 资源释放：缓存最多 `limit`（默认 256）项，超限逐出最久未使用项。
- 平台差异：不适用。
- 状态所有者：缓存实例的 Map；命中会刷新 LRU 顺序。
- 日志级别：不适用。
- 语义常量：
  - 去掉 username/password/search/hash；hostname 小写；https:443 与 http:80 去端口；
  - route 先 `decodeURIComponent` 每段（失败保留原串），逐段替换：邮箱 → `{email}`、
    UUID v1-5 → `{uuid}`、≥7 位数字 → `{id}`、≥16 位 hex → `{hash}`、≥20 位且含小写与
    （大写或数字）的 token 形态 → `{token}`；其余段截 128；整条 route 截 1,024；
  - 空 pathname 归一为 `/`；
  - 缓存键为 `<providerKind ?? "unknown">\0<trim 后的 baseURL>`；无效端点也缓存为
    “无结果”（重复调用不再解析）；空 baseURL 不读写缓存；`size` 为当前项数。
- 依据：`provider-endpoint.ts` 1-99 行。

### B31 Status Sink 生命周期与状态映射

- 输入：`ModelNetworkStatusEvent` 与可选的原始 `failureError`。
- 输出：对每次逻辑调用创建/更新 call 与 attempt writer；`activeCallCount` 反映在册调用数。
- 错误语义：`publish`/`publishFailure` 不抛错；处理异常经
  `onWarning("Model telemetry status processing failed", { eventType, errorType })`。
- 时序与并发：同步处理；`model_request_started` 首次为调用建 writer（`streaming` 为
  `transport !== "http"`），同 `requestId` 重复开始被忽略；`retry_scheduled` 记录 delay，下一次
  attempt 以 `attemptCause: "retry"`、`previousRequestId`、`retryDelayMs` 开始；完成时 attempt 先
  结算、再结算 call 并移除；失败可重试时保留调用，不可重试时 call 以 `failureStage: "attempts"`
  结算并移除；取消（reason `"cancelled"`）两侧都以 `finishCancelled("abort_signal")`。
- 幂等：未知请求/未知调用的完成/失败事件被忽略；重复完成不会二次结算。
- 资源释放：完成/不可重试失败/abandon 都从 Map 删除，避免长生命周期泄漏。
- 平台差异：不适用。
- 状态所有者：Sink 的 `calls` Map；endpoint 身份来自 B30 缓存。
- 日志级别：告警回调（调用方落 warn）；不直接打日志。
- 语义常量：
  - 逻辑调用 `callCause` 缺省 `"initial"`；`initial` 或没有 `previousLogicalCallId` 时按 initial
    建 call，否则携带 `previousLogicalCallId`；
  - attempt 的 `attemptCause`：`attempt <= 1` 或无 previous requestId 时为 `"initial"`；
  - 失败阶段：`errorPhase === "prepare"` → `"configuration"`；否则 `errorPhase ?? "unhandled"`；
  - 分类：auth_failed → authentication；provider_not_configured/invalid_request → configuration；
    rate_limited → rate_limit；timeout/stream_idle_timeout → timeout；
    network_error/stale_connection/tls_error → network；cancelled → cancelled；
    context_exceeded/provider_overloaded/server_error/proxy_error/auth_refresh/offpeak_queued →
    provider；其余 → unknown；
  - 路由 → API operation：含 `/chat/completions` → `chat_completions`；`/responses` → `responses`；
    `/messages` → `messages`；`:generatecontent`/`:streamgeneratecontent` → `generate_content`；
    否则 `unknown`；
  - 完成事件字段：providerRequestId、finishReason、input/output/reasoning/cacheRead/cacheWrite
    tokens、`streamOutputCommitted ?? false`；失败事件字段：statusCode、providerRequestId、
    providerErrorCode、providerErrorMessage、retryAfterMs、`streamOutputCommitted ?? false`；
  - `publishFailure` 的原始错误优先于事件字段构造的替代对象；
  - reasoning 缺省五元组为 `capability/effectiveControl/effectiveState/requestedControl/
requestedState = "unknown"`；有效 level/budget 在场时写入 attempt。
- 依据：`model-api-recorder.ts` 57-448 行。

### B32 Status Sink 容量、过期与旁路

- 输入：构造选项 `maxActiveCallAgeMs`、`maxActiveCalls`、`now`、`onWarning`。
- 输出：超限时逐出最久未活动的调用；过期扫描按固定节流执行；被放弃的调用 writer 收到
  `finishAbandoned(reason)`。
- 错误语义：不抛错；`onWarning` 自身抛错也被吞掉。
- 时序与并发：`maxActiveCallAgeMs` 缺省 `30 * 60_000`，`maxActiveCalls` 缺省 `1_000`（非有限或
  ≤0 回落）；过期扫描首次每 `min(maxActiveCallAgeMs, 60_000)` ms 一次；容量告警每 60 秒最多一次。
- 幂等：同一调用只 abandon 一次（从 Map 删除）；容量逐出循环直到低于上限。
- 资源释放：`abandonSession(sessionId)` 只清理 `call.sessionId` 匹配项，原因
  `"session_shutdown"`；`shutdown()` 清理全部，原因 `"process_shutdown"`；过期/容量原因
  `"missing_terminal"`。
- 平台差异：不适用。
- 状态所有者：Sink。
- 日志级别：告警文案
  `"Model telemetry active call capacity was reached"`（带 `abandonedCount`、`maxActiveCalls`）与
  `"Expired model telemetry calls were abandoned"`（带 `abandonedCount`、`maxActiveCallAgeMs`）。
- 语义常量：过期扫描节流上限 `60_000` ms；容量告警节流 `60_000` ms。
- 依据：`model-api-recorder.ts` 57-104、328-384 行。

### B33 Agent 遥测 Runtime：创建、容量、noop 与错误分类

- 输入：`AgentTraceRuntimeOptions { tracer, identity?, maxActiveWriters?, metrics?, onWarning? }`。
- 输出：`startTurn`/`startStep`/`startTool`/`startCompaction`/`startDetachedOperation`/`startCall`
  返回对应 writer；`captureCausation()` 在活跃 writer context 内返回 span/correlation 快照；
  `abandonSession(id)` 只放弃 correlation.sessionId 匹配的 writer（`session_shutdown`）；
  `abandonProcess()` 放弃全部（`process_shutdown`）；`updateIdentity` 影响后续 turn 的
  `identity_state`/`user_subject_id`。
- 错误语义：writer 创建失败或指标失败**不抛出**，回退 noop writer 并告警：
  `"Telemetry writer creation failed"` / `"Telemetry metric operation failed"`；容量耗尽回退 noop 并
  告警 `"Telemetry active writer capacity was reached"`（容量释放前只告警一次）。
- 时序与并发：writer 集合同步增减；writer 终结时从集合移除；容量判断在创建前。
- 幂等：每个 writer 的终态只认一次；重复 finish 无效。
- 资源释放：writer 终结（completed/failed/cancelled/abandoned）即从活跃集合移除；span.end 一次。
- 平台差异：不适用。
- 状态所有者：Runtime 的 `activeWriters`、identity、告警闩锁。
- 日志级别：告警回调；不直接打日志。
- 语义常量：默认 `maxActiveWriters` 5,000（非有限/≤0 回落）；turn span 属性
  `knorvia.agent_turn.turn_number`、`knorvia.agent_turn.input_source`；执行投影键前缀
  `knorvia.execution.*`；错误分类：AbortError/`ABORT_ERR` → cancelled；status 401/403 →
  authentication；408/504 → timeout；429 → rate_limit；code 含 `timeout` → timeout；含
  `network`/`econn`/`enotfound`/`tls` → network；否则 unknown；noop writer 的 `run` 直接执行回调、
  `captureCausation` 返回 undefined。
- 依据：`agent-trace-runtime.ts` 102-631、1535-1686 行。

### B34 Writer scope：run 的上下文与终结

- 输入：writer 的 `run(execute)`。
- 输出：在 writer 的 active context 中**恰好执行一次**业务回调；返回其返回值（Promise 原样透传）。
- 错误语义：
  - 上下文激活在回调执行前失败 → 告警 `"Telemetry context activation failed"`，仍执行一次回调；
  - 回调已返回后 teardown 抛错 → 告警 `"Telemetry context teardown failed"`，保留业务返回值，
    不重跑；
  - 回调抛错 → 若未终结，AbortError/`ABORT_ERR` 记 cancelled(`abort_signal`)，否则 failed
    (`unhandled`, 分类)；原错误继续抛出；
  - 回调返回且 writer 仍未终结 → 自动 abandoned(`missing_terminal`)；
  - 返回 Promise 时，resolve 后若仍未终结 → abandoned(`missing_terminal`)；reject → 同上抛错路径。
- 时序与并发：终态闩锁先关内存闩锁再触碰 SDK；同一 writer 的后续终结调用无效。
- 幂等：业务回调有且仅有一次求值；终态一次。
- 资源释放：终结时调用 `span.end()` 一次并触发一次终态指标回调。
- 平台差异：单调时钟用 `process.hrtime.bigint()`。
- 状态所有者：writer 自身（ended 闩锁、startedAt）。
- 日志级别：告警回调。
- 语义常量：自动放弃原因 `"missing_terminal"`；取消原因 `"abort_signal"`；失败阶段
  `"unhandled"`；属性值字符串截 1,024、去除控制字符/压空白；非有限数字、混合类型数组被忽略。
- 依据：`agent-trace-support.ts` 55-262、302-410 行。

### B35 指标口径与外部兼容属性（内部模块）

- 输入：`OtelAgentTelemetryMetrics` 的 meter；`toolCompatibilityAttributes`、
  `commandCompatibilityAttributes`、`modelAttemptCompatibilityAttributes`、
  `modelResponseCompatibilityAttributes`、`httpResponseCompatibilityAttributes`。
- 输出：
  - 指标名：`knorvia.agent.turn.duration`、`knorvia.agent.step.duration`、
    `knorvia.tool.execution.duration`、`knorvia.command.execution.duration`、
    `knorvia.context.compaction.duration`、`knorvia.detached.operation.duration`、
    `knorvia.model.call.duration`、`knorvia.model.attempt.duration`、
    `knorvia.model.call.attempts`、`knorvia.model.attempt.tokens`、
    `knorvia.model.attempt.time_to_first_provider_event`、`knorvia.model.attempt.time_to_first_content`、
    `knorvia.model.attempt.time_to_first_text`、`knorvia.model.attempt.stream_stall.count`、
    `knorvia.model.attempt.stream_max_idle`、`knorvia.command.execution.time_to_first_output`、
    `knorvia.telemetry.creation_drop.count`、`knorvia.telemetry.abandoned.count`；
  - 时长以**秒**记录；终态指标只允许白名单标签（含 `outcome`、`error_category` 等）；
    `abandoned` 计数只在 outcome 为 `"abandoned"` 时加 1；
  - 兼容属性：`gen_ai.operation.name: "execute_tool"`、`gen_ai.tool.call.id`、`gen_ai.tool.name`、
    `process.exit.code`、`process.signal.name`、`gen_ai.provider.name`、`gen_ai.request.model`、
    `server.address`、`server.port`（无显式端口时 https→443、http→80）、
    `gen_ai.response.finish_reasons`（单元素数组）、`gen_ai.response.model`、
    `gen_ai.usage.input_tokens`、`gen_ai.usage.output_tokens`、`http.response.status_code`。
- 错误语义：指标记录不抛错（Runtime 侧 `safeMetric` 吞掉）；兼容属性对空/非法值省略。
- 时序与并发：纯记录；标签是低基数、已归一化值，高基数 ID 不进 Metric。
- 幂等：`recordModelTokenDelta` 忽略非有限或 ≤0；`recordModelAttemptDetail` 只在值存在时记录，
  `stallCount <= 0` 不记录流停滞。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：仪表实例。
- 日志级别：不适用。
- 语义常量：`NOOP_AGENT_TELEMETRY_METRICS` 全部方法 no-op；标签白名单按 span 种类固定。
- 依据：`agent-metrics.ts`、`compatibility-adapters.ts`。

### B36 OTel Runtime 的懒加载与资源属性（内部模块）

- 输入：`createOwnedAgentTelemetryRuntime(options)`（仅由 B27 动态导入，不在包入口导出）。
- 输出：`AgentTelemetryRuntimeOwner`：`enabled: true`、`agentExecution`/`modelExecution`/
  `statusSink`、`abandonSession`、`flush({ timeoutMs? })`、`shutdown({ timeoutMs? })`、
  `updateIdentity`。
- 错误语义：flush/shutdown 不抛错（内部超时吞掉）；重复 shutdown 直接返回；构造失败由 B27 捕获。
- 时序与并发：OTel `BasicTracerProvider` + `BatchSpanProcessor`（maxBatch 100、队列 2,000、5s
  delay）；Metric `PeriodicExportingMetricReader` 默认 300,000 ms、DELTA temporality；trace 采样率
  默认 0.1；超时默认 3,000 ms；GZIP。关闭时先关 statusSink/放弃进程内 writer，再并行
  `provider.shutdown()`/`meterProvider.shutdown()`；注册成功的全局 Context Manager 在关闭时 disable
  （注册失败则复用宿主并禁用本实例）。
- 幂等：`flush`/`shutdown` 在 closed 后 no-op。
- 资源释放：见上；timer/队列/Exporter 随 provider 关闭。
- 平台差异：资源属性 `host.arch` 把 `x64` 映射为 `amd64`、`ia32` 映射为 `x86`；`os.type` 用
  `process.platform`。
- 状态所有者：Owner 持有 provider/meter/context manager 与 execution/statusSink。
- 日志级别：告警回调。
- 语义常量：Trace Resource 含 `service.instance.id` 与 `knorvia.device.installation_id`；
  Metric Resource **不含**这两个每次启动变化的 ID，避免无界基数；资源键包括 `service.name`、
  `service.version`、`knorvia.build.commit_id`、`knorvia.product.version`、
  `knorvia.runtime.distribution`、`knorvia.runtime.surface`、`knorvia.telemetry.schema_owner: "cli"`、
  `knorvia.telemetry.schema_version`；空值/undefined 属性被剔除；直方图边界按指标族固定
  （见 `otlp-exporter.ts` 的 `metricViews`）。
- 依据：`otlp-exporter.ts` 1-295 行、`bootstrap.ts` 154-200 行。

## 批次 E：node-repl-host（仅清单与工具契约）

### B37 包清单、导出面与发布面

- 输入：`package.json`、`.knorvia-plugin/plugin.json`。
- 输出：包名 `@knorvia/node-repl-host`、版本 `0.8.0`、`private: true`、`type: "module"`、
  `license: "MIT"`；`exports` 恰为 `.`、`./cua-bridge`、`./browser-bridge`、`./cua-broker`、
  `./result`、`./tool-contract`、`./runtime-bridge`，全部指向 `src/*.ts`；
  `scripts.build` 为 `tsc && node scripts/build.mjs`；插件清单名 `node-repl-host`、版本 `0.8.0`、
  `author.name: "Knorvia Studio"`、`license: "SEE LICENSE IN docs/LICENSE.txt"`。
- 错误语义：不适用（静态发布面）。
- 时序与并发：不适用。
- 幂等：不适用。
- 资源释放：不适用。
- 平台差异：`exports` 的 `src/*.ts` 由 TypeScript 消费方/打包器解释，不生成逐模块 dist 镜像。
- 状态所有者：无。
- 日志级别：不适用。
- 语义常量：包版本与 `NODE_REPL_SERVER_VERSION` 必须相等；`test/runtime.test.mjs` 是不在重写范围
  的 `unreviewed` 继承测试（见 `known-differences.md` §二）。
- 依据：`package.json`、`.knorvia-plugin/plugin.json`。

### B38 工具契约常量与文本

- 输入：`@knorvia/node-repl-host/tool-contract`。
- 输出：`NODE_REPL_DEFAULT_TIMEOUT_MS`（number）、`NODE_REPL_SERVER_VERSION`（string）、
  `NODE_REPL_SERVER_INSTRUCTIONS`（多行 string）、`JS_TOOL_DESCRIPTION`（多行 string）。
- 错误语义：不适用。
- 时序与并发：模块常量。
- 幂等：是。
- 资源释放：不适用。
- 平台差异：不适用。
- 状态所有者：无。
- 日志级别：不适用。
- 语义常量：
  - 默认超时 `60_000`；服务器版本 `"0.8.0"`；
  - `NODE_REPL_SERVER_INSTRUCTIONS` 为 8 行，必须表达：每次请求一个隔离 JS cell、变量/模块状态
    不跨调用、只接受 `node:` 内建与绝对文件模块 URL、`nodeRepl` 暴露的成员清单、只报告观察到的
    事实不得编造成功、Windows 计算机控制必须用专用 `computer_*` 工具并“请求访问→截图→单动作→
    验证”、只读页面内容是证据而非扩大授权的依据；
  - `JS_TOOL_DESCRIPTION` 必须表达：提供 code 与用户语言的短标题、`timeout_ms` 可选范围
    1–120000 ms 且默认 60000、每次重复导入与浏览器 bootstrap、用 `console.log`/`nodeRepl.write`
    输出紧凑事实、截图用 `nodeRepl.emitImage(await tab.screenshot())` 且不打印图片字节、
    动作后观察并如实报告失败。
- 依据：`tool-contract.ts` 1-15 行。

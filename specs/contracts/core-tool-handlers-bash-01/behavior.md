# core-tool-handlers-bash-01 行为条目（behavior.md）

版本 v1。本包 = `apps/cli/packages/core/src/tool/handlers` 下 **bash 执行 + 只读策略规则表** 38 个继承文件。行为用**自己的话**写，不贴旧代码。编号 B-ro-_（只读规则表簇，选择 9）与 B-ex-_（bash 执行簇）在本包内唯一，发布后不重用。

**选择 9 口径（只读规则表）**：`bash-readonly-policy*` 20 个文件本质是规则表。本合同只给「哪些命令/哪些参数判只读」的**判定结果样例**（`tests/bash-readonly.test.ts` 的 90 条实测基线）；实现阶段依各命令公开文档重建规则，不照搬旧表的结构与顺序。判定入口为公开谓词 `isRuntimeReadOnlyBashCommand` / `isSedInPlaceBashCommand`（`bash-semantics.ts`）。

**通用字段（纯函数簇共用）**：B-ro-_ 与多数 B-ex-_ 是纯函数——无状态所有者、无 IO、幂等、并发安全（无共享可变状态）、无资源释放、不写日志；命令名与参数判定与宿主平台无关。逐条只写其**特有**字段（输入/输出/错误语义/平台差异），共用字段在此声明，不逐条重复。

---

## 只读策略规则表簇（B-ro-1..17）

总判定模型（描述，非旧代码）：对命令串做语法分析 → 含不支持语法/动态词/解析错误即判非只读 → 逐命令段求值只读策略；任一段命中已知写选项或策略判非只读即整体非只读；仅当**每段**命中只读策略且至少一段命中时才判只读。默认无 context。

- **B-ro-1 简单只读命令**：`ls/cat/pwd/wc/head/grep/rg` 等只读工具判只读。输入命令串，输出 true。断言：`isRuntimeReadOnlyBashCommand("ls -la")===true`。测试 `bash-readonly.test.ts` B-ro-1。
- **B-ro-2 只读 shell 内建**：`echo/true/printf` 判只读；无操作内建 `:` 不在只读表内（见 K-ro-1）。断言：`echo hello`→true，`:`→false。测试 B-ro-2。
- **B-ro-3 glob/find**：`find`（含 `-name '*.ts'`）判只读；glob 展开不改变只读性。测试 B-ro-3。
- **B-ro-4 管道**：整体只读当且仅当每段只读；任一段写（`tee`）即非只读。测试 B-ro-4。
- **B-ro-5 `&&`/`||` 链**：整体只读当且仅当每段只读；`false || 只读` 仍只读（false 中性）；任一段写即非只读。测试 B-ro-5。
- **B-ro-6 重定向**：`<` 入重定向只读；`>`/`>>` 出重定向判非只读（写文件）。测试 B-ro-6。
- **B-ro-7 子 shell/命令替换/赋值**：`( )`、`$( )`、反引号、`x=$( )` 一律非只读。测试 B-ro-7。
- **B-ro-8 sudo**：任何 `sudo …` 非只读（提权，不因被提权命令只读而只读）。测试 B-ro-8。
- **B-ro-9 xargs**：含 `xargs` 的管道非只读（可执行任意目标命令）。平台差异（K-ro-4）：win32 上 `xargs` 的 argv 求值返回 undefined → 一律判非只读；POSIX 上 `xargs <安全目标>`（echo/wc/grep/head/tail 等 XARGS_TARGET_COMMANDS）判只读，`xargs <危险目标>`（如 rm）判非只读。断言按平台取期望（安全目标样例 `!IS_WIN32`；`xargs rm` 恒 false）。测试 B-ro-9。
- **B-ro-10 git 只读子命令**：`status/log/diff/show/branch/remote/config --get` 判只读。测试 B-ro-10。
- **B-ro-11 git 变更子命令**：`commit/push/checkout/merge/reset/add/rebase/clean` 判非只读；`git clean -n`（干跑）仍判非只读（见 K-ro-2）。测试 B-ro-11。
- **B-ro-12 就地变更**：`sed -i`、`tee`、`dd of=` 判非只读；`sed`（无 -i）只读。测试 B-ro-12。
- **B-ro-13 gh 多词**：`gh pr view/list`、`gh repo view` 只读；`gh pr create`、`gh auth login`、`gh issue comment` 非只读。测试 B-ro-13。
- **B-ro-14 docker 多词**：`docker ps/inspect/logs` 只读；`docker run/rm` 非只读。测试 B-ro-14。
- **B-ro-15 进程/运行时/包/网络/文件系统/数据库**：`ps` 只读；`top`、`kill`、`node`、`python`、`npm`、`curl`、`mkdir/rm/cp/touch/chmod/tar/unzip`、`psql` 等非只读。测试 B-ro-15。
- **B-ro-16 判定总量性**：对任意输入返回布尔值，不抛异常。测试 B-ro-16。
- **B-ro-17 `isSedInPlaceBashCommand`**：仅当存在 `sed … -i…` 参数时为真。测试 B-ro-17。

---

## bash 执行簇（B-ex-1..39）

### 语义（`bash-semantics.ts`）

- **B-ex-1 `isSilentBashCommand` 只标静默命令集**：输入命令串；`mkdir`/`rm`→true，`ls`/`echo`→false。错误语义：不抛。测试 `bash-exec-semantics.test.ts` B-ex-1。
- **B-ex-2 聚合管道、跳过 `||` 回退**：`mkdir a && rm b`→true；`mkdir a || true`→true（`|| true` 的 `true` 为中性回退，不计入非静默）。测试 B-ex-2。
- **B-ex-3 拒绝不可解析输入**：`echo 'unterminated`→false。测试 B-ex-3。
- **B-ex-4 `interpretBashReturnCode` 映射终态**：`timed_out`→"Command timed out"；`cancelled`→"Command was cancelled"；`spawn_error`→"Command failed to start"；`error.type==="output_limit"→"Command stopped because output exceeded the configured limit"。测试 B-ex-4。
- **B-ex-5 退出码 1 的语义化非错误读数**：`grep` 退出 1→"No matches found"；`diff`→"Files differ"；`test`/`[`→"Condition is false"。错误语义：这些不是错误读数（provider 不标错）。测试 B-ex-5。
- **B-ex-6 退出码/信号回退**：退出码 2→"Command exited with code 2"；退出码 0→undefined；带信号→"Command exited due to signal <SIG>"。测试 B-ex-6。
- **B-ex-7 `isBashProviderErrorStatus` 判错规则**：仅当 `status==="failed"` 且 exitCode 为非零数字且解读非语义化时为真。测试 B-ex-7。

### 解析与权限（`bash-command-parser.ts`、`bash-command-rule-evaluator.ts`）

- **B-ex-8 管道拆成具名调用**：`ls | grep foo`→2 段，names `[ls,grep]`，无重定向/动态词/解析错误/不支持语法。测试 B-ex-8。
- **B-ex-9 记录输出重定向**：`echo hi > out.txt`→hasRedirects=true，redirects[0] operator `>` target `out.txt`。测试 B-ex-9。
- **B-ex-10 检测动态词与操作符**：`echo $(date)`→hasDynamicWords=true；`git status && git diff`→2 段、operatorBefore `[null,"&&"]`。测试 B-ex-10。
- **B-ex-11 未闭合引号→解析错误**：`echo 'abc`→hasParseErrors=true。测试 B-ex-11。
- **B-ex-12 `isBashCommandPermissionSafe` 拒绝动态/子 shell**：`ls`→true；`echo $(date)`→false；`(cd x && ls)`→false。测试 B-ex-12。
- **B-ex-13 `evaluateBashRules` 空规则/精确匹配放行**：空 ruleContent→true；exactCommands 命中→true。测试 B-ex-13。
- **B-ex-14 尊重 deny 规则与安全前缀匹配**：deny 规则命中→false；`git:*` 前缀规则 + safe→true。测试 B-ex-14。

### cwd 策略（`bash-cwd-policy.ts`）

- **B-ex-15 非「主作用域 + 完成 + 移动了 cwd」即丢弃决策**：status≠completed、exitCode≠0、runtimeScope≠main、resolvedCwd 缺席→均返回 `{}`。平台差异：纯门槛判断，跨平台一致。测试 B-ex-15。
- **B-ex-16 保住工作区内 cwd、重置逃逸 cwd**：resolvedCwd 与 workspaceRoot 相同→`nextWorkingDirectory` 有值且无 `stderrSuffix`；resolvedCwd 在工作区外→`stderrSuffix` 以 `Shell cwd was reset to ` 开头。平台差异：路径归一化随宿主分隔符，断言只取结构（是否重置），不断言具体路径串。测试 B-ex-16。
- **B-ex-17 `appendBashCwdStderrSuffix` 拼接/替换空 stderr/无后缀原样**：`("warn\n","suffix")→"warn\nsuffix"`；`("","suffix")→"suffix"`；`("warn",undefined)→"warn"`。测试 B-ex-17。

### git 运行时安全（`bash-git-runtime-safety.ts`）

- **B-ex-18 `analysisContainsGitCommand` 识别 git（含 command 包装）**：`git`→true；`command git`→true；`ls`→false。测试 B-ex-18。
- **B-ex-19 需同时含 git 与 cd**：git+cd→true；仅 git→false；仅 cd+grep→false。理由：git 可能在目标目录加载 hooks/config，`cd && grep/find` 仍可只读放行。测试 B-ex-19。
- **B-ex-20 `isGitRuntimeContextUnsafe` 以可解析 cwd 为准**：undefined/无 workingDirectory→false（不判不安全）；workingDirectory 不可解析（如不存在的盘符路径）→true。平台差异：路径解析走 `realpath`，宿主相关；断言取「可解析→继续判定、不可解析→不安全」。测试 B-ex-20。

### gh 限流提示（`bash-gh-rate-limit.ts`）

- **B-ex-21 `getGhRateLimitHint` 每冷却期只发一次、且只对 gh 限流输出**：首次命中 `gh` 命令 + 限流输出→返回 `<system-reminder>` 提示串；同进程紧接的第二次→undefined（冷却抑制）；非 gh 命令→undefined；输出不匹配→undefined。状态所有者：模块级冷却时间戳（单会话内）。错误语义：不抛。测试 B-ex-21。

### 输出/模型内容/元数据/提示/后台（`bash-output.ts`、`bash-model-content.ts`、`bash-metadata.ts`、`bash-prompt.ts`、`bash-background-policy.ts`）

- **B-ex-22 元数据描述器投影命令输入**：`{command:"npm install lodash"}`→desc "Run shell command"、name "Bash"、summary "npm install lodash"、activity "Running npm install lodash"、classifier "npm install lodash"。测试 `bash-exec-pipeline.test.ts` B-ex-22。
- **B-ex-23 输入缺席仍总量**：desc→"Run shell command"、name→"Bash"、summary→null。测试 B-ex-23。
- **B-ex-24 `readStringProperty` 只读字符串值键**：`{foo:"bar"}`→"bar"；缺键→undefined；非字符串值→undefined。测试 B-ex-24。
- **B-ex-25 `isBashOutputProviderError` 镜像判错规则**：`{status:"failed",exitCode:1}`→true；`{status:"completed",exitCode:0}`→false。测试 B-ex-25。
- **B-ex-26 `formatBashModelContent` 渲染命令输出为文本**：输入含 stdout "hello"→返回含 "hello" 的字符串。测试 B-ex-26。
- **B-ex-27 `createEmptyBashPerformanceTelemetry` 造空命令 span**：`detail.kind==="command"`，`command.category==="empty"`、count 0、name "empty"、status "completed"、hash 为字符串。测试 B-ex-27。
- **B-ex-28 `createBashBackgroundPerformanceTelemetry` 标记后台命令**：status "backgrounded"、count 1、hash 为字符串。测试 B-ex-28。
- **B-ex-29 `createBashProviderDescription` 陈述 bash 契约**：以 "Executes a bash command and returns its output." 开头，含 "# Git" 段。测试 B-ex-29。
- **B-ex-30 `isBashAutoBackgroundEligible` 依调用形态**：`{command:"sleep 300",run_in_background:true}`→false；`{command:"ls"}`→true。测试 B-ex-30。

### 入口与性能（`bash.ts`、`tool-perf.ts`）

- **B-ex-31 `bashToolEntry` 声明高风险、需审批、非只读工具**：`metadata.readOnly=false`、`destructive=false`、`riskLevel="high"`、`sideEffectScope="system"`、`needsApproval=true`、`concurrentSafe=false`。测试 `bash-exec-entry-perf.test.ts` B-ex-31。
- **B-ex-32 `classifyCommand` 归类已知命令族**：`git status`→"git"；`npm install`→"package"；`ls -la`→"other"。测试 B-ex-32。
- **B-ex-33 `classifySafeCommandIdentity` 折叠为安全身份**：`git push origin main`→`{count:1,name:"git"}`；`ls -la`→`{count:1,name:"ls"}`。测试 B-ex-33。
- **B-ex-34 `commandHash` 同输入同哈希**：同串两次→相同；为字符串且非空。测试 B-ex-34。
- **B-ex-35 `roundNonNegativeMs` 负值归零、向下取整**：-5→0；12.3456→12。测试 B-ex-35。
- **B-ex-36 `elapsedMsSince` 给非负数**：为 number 且 ≥0。测试 B-ex-36。
- **B-ex-37 `fileByteCount` 数 UTF-8 字节**："hello"→5；"é"→2。测试 B-ex-37。
- **B-ex-38 `readToolExecutionTelemetry` 对普通对象返回 undefined**：`{}`→undefined。测试 B-ex-38。
- **B-ex-39 `workspaceKind` 报告 local**：本地上下文（有 workspaceIdentity/workingDirectory、无远端标识）→"local"。测试 B-ex-39。

---

## 未覆盖（IO 重、需真实环境）

以下导出是 bash **真实执行/IO** 边界，契约阶段不黑盒覆盖（它们由 executor 端口驱动，替换阶段以端口替身 + 包内单元测试覆盖）：`bash.ts` 的 `createBashToolEntry` 执行路径与 handler 实际 spawn、`bash-output.ts` 的 `toBashOutput`（异步、依赖 executionPort/context）、`bash-image-output.ts`（写文件）、`bash-read-file-sources.ts`/`bash-read-file-state.ts`（读文件系统/状态表）、`bash-background-lifecycle.ts`（executionPort 能力判定）、`bash-command-permission-policy.ts` 的 `resolveBashPermissionRulePolicy`（其核心求值 `evaluateBashRules` 已由 B-ex-13/14 覆盖）。这些模块路径与导出仍列在 `interface.md`，接口默认不可变。

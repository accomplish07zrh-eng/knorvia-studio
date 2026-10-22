# kernel-plugin-policy 行为条目（behavior.md）

**合同版本：v1**（2026-10-22）

每条含：输入 / 输出 / 错误语义 / 时序与并发 / 幂等 / 资源释放 / 平台差异 / 状态所有者 /
日志级别 / 可测断言。

**行为依据**：`specs/knorvia-permission-policy.md`「必须保留的优先级」1–7 条为**权威**；
旧实现 `apps/cli/packages/core/src/permission/**` 仅作行为取证，不作为代码来源。

---

## B1 插件形态与挂载

**输入**：`apply(ctx: Context, config: KnorviaPolicyConfig)`。
`config` 必需三项：`readMode`（getter）、`readToolCapability`（getter）、`readSessionGrants`（getter）。
可选：`logger`、`readProjectRules`。

**输出**：无返回值；在 `ctx` 上注册一个 `tools/pre-execute` 监听者。

**接线约定（照 #254 的 `assertWired` 精神）**：

- 三个必需字段缺席 → **立即抛错**（装配期暴露，不拖到第一次工具调用）；
- **不补默认值** —— 它们都是「当前运行时的事实」，凭空造值等于伪造状态。

**错误语义**：配置错误抛 `Error`，消息直接指出缺哪个字段。

**时序**：挂载后即可生效；不依赖「本插件晚于其他插件挂载」（DSH `boot()` 的 `loader.await()` 保证）。

**并发**：监听者必须无共享可变状态（除注册表的显式写入）。

**幂等**：重复 `apply` 会注册多个监听者 → 禁止；由组合根保证只挂一次。

**资源释放**：`apply` 返回后由 DSH `ctx` 生命周期管理；本包不持有需要手动释放的资源（无定时器、无句柄）。

**平台**：无平台相关行为（不读路径、不读环境变量）。

**状态所有者**：模式注册表、会话授权集 —— 均归本包实例，按 `sessionId` 分区。

**日志**：`info` —— `kernel.policy.mounted`（含监听者序号、工具声明来源摘要）；
`debug` —— 每次判定的 `{ callId, toolName, mode, ruleId, decision }`；
`warn` —— fail closed 触发（附原因分类，不含 arguments）。

**断言**：

1. 缺 `readMode` → `apply` 抛错且消息含 `readMode`；
2. 正常装配后，触发一次 `tools/pre-execute` 能收到 `PreToolDecision`；
3. 插件模块目录内 `git grep KNORVIA_KERNEL_ENGINE` 零命中（L10）。

---

## B2 模式注册表

**输入**：`readMode(sessionId)` getter（组合根提供权威读取器）；
本包内部 registry 缓存并订阅变更。

**输出**：`CollaborationMode | undefined`（`plan` / `build` / `edit` / `yolo` / `auto`）。

**错误语义**：返回 `undefined`（session 未知）→ **`deny`**（L3）。
**不默认 `build`**：默认 `build` 会让新 session 意外获得写权限。

**时序**：`readMode` 在**每次进入判定时调用一次**，结果存为 `modeAtEntry`（B4）。
若组合根的读取器本身也缓存，两者必须一致（以组合根为准）。

**并发**：同一 session 的两个并发 execution 各自快照；不共享快照变量。

**幂等**：同 session 连续读多次得到同一值（除非期间发生了显式模式切换事件）。

**资源释放**：registry 随插件生命周期释放；不持久化到磁盘（模式持久化归 DSH session log）。

**平台**：无。

**状态所有者**：本包 registry 是 cache；**权威**是组合根（DSH session log / UI 状态）。

**日志**：`debug` —— `kernel.policy.mode`（`{ sessionId, mode, source: MyReadme"registry" }`）。

**断言**：

1. 未注册 session → `deny`，理由含「no mode」；
2. 注册 `plan` / `build` / `edit` / `yolo` / `auto` 后，判定分别走对应路线；
3. 模式切换后，**下一次** execution 用新模式（不是当前正在判定的那次）。

---

## B3 能力解析

**输入**：`{ toolName, arguments }`（来自 `ToolExecution`）+ `readToolCapability(toolName)` getter。

**输出**：9 个判定字段：

| 字段                      | 取值来源（逐属性优先级）                                             |
| ------------------------- | -------------------------------------------------------------------- |
| `allowedInPlanMode`       | 声明 → `false`                                                       |
| `alwaysAsk`               | `permission.alwaysAsk` → 声明 `alwaysAsk` → `false`                  |
| `allowSessionApproval`    | `permission.askOptions.allowAlways !== false`                        |
| `readOnly`                | 声明 → 工具名缺省表                                                  |
| `destructive`             | 声明 → 工具名缺省表                                                  |
| `requiresUserInteraction` | 声明 → （`sideEffectScope === "userInteraction"`）                   |
| `sideEffectScope`         | `permission.sideEffectScope` → 声明 `sideEffectScope` → 工具名缺省表 |
| `riskLevel`               | `permission.riskLevel` → 声明 → 工具名缺省表                         |
| `needsApproval`           | `permission.needsApproval` → 声明 → 工具名缺省表                     |

**⚠️ 逐属性独立**：`readOnly: true` 的覆写**不能**顺带授予 `needsApproval: false`
（一条覆写只影响它自己那一个属性）。

**工具名缺省表**（既有产品政策，**原样保留**）：

| 工具名组                                                                                                            | readOnly | sideEffectScope | needsApproval |          riskLevel          |
| ------------------------------------------------------------------------------------------------------------------- | :------: | :-------------: | :-----------: | :-------------------------: |
| `Read` `Glob` `Grep` `WebSearch` `WebFetch` `TodoRead` **`TodoWrite`** **`AskUserQuestion`** `Agent` `Task` `Skill` |   true   |      none       |     false     |             low             |
| `Bash`                                                                                                              |  false   |    workspace    |     true      | medium（+destructive=true） |
| （未知名）                                                                                                          |  false   |    workspace    |     true      |           medium            |

**⚠️ `TodoWrite` 与 `AskUserQuestion` 在只读组里** —— 名字像写操作但既有政策如此，**必须原样保留**。

**错误语义**：`readToolCapability` 抛错 → **`deny`**（fail closed，L5），不吞掉也不放行。

**并发**：纯函数（除 getter 调用），无状态。

**幂等**：同输入同输出。

**资源释放**：无。

**平台**：无（`sideEffectScope: system` 的判定不含路径语义；`workspace` 档的路径判定见 B6 的草稿免确认）。

**状态所有者**：工具声明归 `kernel-plugin-tools-01`（exec-kernel）；本包只读。

**日志**：`debug` —— `kernel.policy.capability`（9 个字段 + 缺省来源标记）。

**断言**：

1. 未知工具名 → `readOnly:false` / `workspace` / `needsApproval:true` / `medium`；
2. `TodoWrite` → `readOnly:true` / `none` / `needsApproval:false` / `low`（政策保留）；
3. `Bash` → `destructive:true`；
4. 声明 `{ readOnly: true }` 但未声明 `needsApproval` → `needsApproval` 仍按缺省表（**不被顺带放开**）；
5. `readToolCapability` 抛错 → `deny`。

---

## B4 模式快照与并发

**输入**：`sessionId`（来自 `exec.agent?.id`，缺失则 `deny`）。

**输出**：`modeAtEntry` —— 本次 execution 全程使用的模式。

**时序（核心不变量 L2）**：

```
① 监听者入口：modeAtEntry = readMode(sessionId)
② 之后所有判定只用 modeAtEntry
③ 即使下游 listener（kernel-plugin-hooks）在 next() 前改了注册表，本次判定不受影响
④ 下一次 execution 重新快照
```

**⚠️ 这精确对应 Knorvia 的「`activePlan` 提前捕获」约束**：

> 规则回调可修改调用者 context；本次计划模式事实必须在调用它之前捕获。

**并发**：每个 execution 有独立的 `modeAtEntry` 局部变量（不在实例上）。

**幂等**：同一 execution 内多次读取同一快照（同一值）。

**资源释放**：无。

**平台**：无。

**状态所有者**：快照归本次 execution 的栈帧；registry 归本包；权威归组合根。

**日志**：`debug` —— `kernel.policy.modeSnapshot`（`{ callId, modeAtEntry }`）。

**断言**：

1. 在监听者内部（判定过程中）调用 `registry.set(newMode)` → 本次判定仍用旧 mode；
2. 下一次 execution → 用 newMode；
3. 两个并发 execution 各自持有独立快照（不串）。

---

## B5 7 条路线的短路顺序（安全语义）

**这是本包最重要的行为**：顺序本身即安全语义，不可调整。

```text
① control         ── EnterPlanMode ⇒ allow；ExitPlanMode 且非 plan ⇒ deny
                     （planEnabled 显式布尔优先于 mode === "plan"）
② interaction     ── requiresUserInteraction 时：
                     仅 disallowedTools ⇒ deny；其他 ⇒ ask
                     ← 硬拒绝，优先于 auto / 项目规则 / alwaysAsk / 会话规则
③ mandatory       ── alwaysAsk 时依次：
                     auto⇒deny / disallowedTools⇒deny / 项目deny⇒deny /
                     可用会话allow⇒allow / 本会话非用户停止的 AmendWorkflow⇒allow / 其他⇒ask
                     ← 项目 ask / allow、全局 allowlist、yolo、计划只读都不能绕开
④ ordinary        ── 非计划 yolo⇒allow / auto⇒deny / disallowedTools⇒deny /
                     项目deny⇒deny / 项目ask⇒ask
                     ← 进入此路线时捕获本次 planEnabled（即 modeAtEntry）
⑤ plan（activePlan）── 非破坏只读⇒allow / 非破坏 mcp⇒allow /
                     显式 allowedInPlanMode + session 范围 + 非破坏 + 非 needsApproval⇒allow /
                     其他⇒deny
                     ← 不读项目 allow 或普通免确认规则
⑥ exemptions      ── 项目allow⇒allow / 预批准 WebFetch⇒allow / 项目 workflow-drafts 写⇒allow /
                     allowedTools⇒allow / edit 模式的 edit+workspace 工具⇒allow
                     ← 草稿与 WebFetch 不能越过项目 deny / ask
⑦ build           ── 只读且非破坏且非needsApproval⇒allow / critical⇒ask /
                     high 且未 autoApproveHighRisk⇒ask /
                     低风险 session⇒allow / 有副作用⇒ask / 其他⇒allow
```

**输入**：`modeAtEntry` + 能力字段 + `readSessionRules()` + `readProjectRules()` + `readSessionGrants()`。

**输出**：`{ kind: 'allow' | 'deny' | 'ask' | 'cancel', reason, ruleId }`。

**错误语义**：路线耗尽仍无决策 → **`deny`**（L5）。
**⚠️ 这与旧实现的 `throw new Error("Permission policy program ended without a decision")` 不同**：
旧实现抛错是「编程错误」信号；新实现必须 `deny`，因为 DSH 侧抛错可能被默认放行（违反 fail closed）。

**⚠️ 惰性求值**：只有被选中路线才读项目/会话规则或 arguments（对应旧实现的 generator 语义）。
`④ ordinary` 之后若 `activePlan` 为真，**不进入 ⑥⑦**（不读项目 allow）。

**并发**：每条路线的判定是纯函数（getter 调用除外）。

**幂等**：同输入同输出（除 getter 返回变化）。

**资源释放**：无。

**平台**：`⑥` 的「项目 workflow-drafts 写」判定含路径语义（见 B12）。

**状态所有者**：规则集归项目存储；会话授权归本包；模式归 registry。

**日志**：`debug` —— `kernel.policy.decision`（`{ callId, mode, ruleId, decision }`）；
`info` —— 仅 `ask` / `deny`（生产可用事件，不含 arguments）。

**断言**（每条路线至少 1 个）：

1. `EnterPlanMode` 恒 `allow`；`ExitPlanMode` 且 `planEnabled === false` → `deny`；
2. `requiresUserInteraction` + 未在 `disallowedTools` → `ask`（即使 `mode==="auto"`）；
3. `requiresUserInteraction` + 在 `disallowedTools` → `deny`；
4. `alwaysAsk` + 项目 `allow` 规则 → **仍 `ask`**（项目 allow 不能绕开）；
5. `mode==="yolo"` 且非 plan → `allow`；但 `alwaysAsk` 时为 `ask`；
6. `mode==="auto"` → `deny`（`ruleId === "mode.auto.unimplemented"`）；
7. `plan` 模式四类白名单逐一断言；白名单外 → `deny`；
8. 项目 `deny` 规则优先于豁免路线（即使 `allowedTools` 含该工具）。

---

## B6 五模式语义

| 模式    | 语义                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------- |
| `plan`  | 第 ⑤ 路线：只允许非破坏只读 / 非破坏 mcp / 显式 `allowedInPlanMode`+session+非破坏+非`needsApproval`；其余 `deny` |
| `build` | 第 ⑦ 路线六步（见 B5 ⑦）                                                                                          |
| `edit`  | 第 ⑥ 路线：**同时**满足 `permissionName === "edit"` **且** `sideEffectScope === "workspace"` 时 `allow`           |
| `yolo`  | 第 ④ 路线：非计划时 `allow`（**保留的既有产品政策**），但不能绕开 ②③                                              |
| `auto`  | **保留未实现** → `deny`（`ruleId === "mode.auto.unimplemented"`），不得静默降级为 `build`（L6）                   |

**断言**：

1. `edit` 模式 + `permissionName==="edit"` 但 `sideEffectScope==="session"` → 不免确认（走 ⑦）；
2. `edit` 模式 + `sideEffectScope==="workspace"` 但 `permissionName!=="edit"` → 不免确认；
3. `yolo` + `planEnabled===true` → 不走 yolo 允许（进入 plan 路线）；
4. `auto` → `deny` 且 `ruleId` 为 `mode.auto.unimplemented`。

---

## B7 取消与中止

**输入**：`exec.signal`。

**输出**：`{ kind: 'cancel' }` 或按正常判定。

**语义**：

- 进入监听者时 `signal.aborted === true` → **`cancel`**（不判定、不记会话授权）；
- 判定完成后 signal 才中止 → **不影响已定决策**（已返回的 `PreToolDecision` 有效）。

**⚠️ 不返回 `deny`**：`deny` 会被记录成「权限拒绝」，而中止不是拒绝语义。
`cancel` 是 DSH 提供的第四档，专门表达「调用方撤回」。

**并发**：signal 由调用方持有；本包只读。

**幂等**：同 execution 重复判定得到同结果（signal 不会「取消回滚」）。

**资源释放**：本包不注册 signal 监听者（避免泄漏）；只读 `aborted`。

**平台**：无。

**状态所有者**：signal 归调用方。

**日志**：`debug` —— `kernel.policy.cancelled`。

**断言**：

1. 已中止的 signal → `cancel`；
2. 判定后中止 → 返回原决策（非 `cancel`）；
3. 本包不调用 `signal.addEventListener`（可用 spy 断言零注册）。

---

## B8 会话授权

**输入**：`readSessionGrants(sessionId)` getter；批准事件（来自 `dsh-user-approval` 的
`approval/request` 结果，或组合根的显式调用）。

**输出**：`sessionId → 已授权规则集`；在 ⑦/⑥ 之前先查（顺序见下）。

**语义**：

- 授权**仅对同一 session** 生效；不跨 session、不跨 workspace（L4）；
- 授权条目形如 `{ toolName, ruleContent? }`，按项目规则的匹配语义判定（B3 + `rule-content-program`）；
- **查授权的时机在 ③ mandatory 之后、④ ordinary 之前不影响语义**：
  实际按 B5 的 `③ mandatory` 内「可用会话 allow」与 `⑥ exemptions` 的 `allowedTools` 分别消费；
- **写授权的时机**：在 `approval/request` 的 waterfall 结果处（用户选「本次会话都允许」时），
  **不在 `tools/pre-execute` 内写**（避免判定函数有副作用，L8）。

**⚠️ 与 DSH 的关系**：`dsh-user-approval` 的 approval 只对那一次请求有效；
本包的会话授权是**额外的跨请求状态**，两者不冲突（DSH 管单次，本包管会话）。

**并发**：同 session 并发写授权 → 必须串行（read-modify-write 加锁）；
不同 session 互不影响。

**幂等**：重复批准同一 `{toolName, ruleContent}` → 集合语义，不重复计数。

**资源释放**：session 结束时清除该 session 的授权（避免内存增长）；不持久化到磁盘。

**平台**：无。

**状态所有者**：本包（内存）；session 生命周期由组合根通知。

**日志**：`info` —— `kernel.policy.grant.added`（`{ sessionId, toolName, hasRuleContent }`，不含实参值）；
`info` —— `kernel.policy.grant.cleared`。

**断言**：

1. session A 的授权不影响 session B；
2. 重复批准不产生重复条目；
3. session 结束后授权被清除；
4. 授权带 `ruleContent` 时按通配/命令/URL 语义匹配（见 B12）。

---

## B9 fail closed 与无静默降级

**输入**：任意判定路径。

**输出**：`{ kind: 'deny', reason }`。

**必须 `deny` 的全部情形**：

1. `sessionId` 缺失（`exec.agent` 为 `undefined`）；
2. 模式缺失（registry 返回 `undefined`）；
3. 工具声明读取抛错；
4. 路线耗尽仍无决策；
5. 内部逻辑抛异常（catch 后 `deny`，**不 rethrow**）；
6. `arguments` 形状无法解析（如需要 URL 但拿不到字符串）。

**⚠️ 绝不 `allow`**：任何「无法判定」都不得放行。
**⚠️ 绝不 rethrow**：DSH 侧若把异常当「管线失败」，可能走默认放行路径。
**⚠️ 绝不静默降级**：`auto` 未实现 → `deny`，不当作 `build`（L6）。

**日志**：`warn` —— `kernel.policy.failClosed`（`{ callId, toolName, reasonKind }`，不含 arguments）；
`error` —— 仅内部异常（附 stack，但**脱敏**：不含 arguments 值）。

**断言**：

1. 6 种情形逐一断言 `deny`；
2. 内部抛异常时，监听者**返回** `deny` 而非抛错（catch 断言）；
3. `deny` 的 `reason` 不含工具 arguments 的任何值（L9）。

---

## B10 幂等与重入

**输入**：同一 `callId` 重复进入监听者（理论上 DSH invariant 禁止，但防御性处理）。

**输出**：同一 `PreToolDecision`（不重复记账、不重复写授权）。

**语义**：

- 本包**不缓存** `callId → decision`（避免内存增长）；
- 但**不产生副作用**（不写授权、不写日志以外的状态）→ 重入天然幂等；
- DSH 的 invariant 保证「`tools/pre-execute repeated for one execution`」会 fail，
  **本包不依赖该 invariant**，而是靠「无副作用」保证安全。

**并发**：不同 `callId` 并发 → 各自独立。

**断言**：

1. 同一 execution 调用两次监听者 → 两次返回相同决策；
2. 两次调用都不产生授权写入（spy 断言）。

---

## B11 日志与理由（不泄漏）

**规则**：

- `reason`（进 DSH 审计）必须是**稳定的英文短句**，不含工具 arguments 的值、不含路径全文；
- `displayReason`（进 UI）只放本地化文案（`{ en, zh, ... }`），同样不含值；
- `debug` 可含 `toolName` / `mode` / `ruleId` / `callId`，**不可含 arguments**；
- `error` 可含 stack，但必须脱敏。

**断言**：

1. 对含敏感值的 arguments（如 `{ file_path: "/secret/path" }`）触发判定后，
   所有日志与 `reason` 都不含 `/secret/path`；
2. `reason` 在同一 `ruleId` 下稳定（便于审计聚合）。

---

## B12 平台差异

**涉及路径的两处**：

1. **workflow-drafts 免确认**（B5 ⑥）：目标是否严格位于
   `<workingDirectory>/.knorvia-studio/workflow-drafts/` 之内；
2. **项目规则的路径类 `ruleContent` 匹配**。

**语义**：

- 用 `node:path` 的 `resolve` / `relative` / `isAbsolute`，**不手写分隔符**；
- 判定必须注入 `pathModule`（测试可传 `path.win32` / `path.posix` 覆盖盘符、反斜杠、大小写）；
- **纯字符串比较**：不 `realpath`、不 `stat`（一次磁盘读失败不能把「不放行」变成「放行」）；
- `workingDirectory` 缺失 → **不免确认**（算不出目标落在哪，该弹窗弹窗）。

**平台差异**：

- Windows：盘符、反斜杠、大小写不敏感比较（`path.win32.relative` 已处理盘符差异）；
- POSIX：正斜杠、大小写敏感；
- **无真实 `~/.dsh` 读写**（本包不接触用户目录）。

**断言**：

1. `path.win32` 下 `C:\w\...\workflow-drafts\a.md` 判定为内部；`C:\w\...\workflow-drafts-other\a.md` 判定为外部；
2. `path.posix` 下 `/w/.knorvia-studio/workflow-drafts/a.md` 内部；
3. `workingDirectory` 缺失 → 不免确认；
4. 目标等于草稿目录本身（`relative === ""`）→ 不免确认；
5. 跨盘符（Windows）→ 不免确认（`relative` 返回绝对路径）。

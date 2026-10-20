# kernel-bridge-legacy 行为合同

条目编号 B1–B16，发布后不重用。每条写清输入、输出、错误语义、时序与并发、幂等、资源释放、平台差异、状态所有者、日志级别。断言在 `tests/`，对照表见 [README.md](README.md) §五。

术语：**旧运行时** = 默认引擎（`KNORVIA_KERNEL_ENGINE` 缺省或非 `dsh`）；**新运行时** = `KNORVIA_KERNEL_ENGINE=dsh`。

---

## B1 物理协议面与严格外壳

- **输入**：stdin 上的 NDJSON 行。
- **输出**：stdout 上每行一条协议消息；四类外壳按 `packages/shared/src/protocol/index.ts` 的 schema 严格解析。
- **错误语义**：非法 JSON → `-32700 "Parse error"`，回复 id 固定为 `parse-error`；结构不符 schema（含带 `jsonrpc` 字段）→ `-32600 "Invalid Knorvia Studio Protocol message"` + `data.issues`，回复 id 固定为 `invalid-message`。
- **时序**：同一连接串行处理请求；回复按到达顺序写出。
- **平台差异**：Windows 与 POSIX 都是 `\n` 分隔，UTF-8。
- **状态所有者**：连接（transport），不属会话。
- **日志**：解析失败 `warn`；其余 `debug`。

两种引擎都必须完全一致——`kernel-bridge-01` 已实现，本包不改。

## B2 未知方法与旧协议方法的分界

- **输入**：任意 `method` 字符串。
- **输出**：真正未实现的方法 → `-32601 Method not found: <method>`。
- **关键约束**：74 个旧协议方法里的 59 个客户端方向方法**不得**落入该分支（B5 逐条断言）。
- **状态所有者**：路由器。

## B3 `runtime/capabilities` 与 `process/childProcesses`

- **输入**：`{}`（两者都是 strict 空对象）。
- **输出**：`runtime/capabilities` → 至少含 `independentPlanState: boolean`；`process/childProcesses` → `{ processes: ProcessChildProcess[] }`，无子进程时为空数组。
- **幂等**：是，纯查询。
- **状态所有者**：进程级（能力声明与进程表）。

## B4 workspace 级只读方法

- **输入**：`{ workspace: { workspacePath, workspaceKey } }`。
- **输出**：`workspace/readPresentation` → `{ workspace, mode, slashCommands[] }`，`workspace.workspacePath` 与请求一致；`session/list` → `{ sessions: SessionSummary[] }`，空白工作区为空数组。
- **错误语义**：缺 `workspace` → `-32602`（参数非法，请求边界拒绝）。
- **平台差异**：`workspacePath` 原样回显，不做大小写或分隔符归一。
- **状态所有者**：workspace 快照。

## B5 客户端方向 59 个方法的应答面

- **输入**：`fixtures/request-script.mjs` 的固定脚本（每条给 schema 合法的最小参数）。
- **输出**：每个方法必须被应答，且响应是「结果」或「既有错误码」，**永不 `-32601`**。
- **错误语义**：允许的错误码族 = `-32003`、`-32004`、`-32009`、`-32010`、`-32018`、`-32031`，以及旧实现在域错误上折叠出的 `-32603`；错误 `message` 必须非空字符串。不得新增错误码。
- **outcome 三档**：`ok`（两引擎都必须给结果）、`error`（两引擎都必须给既有业务错误）、`either`（取决于本地状态；但 `-32031` 仅留给端口类方法，见 B10）。
- **时序**：逐条串行发出，逐条等待应答；断言不看耗时。
- **幂等**：脚本里的读类方法幂等；写类方法用固定夹具名，不留真实数据。
- **状态所有者**：各方法的域所有者；桥只做参数校验与结果整形。

## B6 会话身份闭环

- **输入**：`session/create`（`{ workspace }`）→ 取其 `session.sessionId` → `session/list`（同 workspace）。
- **输出**：列表恰好 1 条，`sessionId` 一致，`workspace.workspacePath` 与请求一致。
- **时序**：create 的应答必须先于 list 可见（同连接串行即满足）。
- **状态所有者**：会话登记表（唯一写入者）。

## B7 空白会话的只读面

- **输入**：live 但无消息的会话。
- **输出**：`session/messages` → `{ messages: [] }`；`session/events` → `{ events: [] }`。
- **错误语义**：不存在的会话：只读面回 `-32004`（旧运行时文案 `Session is not active: <id>` 或 `Session not found: <id>`）；文案不属冻结面，错误码属。
- **状态所有者**：会话投影。

## B8 方向不可反

- **输入**：14 个 CLI→Host 方法在客户端方向发来。
- **输出**：必须 `-32601`。
- **正向对照**：同一连接上 `runtime/capabilities` 必须**不是** `-32601`，否则本断言在空实现上也会通过（自证陷阱）。
- **状态所有者**：路由器（方向表）。

## B9 方法表自洽

- **输入**：静态清单。
- **输出**：59 + 14 + 1 = 74；7 个通知名唯一；借名通知 `computer-use/operation-event` 单独计。
- **附加**：清单必须由协议面真的实现（正向对照调用 `runtime/capabilities`）。

## B10 执行端口的 capability 缺席语义（实现阶段）

- **输入**：回合类方法（`session/send|stop|compact|fork|goal|setModel|setThoughtLevel|setMode|resume|subscribe`、`session/cancelBackgroundTask`）在端口未注册时。
- **输出**：`-32031` + 既有 `fault.command.capabilityUnsupported` 词表；不得回 `accepted`/空白结果，不得新增 reasonCode。
- **时序**：端口注册是启动期一次动作，运行期不动态增删。
- **状态所有者**：执行端口注册表（唯一所有者是组合根）。
- **日志**：`warn`。

## B11 `session/requestRuntimePreferences` 反向请求（实现阶段）

- **输入**：CLI 需要会话运行时偏好时发起 `{ sessionId, scope }`，`scope ∈ {runtime-materialization, user-execution}`。
- **输出**：Host 应答 `sessionRuntimePreferencesResultSchema`；结果形状不变。
- **错误语义（逐码冻结，Lead 2026-10-20 裁决）**：本表是回归依据，实现与测试都按它对齐。

  | 错误码                       | 行为                                                | 日志    |
  | ---------------------------- | --------------------------------------------------- | ------- |
  | `-32601`（宿主不认识该方法） | **退化**：用本地默认值继续，不阻断 `session/create` | `debug` |
  | `-32020`（无客户端连接）     | **退化**：同上                                      | `debug` |
  | `-32022`（超时）             | **抛出让 create 失败**（不得退化成「用默认偏好」）  | `warn`  |
  | 其它错误                     | **抛出**                                            | 默认    |

  超时必须阻断的理由：若把超时也退化，Host 侧真实超时就会从「失败」静默变成「用默认偏好」，
  属于放宽行为。退化默认值：`nativeSearchEnhancementsEnabled: true`、`memoryEnabled: false`、
  `askUserQuestionAutoResolutionEnabled: true`、`modelContextBudgetStrategy` 取共享默认。

- **时序**：反向请求必须在同一 stdout 流上，且 id 不与客户端请求 id 冲突（`server-<n>` 前缀）；
  `session/create` 触发 1 次（scope=`runtime-materialization`），`session/resume` 另触发 1 次（执行偏好）。
- **资源释放**：超时/取消/连接关闭都必须清掉 pending，不得泄漏定时器。
- **状态所有者**：反向请求登记表（唯一写入者）。
- **实测（2026-10-20，dsh 引擎）**：create 期间每次都拿到了 Host 应答并继续，**未观察到超时分支**；
  即 dsh 路径的常态是「有应答」或「退化」，create 不受阻。

## B12 `interaction/*` 六方法（实现阶段）

- **输入**：`interaction/requestPermission`、`requestUserInput`、`requestProviderRuntimeHeaders`、`requestOfficialMcpAuthHeaders`、`browserList`、`browserExecute` 由 CLI 发起。
- **输出**：各自的 result schema 由 `@knorvia/shared` 冻结；`requestProviderRuntimeHeaders` 在超时或中止时**额外**发 `interaction/providerRuntimeHeadersCancelled` 通知（`{ workspace, sessionId, requestId }`）。
- **错误语义**：`headersApplied: false` → `-32031` 且带既有 `errorMessage`；不允许静默降级为「已应用」。
- **时序与并发**：同一毫秒内的并发请求必须有不同 `requestId`；先到先得，晚到应答是无害幂等操作。
- **凭据约束**：夹具与日志不得出现真实凭据；`requestProviderRuntimeHeaders` 的结果只用于本次模型请求。

## B13 `plugins/operationProgress` 通知（实现阶段）

- **输入**：插件目录刷新等长操作。
- **输出**：`{ operationId, state }` 形状不变（既有 schema）。
- **时序**：通知在对应请求处理期间发出，按发生顺序；不可合并、不可跳序。

## B14 通知名与触发点对应（实现阶段）

7 个服务端通知名冻结；每个都必须有明确触发点，禁止「名字在但永不发」：

| 通知                                          | 触发点                               |
| --------------------------------------------- | ------------------------------------ |
| `startup/storageState`                        | 旧运行时启动迁移；新运行时按 D1 不发 |
| `interaction/providerRuntimeHeadersCancelled` | B12 的取消/超时                      |
| `process/mcpTelemetry`                        | MCP 进程生命周期与启动汇总           |
| `process/mcpResourceSamples`                  | MCP 资源采样                         |
| `process/toolExecResource`                    | 工具执行资源采样                     |
| `process/resourceSample`                      | 进程级资源采样                       |
| `plugins/operationProgress`                   | B13                                  |

## B15 `computer-use/operation-event` 借名通知（实现阶段）

- **输入**：计算机使用过程中的操作事件。
- **输出**：**作为 CLI→Host 通知**发出（不是客户端请求）；客户端反向发来时按 B8 回 `-32601`。
- **状态所有者**：计算机使用适配器。

## B16 生命周期与 stdout 纯净性

- **输入**：stdin EOF（或 SIGTERM）。
- **输出**：进程退出码 0；stdout 只含 JSON 协议行；stderr 含日志/就绪标记，但**不含**协议消息（stderr 的每一行都不是合法 JSON 协议消息）。
- **正向对照**：EOF 断言必须建立在「协议面真的应答过」之上（先调 `runtime/capabilities` 并断言不是 `-32601`），否则桩也能通过。
- **资源释放**：EOF 后先在途请求收口、再释放投影与 DSH host、最后退出。
- **平台差异**：Windows 上子进程句柄释放有延迟，测试夹具必须自己保证自然退出 —— 清理统一用 `app.registerCleanup(t, [home])`（收子进程与删临时目录在同一钩子内各自 try/catch，见 known-differences D7），删目录带 `maxRetries`。门禁运行器**不用** `--test-force-exit`。

---

## B17 反向请求应答行的判定与迟到应答的处置（实现阶段补齐）

编号规则同 B1、B2：B17 是族编号，子项 a/b/c 各自独立断言，发布后不重用。

### B17a 应答的 `result` 含 `method` 键时仍按应答处理

- **输入**：客户端对反向请求的应答，其 `result` 里带有字符串键 `method`（例如工具参数 `{"tool":{"method":"bash"}}`）。
- **输出**：仍被识别为应答并结算在途请求。
- **为什么必须单独测**：实现阶段首版用 `line.includes('"method"')` 判断方向，这条**合法应答**会被判成 request 塞进串行链，而链上等它的 `execute` 永远等不到结算 → `session/create` 挂到 15 s 超时。这是串行链死锁的第二种触发形态。
- **判定规则**：先 `JSON.parse`，再看**顶层**是否有 `method` 键；`"id"` 子串只作便宜的预筛。
- **状态所有者**：传输层（应答分派）。

### B17b 顶层带 `method` 的行是 request/notification，不是应答

- **输入**：顶层含 `method` 的行（有 `id` 是 request，无 `id` 是 notification）。
- **输出**：request 正常应答；notification 不发响应行、不报错。
- **正向对照**：同连接上随后的请求必须仍被正常应答，证明判定没有把请求吃掉。

### B17c 无法匹配的在途应答被安全处置

- **输入**：`id: null` 的回执，与从未发出过的 `server-<n>` id。
- **输出**：`id: null` 不是合法信封（协议 id 只接受 `string|number`）→ 回 `-32600 invalid-message`（B1 既有行为）；合法 response 但匹配不到在途请求 → 静默丢弃。
- **实测事实（两引擎一致）**：`id: null` 更早被信封校验拦下，**不会**走到「丢弃」分支；「丢弃」只对「合法 response 但无匹配」生效。
- **不变量**：两种处置之后连接都必须继续可用，且不产生额外错误行。
- **日志**：`debug`。

---

## 语义常量清单（改写时逐条对照，防丢边界）

| 常量                                                            | 值                                             | 出处                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `-32700` / `-32600` / `-32601` / `-32602` / `-32603`            | JSON-RPC 族错误码                              | `bootstrap/src/protocol/transport.ts`、`entry.ts`                       |
| `-32003` / `-32004` / `-32009` / `-32010` / `-32018` / `-32031` | 旧协议业务错误码                               | `server-operations.ts`、`server-types.ts`、`account-provider-config.ts` |
| `-32020` / `-32021` / `-32022`                                  | 反向请求：无客户端 / 取消 / 超时               | `server.ts`                                                             |
| `parse-error` / `invalid-message`                               | 无 id 失败的稳定伪 id                          | `transport.ts`、`entry.ts`                                              |
| `server-<n>`                                                    | 反向请求 id 前缀                               | `server.ts`                                                             |
| `15_000` ms                                                     | `session/requestRuntimePreferences` 超时       | `KNORVIA_SESSION_RUNTIME_PREFERENCES_REQUEST_TIMEOUT_MS`                |
| `180_000` ms                                                    | provider runtime headers 总超时                | `provider-runtime-headers.ts`                                           |
| `1_000` ms                                                      | 交互请求重发现初始间隔                         | `interaction-broker.ts`                                                 |
| `10_000` ms                                                     | 重发现间隔上限                                 | `server.ts` `MAX_CLIENT_REQUEST_REANNOUNCE_INTERVAL_MS`                 |
| 74 / 59 / 14 / 7                                                | 方法总数 / 客户端方向 / Host 方向 / 服务端通知 | 本包实测（README §二）                                                  |

# kernel-plugin-credentials 行为合同

条目编号 B1–B11，发布后不重用。每条写清输入、输出、错误语义、时序与并发、幂等、资源释放、
平台差异、状态所有者、日志级别。断言在 `tests/`，对照表见 [README.md](README.md)。

术语：**旧运行时** = 默认引擎（`KNORVIA_KERNEL_ENGINE` 缺省或非 `dsh`）；**新运行时** = `dsh`。

> **本包只在新运行时下生效**：它是 `dsh` 引擎的插件，旧运行时（默认引擎）走旧的模型适配
> （`adapters/src/model/**`），**行为不变**。因此凡「两引擎都要成立」的条目会显式说明，
> 其余条目只对新运行时断言。

---

## B1 插件模块形态：`apply(ctx)` 后 `ctx.credentials` 可用

- **输入**：DSH Loader 按组合行的 `moduleId` 解析到本包模块，调用 `apply(ctx, config?)`。
- **输出**：`ctx.credentials` 被本包的 `CredentialProvider` 实现提供；服务名 `"credentials"`
  由基类构造函数固定（`super(ctx, "credentials")`），本包不自选服务名。
- **错误语义**：`apply` 内不得抛错（除非配置非法）；抛错会让整棵 Cordis 树启动失败。
  配置非法（如 `credentialRequestTimeoutMs` 非正）→ 抛明确错误并在 stderr 记 `error`。
- **时序**：provider 必须可用时，**所有插件都已加载完成**——但保证它的是 **DSH `boot()` 的语义**，
  不是 `composition.ts` 的行位置。证据链（逐条读源码核实，2026-10-20）：
  1. `cordis-plugin-loader/lib/index.js` 的 `await()`：循环等到 `getTasks()` 归零才返回
     （「Wait until this tree has no pending import or lifecycle tasks」）；
  2. `dsh-app-boot/lib/index.js` 的 `boot()` 在返回前执行 `await ctx.get("loader")?.await()`；
  3. 行之间是**并发挂载**（`cordis-plugin-loader` 用 `Promise.all(ids.map(...))`），
     所以**行顺序本来就不决定挂载顺序**；
  4. `kernel/process.ts` 的时序是 `bootKernel()`（含上述 `loader.await()`）→ **写就绪行** →
     `runBridge()` 才开始接受命令。

  **因此「provider 晚于首次模型请求挂载」这个场景不会发生**：任何 v4 命令（含首次模型请求）
  都必然发生在所有插件挂载完成之后。

  **本包仍不承担挂载顺序责任，但理由不是「行位置保证」，而是「DSH 的 `boot()` 语义保证全部插件
  在就绪前加载完成」**——后者依赖 DSH 的公开契约（稳定），前者依赖 `composition.ts` 的实现细节（脆弱）。

  另注：`composition.ts` 的**输出顺序**（credentials 行早于 mcp-client 行）由 `kernel-dsh-builtins`
  的测试锁住；那是**确定输出顺序**的保证，与**挂载时序**是两个不同的保证，本包依赖后者。

- **幂等**：`apply` 只调用一次；重复挂载同一模块由 DSH 拒绝（服务已存在）。
- **资源释放**：`ctx` 卸载时基类负责清理；本包不额外持有定时器。
- **状态所有者**：`ctx.credentials` 服务的唯一所有者是本包的 provider 实例。
- **日志**：`info` 一条「credentials provider mounted」；`debug` 记录配置摘要（**不含任何凭据**）。
- **对应测试**：B1。

---

## B2 组合行契约对齐

- **输入**：组合行由 `createKernelCredentialProviderRow(moduleId)` 产出。
- **输出**：行 id 恒为 `KERNEL_CREDENTIAL_PROVIDER_ROW_ID`（`"knorvia-credentials"`）；
  `moduleId` 指向本包模块。
- **不变量**：本包**不**自己拼接组合行、**不**改 `composition.ts`；只在测试里断言
  「用该 `moduleId` 解析到的模块导出 `apply`」。
- **错误语义**：`moduleId` 为空 → `createKernelCredentialProviderRow` 自己抛错（既有实现）。
- **状态所有者**：组合（`kernel-dsh-builtins`）。
- **日志**：无（本包不感知挂载动作）。
- **对应测试**：B2。

---

## B3 供应商配置 → `PiAiProviderProfile` 字典

- **输入**：Knorvia 供应商配置（`KnorviaProviderEntry[]`）。
- **输出**：`Record<string, PiAiProviderProfile>`，路由 key = `providerId`。
- **规则**：
  1. `api` 取 `KnorviaProviderProtocol` 三个字面量之一（见 interface.md §3.2）；
  2. `baseURL` **原样透传**（不做尾斜杠归一——归一化会改变用户配置语义）；
  3. `apiKeyEnv` 写**引用名**（`KNORVIA_<providerId>` 规范化），**绝不**写真实 key；
  4. `staticHeaders` 存在时才写 `headers`，且写入前先自查 header 名合法
     （`new Headers([[name, value]])` 不抛）；
  5. 空输入 → 空字典（合法：没有配置就没有可选模型，不伪造默认 provider）。
- **错误语义**：`providerId` 非法（空、或不能作为路由 key）→ 跳过该条并 `warn`，不整批失败
  （一条坏配置不应让全部供应商不可用）。
- **幂等**：纯函数，相同输入相同输出。
- **状态所有者**：无状态（纯映射）。
- **日志**：`warn` 记录被跳过的条目（不含凭据）。
- **对应测试**：B3。

---

## B4 三种协议格式

- **输入**：`KnorviaProviderEntry.protocol`。
- **输出**：`PiAiProviderProfile.api` 取以下之一，**与 DSH `PROTOCOLS` 表的键逐字一致**：
  `"openai-completions"` / `"openai-responses"` / `"anthropic-messages"`。
- **不变量**：**不得**自造协议名。这三个字面量就是 `supportedProtocols()` 的返回值
  （`dsh-llm-pi-ai` 的 `PROTOCOLS` 表）。
- **错误语义**：未知 protocol → 跳过该条并 `warn`（同 B3）。
- **状态所有者**：无状态。
- **对应测试**：B4（三种格式各一条断言，并断言协议名集合等于 `supportedProtocols()`）。

---

## B5 凭据按请求获取（核心）

- **输入**：`resolve(ref)` 被调用，`ref` 形如 `KNORVIA_<providerId>`。
- **输出**：`{ value, source: "knorvia-host" }`，其中 `value` 是本次 Host 应答的 `apiKey`。
- **时序（冻结）**：
  1. 从 `ref` 解析出 `providerId`；
  2. 经 `channelForHostRequests()` 拿通道（**每次调用都取**，未挂载时 `undefined`）；
  3. 用 `knorviaProviderRuntimeHeadersRequestParamsSchema` 校验请求参数后发
     `interaction/requestProviderRuntimeHeaders`（`reason: "model-request"`）；
  4. **应答必须** `knorviaProviderRuntimeHeadersResponseSchema.parse()` 运行时校验（L5：
     不信任类型签名——这是 #124 的安全口径）；
  5. `headersApplied: true` → 返回 `requestAuth`；`false` → 抛明确错误（B6）。
- **并发**：同一 provider 的并发 `resolve()` **各自独立发请求**（遵守 D4 不缓存）；
  不合并、不共享 Promise。
- **幂等**：**不幂等**（每次都是一次真实往返）——这是基类契约要求的。
- **资源释放**：超时/取消由 `LegacyHostChannel` 负责清 pending；本包不额外持定时器。
- **状态所有者**：凭据值的唯一所有者是 **Host 的凭据服务**；本包不保存。
- **日志**：`debug` 记录「providerId + 是否成功 + 是否含 headers」，**绝不**记录 `value`。
- **对应测试**：B5（四条映射分支 + 连续两次调用观察到两次请求）。

---

## B6 拿不到凭据 → 明确失败

- **输入**：`headersApplied: false`；或通道为 `undefined`（未挂载）；或反向请求失败
  （`-32020` 无客户端 / `-32021` 取消 / `-32022` 超时）；或应答 schema 校验失败。
- **输出**：**抛出明确错误**，错误消息说明「哪个 providerId、哪种原因」，**不含任何凭据**。
- **不变量**：**不得**静默降级到「无凭据调用」；**不得**返回 `undefined` 冒充「未配置」
  （基类里 `undefined` 的语义是「没有这个引用」，不是「这次取失败」）。
- **错误码**：沿用既有 `-32020/-32021/-32022`（由通道抛出），本包**不新增错误码**。
- **日志**：`warn`（可恢复：Host 可能稍后可用）或 `error`（配置性失败）。
- **对应测试**：B6（四种失败输入各一条）。

---

## B7 不缓存明文、写入面拒绝

- **输入**：任意 `resolve` / `set` / `unset` / `modifyRecord` / `deleteRecord`。
- **输出**：
  - `resolve` 不缓存（见 D4）；进程内**不保存**凭据（不写字段、不进 Map）；
  - 四个写入方法**抛明确错误**（见 D3），`describe` 报 `writable: false`。
- **不变量**：凭据不得出现在日志、错误消息、异常堆栈、夹具、PR 文本（L8/B9）。
- **状态所有者**：凭据写入的唯一所有者是 Host。
- **对应测试**：B7。

---

## B8 工具子进程环境不因本包收紧

- **输入**：dsh 引擎下启动 bash 等工具子进程。
- **输出**：子进程环境 = **启动时用户环境快照去掉 `DSH_*`**（既不含 `*_API_KEY` 的额外清除）。
- **不变量**：本包**不得**改 `bootstrap/src/kernel/**`，也不得通过任何方式收紧工具子进程环境
  （见 D5：那是 `kernel-dsh-builtins` 已交付并经审查的行为）。
- **状态所有者**：工具子进程环境归 `kernel-dsh-builtins`。
- **对应测试**：B8（断言子进程环境无 `DSH_*`、且用户自定义变量仍在）。

---

## B9 凭据不泄漏（安全红线）

- **输入**：任意路径产生日志 / 错误 / 夹具。
- **输出**：
  - 日志字段里**不得**出现凭据值（`value` / `apiKey` / `headers` 的值）；
  - 错误消息与 `error.cause` 链**不得**含凭据；
  - 测试夹具一律用形如 `"fixture-credential-value"` 的假值；
  - 仓库内不得出现真实 key。
- **判定方式**：测试里对「本包输出的所有日志字段与错误消息」做断言式扫描；
  实现 PR 再全仓 grep 一次已知前缀格式做人工复核。
- **对应测试**：B9。

---

## B10 模型连接性测试（`provider/testModelConnectivity`）归本包

- **输入**：旧协议 `provider/testModelConnectivity`（`{ workspace, selection }`）。
- **输出**：离线部分——
  - **拿不到凭据** → 既有错误语义（`-32603` 折叠或明确错误），**不得**假装成功；
  - **有凭据** → 能构造出一次最小请求（断言请求形状与目标端点，不实际发出）。
- **不变量**：**真实往返**（发一次真请求看连通性）归 `kernel-switch` 实机冒烟；
  离线不得伪造 `{ success: true }`。
- **三种状态必须区分**（源自 interface.md §3.6 的 DSH 设计意图）：
  1. **未配置**：`readRecord()` 返回 `undefined` → 报「没有这个 provider 的凭据」；
  2. **已配置但走 ambient 认证**：`readRecord()` 返回了 record，但 `key` 与 `env` **都为空**
     —— 这是 owner 确认「该路由用自身环境认证」，**不是未配置**，不得报成没配；
  3. **已配置且有材料**：有 `key` 和/或 `env`。
     **三者混为一谈会让用户去设置页找一个不存在的配置项。**
- **状态所有者**：连接性事实属 Host/供应商；本包只做请求构造与失败归类。
- **对应测试**：B10（离线部分，三种状态各一条断言）。

---

## B11 平台差异与隔离

- **输入**：Windows / POSIX。
- **输出**：路径、临时目录、主目录一律走 Node 标准库；夹具用 `mkdtemp` 临时根。
- **不变量（用户红线，2026-10-20）**：
  - **禁止进程级清理**：只对自己 `spawn` 的句柄 `kill`，且只在 `after` 钩子里；
  - **禁止读写真实 `~/.dsh`**：`HOME` / `USERPROFILE` / `DSH_HOME` 一律指向临时根。
- **平台差异**：header 名大小写、路径分隔符、换行符；`new Headers()` 校验在两端行为一致。
- **对应测试**：B11（夹具自身的隔离断言）。

---

## 语义常量清单（改写时逐条对照，防丢边界）

| 常量                                | 值                                                               | 出处                                                                      |
| ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `KERNEL_CREDENTIAL_PROVIDER_ROW_ID` | `"knorvia-credentials"`                                          | `bootstrap/src/kernel/credential-provider.ts`（#236）                     |
| 服务名                              | `"credentials"`                                                  | `dsh-credentials` 的 `CredentialProvider` 基类构造                        |
| record scope                        | `"llm-pi-ai"`                                                    | `dsh-llm-pi-ai` 的 `RECORD_SCOPE`                                         |
| 协议字面量                          | `openai-completions` / `openai-responses` / `anthropic-messages` | `dsh-llm-pi-ai` 的 `PROTOCOLS`                                            |
| 反向请求方法                        | `interaction/requestProviderRuntimeHeaders`                      | `knorviaProtocolMethods`                                                  |
| 超时默认值                          | `180_000` ms                                                     | 旧 `provider-runtime-headers.ts` 的 `PROVIDER_RUNTIME_HEADERS_TIMEOUT_MS` |
| 引用名前缀                          | `KNORVIA_`                                                       | 本包 config 默认值（**不是**环境变量）                                    |

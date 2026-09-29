<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP 客户端生命周期

2026-09-29。整体替换客户端门面，保持两工厂、共享连接/授权任务、工具调用、诊断与关闭边界。SDK及保留的网络、OAuth、凭据、池、进程和遥测依赖继续拥有各自行为与权利。

```text
公开McpPort → 单一adapter state → connection engine → retained SDK/transport
                     │                  ├─ generation fence → 状态发布
                     │                  └─ shared OAuth owner → callback/credential端口
                     ├─ caller deadline/abort → 仅结束本次等待
                     └─ tool span → 有界响应关联 → 日志/结果投影
```

## 1. 批次和公开边界

建议一次整体替换本模块的两个工厂及门面接线。公开入口是 createMcpAdapter(options?)→McpPort 和 createMcpAdapterConnectionPool(options?)→McpConnectionPool；两工厂同步，默认参数为空对象，JavaScript length 均为 0。pool、telemetry 的已有公开再导出必须仍是原依赖的同一导出对象，不能包装成新身份。

连接、工具调用、授权恢复和关闭共享每个 server 的生命周期。它们没有可单独替换而不改变公开合同的现有子入口，不为分批从旧源码摘取 helper 或造临时状态桥。独立作者可按新职责组织私有伴随模块，每个新源不超过 400 有效行；本文不规定私有类名、字段布局、容器或 helper 分割。

McpPort 的方法依赖返回实例 receiver，不能擅自变成可无 receiver 提取的箭头函数或改变原型公开面。配置、环境、网络策略、授权端口、遥测和 context 按传入引用使用，不深拷贝或冻结。本文不扩展任意 Proxy/getter 输入矩阵，但正常引用变化、注入方法 receiver、已明确异常范围必须保留。

## 2. 状态、外部作用和 owner

- adapter 独立拥有 server 生命周期、单调递增连接代际、共享建连/授权恢复任务、连接诊断、按 tool span 关联的响应请求号。创建时先产生随机 adapter UUID，后读取构造选项；随机源错误同步传播。
- SDK Client/transport 拥有协议、网络流、spawn 和底层握手；本层传参、限时等待、关闭及状态投影。SDK 的具体重试/验证不由本批复制或新增。
- timeout 依赖拥有计时器和调用者等待的 deadline；交互 OAuth 依赖拥有 callback、锁、credential publication 和事务寿命；本层只编排并传同一生命周期 signal。普通网络 fetch、官方鉴权 fetch、进程树与遥测同样保留各自 owner。
- config 对象原引用保留，status 和 descriptor 按下文明确共享；显式关闭没有“永久关闭”标记，之后可再次 connect。
- 本层不直接读写凭据文件。运行期 provider 首次需要时缓存一个 credential store：优先 mcpOAuth.credentialStore，再调用保留工厂。交互授权按其 options 中的 store 或新工厂结果取 store，不承诺复用前述运行期缓存。

构造默认 clientName=`knorvia`、clientVersion=`0.0.0`，只有 nullish 才用默认。按顺序捕获 connectionContext、env；logger 经 options.logger?.child({先 context 展开，module:`adapters.mcp`}) 取得子 logger，receiver 为原 logger，异常直接阻断构造。随后捕获 mcpOAuth、network、officialMcpAuth、telemetry、workingDirectory。不深拷贝这些对象。

池工厂把当前 options.logger、options.telemetry 传给保留池工厂。其 createAdapter 回调每次展开当时原 options，再覆盖该次 connectionContext；workingDirectory 优先回调传入的非 nullish 值，否则当时 options.workingDirectory。回调传入的 config/serverName 不另用于构造。池的租约、owner 和 idle 规则留给池依赖。

## 3. 状态读取和形状

新 status 的 own 字段顺序为 status、transport、toolCount、updatedAt、authorization、error、failureKind、protocolEra、serverRequestId；后五个可具有值 undefined，而非统一省略。transport 来自 config.type，toolCount 默认 0，updatedAt 为新 Date().toISOString()。授权状态的字段依次 type=`oauth_authorization_code`、authorizationUrl、startedAt（生成该投影时的新 ISO 时间）。授权通知更新既有 status 时生成新 shallow 对象并刷新 updatedAt。

status() 返回新的普通名称→status 对象，但各 status 值为当前引用。listTools() 返回新的扁平数组，按 server 当前插入顺序拼接 descriptor 引用，不按 status 过滤。因此 ping/onclose 标成 disconnected 后仍可列出旧 descriptor；显式 disconnect、disabled 或失败收敛会清空该 server 的工具。外部修改返回 status/descriptor 对象可被后续读取观察，不新增 clone。

## 4. 单 server connect、disconnect 和 caller 等待

connectServer(name,config,options={}) 开始即记录时间、读取 config.timeoutMs（nullish 默认 30000）、增加该名称代际，清该名称官方失败分类及连接响应诊断，写连接开始日志，然后 await 关闭现有记录。开始日志或关闭失败可直接 reject；尚未建立新记录。

enabled 精确 false 时，关闭后写 disabled 状态、原 config、空工具，记录跳过日志并返回同一 status。不创建 AbortController、不附着外部 signal、不创建 transport；日志失败不回滚已写 disabled 状态。

其余连接为本次建连创建内部 AbortController。外部 signal 已 aborted 时立即 abort；否则 once 注册监听。调用 abort 时仅保留外部 reason instanceof Error 的值，其余传 undefined；Node 24 对 abort(undefined) 的可观察 signal.reason 为默认 AbortError DOMException。注册逻辑在创建 connecting 记录前；不先因为 aborted 而跳过后续 transport 构造。写 connecting 状态和空工具后启动共享建连任务。共享任务 finally 从当时 options.signal 移除外部监听；移除异常仍可使该 promise 拒绝。

本次 connect 的外部 signal 既驱动内部 controller，也作为 caller 的等待条件。与之区别，后来复用共享任务的 caller signal 只结束其自身等待，不得 abort 原 owner。caller 的 oauthAuthorizationTimeoutMs 是等待上限，不是底层 OAuth 事务 TTL，也不只在已经得到授权 URL 后才开始计时。

共享等待没有任务时 resolve 原 status；有任务且 timeout 未定义、signal falsy 时直接采用共享 promise。否则在共享 promise、可选 setTimeout 和可选 abort 快照之间竞争。timeout 使用原值，不 clamp；abort/timeout 返回当时该名称的当前 status（若已无记录则原 status），不抛超时、不取消共享任务。已 aborted signal 即 resolve 快照。最终清 timer 并移除本 waiter listener；不 unref timer。共享 promise 拒绝仍可以赢得竞争而 reject。等待可能看到后续代际 status，不能强制返回旧快照。

disconnectServer 未找到记录时返回 undefined，不增加代际。找到则先增加代际，await close，之后以最初该记录的 config 写 disconnected/空工具并返回。close 失败不写新状态。不存在额外并发串行锁；在 close await 期间其他 connect 的竞态不在此批改写。

## 5. 全配置收敛

connectConfiguredServers 先时间和 Object.keys(servers)，记录开始日志；再重新取 names，平行 disconnect 已有但不在新配置的名称。disconnect 并不删除名称，因此被移除项会保留 disconnected 快照。任一 reject 使整批 reject，不额外等待/取消其他在途操作。

随后 Object.entries(servers) 顺序发起并行连接。仅当已有共享任务、状态 connecting、authorization truthy 且 Node isDeepStrictEqual(oldConfig,newConfig) 为真，才复用其 caller 等待；否则调用 connectServer（即使既有 connected 配置相同也会重连）。不在本层消费 revalidate、trace 或 workspaceIdentity；这些是更外层/池的规则。

全部 settle 成功后依次 await status()、listTools()，按状态统计数量，记录完成日志并返回 own statuses、tools。日志或统计异常不回滚已完成的连接。

## 6. transport 建立和协议协商

stdio 传给保留 ProcessTreeStdioClientTransport 的字段依次 command、args（nullish 空数组）、cwd、env、stderr=`pipe`，以及符合官方条件时的逐消息 requestMetaProvider。args 不复制。cwd：config.cwd truthy 时以本次 connect workingDirectory、adapter workingDirectory、process.cwd() 的首个非 nullish 值为基础调用 Node resolve；否则直接采用前两者的非 nullish 优先，不调用 process.cwd。env 为 buildMcpStdioEnv({env,network}) 的浅展开后再展开 config.env，后者覆盖。非官方 stdio 不附加 requestMetaProvider。

HTTP/SSE 先创建普通网络 fetch。HTTP 再选择官方 fetch（若有），之后按参数求值创建 URL、OAuth provider，传 StreamableHTTPClientTransport：authProvider、fetch、requestInit；config.headers truthy 则 requestInit 为含原 headers 引用的对象，否则该字段值 undefined。SSE 使用普通 fetch 与 SSEClientTransport，不启官方 fetch；未命中 stdio/http 的分支按 SSE 处理，未新增形态校验。

创建 transport 后附着 stderr 监听，再 new SDK Client({name,version},{versionNegotiation})；若代际仍当前则把该 client/transport 发布到 connecting 生命周期，便于关闭正在建连的实例。SDK connect 调用先发生，再交 withTimeout 等待；连接完成后再调用 listTools 并单独给同样完整 timeoutMs。两段不是共用总 deadline；transport 创建/授权依赖准备不包在这两段限时内。signal 原样传 timeout 依赖，不能宣称它一定取消已经发起的底层 SDK 操作。

协议 mode：显式 protocolVersion=`2026-07-28` 先于 SSE 判定，给 pin；否则 SSE 为 legacy；显式 legacy 为 legacy；其余 auto。legacy 只传 mode。pin 的 probe timeout 为 floor(timeoutMs) 且至少 1；auto 为 floor(timeoutMs/2) 且至少 1、至多 5000。不另设置 retry；NaN/Infinity 等声明外数值按这些数值运算自然传递，不新增 clamp 政策。

listTools 成功后按 SDK 返回 tools 顺序逐个调用保留 descriptor normalizer(name,tool,config.timeoutMs,officialFlag)。officialFlag 仅检查 HTTP 且 auth.type 等于保留官方类型常量；不等同更严格的官方鉴权资格检查。随后依次读取 SDK protocol era/version，创建 connected 状态。

若此时代际已旧，关闭本次 client/transport，返回该名称当前 status（不存在则本次计算的 connected status），不发布旧工具。当前代际则先清连接诊断，发布 connected/config/tools/client/transport；成功记录不保留 connecting promise 或内部 abort controller。再读取有效 stdio PID，若有 connectionContext 则可调用 telemetry.recordProcessStarted；接着安装 onclose，最后记连接成功日志。遥测、onclose 赋值或日志失败仍落进建连 catch，可能把已发布 connected 改为失败并清理，不把它们统一吞掉。

## 7. 断连与 ping

onclose 先核代际，再核当前 client 身份；不匹配直接返回。匹配时先读取 stderr 尾部与专用 transport 的 processExit，再写 disconnected，error=`MCP server connection closed unexpectedly`、failureKind=`unexpected_disconnect`，保留当前 client/transport/tools。先 warn 连接丢失；之后仅当当前配置 stdio、有 connectionContext，且 processExit 存在或专用 transport 已不活，才 recordProcessCrashed。同步日志/遥测错误不额外 catch，可能阻断后续步骤。不会主动在 onclose 重连。

pingServer 无 client 或非 connected 返回 false。timeout 为调用 option.timeoutMs（默认 5000）与 config.timeoutMs（默认 30000）的 Math.min，不新增正数验证。捕获代际后 await client.ping({timeout})。成功返回 true，即使等待期间代际改变。异常若 instanceof SDK ProtocolError，或非 null 非 array object 的 code 为 number，则返回 true（仅证明对端回应）；其余异常旧代际返回 false，不改状态/日志。当前代际且 client 仍同一引用时写 disconnected/error=`MCP server did not answer ping`/unexpected_disconnect；然后 warn 并返回 false。日志异常会 reject，工具和 transport 不因此关闭或清空。

## 8. 工具调用等待、预算和有限重试

callTool 先以 request.serverName 找初始记录，timeout 优先 options.timeoutMs，再初始 config.timeoutMs，再 30000；创建一个保留依赖 deadline，错误文字为 `MCP tool <server>/<tool> timed out after <budget>ms`。若初始记录有 connecting，按 deadline/signal 等它；这个 caller 不取消共享任务。然后重新读当前记录，若状态 disconnected，发起一次重连并按同 deadline 等；该重连使用 connectServer(name,config) 默认选项，不传本 caller signal、workingDirectory 或 OAuth 等待上限。

之后重新取记录，无 client 或非 connected 抛 `MCP server is not connected: <name>`。这个检查在实际 tool 尝试的 catch 外。实际尝试使用剩余 deadline 和 caller signal。

第一次尝试失败先交保留 OAuth trigger 分类器；有 trigger 且该次记录非 stdio，走授权恢复。若未走恢复，仅 instanceof Error 且 message 精确 `Not connected` 才执行一次重连与重发；其他错误原样抛。该重连等待失败时 warn reconnect failed，然后抛原 tool error（warn 若抛则覆盖）。重连后未恢复 connected/client 也抛原 tool error。第二次实际调用不再被这层恢复 catch 包裹，不循环、不根据 isError 重试。预先 disconnected 重连与首次尝试后这一重连可以在同一 call 中分别发生，但所有 caller 等待受同一 deadline；SDK progress 规则另见下节。

## 9. 实际 tool 参数、结果和诊断关联

调用前收集 Object.keys(request.arguments ?? {}).sort()，debug started 后才记录开始时间并进入 try。key 读取或 started logger 抛错时尚未调用 SDK。SDK callTool 参数 own name、arguments（原对象或新空对象）；仅 trace、runtimeScope、workspaceKey、workspacePath 任一 truthy 时加 \_meta。options 字段为 signal（可 undefined）、timeout、resetTimeoutOnProgress=true，不额外包一层总耗时计时器，故 SDK progress 可延长本次请求等待。

\_meta 中 request-context 字段按次序：有 trace 对象即带 trace_id；其 spanId、parentSpanId、sessionId、turnId truthy 分别成为 span_id、parent_span_id、session_id、turn_id；再按 truthy 值传 runtime_scope、workspace_path、workspace_identity、workspace_key、remote_session_id、client_mode、delivery_kind；request.turnId truthy 且 trace.turnId falsy 时补 turn_id。queryId、parentId、attributes 不下传。顶层展开相同字段，并增加 `com.knorvia-studio/request-context` 指向该 context 对象。只有 workspaceIdentity/remoteSessionId/clientMode/deliveryKind/turnId 时，外层条件不成立，因此不发 \_meta；这是现行兼容边界。

SDK resolve 后先耗时，isError 只有 boolean 才用于日志，否则视 false；按 trace.spanId 取并删除关联 request id。outcome 记录 contentBlocks（仅 array 有长度）、hasStructuredContent（非 undefined）、isError、可选 request id。业务错误 warn，成功 debug；日志仍在 try 内，抛错会进入 tool failure catch。

返回对象 own 字段 content、structuredContent、isError、\_meta。content 为原数组引用，否则一个 `{type:text,text:空串}` 的新数组；structuredContent 原值；isError 非 boolean 则 undefined。结果 \_meta 仅保留非 null、非 array object，平常返回同一引用。仅 isError=true 且有关联 request id 时浅复制 meta 后写 `knorvia/officialMcpServerRequestId`，实际覆盖服务端同名键。不能把旧注释“不会覆盖”当合同。无其他结果清洗、过滤或 clone。

try 内任何错误（包含结果读取、日志或投影）进入失败日志：耗时、Error.message 或 String(error)，timedOut 仅按 message 中不区分大小写的文字模式（`time` 或 `timed` 后零个或多个空白再 `out`，或连续 `timeout`）或 Error.name=`AbortError`；此判定只用于日志，不驱动 retry。再消费一次 span request id；记录 timedOut，若为真额外 budgetExhausted=(duration>=timeout\*0.9)。warn 完成后 throw 原值；warn 自身抛错会替换它。

官方响应关联：无 span、rpcMethod 非 tools/call、当前状态 connecting 时，仅 truthy failureKind 保存连接诊断（可附 truthy request id），随后返回；没有 failureKind 不清旧诊断。有 span 且 request id truthy 才保存 tool 关联；同 span 后写覆盖但保留原插入位置。最多 64 个，超出淘汰最早插入；仅按 span 取，不用 server/traceId 或“最近一条”兜底。没有 span 或未命中返回 undefined。close 不统一清此关联容器；这是现有限界，不补额外清理。

## 10. OAuth provider 选择和事务编排

stdio 不创建 OAuth provider。官方资格成立时亦不创建。其余先解析 authorization_code：显式该配置原引用优先，即使 headers 有 Authorization；显式 client_credentials 排除；没有显式 OAuth 且 Object.keys(headers) 中存在任意大小写的 authorization 名称则排除（不检查值、不 trim 名称、不查继承键）；否则使用默认 authorization_code 配置。

authorization_code provider 交保留工厂，按顺序传 config、运行期缓存 store、新网络 fetch、credential prefix(serverName,url,config)、truthy logger、serverName、serverUrl。client_credentials 用 SDK provider，clientId、clientName（nullish 默认 `<adapterClientName>-<serverName>`）、clientSecret、scope；不额外传 expectedIssuer。不用本层复制 SDK/token provider 的 refresh、discovery 或安全政策。

交互授权生成 runtime options：非 stdio 对 mcpOAuth 浅展开，authorizationTimeoutMs 采用调用参数 nullish 优先原 option，并安装 onAuthorizationRequired。该回调先按代际更新当前 status.authorization 与 connecting/updatedAt，再 await 当时 mcpOAuth 的 optional onAuthorizationRequired，receiver 为 mcpOAuth；代际过旧只跳过状态更新，仍调用外部回调。此次实际交互入口不传 caller 的等待上限，因此其 runtime option 不是 caller timeout 的事务截止。

交互事务内依次取 runtime options/store、credential key；requestedScope 起初为 config.scope。trigger.requiredScope truthy 才 loadCredentialPair，并用 SDK computeScopeUnion(config.scope,pair.tokens.scope,requiredScope)。调用保留 runMcpInteractiveAuthorization，传 adapter UUID、config、store、新网络 fetch；仅 reason=insufficient_scope 加 forceReauthorization=true；key、logger、truthy授权回调/打开URL回调、truthy requestedScope、truthy resourceMetadataUrl 转 URL、serverName/serverUrl、生命周期 signal、保留 TTL 常量（当前 300000）。没有本层重写锁/store/CAS或浏览器 owner。

上述编排 try 内所有异常记录 orchestration failed warn，然后返回 failed/error原值；warn 若抛会 reject，所以不可宣称无条件 total。URL 创建、credential load、回调和依赖 reject 均在这一边界内。

## 11. 建连 OAuth 恢复与运行期 OAuth 恢复

建连 catch：本轮未授权过才分类 OAuth trigger；有 trigger、非 stdio 且可解析 authorization_code 时，先关闭旧 client/transport，再进行交互事务。authorized 或 already-authorized 用同输入与代际重新走建连，标记授权已经尝试；不会无限授权循环。pending 转错误 `MCP server <name> OAuth authorization is still in progress; complete it in the browser and reconnect`，其他 failed 用 outcome.error，按 oauth_authorization_failed 收敛；旧 client/transport 已在授权前关闭，不再交失败收尾重复清理。此 catch 内关闭/编排/失败收尾若再 reject，不被原 try 的 catch 再捕获。

运行期 tool 授权恢复对 stdio 或无 authorization_code 配置直接抛原 tool error。有配置先 warn authorization_required。若当前同名有 connecting、状态 connecting 且 config deep-equal，则复用该共享任务（不要求 authorization 已有 URL）；否则增加代际，创建 adapter-owned controller，发布 connecting，保留原工具数组和 toolCount，然后由该生命周期统一关闭以前 client/transport，发起交互事务。该新任务不绑定 tool caller signal。

authorized/already-authorized 后在同代际用 config.timeoutMs（默认 30000）重新建连，并标授权已尝试；没有传原 connect 的 workingDirectory（使用 adapter 默认）。pending/failed 按 oauth_authorization_failed 收敛。此运行期恢复编排外围另有 catch，会尝试失败收敛；若失败收敛自身的 logger/cleanup 再失败仍可 reject，不把注释 total operation 当保证。

tool caller 按自身 deadline/signal 等共享恢复。若返回非 connected 或当前记录仍无 connected/client，抛其最初 tool error；否则只再调用一次 tool，使用剩余 deadline 与 caller signal，第二次错误直接传播。caller 超时/abort 不取消共享授权，也不撤掉共享 callback listener。

## 12. 官方鉴权资格及 stdio 元数据

官方资格精确要求 transport 为 HTTP 或 stdio，auth.type=`knorvia_official`、auth.provider=`jwt_token`，且 official !== undefined；需要实际 provenance 的调用入口另检查 official truthy。SSE 不因声明外官方字段进入此分支。此资格不代替真实目的地信任校验。

stdio 每条 provider 调用重新取 config/端口，非 stdio/不具资格/official falsy 返回 undefined，不注入官方 key。捕获 official、authHeadersPort、trustedOrigins、resolveKnorviaApiOrigin 与日志基础字段；任一必需端口 falsy 则 warn unavailable，返回 `{ok:false,reason:official_auth_unavailable}`。此 stdio 失败不写连接官方错误分类，避免之后无关进程断连被误分类。

先以普通局部函数调用 resolver（不绑定 officialMcpAuth），再 await registry.isTrusted({mcpKey,origin,pluginId})，registry receiver 保留。这两步抛错时先 origin resolution failed warn，再通用 unavailable warn并返回失败；日志异常不另外吞。trust.trusted falsy 时先 not trusted warn（detail nullish 默认 unknown），再通用失败 warn，返回 reason=official_mcp_origin_untrusted。

可信后 await authHeadersPort.resolveHeaders({mcpKey,pluginId,targetOrigin，及 truthy workspaceIdentity、adapter workingDirectory→workspacePath、signal})。该 resolver 的 rejection 不在 origin catch 内，直接传播；只有 fulfilled ok=false 走 reason 返回。成功 debug 仅记录小写排序 header 名；若精确 `Bigmodel-Target-Type` header truthy，记录其维度值 identityTargetType（这是日志合同，不扩大成记录其他值）。返回原 headers 引用。provider 把 truthy payload 放进 `com.knorvia-studio/official-mcp-auth`。逐消息调用如何合并由保留 stdio transport 拥有。

## 13. 官方 HTTP fetch 接线与失败收敛

只有 HTTP、官方资格且 official truthy 才选择官方 fetch。缺 trustedOrigins 时返回一个调用即同步抛 OfficialMcpAuthError(kind=`official_auth_unavailable`,message=`official MCP trusted origin registry is not available in this runtime: <server>`) 的 fetch 函数；不是在 transport 构造时直接抛。

有 registry 时交保留 fetch 工厂：新网络 baseFetch、原 official、onAuthFailure、onServerResponse、serverName、registry、config.url，外加 truthy authHeadersPort/logger/workspaceIdentity/adapter workingDirectory。onAuthFailure 保存本名称 kind，不带代际检查；onServerResponse 先核当前代际才处理连接/工具诊断。因此旧请求对这两类诊断的影响不同，不擅自补齐 fence。HTTP resolver 匿名降级、401一次重试、响应 clone/分类、目的地信任均由已保留官方 fetch 边界负责，本批不新增复用/重试策略。

一般建连失败收敛先得到 error 文本；官方 kind 优先 instanceof OfficialMcpAuthError.kind，否则同名暂存 kind，随后删除该暂存；再取/删连接响应诊断。最终 failureKind 优先：官方 origin untrusted→official_origin_untrusted；响应诊断 kind；McpTimeoutError 且当前 fallback 非 tool_list_failed→connection_timeout；fallback；connection_failed。response request id truthy 时显示 error 追加 ` - <requestId>` 并设置 status.serverRequestId。

fallback 在 transport/SDK连接阶段分别 stdio=process_start_failed、其他=network_unreachable；SDK连接成功后改为 tool_list_failed，覆盖工具列表及其后阶段。若没有走交互授权，协议分类识别 SDK EraNegotiationFailed 或 UnsupportedProtocolVersionError（调用静态 isInstance 时保留 class receiver），沿 cause 追踪，undefined或直接自身引用终止；不匹配错误文本。多节点 cause 环没有 visited 集合，可能导致递归溢出；这是现行限制，不能在兼容替换中悄然改变。

建立失败 status 后先取 stderr/PID并关闭本次 client/transport，再检查代际。旧代际返回当前 status 或本次失败 status，不写新记录/失败日志，但此前同名称诊断的消费已发生。当前代际写 failed/config/空工具，记录失败 warn并返回。错误文本转换、stderr/PID getter、关闭或 warn 都可能 reject，原函数没有包住全部失败。

## 14. 显式关闭与进程遥测

closeRecord 找当前同名记录，没有则返回。先 abort 其 controller，reason=`MCP server <name> connection closed` 的新 Error；没有 client/transport 则返回，不 await connecting，也不删记录。否则执行实际关闭。

实际关闭先记时和有效 stdio PID，将 client.onclose 置 undefined 防止主动关闭被误报；随后 await 进程树终止。有效 PID 仅 SDK StdioClientTransport 实例且 pid 为 number、integer、>0；其它不清树。终止依赖失败记录 cleanup failed warn后继续，warn 抛错会阻断后续关闭。

之后分别 await client.close、transport.close，即使前者正常可能已关 transport，仍调用后者。每个调用异常用 debug 记录；该 debug 若抛，后续步骤不保证继续。两个调用完成后，仅有 connectionContext、专用 ProcessTreeStdioClientTransport 且 processAlive falsy，才 recordProcessClosed。最后 info server closed。这里没有额外调用 terminateWindowsJobObject，没有 SDK close 总超时，也不保证所有进程事实退出；专用 transport/进程树的细则归各自保留依赖。

adapter.close 先记时与当前数量，给当时每个名称增加代际，再平行 closeRecord；全部成功才清所有 server 记录和连接响应诊断，然后记录 adapter closed。失败不执行最终清空。官方失败暂存、span请求号、代际和运行期 credential-store 缓存没有统一清空。关闭过程中可有并发新连接，未新增全局 close fence 或 once promise。

## 15. stderr 有界处理

每次建立 transport 都尝试读取其 stderr 并 optional 注册 data 回调，不限于 instanceof stdio。每个 chunk 以 toString(`utf8`) 处理，先把原文本加入只保留最后 4000 JavaScript UTF-16 代码单元的内存尾部，再写该 chunk 的脱敏 debug（取脱敏后前 4000 代码单元）。失败/断连时读取原始尾部，无文本则 undefined，否则脱敏再取末 4000 代码单元。没有 listener detach、增量 UTF-8 decoder 或跨 chunk 专用 token 状态；日志 callback 异常可向事件分发传播。

脱敏顺序是可观察字符串合同，所有匹配不区分大小写：先掩盖 bearer 后至少一个空白之后、直到空白或单双引号的非空值，保留原 bearer/空白前缀；再掩盖词边界 authorization 后可选空白、冒号/等号、可选空白至行尾的非空值（保留前缀，若有 bearer 则统一保留 `Bearer `）；再掩盖以 ? 或 & 开始的 query 敏感键值直到 & 或空白。其后处理引号包裹的敏感 key、冒号及引号 value；key 的开闭引号按现行字符匹配不强制同类，value 必须闭合于同类引号，不跨换行，替换保留 value 双侧引号。再处理词边界敏感 key、冒号/等号和可选单个引号后非空值，值截止字符为空白、单双引号、逗号、分号、右圆括号或右花括号；保留前缀及可选起始引号。最后掩盖 URI 的 username:password@ 为 `[Redacted]@`，保留 scheme://。敏感键集合为 api/access/private 后可有下划线或短横线的 key、secret（可带 key）、token、password、passwd、pass、mysql_pass、mysql_password。替代标记精确 `[Redacted]`；不是安全解析器，不承诺覆盖所有编码、换行、分块或任意凭据形式，不顺手改正其既有匹配范围。

## 16. 日志合同和异常总则

除专门写明的 catch，logger/telemetry/授权回调异常按当时位置传播，不“尽力日志”吞掉。所有 logger 调用保留 logger receiver；SDK client/transport、registry、auth port、telemetry 调用保留对象 receiver。字串化非 Error 使用 String(error)，不按 message 决定授权/协议分类。没有新增后台轮询、统一错误包装或全局 retry。

下列字段顺序与条件为业务审计合同。`ctx` 表示先展开 connectionContext；`toolBase` 表示依次 event=`mcp.tool.call`、mcpServerName、mcpToolName、module=`adapters.mcp`、timeoutMs；`authBase` 表示依次 event=`mcp.official_auth.stdio_meta`、mcpKey、mcpServerName、module=`adapters.mcp`。括号字段只在上文条件满足时出现。

| 级别 / message                                       | context 字段顺序                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| info / MCP configured servers connection started     | event=mcp.configured_servers.connect.started, serverCount, serverNames, status=started                                                                                                                                                                                                                                   |
| info / MCP configured servers connection completed   | durationMs, event=mcp.configured_servers.connect.completed, serverCount, status=completed, statusCounts, toolCount                                                                                                                                                                                                       |
| info / MCP server connection started                 | event=mcp.server.connect.started, mcpServerName, status=started, timeoutMs, transport                                                                                                                                                                                                                                    |
| info / MCP server connection skipped                 | durationMs, event=mcp.server.connect.skipped, mcpServerName, status=completed, transport                                                                                                                                                                                                                                 |
| warn / MCP server ping failed                        | ctx, error, event=mcp.server.ping.failed, mcpServerName, status=failed, transport                                                                                                                                                                                                                                        |
| warn / Official MCP stdio auth headers unavailable   | authBase, reason, status=failed                                                                                                                                                                                                                                                                                          |
| warn / Official MCP stdio origin resolution failed   | authBase, error, errorName, pluginId                                                                                                                                                                                                                                                                                     |
| warn / Official MCP stdio origin is not trusted      | authBase, detail, pluginId, targetOrigin                                                                                                                                                                                                                                                                                 |
| debug / Official MCP stdio auth headers attached     | authBase, identityHeaderNames, (identityTargetType), status=completed                                                                                                                                                                                                                                                    |
| debug / MCP tool call started                        | toolBase, argumentKeys, status=started                                                                                                                                                                                                                                                                                   |
| warn / MCP tool returned an error                    | toolBase, contentBlocks, durationMs, hasStructuredContent, isError, (serverRequestId), status=failed                                                                                                                                                                                                                     |
| debug / MCP tool call completed                      | 同上 outcome，status=completed                                                                                                                                                                                                                                                                                           |
| warn / MCP tool call failed                          | toolBase, argumentKeys, durationMs, error, (serverRequestId), errorName, status=failed, timedOut, (budgetExhausted)                                                                                                                                                                                                      |
| warn / MCP server reconnecting after lost connection | event=mcp.server.reconnect.started, mcpServerName, status=started, transport                                                                                                                                                                                                                                             |
| warn / MCP server reconnect failed                   | error, event=mcp.server.reconnect.failed, mcpServerName, status=failed                                                                                                                                                                                                                                                   |
| warn / MCP tool call requires OAuth authorization    | event=mcp.oauth.tool_call.authorization_required, mcpServerName, oauthTriggerReason, status=started, toolName                                                                                                                                                                                                            |
| info / MCP adapter closed                            | durationMs, event=mcp.adapter.closed, serverCount, status=completed                                                                                                                                                                                                                                                      |
| warn / MCP server connection lost                    | ctx, event=mcp.server.connection_lost, mcpServerName, (mcpTransportPid), processIdentity展开, (exitCode,signal), status=failed, transport, (stderr)                                                                                                                                                                      |
| info / MCP server connected                          | ctx, connectDurationMs, durationMs, event=mcp.server.connected, listToolsDurationMs, mcpClientName, mcpClientVersion, mcpProtocolEra（nullish unknown）, mcpProtocolVersion（nullish unknown）, mcpServerName, processIdentity展开, (mcpTransportPid), mcpVersionNegotiationMode, status=completed, toolCount, transport |
| warn / MCP OAuth authorization orchestration failed  | error, errorName, event=mcp.oauth.authorization.orchestration_failed, mcpServerName, status=failed                                                                                                                                                                                                                       |
| warn / MCP server connection failed                  | ctx, connectDurationMs, durationMs, error, event=mcp.server.failed, listToolsDurationMs, mcpServerName, (officialAuthKind), (mcpTransportPid), status=failed, (stderr), transport                                                                                                                                        |
| debug / MCP stdio stderr                             | event=mcp.stdio.stderr, mcpServerName, stderr                                                                                                                                                                                                                                                                            |
| debug / MCP client close failed                      | error, event=mcp.client.close.failed, mcpServerName                                                                                                                                                                                                                                                                      |
| debug / MCP transport close failed                   | error, event=mcp.transport.close.failed, mcpServerName                                                                                                                                                                                                                                                                   |
| info / MCP server closed                             | ctx, durationMs, event=mcp.server.closed, mcpServerName, (mcpTransportPid), status=completed                                                                                                                                                                                                                             |
| warn / MCP stdio process tree cleanup failed         | ctx, error, event=mcp.stdio.process_tree_cleanup.failed, mcpServerName, mcpTransportPid, pid, status=failed                                                                                                                                                                                                              |

## 17. 本批验收边界

后续离线验收以公开工厂、McpPort、SDK/依赖替身与注入端口的可观察调用为边界，覆盖正常连接/列表/调用/关闭、disabled、全配置移除、共享 OAuth caller timeout/abort 与事务 owner 分离、旧代际完成、两个恢复入口、官方 HTTP/stdio 的不同凭据路径、工具一次重发及原错保留、progress 参数、状态/descriptor 引用、span 有界关联、stderr 字符处理、日志/回调/遥测抛错边界。不能为测试便利暴露旧私有 helper，不能把等待预算扩大或把失败改写为通过。

以上合同初稿来自静态提取；后续旧版与独立候选均通过相同81项 owned-seam 验收，主仓集成结果另见验收文档。它们不执行真实SDK网络、OAuth listener、credential store、模型、进程或native；不据此声称绝对无泄漏、整仓许可迁移完成或全流程 clean-room。

<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP交互式授权事务

2026-09-29。按批准行为与公开声明独立替换交互式授权入口及其事务内provider。保留MCP_OAUTH_AUTHORIZATION_TRANSACTION_TTL_MS=300000与async runMcpInteractiveAuthorization(input)、arity1和四种现有结果。授权锁、canonical凭据/pending/discovery存储、localhost回调、timeout与SDK仍各自拥有副作用；不新增transport、重试、缓存、浏览器启动或全事务超时。CLI尚非受控架构模块，另人工核对公开依赖及状态owner。

```text
读取entry generation → 尝试auth lease
  ├─ 无lease：只读canonical/pending → URL变化通知 → 500ms可取消等待
  └─ 有lease：锁内复查winner → 创建callback + 单个事务provider
      → 首次SDK auth → callback等待（TTL/signal） → code交换完成
      → callback close → owned pending CAS清理 → lease release
```

TTL使用nullish默认。entry读取/lease取得失败直接reject；无lease进入follower，不执行leader清理。有lease后，锁内读取具有truthy tokens且generation严格不同于entry baseline时返回already-authorized；force标记不绕过该判断。leader、leader catch与follower都使用相同winner条件，pending中的baseline不决定winner。finally依次await deletePendingIfOwned(...attemptId).catch(ignore)，再await release；同步method lookup/invocation抛错不被Promise.catch吞掉，也不增加保证释放的新finally。release拒绝可覆盖返回结果。

follower按Date.now()+TTL计算截止时间，先发following日志；每轮先查canonical，再查pending。authorizationUrl严格不同于上次投影时先更新投影，再await required hook，context的redirectUrl为空字符串。没有open hook、重获锁或pending清理。同URL去重，pending消失不重置投影，离开再回到旧URL会再次通知；空URL可被通知但最终pending结果省略falsy URL。每轮等待500ms，abort清timer并resolve，timer到期移除abort listener；到期或取消返回pending。依赖和hook失败直接reject。

leader生成24字节base64url随机state，先计算编码serverName的默认callback路径，再选择custom truthy路径并补前导斜线。调用localhost callback创建器一次；创建失败发指定warn并返回failed exact error，warn或String(error)失败仍reject。构造provider在callback-close try/finally之前，不新承诺构造失败一定关闭callback。

第一次SDK auth按顺序提供serverUrl、truthy requestedScope、truthy resourceMetadataUrl、truthy fetchFn、truthy forceReauthorization对应literal true。只有精确AUTHORIZED提前返回authorized。其他结果await withTimeout(callback.waitForCallback(),TTL,现有超时文字,signal)，仅人类callback等待有此预算。不能把整个授权或后续code交换放入Promise.race，使尚未完成的凭据发布与新leader并行。

使用native URL解析callback.url；code取query code的nullish fallback到callback.code，空query code保留；iss仅truthy转交。第二次auth使用同一个provider，参数依次serverUrl、authorizationCode、truthy iss/scope/resourceMetadataUrl/fetchFn，无force字段。任何正常返回后发completion日志并返回authorized。该try中的auth/解析/等待/交换/日志失败先重读canonical，winner成立返回already-authorized，否则warn并返回failed exact error；catch的读取、转换或warn失败reject。finally先await callback.close().catch(ignore)，之后才是外层pending清理/release；拒绝与同步throw的区别保留。

事务provider只拥有client information、PKCE、discovery与issuer的内存状态，捕获创建时config/store/hooks/logger等引用、requestedScope值及state。metadata每次返回新对象：client_name为config.clientName的nullish默认，两个grant_types、一个当前redirect_uris、response_types code；truthy clientSecret添加basic认证方式。scope每次getter按captured requestedScope ?? captured config.scope计算，条件和值分开普通读取；requested空字符串阻止config fallback。旧config对象的scope变更可见，外层替换config不会更换捕获引用；两次SDK调用仍读取各自live input.requestedScope。

static truthy clientId返回新client对象及truthy secret，否则只返回本事务DCR内存；不从旧persisted DCR初始化。saveClientInformation仅更新内存，tokens()恒为undefined。saveTokens通过provider自己的clientInformation获得值，缺失按固定诊断抛错；以truthy issuer、完整state SHA-256作publishedBy、原tokens引用执行一次canonical publication，成功后发规定脱敏日志。不会独立写client、提前删除旧值或重试。

redirectToAuthorization先构建共享context，await发布pending（attemptId、URL、truthy entry baseline、Date.now()+TTL、原state），再发required日志，依次await required/open hooks。两个hook同一context，前者修改对后者可见；hook缺席不自动打开浏览器。PKCE保存/读取只在内存，falsy时固定Missing MCP OAuth PKCE verifier诊断。issuer单独赋值/读取，不从discovery推导。saveDiscoveryState先更新内存再await存储，保存失败不回滚；discoveryState优先truthy内存，否则调用保留load且无expectedIssuer参数。

保留六种现有日志：callback_listener.failed、authorization.following/completed/failed/required、credentials.published。outer context使用live input，含own adapterInstanceId（可undefined）、prefix/name、可选state摘要、PID；provider context使用captured prefix/name、attempt前12、state摘要前16及PID。成功publication日志含clientId摘要（falsy时own undefined）、grantKind、hasRefreshToken、generation前12、status及expires；required含callback端口。logger保持receiver、不await；不记录原token/state/clientId。AUTHORIZED/winner/pending快捷路径不补completion日志。精确消息/字段顺序在批准合同附录与行为测试中核验。

先独立写公开行为测试，再比较冻结旧源、候选、主仓和实际CLI可达产物。重点覆盖leader/follower、静态client与fresh DCR、scope/force、generation竞态、共享hook context、PKCE/discovery、取消/TTL及close→pending→release异常顺序；显式门闩证明code交换和publication未settle时lease仍保留。端口mock与自有loopback回调集成分开计证，不使用真实OAuth服务、浏览器、用户数据或收费模型。首次准备/行为失败分别保留，不以静态通过证明兼容。

根读取过旧497行正文，作者按批准行为/声明先设计后实现且保留此前上下文，不称全过程clean-room。native/SDK/保留模块权利不计为本批原创；头注、协议字段、改名、测试通过本身不能证明来源。根Apache与preview身份保持，整仓MIT及最终稳定发行仍需全量验收。

源码审阅及旧/候选运行对照补充：leader的两个普通function提示hook以SDK-facing provider为this，follower仍以live input为this；不暴露/断言旧私有class布局。独立31项之外另加这一项，具体初次失败与修订另记验收。

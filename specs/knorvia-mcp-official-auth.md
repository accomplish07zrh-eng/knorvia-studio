<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP认证请求边界

2026-09-29。目标为独立替换official-auth.ts，保留目的地信任、逐请求身份头、请求/响应关联、有限诊断与单次401重发。合同准备者和根完整读过旧563行及公开声明，根完整复核合同和三份有限声明，并核对保留helper签名及公开错误类型。作者只获批准行为与有限声明，不能把目录隔离称为全流程clean-room。此规格不是运行结果。

```text
调用者 → 捕获origin比较 → registry信任 → init元数据摘要
       → 每次解析凭据 → 合并Headers → baseFetch(manual redirect)
       → 响应关联/有界诊断 → 日志 → 最多一次401重发
       → 原Response返回，或丢弃body后通知并抛鉴权错误
```

wrapper只拥有创建时的expected origin和每次调用的摘要/attempt，不存token、不并发合并、不读环境或用户文件。registry拥有信任事实，authHeadersPort拥有凭据，baseFetch拥有传输/取消，adapter回调拥有关联状态。保留shared三helper及其权利；findOfficialMcpReservedHeaders须直接同身份重导出，另外两个helper继续承担保留头判定和身份摘要。运行公开面是OfficialMcpAuthError、createOfficialMcpAuthFetch和上述find函数；初始范围文档将factory误写的笔误用单独附加输入勘误，不新增别名。

Error继承原生Error，保留message/kind/name、正常字段顺序及constructor arity，不冻结kind或加cause。factory仅立即计算expected origin，随后返回不依赖this的async函数。registry/port/logger方法保留各自receiver，baseFetch和两个callback保留input receiver；void通知不await。除创建origin外input依赖按调用时live读取，不把依赖提早快照。

origin由无base的原生URL解析，拒绝解析失败及username/password；不在此自行加HTTPS或host政策。resource为string、同realm URL.toString或Request.url。提取异常原样reject；实际/预期origin不相同在trust/凭据/传输前按固定origin_untrusted失败。通过后每次wrapper调用仅一次registry.isTrusted，拒绝和registry异常边界分开；重发不重查信任。错误消息先计算、再optional onAuthFailure、再构造Error，callback原异常可覆盖。可变URL/input不冻结，因此不宣称该初查约束任意await中修改。

摘要仅来自init.body/headers/signal，不能自动补读resource Request对应字段。RPC只解析string JSON object，保留number/string id及truthy方法、工具名、扁平trace_id/span_id，不记录完整arguments/body；array/null/非法JSON无摘要。body字节仅string的UTF-8或Uint8Array.byteLength。基础日志一次构造并由两attempt共用，路径不含query/hash，字段及条件保留批准合同顺序。

逐attempt读取live authHeadersPort；存在时Date.now→await resolveHeaders→Date.now，传入官方标识、origin及truthy的原workspace/signal。缺port或ok:false匿名继续并warn；resolver rejection及此阶段clock/logger异常直接reject，不转换为匿名或鉴权失败。采用成功headers原引用；始终调用保留identity summary，即使logger缺席。不缓存或主动刷新token。

Headers只取init，生成新的原生Headers。动态头own keys以小写名称先排除同名incoming；其余incoming由保留reserved helper判定，MCP session/protocol例外保留；然后依次set动态头。最后无条件依序删除x-request-id和x-trace-id，包括动态来源。保持原生Headers大小写/值语义与异常，不复制保留名单。发送前debug/时钟在send try外；try内调用原resource及浅拷贝init，仅覆盖headers、redirect=manual，不clone/replay body。

每次响应先trim x-request-id；init摘要精确tools/call完全跳过诊断/clone，即使429/5xx。其他请求执行有限分类。有关联ID或failureKind时，optional onServerResponse在响应日志之前调用，并保留精确条件字段；callback抛错进入send catch并阻断重试。outcome即使无logger也构造；authApplied在处理/日志之后按当时headers own key数量判断，不等同于Authorization有效或实际发送认证。try内任何错误进入固定did-not-complete日志后重抛；catch时钟/日志错误仍可覆盖，不增通用保护。

诊断顺序：429为rate_limited、>=500为server_internal_error，均不读body；非JSON按ok取undefined/connection_failed；JSON诊断最多65536字节。数值content-length用Number且finite，不额外限定正数整数，声明超限直接跳过clone。clone/body/getReader/decoder建立在reader try外；读取逐块计byteLength，超限await cancel，finally releaseLock。恰好上限仍等done，decoder分块与最终flush保留；读/cancel/decoder/release异常不进入JSON解析fallback，而进入send catch。

JSON根对象code3001/1000优先分别not_found/unavailable；否则jsonrpc2.0且error存在，object error code1006/3101分别not_authenticated/coding_plan_required，其余protocol_error。其他内容/解析错误按ok回退；不解析result.isError，不匹配字符串数字。字节限额不是时间限额，原生clone tee取消可能等待原分支，既有风险仅记录，本次不添加timeout或提前取消原body。

首轮401且authApplied才先retry日志→await吞错的body.cancel→send2；新attempt重新解析live凭据，但沿用原resource/init/body，不重信任、不回放流、不退避，不主动判断signal。缺body直接继续；cancel未settle没有新增时限。最终401/403/3xx按原kind/message失败，只有tools/call从当前最终header再读request id附到消息；先构造消息、再丢弃body、再通知/抛错。其他4xx/5xx在诊断后仍返回原Response。这些终态分支在send try外，不额外记录did-not-complete。

保留全部现有精确日志、字段/覆盖顺序和optional参数求值：logBase、identity、outcome总计算，而logger缺席时参数专用值不提前计算；onServerResponse payload只在通知条件及callback均存在时构造。aborted仅same-realm Error且name为AbortError/TimeoutError；没有主动abort或新增隐私政策。错误对象和receiver是合同的一部分，但验收不穷举声明外Proxy/getter。

先行测试由独立作者在读取候选之前编写，根先跑旧源，再审候选及实际CLI可达dist。使用owned registry/resolver/shared helper/logger/callback/fetch/时钟以及有界native标准对象或自有流，禁止真实服务、凭据或付费推理；测试门闩watchdog不改变产品预算。保留helper、传输、信任实现不算本批自研。独立性由具体表达、设计、读取记录和验证共同复核，不能凭改名/头注/测试通过确定。根Apache、适用第三方声明和preview保持，整仓MIT与最终发布尚未完成。

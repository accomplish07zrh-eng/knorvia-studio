<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP OAuth错误与发现缓存边界

2026-09-29。按批准的公开行为独立实现oauth-errors与oauth-shared，不替换保留的MCP SDK、凭据存储或key/record helper，不改变登录、token刷新、交互授权、网络发现、UI及数据格式。

## 所有权与顺序

错误模块只创建普通Error和投影原因链；遍历集合仅属于当前调用。发现缓存模块只投影JSON/时间戳并调用一次批量存储，耐久性和串行写入仍由既有SharedKnorviaCredentialStore负责。

```text
错误输入 → 当前调用的原因遍历 → 首个匹配分类/临时失败停止
save → key helper → 原始JSON/时间戳 → 单次await saveMany → undefined
load → 取now/ttl → 单次await loadMany快照 → TTL/JSON/issuer → 原始解析记录或miss
```

## 错误边界

- 两工厂保持普通Error、确切消息、code、reason以及truthy可选scope/metadata字段和插入顺序；cause仅在undefined时没有own属性，其余包括null保留身份。注册symbol仍为knorvia.mcp.oauth.interactiveAuthorizationRequired/temporaryRefreshFailure，值true、可配置、不可枚举、不可写，不额外导出私有常量。
- classify每节点顺序为临时品牌停止、交互品牌、真实SDK InsufficientScopeError、SDK UnauthorizedError、非null对象的SDK ClientHttpAuthentication code，然后普通cause。数组可走对象code，函数不可，但函数可有品牌/cause；品牌普通或继承lookup必须严格true。保留getter异常，不用消息/HTTP数值/相似名称判断授权。
- 每次返回新trigger，品牌字段保留原值且不额外验证/字符串化；仅SDK metadata URL按原规则String转换。每工厂及分类入口arity1，原因联合七值与公开类型保持。
- 两对象循环和长链原先栈溢出。改为迭代与本调用object/function身份追踪，在重复身份第二次属性读取前结束，未先匹配则返回undefined；这明确改变重访时才变成品牌的有状态getter边界，不声称完全保留该缺陷。无任意深度上限和跨调用状态。primitive仍普通读取cause，不因值重复提前截断；直接cause===current结束。

## 发现缓存

- save为async/arity3，默认now=Date.now；通过原key helper使用discovery_state、discovery_state_fetched_at，按此顺序一次saveMany。裸JSON.stringify结果（包括toJSON产生的undefined own值）与String(now)原样交接，不包装、不删key、不新增验证。序列化发生在存储前，await写入且成功返回undefined，失败保持原因身份。
- load为async/arity2，now和ttl用nullish默认值（Date.now与86400000），在await一次有序loadMany前取得。falsy raw state为miss，时间戳用Number且要求有限，age>=ttl为miss；包含相等、未来时间戳、近epoch null/空串及调用方原生number语义均保持。没有新读取、删除、写入、锁或发现请求。
- 仅JSON.parse失败被catch；store/转换/getter异常不吞掉。外层沿用isRecord，authorizationServerUrl必须string；无expectedIssuer时允许空string并保留opaque额外字段。
- truthy expectedIssuer才比较，selected issuer为metadata?.issuer ?? authorizationServerUrl。nullish回退，空串不回退；原始空串拒绝后，两字符串只去掉一个末尾斜杠，无trim/URL规范化。raw '/'与'/'匹配，''与'/'、'//'与'/'不匹配。
- 仅修补选中的issuer非string时导致TypeError：需要比较时返回miss，不强制转换；没有expectedIssuer时仍返回原opaque记录。返回解析记录本身，不过滤/包裹/克隆。

## 先行验收与范围

根先做19组自有观察及5项有限澄清；未访问真实凭据、认证端点或模型。一个错误SDK CJS入口的准备件保留但从未用于观察，随后使用实际import/ESM入口。独立设计审阅只读批准合同并将四项歧义收束；作者仅批准行为/声明与SDK声明，保留自身先前上下文，不作全流程clean-room声明。

72项先行测试在未读候选前写出并对旧冻结正文运行：68通过、4预期失败（多对象循环、重访getter、长链、非字符串issuer）；其余格式、错误身份/优先级、primitive cause、store单次调用/顺序、TTL和单斜杠边界通过。作者静态候选72/72，无运行反馈修改。主仓旧/新、真实CLI可达dist与全量回归另行验收，不把静态作者报告当成这些验证。

保留SDK及凭据依赖的权利；固定键/消息、标准Error/JSON表达、MIT头与测试通过不能单独证明独立来源。根Apache和preview身份在全量目标完成前保持。

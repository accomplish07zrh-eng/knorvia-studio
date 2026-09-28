<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 权限策略的有序判定表

2026-09-28。接续审批就绪批次，独立替换 PermissionService 的模式判定和能力默认值解析。已访问旧实现；不作无接触声明，接口、工具名、规则号、理由文案与既有政策顺序是兼容要求，不声称为发明。本次不调整授权范围，也不把项目规则匹配、规则持久化或公共类型的继承实现改称 MIT。

## 设计和所有权

Service 保持公共 checkPermission / requiresApproval / getRiskLevel / grantSessionPermission 入口，只拥有本实例的临时会话规则和调用者提供的配置引用。策略到达会话授权分支时通过读取端口取得当前规则；自定义项目规则回调若同步调用 grantSessionPermission，后续分支必须立即看见新授权，不能在判定入口保留已过期的 ruleset 引用。配置及其 Set 后续更新继续可见；新实例的会话规则为空，不增加持久存储或第二份授权表。项目规则仍由现有 store 提供，单次调用只读。

能力解析使用模块级默认能力索引与显式字段优先级。策略以不可变的有序规则程序表达：先检查计划模式转换，再选择交互、强制确认或普通工具路线；路线只执行到第一个命中规则。规则包含条件、结果类别、稳定规则号和解释，统一投影公共结果。惰性遍历避免对已短路请求调用后续规则策略或检查输入；不预计算所有条件，不另设已接受决定缓存。

```text
临时会话规则 ← grantSessionPermission（仍走现有更新合并端口）
       ↓
调用输入 + 能力声明 + 配置 + 项目规则 → 有序规则程序
       → 首个命中 → 同一 PermissionDecisionResult → 既有执行/审批主流程
```

这是同步、无 IO 的 CLI 内部领域边界，属于现有 unmanaged cli 模块。原 Host / broker / registry 继续拥有事件、答复和持久化；Desktop continuous 与 Web replay 不新增消息或改变事件顺序。本次不改界面、用户数据、设备端口和模型请求。

## 能力合同

- 名称默认只读集合保留 Read、Glob、Grep、WebSearch、WebFetch、TodoRead、TodoWrite、AskUserQuestion、Agent、Task、Skill。其余名称默认非只读；仅 Bash 默认 destructive。名称区分大小写，Object 原型同名键不能获得能力。
- getRiskLevel 只读顶层 capability.riskLevel；缺省时上述只读名称为 low，其余为 medium，Bash 仍为 medium。checkPermission 的结果风险优先 permission.riskLevel，其次顶层风险/名称默认；不从 context.riskLevel 重新授权。
- permission 中的 alwaysAsk、sideEffectScope、riskLevel、needsApproval 优先于顶层；false 和空串这类显式值按现有 nullish / truthy 规则处理。readOnly、destructive、allowedInPlanMode、requiresUserInteraction 和 capability group 仍按现有声明解析；不凭名称伪造可信能力组。
- 缺省 sideEffectScope 为只读名称的 none / 其他名称的 workspace；只改 readOnly 不同步改变范围或 needsApproval。requiresUserInteraction 缺省只由显式范围 userInteraction 推导。permission.askOptions.allowAlways 严格为 false 时禁止会话免确认。
- 返回字段保留 decision、allowed、escalated、mode、reason、riskLevel、ruleId、sideEffectScope；alwaysAsk 仅为 true 时附入，不用规则号猜测该标记。

## 必须保留的优先级

1. EnterPlanMode 总是按现有规则直接允许；未启用计划时 ExitPlanMode 直接拒绝。planEnabled 用显式布尔优先于 mode === plan；prePlanMode 只保持接口，不参与本层重新解释。
2. requiresUserInteraction 先检查 disallowedTools，其他情况下 ask，优先于 auto、项目规则、alwaysAsk、会话规则和任何允许分支。
3. alwaysAsk 路线依次为 auto 拒绝、disallowedTools 拒绝、项目 deny、可用会话 allow、属于本会话且非用户停止的 AmendWorkflow、最后 ask。项目 ask / allow、全局 allowlist、yolo 和计划只读都不能绕开它。AmendWorkflow 的归属事实来自先前 resolveInput，不接受本层推测或新建缓存。
4. 普通路线依次为非计划 yolo 允许、auto 拒绝、disallowedTools、项目 deny、项目 ask。进入此路线时捕获本次 planEnabled，规则端口随后修改原 context 不得偷换此次计划模式事实；下次调用读取新的事实。保留普通 yolo 早于禁用表的既有产品政策；这不适用于 alwaysAsk 或需要用户交互的工具，不借迁移暗改政策。
5. 计划模式只允许非破坏性只读、非破坏性 mcp，或显式 allowedInPlanMode 且 session 范围、非破坏性、不 needsApproval 的控制工具，其余拒绝。按此顺序返回规则号；不再读取项目 allow 或普通免确认规则。
6. 非计划依次为项目 allow、预批准 WebFetch、项目 workflow-drafts 中的 Write/Edit、allowedTools，然后 edit 模式下的 edit/workspace 工具，其余进入 build 判定。草稿、WebFetch 不能越过项目 deny / ask。
7. build 判定：无破坏/无需批准的只读直接允许；然后 critical ask、未设置 autoApproveHighRisk 的 high ask；然后低风险 session 更新允许；有 needsApproval、destructive 或非 none 范围则 ask；最后允许。autoApproveHighRisk 不单独豁免副作用，allowMediumRiskInAutoMode 仍不启用保留的 auto 模式。

以上包括当前的有意特例和已有兼容边界；不能用更宽的默认 allow 缩减审批功能。requiresApproval 仅返回最终类别是否 ask，deny 不是需要审批；getRiskLevel 的顶层语义不扩大为完整权限声明解析。

## 验收与迁移范围

先在现有实现执行新的契约用例：能力字段优先级和未声明名称、每个结果字段、五种模式与 planEnabled、交互与强制确认的硬拒绝、仅本次许可、临时规则隔离、工作流归属、项目 deny/ask/allow 顺序、自定义规则端口的惰性调用与原异常/receiver、计划控制能力、WebFetch/草稿及 build/edit 风险组合。使用真实规则匹配与纯内存配置，不接触网络、实际磁盘写入、模型、设备或用户数据库。

替换后复跑原用例、CUA/Invocation/权限主流程，另以固定 24a3302 的有限离线基线对照公共结果/异常及策略回调轨迹；不是对任意 getter、Proxy、原型替换或并发篡改的形式证明。旧实现仅用于行为取证和仓库外验收，不进入产品构建，也不作为 fallback。新版必须在真正编译的公开 core 入口通过验收。

根/CLI 类型、lint、架构、格式、CLI 构建、完整离线回归、逐文件来源摘要和暂存密钥扫描实际执行；两平台 CI 另记录真实结果。本批只对经独立实现复核的指定文件授予 MIT；全量迁移、根许可调整及稳定安装/便携/官网发行仍未完成。

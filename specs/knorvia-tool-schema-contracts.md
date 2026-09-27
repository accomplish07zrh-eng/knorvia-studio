<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 工具 schema 转换与 REPL 参数契约

2026-09-28。属于独立实现迁移的 contracts 边界，保留当前公开导出及实际调用约束。已阅读原实现，不宣称无源码接触的 clean-room；兼容字段、第三方 API 和标准 schema 词汇不属于独创性证明。

## 所有者与依赖

`contracts/src/tools/json-schema.ts` 负责从运行时 Zod schema 产生模型侧 JSON Schema，以及原地规范化外部 schema。继续使用第三方 `zod-to-json-schema`，保留其依赖和许可；本轮独立实现的是 Knorvia 的规范化策略，不把转换库改称自研。

`contracts/src/tools/node-repl.ts` 是 JS 工具输入、结果和推导类型的唯一声明。同一份可组合 Zod 对象同时派生历史调用校验和新调用 schema，模型端经统一转换入口导出，不复制第二份手写 JSON Schema。既有 core 工具和 MCP 宿主均通过 contracts 公开入口使用。

```text
REPL 字段约束 → 历史调用校验（title 可缺）→ 新调用校验（title 必填）
                                             ↓
第三方 Zod 转换 → Knorvia schema 图遍历 → 模型协议
REPL 输出约束 ──────────┘
```

本模块无进程、网络、文件、队列或权限副作用，不持有会话状态，也不决定 core 持久会话与 MCP 单次隔离执行的生命周期。

## 兼容约束

- 转换依然使用 input effect、无 `$ref`、JSON Schema 7 转换目标，最终仅根节点添加 `https://json-schema.org/draft/2020-12/schema` 标识。沿用当前提供商子集，不能把它描述成完整的 2020-12 解析器。
- 规范化返回原对象，保留共享子节点身份；只遍历 `properties` 的值、`items`、`additionalProperties`、`oneOf`、`anyOf`、`allOf`，包括这些位置的数组。删除所访问 schema 节点的 `$schema/$id/$ref/$defs/definitions`；不把 properties 中同名业务字段删掉，不进入 default/examples/const 等数据或其他扩展关键字。
- `anyOf` 是数组且 `oneOf` 未定义时迁移到 `oneOf`；已经有 `oneOf` 时两者都保留。此项是已有提供商适配约束，不声称两个关键字一般等价。
- 已明确声明的 type 不覆盖。缺省时优先按 properties/required 判 object，再按 items/minItems/maxItems 判 array，再按同质 enum（或 const）判标量，再按字符串长度/数值上下限判 string/number。整数与非整数混合数值推为 number；空或异质 enum 不推断，且不回退到其他提示。布尔、null 与数字分别识别。
- object 且没有 properties 对象、additionalProperties 为 schema 对象、propertyNames 未定义时，补字符串键约束；object 没有 properties 对象且 additionalProperties 未定义时补空 properties。array 没有 items 时补空 items；联合 type 数组同样遵守。保留显式 false/null 等值，不扩大遍历范围。
- 新实现用显式待访问集合和按身份去重，不递归消费 JS 调用栈。深层、重复引用和循环的内存 schema 不造成栈溢出；循环对象仍不是可序列化 JSON，不承诺转换为合法模型载荷，也不复制或抹掉循环。
- 保留 properties 字段插入顺序及后续子关键字的深度优先访问顺序；共用同一对象作为 schema 与属性映射时，不能因反向栈顺序提前删除其另一角色仍需要的字段。稀疏 enum 继续跳过数组空位（非空但全为空位时沿用 string 推断），显式 undefined 仍阻止标量推断；这只是内存 API 兼容，不承诺稀疏数组可原样通过 JSON 传输。
- Zod 转换异常保持原有抛出语义，不返回空成功结果。规范化输入仍为可变的普通 schema 对象，不新增冻结对象或恶意 getter 执行保障。

## REPL 数据协议

- code 是必填字符串，空串合法。timeout_ms 可缺；存在时须为正整数且不超过 120000，无强制转换。字段说明提醒超过默认 30000ms 的任务显式预算，估时加 15000ms，超过上限则拆分。
- 新调用 title 为 1–120 字符字符串；历史 runtime 调用允许缺失。保持不 trim、空白标题仍合法，不利用本轮迁移收紧历史输入。说明要求用用户语言描述动作，不写实现术语。
- title 可缺只描述 runtime parser、直接 handler 与 MCP 的兼容路径；core 的新工具调用还会经过必填 title 的模型 schema 校验，不宣称所有入口都允许省略。
- 输入两个对象均严格拒绝未知字段，尤其不能把 Bash 的 command 当 code。保持 Zod 对象 API、推导类型及公开导出名。
- 输出 logs 为必填字符串；result 可缺但存在时为字符串；error 包含 name/message 及可选 stack，并保留原有嵌套未知字段剥离行为。
- 嵌套 error 的剥离指 Zod parse 返回值；部分执行入口只检查 safeParse 的成功标志，仍持有原对象，本轮不扩大对整体工具输出的承诺。规范化函数也不接入外部 MCP descriptor，那里对引用的处理仍由其原适配器负责。
- images 是可选数组，每项严格包含字符串 base64/mimeType；browserScreenshotPaths 是可选字符串数组；responseMeta 为任意值的字符串键记录。输出顶层拒绝未知字段；图片编码、路径来源和可信元数据仍由执行层检查，本 schema 不凭内容授予 authority。

## 验收

先对旧实现运行 API 契约测试，记录既有通过行为及深层/循环问题，再用同样测试验收替换实现。覆盖遍历边界、关键字迁移、type 推断优先级、别名身份、显式空值、深层与循环、Zod effect/input 和公开 REPL 的接受/拒绝及解析结果。

contracts 的新测试接入现有 `pnpm test:studio`，不依赖模型或外网。核对构建后的所有公开工具 schema（REPL 新编写说明可变，结构与约束不可变），执行根/CLI 类型、lint、变更严格 lint、架构、构建与完整离线回归。只对本批实现和测试逐文件记录来源，不扩大到其余 contracts、内核、UI 或整个应用许可。

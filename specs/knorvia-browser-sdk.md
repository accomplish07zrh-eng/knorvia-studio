# Knorvia 浏览器 SDK 独立实现

## 范围和边界

浏览器 SDK 将现有 `agent.browsers` / Browser / Tab / Playwright API 转为 BrowserControlPort 命令。独立替换按照公开类型、调用方契约和替换前的黑盒测试进行；辅助审计提供行为说明，不复制旧实现正文。此前已接触部分源码，不宣称未接触源码的 clean-room 过程。

后端连接、代际校验、用户授权、工作区隔离、截图可信来源仍由宿主端口负责。SDK 不创建新权限、不连接其他浏览器、不以另一后端掩盖显式选择失败。界面和浏览器能力不能因来源迁移被删减。

每次替换按文件记录当前摘要和许可范围。本文覆盖的契约不代表所有 SDK 文件已经独立替换；来源清单决定已完成范围。

## 第一边界：纯选择和结果解包

`selection.ts` 与 `result.ts` 没有持久状态、文件访问或网络调用。输入由调用方提供；返回选择必须保留原对象身份，不能修改输入数组或描述符。传输命令和 BrowserCommandResult 类型暂沿用既有公共契约。

### 后端与标签页选择

- 默认顺序为内置浏览器、首选扩展、其他扩展、CDP；同级保持发现顺序。首选扩展由字符串元数据 `preferred=true`、`preferredInstance=true`、`profileIsLastUsed=true` 或 `profileOrdering=0` 指示。没有后端时默认选择返回 undefined。
- 按 URL 选择后端时，空列表抛出 `No browser backend is available`；单后端直接返回。多后端先解析目标，非法目标抛出 `Invalid browser target URL: <value>`。
- `file:`、localhost 及其子域、127.0.0.1 和 IPv6 回环目标优先使用已有内置浏览器；未发现内置浏览器时继续一般选择，不创建连接。127.0.0.2 不属于这个特殊优先规则。
- 一般 URL 匹配依次为忽略 fragment 后完整地址相等、同 origin 与 pathname、同 hostname、父子域。父域必须包含点、不是 IP，并在点边界匹配。无匹配按默认顺序选择；匹配相同时也用默认顺序裁决。
- 标签页复用只接受前三种匹配，不复用仅有父子域关系的页面。相同匹配优先 active，再取列表靠后的标签页；没有合适页面返回 undefined。无 URL 或 URL 无法解析的候选被跳过，目标 URL 错误不能静默忽略。
- 现有行为保留：query 在第二级不影响匹配；协议和端口不同仍可在同 hostname 级匹配；不同 pathname 不自动去除末尾斜杠。opaque URL 的空 hostname 也参与同 hostname 比较，本次不改变这个兼容行为。

实现采用不可变的候选排序键及统一 URL 特征比较；后端选择和标签页复用分别限定允许的匹配范围。浏览器发现与真正激活标签页不属于这两个纯函数。

### 结果与失败

- `expectOk` 成功时返回传入结果原对象；失败抛 BrowserCommandError，保留 command/result 引用以及后端 code/message。缺省 code 为 browser_command_failed；缺省 message 为 Browser command failed: 加 code。显式空字符串不当作缺省值。
- `expectPayload` 先处理失败结果；成功结果只有 undefined 算缺失，null、false、0、空字符串均保留。缺失产生 execution_error 和 Browser result missing 加字段名，错误携带新的失败结果，并保留原结果的 elapsedMs 和其他字段，不修改原对象。
- 显式构造 BrowserCommandError 支持调用方的 fallbackCode；错误名称和 Error 继承关系兼容。
- base64 解码保持 Node Buffer 的输入兼容性（含换行、无 padding、URL-safe 变体），但公开返回普通 Uint8Array。此层不新增网络图片抓取或截图可信来源声明。

## 第二边界：API 声明与能力可见性

API 声明只是公共接口数据，不授予宿主权限。内置声明保留 17 类对象和 121 个成员的可见性；未带文档目录也能使用完整既有基础 API。方法名、参数契约、后端限制和命令映射按现有公共接口重建，说明文字和组织方式独立编写。

能力策略由单个 BrowserApiPolicy 实例拥有。它索引已知成员，并持有当前后端类型、浏览器/标签页能力集合及宿主提供的显式覆盖值；更新描述符后已创建的代理立即使用新策略。未知成员默认支持，是否展示由代理的 hideUnknown 决定；未知成员不被 override 人为变为已声明成员。

- 已知成员先满足自身后端/能力要求，再满足至少一个 overload 声明；空 declarations 与未提供相同。宿主显式 boolean override 最后裁决，包含强制开与强制关。
- browser: / tab: 分别限定能力所在层；无这两个前缀的字符串按完整 id 在任一层匹配。所有 requiresCapabilities 项必须满足。documented 只控制文档，不控制实际可见性。
- 不支持的成员在读取、in、可枚举键和自有属性描述符中统一隐藏。Symbol 不受字符串 API 名称过滤。hideUnknown 同时隐藏未声明字符串成员，并把方法绑定到原目标，避免私有字段和内部方法调用受代理过滤影响。普通模式保留现有未声明兼容方法。
- 代理不是对象沙箱或权限防线；宿主仍须逐次授权。普通可配置对象是支持范围，不把代理声明成能违反 ECMAScript 非可配置属性不变量的机制。
- 显式 api.json 可完整替代默认声明；不存在、不可读、非法 JSON 或结构错误时回退到内置声明。读取只限调用方给定目录，不联网。每次回退返回独立数据，防止一次调用修改共享声明而影响其他会话。

加载器、声明目录和策略引擎分开。加载器验证输入形状；目录负责基础公共接口；策略仅做可见性决定。生成文档和传输执行均不挤入策略对象。

## 验收

先让选择和结果测试在旧实现通过，再替换并重跑相同测试。测试覆盖引用身份、排序稳定性、本地地址、fragment/query、父子域边界、无效候选、active/最近裁决、缺失字段和错误结构。再执行根类型、lint、变更架构、CLI 类型及构建、完整离线回归，并核实产物不依赖被替换正文。上层 facade / Playwright / 能力门与文档分阶段保留独立验收。

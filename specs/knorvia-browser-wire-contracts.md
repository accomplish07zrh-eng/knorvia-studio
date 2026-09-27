# 浏览器共享协议独立实现

替换 `packages/shared/src/browser-use/` 的协议实现，以及 CLI contracts 中的浏览器结构镜像。保持全部公开 schema、类型、常量和子路径出口；不修改浏览器 manager/executor、UI、数据格式、授权流程或网络协议。Zod 仍是独立第三方依赖，不能把它计为 Knorvia 自研。

## 结构设计

新的协议模块由字段规则、命令目录、Playwright 动作目录、录制动作目录、身份、观察结果与本地 broker 信封组成。一个目录键对应一个判别值；公共构造器从键和字段结构产生严格对象及判别联合，避免每个分支重复创建判别字段。公共命令枚举保留既有顺序，字段目录的 key 集在编译期和测试中与枚举一致。

CLI BrowserControlPort 继续声明会话调用的 trace/signal 边界，但浏览器载荷类型从共享协议派生，不再手写第二份协议结构；只复用类型与公共常量，不把 Zod v4 schema 交给 CLI 中仍使用 Zod v3 的业务校验器。依赖方向为 CLI contracts → shared（已有依赖），shared 不引用 CLI contracts。兼容出口只导出同名公开项，不保留旧正文 fallback。

共享包新增 `@knorvia/shared/browser-use` 窄入口，指向同一浏览器协议公共目录；既有根入口和 node-repl-browser-broker 子路径保留。CLI 不通过内部源码路径导入，也无需加载其他共享业务协议来读取浏览器常量。

纯尺寸常量另从 `@knorvia/shared/browser-use/viewport-limits` 公开子路径导出，不引入 Zod 或任何 schema 初始化。CLI 的运行时常量引用使用此入口，类型引用仍指向协议入口；验证构建后的浏览器 SDK 不因该引用包含共享协议校验器。

CLI bundle 对该公开子路径设置显式 alias，防止既有根别名把后缀接到 index.ts 文件名后。以真实构建和产物中的源内容核对该入口，不改为运行时下载或保留旧类型镜像。

MCP 宿主与浏览器插件的构建缓存必须包含仓库外层 shared 的源码与包出口配置；CLI 构建也包含 shared/package.json。浏览器插件将实际 browser-client.mjs 声明为输出并排除在输入之外。通过构建计划确认源码确实进入输入摘要，避免只改协议时复用旧校验器或 SDK 常量；实际编译及产物检查仍是验收依据。

```text
公共字段约束 + 目录键/字段 → 严格对象 / 判别联合 → 协议 parser
                                             → TypeScript 类型 → CLI 端口
输入 → schema → 规范化结构 → 已有宿主授权/执行
```

模块没有业务状态、I/O、队列或缓存。命令 schema 只验证形状，不能替代宿主的 workspace、session、owner/lease、generation、权限与真实路径 containment 检查。

## 兼容条件

- 保留 3 类 backend（iab/extension/cdp）、live/cached、desktop-continuous/web-remote-replayable，以及全部命令、Playwright 与录制动作。判别联合各分支、嵌套对象和元数据继续拒绝未知键；任意 evaluate value/arg 仍按原契约保留。
- 身份字段按既有区别处理：discovery 的名称/路径/身份会 trim 且不能为空；commandContext 的非空字符串不新增 trim。backend generation 缺省为 0，执行 generation 必须显式提供非负整数。capabilities 必须存在，但其 browser/tab 数组可选。
- 实际 viewport 为正整数，不受自由尺寸上限限制；输入 viewport 的范围为宽 320–3840、高 320–2160。Agent 默认 1280×720；人类显示偏好保持 normal、393×852、fit，缩放档位和顺序保持不变。
- 坐标保留有限 number 语义。普通命令 tabId 允许省略或空字符串；activate/claim/标记命令要求非空 tabId。ref、key、selector 的非空约束、可选性、是否 trim 保持原行为，不通过本次迁移新增点击目标互斥或动作前置条件。
- 普通 Playwright timeout 是可选正整数，固定 waitForTimeout 接受 0；load/url/event 支持的状态不变。select option 至少有 value/label/index 一个字段，允许空字符串 value，index 必须非负整数；保留当前诊断文本。
- 录制 DSL 有 10 类动作；duration/delay 为 0–90000 的整数；selector trim 后长度 1–2000，type 文本上限 100000，drag 路径 2–200 点，wheel 次数 1–100，waitFor timeout 为 1–30000。options 保留 fps 1–60、jpegQuality 1–100、maxDuration 1000–90000、最多 500 个动作和原有可选性。录制输出路径仍 trim、长度 1–2000、相对路径、不得含独立点/父段、后缀不区分大小写为 .webm；结构校验不负责解析实际工作区路径。
- Snapshot 必須在输出中把 dom/domTruncated 放在 elements 之前，保证截断的模型观察先包含页面语义。ref、rect、framePath、attributes、可见性和所有可选字段不删减；rect 大小不新增正数约束。
- Tab 摘要必须带实际 viewport；PageState、Dialog、RecordingJob、Artifact、ResponseMeta 以及 elapsedMs/error/sideEffect 的字段、枚举和边界不变。CommandResult 仍以 ok:boolean 表达状态，不新增 ok/error 关联约束。
- 本地 broker request 保留 UUID、token 最短 32、main/subagent、session/turn/trace 和 list/execute 信封；仍不接收客户端 workspace 身份。response 的 true/false 分支、可选 browsers/result 及非空 error 不变。
- Zod 对象/联合继续支持现有消费者需要的 shape/extend/options/parse/safeParse，不用不可组合的自定义 parser 替换公开 schema。已有默认/规范化输出、结构化错误路径与语义须进行新旧对照。

## 验收

先在旧版运行覆盖所有命令和动作的最小合法载荷、缺字段、未知字段、数值/数组边界、规范化、默认值、输出字段顺序及嵌套对象测试。旧 schema 仅在仓库外按固定提交打包作只读比较，不进入新产品或生成新实现。进一步按 JSON schema 生成输入扰动并对比接受/拒绝、规范化值和诊断；不能以生成器遗漏的约束证明完全等价。

CLI 与共享类型做双向可赋值检查；真实现有调用方通过根/CLI 类型检查。执行相关单元测试、全部离线回归、lint、变更架构、格式、CLI 构建及实际 SDK/MCP/broker 产物检查。UI、真实浏览器联网及模型推理不在本次变更范围；记录未执行的实际平台行为。已接触旧公开协议正文，不宣称无源码接触的 clean-room；独立设计、行为证据和逐文件许可决定分别记录，根许可证不提前调整。

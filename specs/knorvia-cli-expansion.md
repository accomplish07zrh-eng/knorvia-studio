# 本机 CLI Agent 扩展与能力共享

更新：2026-09-23。延续 `specs/knorvia-backend.md` 的 Host 所有权、隔离工作目录、单聊切核新建会话和原 GUI 规则。

## 产品规则

Agent 的身份图标由 UI 的单一映射表负责，同一内核在选择器、管理页和时间线使用同一标识。预置内核优先采用产品自己的官方发布资源（官网、官方文档或官方源码）；若产品没有独立标识，可明确采用所属厂商标识。不得再用凭印象绘制的图形冒充官方标志，也不得把母公司的通用图标误作已有专属图标的 CLI。Qoder 国际版与 CN 版使用两站共同发布的同一 Qoder 标志，以文字区分产品。外部自定义 ACP 的未知品牌继续使用中性的缩写图标。下载的第三方资源保留来源清单，保持原文件内容，深色与浅色主题保证可辨识。此项仅影响展示，不改变内核 ID、安装检测、运行配置或历史会话。

Studio 启动及用户刷新时检测本机已安装的可接入 CLI Agent。预置候选包括现有 Codex、Claude Code、Grok Build，以及官方提供 ACP stdio 的 OpenCode、Qoder CLI、Qoder CN CLI、Gemini CLI、Goose、Kimi CLI、GitHub Copilot CLI、Hermes Agent、Qwen Code、Mistral Vibe、DeepSeek Harness。Qoder 国际版与 CN 版使用不同的命令和独立身份。候选列表集中在服务端注册表，界面按服务返回的状态显示，不为每个新 Agent 复制一套聊天页。用户还可在 Studio 数据目录登记自定义 ACP Agent：标识为 `acp:<slug>`，指定绝对可执行路径和参数；登记文件不授予未知程序自动运行权限。仅发现可执行文件不代表可用：受控版本探测与 ACP 握手确认后才显示可接入。

新接入的 CLI 默认复用各自现有认证与本机配置，Studio 不写它们的全局认证、模型或插件目录。Studio 继续管理原有受管 CLI 的安装更新卸载；其余外部 CLI 仅接入现有安装，界面说明如何回到其自身安装渠道。新会话由所选 CLI 原生创建；旧会话只在它明确支持且回显同一 ID 时恢复。中断结果不明时沿用现有派发屏障和显式重试。

每个内核的模型与思考档位从其原生目录、ACP 会话选项或明确支持的配置接口读取。单聊沿用同一选择控件，选择后须核对原生回显；原生未暴露的档位不可猜测、不可通过提示词伪造，也不可静默回退。权限以原生能力为上限；无法保证只读时禁用只读，停止以原生取消确认结果表示，未知仍保留为未知。

Knorvia 中用户启用的 skill、插件所提供的可移植资源和 MCP 在所有接入内核中提供同一个可见目录。使用 skill 时，Studio 将当前版本的说明注入对应任务；插件中可转换为 skill 或标准 MCP 的内容经同一目录投影。MCP 通过各内核受支持的会话参数或进程级临时配置传递；不修改外部 CLI 全局配置。用户已确认插件的 Knorvia 专属 hooks、私有命令和专有 Agent 行为不跨核执行；界面不能将这类行为宣传为共享。遇到不能安全解析身份或凭据的插件 MCP，要明确标记该服务器不可跨核，不能仅凭提示词宣称支持。每次任务取有界快照，运行中的任务不被设置修改悄悄换资源。凭据和服务端配置不写入聊天正文、日志或跨内核私有记忆。

## 状态与事件顺序

补充：Google Antigravity CLI 是非 ACP 的原生流协议候选。本机 `agy` 1.2.2 自动发现后，可走单聊、群聊和工作流的同一内核路由；通过 stdin 传输入、显式 conversation ID 恢复、`agy models` 查询目录。headless 不提供交互式工具审批或每会话 MCP 注入，因此 Studio 如实标示限制，不改写原 CLI 全局或项目 MCP 配置。首次实机模型请求待用户在原 CLI 登录后再验收；发现、协议夹具和界面不依赖登录。

`StudioKernelRegistry` 唯一拥有候选、探测、ACP 适配与能力结果；`StudioRuntimeService` 唯一拥有运行和持久配置。自定义 ID 的配置索引与配置在同一 SQLite 事务写入；没有配置的候选采用受限询问模式默认值。原有 Skills、Plugins、MCP 服务拥有启用状态，Kernel Adapter 只接收本轮不可变快照。UI 读取 `inspectKernels()` 和 `kernelOptions()`，仅保留未提交的选择草稿。

```text
候选/自定义登记 → 解析绝对路径 → 版本探测 → ACP initialize → 可用性/能力投影
用户提交 → Host 冻结内核配置和共享资源快照 → 派发/会话选择 → 原生执行
        → 回显模型/档位及事件 → SQLite 时间线；停止/未知按原契约恢复
```

自定义 ID 使用受限 slug，不能覆盖内置 ID 或原有记录标识。刷新探测不更改已接受任务；迟到探测结果不得覆盖较新的配置。桌面走连续事件，手机走可重放快照与缺口修复，均读取同一 Host 运行事实。

## 验收

- Agent 管理页、单聊内核选择器和群聊时间线的标识一致；官方有专属图标的 Qoder、Antigravity、Qwen Code、Gemini CLI、Grok、Claude、Goose、Hermes、Mistral Vibe、GitHub Copilot 不再出现手绘示意图或错误的厂商通用图。亮暗主题、小尺寸与未安装状态均可识别；Knorvia 自有应用图标保持不变。

- 没安装时显示缺失，不启动推理；已有安装可发现，握手失败显示原因且不可发送。
- 十一种新增官方 ACP 候选均有确定命令与离线协议夹具；本机已有的 Hermes、Qoder CN CLI 与 DeepSeek Harness 应能通过各自真实安装入口自动发现，自定义 ACP ID 能通过单聊、群聊和工作流验证，未知或恶意 ID 被拒绝。
- 内核切换新建独立会话；模型与档位只显示原生支持项，错回显阻止发送。长任务取消、权限和恢复状态不伪装成功。
- Studio skill 在外部单聊、群聊成员和工作流 Agent 步骤可按显式调用使用；MCP 原生会话可访问且不写外部全局配置。未能通用执行的插件部分明确告知。
- 原有四内核、已保存会话/群聊/工作流与用户数据迁移正常。自动测试、类型、lint、架构及便携生产包与 GUI 复验完成。

## 协议依据

ACP 的 [会话与 MCP 服务器参数](https://agentclientprotocol.com/protocol/v1/session-setup) 用于统一生命周期。预置命令分别依据 [OpenCode ACP](https://opencode.ai/v2/docs/cli/acp/)、[Qoder CLI ACP](https://docs.qoder.com/cli/acp)、[Qoder CN ACP](https://docs.qoder.cn/en/cli/acp)、[Gemini CLI ACP](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/acp-mode.md)、[Goose ACP](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/acp-clients.md)、[Kimi CLI 命令](https://github.com/MoonshotAI/kimi-cli/blob/main/docs/en/reference/kimi-command.md)、[GitHub Copilot CLI ACP](https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server)、[Hermes CLI](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md)、[Qwen Code ACP](https://github.com/QwenLM/qwen-code/blob/main/docs/users/configuration/settings.md)、[Mistral Vibe ACP](https://github.com/mistralai/mistral-vibe/blob/main/docs/acp-setup.md) 与 [DeepSeek Harness ACP](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/acp/acp/README.md)。命令和能力应以实际安装版本握手为准。

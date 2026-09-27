<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 工具结果卡片的有界投影

2026-09-28。独立替换 core 的 result-display、display-text 和 bash-result-display 入口，保留全部现有卡片字段、路由、截断、图像和应用身份行为。已访问旧源码，不作无接触声明。固定字段、提示文案和协议取值是兼容要求；改名和拆文件本身不是独立实现的依据。

## 设计与所有者

工具执行器依旧拥有执行与结果状态，投影器只同步读取某一次 output，不持有缓存、事件、会话或用户状态。实现用明确的终止路由、候选路由和通用后备路由；各类结果由独立策略处理，文本配额复用本项目新的码点扫描器，图片按各自协议计量。构造输出后继续交给既有实时事件、持久化和回放通道，不改 UI renderer、导航、尺寸、主题、玻璃或模型文本。

```text
一次工具结果 → 终止路由（Bash / CUA）
            → 候选路由（REPL / 启动工作流 / 观察工作流）
            → 显式 MCP → 命名任务结果 → 文件差异后备
                         ↓
                  原有 display payload → Desktop continuous / Web replay
```

工作流投影器、diff 生成与计数、公共 Zod schema、MCP 错误解析器和 CUA authority 仍是独立边界，继续原调用路径和许可范围。本批没有文件、网络、模型或设备调用；图片只处理已返回的数据，不读取 artifact URI 或截图文件。

## 路由和普通结果

- Bash 必须最先终止，校验失败或无需单独卡片时返回 undefined，不落到 MCP/文件差异。CUA 名称 trim、小写、横线转下划线后，只要包含 computer_use 且最后一个双下划线后有 action 就采用 CUA 卡；名称匹配只选择样式，不授予来源或操作权限。
- 仅 js 和 mcp**node_repl**js 尝试 REPL 图片；其后依次尝试原工作流启动、观察投影。候选未产出才继续。options.mcp 存在时终止为 MCP 卡，即使名称为空或输出还含文件差异。SendMessage/TaskStop/TaskOutput/RespondToCoordinator 各自匹配时校验失败直接返回 undefined。其他工具才尝试文件差异。
- MCP server/tool 名 trim 后按 256 UTF-16 单元限制，description 按 4096；截点最后是高代理项时移除，包括本就以孤立高代理项结尾的文本。空名称无卡，空 description 省略。unavailable 只在 metadata.official 为真值、isError 严格 true 时，从 content 中第一条被 shared 解析器认可的 text 错误取 code；普通正文、第三方或无效 JSON 不推断配额状态。
- SendMessage 严格 schema 校验后保留 status，error/message 存在时分别 4096 UTF-8 字节限长，空字符串保持存在；其他结果字段不输出。
- TaskStop 严格校验后保留 task_id/type，command 与 message 各 16 KiB。只有 message 完全等于标准停止文案（含原 command）时去掉重复命令括号，其他文案原样。任何一项截断才加 truncated=true，缺省不写 false。
- TaskOutput 保留 retrieval_status；task.status trim 后按 64 UTF-16 单元裁剪，task.output 只 trimEnd，非全空白才保留前 2000 单元。超过该限额才加 truncated=true，保留前导空白和原有按 UTF-16 截断行为。RespondToCoordinator 只保留 status。
- 通用 display 文本在超预算时保留 `\n...[truncated]` 完整后缀，正文按码点取 UTF-8 前缀；即使预算小于后缀，后缀也不能被切成半条。未超限时原字符串直接返回，包括孤立代理项；不将这个 helper 改成强制 Unicode 清洗。

## Bash 卡片

使用原 BashOutputSchema。backgrounded、isImage 或非空 structuredContent 无独立文本卡；其他结果只有 stdout/stderr 截断标志或有效 outputPath 才产出。路径优先 persistedOutputPath ?? rawOutputPath，空 persisted 值阻挡 raw 回退。正文只拼接非空 stdout/stderr，以单个换行分隔。

显示上限 150,000 UTF-8 字节；仅超限才按原 UTF-8 编码再解码语义保留完整字符前缀，包括孤立代理项替换和初始 BOM 消耗，不加截断后缀。truncated 是流截断标志或显示超限，outputPath 为真值时才输出。新实现用定长缓冲 encodeInto，避免为大正文先分配完整编码副本；不改变编码/解码结果。

## CUA 卡片

- 非对象 output 视为空结果；只从 content 的 text 块按原顺序用换行合并。structuredContent 有值时 JSON 编码，循环/BigInt 等抛错编码回退字面 null；编码自身返回 undefined 的非 JSON 值保留原失败语义，不改成成功卡片。正文与结构化文本独立限制 32 KiB。
- status 只看 isError 严格 true。structuredContent.error 的字符串 code/suggested_action 沿原字段输出，不擅自增加与原协议不同的限制或反向解析正文。
- 图片仅接受 content 中 type=image 且 mimeType/data 为字符串的记录。按 Base64 解码字节计量：单图最多 256 KiB，总共 512 KiB，最多 4 张；前置 text 不占图片槽。超单图/总字节者标记截断并继续尝试下一张，已有 4 张后遇到下一张有效图片则标记截断并终止扫描。artifactUri 和未知块不加载，保留现有 Base64/MIME 校验边界。
- targetApp 只有 options.officialCua 严格 true 才交给原 schema；permissionStatus 还要求 action=request_access。普通结果的伪造 metadata 不提升为官方来源。当前 permission 合同返回不支持，使用隔离模拟合同验证消费分支，不能当作实机能力。
- 输出字段顺序及缺省项保持 kind、schemaVersion、toolName、status、structuredContent、text、errorCode、suggestedAction、targetApp、permissionStatus、media、truncated。

## REPL 图片与文件差异

- REPL 候选先遍历 output.images，再遍历 output.content；合法记录只要求 image MIME 和字符串 base64 ?? data，不额外要求 type=image。空 base64 阻挡 data 回退；data: 前缀按第一个逗号之后提取，无逗号维持原字符串。按编码文本 UTF-8 字节计量，每张不超过 200 KiB，最多 2 张；空/过大/超数量的合格候选标截断，其他无效候选跳过，不去重。
- 仅从宿主约定的 knorvia/nodeReplCuaApp 键解析 app 身份，不从 producer 关联键或普通正文回退。纯动作可无图片、仅携带 app；图片和 app 都没有时不产出 REPL 卡，即使曾丢弃图片。保留公开图片上限导出供轮尾截图使用。
- 文件差异仅要求 output 是非数组对象、filePath 字符串、structuredPatch 数组；hunk 数字字段采用原 typeof number 检查，lines 数组每项为 string，不能偷偷升级为公共持久化 schema 校验。先按完整合法 hunks 计 additions/deletions，再保留最多 8 个 hunk、160 行；计数不能只算显示片段。保留 hunk 额外字段的浅复制、原位置与原行数；不修改输入，输出 lines 是新数组。
- 第 160 行之后仍有 hunk、任何 hunk 被裁剪或合法 hunk 超过 8 个时 truncated=true；恰好用完且没有后继时保持 false。空 hunk 在尚有行预算时可保留，普通上下文和换行标记不算增加或删除行。
- hunk 浅复制读取附加字段后，只有显示 lines 比当前输入 lines 更短才判裁剪；附加 getter 缩短输入不能丢弃后续 hunk。稀疏 lines 保留既有计数器的抛错路径，不伪装为有效差异。

## 验收和许可

先在旧实现建立固定期望：路由终止/后备、各字段省略规则、Unicode 与 BOM、图片数量/字节边界、来源 metadata 拒绝、文件差异的总计与显示上限。测试结果送入现有公共 display schema，确认受支持正常载荷可供既有 UI/历史读取；不以更严 schema 反向改动生产构造器的兼容行为。

替换后执行相关契约、有限新旧差分、根/CLI 类型和 lint、变更严格 lint、架构、格式、来源清单、CLI 构建产物和完整离线回归。已明确不改变交互和像素布局；不虚构人工目视、设备或联网模型验收。逐文件记录独立实现依据及摘要，未迁移模块和第三方继续保留原许可，根许可和预览发行不提前改为全量独立版本。

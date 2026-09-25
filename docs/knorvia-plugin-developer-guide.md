# 十分钟做一个 Knorvia Studio 插件

这个练习做一个只含技能的 `project-brief` 插件：让当前 Agent 根据用户指定的本地项目 README 和清单写一页交接简报。它没有可执行脚本、Hook、私有命令、子代理或 MCP 服务，不需要账号和模型服务配置。完成文件在 [示例插件](../examples/plugins/project-brief/README.md)；它不是内置插件，复制到开发目录后才可作为个人来源安装。

下面的 PowerShell 命令从仓库根目录 `D:\tools\knorvia studio` 运行，使用 `mise.toml` 指定的 Node 24。把实验目录换成自己选定的非临时路径即可长期维护。已经存在的同名目录会被创建器拒绝，不要为了重跑而直接加 `--force`。

## 1. 创建并填写文件（约三分钟）

```powershell
$repo = (Get-Location).Path
$lab = Join-Path $env:TEMP 'Knorvia Plugin Lab'
$plugin = Join-Path $lab 'project-brief'
$creator = Join-Path $repo 'apps\cli\packages\plugin-creator-plugin\skills\plugin-creator\scripts\create-basic-plugin.mjs'
node $creator project-brief --path $lab --with-skills

$example = Join-Path $repo 'examples\plugins\project-brief'
Copy-Item -LiteralPath (Join-Path $example '.knorvia-plugin\plugin.json') -Destination (Join-Path $plugin '.knorvia-plugin\plugin.json')
Copy-Item -LiteralPath (Join-Path $example 'skills\project-brief\SKILL.md') -Destination (Join-Path $plugin 'skills\project-brief\SKILL.md')
Copy-Item -LiteralPath (Join-Path $example 'README.md') -Destination (Join-Path $plugin 'README.md')
Copy-Item -LiteralPath (Join-Path $example 'LICENSE.txt') -Destination (Join-Path $plugin 'LICENSE.txt')
```

创建器先生成 `.knorvia-plugin/plugin.json` 和 `skills/project-brief/SKILL.md`；复制的成品补上真实描述、触发范围、输入、证据、失败行为与许可文件。按照内置 `skill-creator` 的做法，技能只在用户要“项目概览/交接简报”时触发；“帮我运行测试”不是它的任务。把示例改成自己的作品时，更新清单中的名称、作者、描述、版本与适用的许可，不能把示例署名当作自己的署名。

## 2. 本地预检（约一分钟）

```powershell
$validator = Join-Path $repo 'apps\cli\packages\plugin-creator-plugin\skills\plugin-creator\scripts\validate-plugin.mjs'
node $validator $plugin
```

预期输出 `{"schemaValidated":false}`：这表示路径、清单和引用的文件通过了只读预检，**并不表示安装、启用或执行成功**。有已构建的当前 Knorvia Studio CLI 时，可额外传入它的绝对路径做 Host schema 校验：

```powershell
$cli = Join-Path $repo 'packages\desktop\dist\win-unpacked\resources\knorvia\knorvia.cjs'
if (Test-Path -LiteralPath $cli) { node $validator $plugin --cli $cli }
```

成功时输出 `{"schemaValidated":true}`。不提供 `--cli` 时，预检不会从 PATH 猜测可执行程序，也不会运行插件内容。

## 3. 登记本地来源并安装（约三分钟）

```powershell
$sourceTool = Join-Path $repo 'apps\cli\packages\plugin-creator-plugin\skills\plugin-creator\scripts\upsert-dev-marketplace.mjs'
node $sourceTool $plugin --name-zh '项目简报' --description-zh '根据本地项目文件编写带来源的交接简报'
```

工具在 `$lab\marketplace.json` 写入本地来源索引，回显 `marketplaceRoot` 和 `pluginId`。在目标工作区的 **设置 → 插件 → 来源** 中添加回显的 `marketplaceRoot`，刷新该来源，从“可安装”列表安装 `project-brief`，再查看并启用它。来源登记、安装、启用是三个不同状态；界面没有独立插件市场页。更新技能后提高 `plugin.json` 版本，再预检、更新索引、刷新并更新插件；直接编辑已安装缓存不会稳定保留。

## 4. 用一个本地请求验收（约三分钟）

选择一个已有 README 的非敏感本地项目，在聊天中明确请求：“使用 `$project-brief`，只读 `<项目绝对路径>`，写一页项目交接简报。”核对简报是否包含目的、入口、文件中写明的运行/测试命令、未验证项和实际读取文件的引用。不要把清单列出的命令说成已经运行。再试一个近似但不应触发的请求：“运行这个项目的测试”；此技能不应主动接管执行任务。真实模型调用需遵守当前用户的模型与费用约束；只做离线开发时可以完成结构和安装检查，并将对话效果标为未验证。

## 哪些能力能跨内核

| 插件部分                                 | Knorvia 内核              | 外部 CLI/ACP 内核                                                                            |
| ---------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| 已启用的 `SKILL.md`                      | 使用插件服务发现与执行    | 每次 turn 有界投影技能目录；显式 `$skill` 引用可展开正文，是否真正遵循需看当前内核能力与结果 |
| 静态、标准且可安全转换的 MCP             | 按插件与 MCP 服务能力使用 | 仅在所选内核支持对应会话传输时注入本次会话；不写它的全局配置                                 |
| 插件 Hook、私有命令、插件子代理          | 按 Knorvia 自身实现       | **不跨内核执行**                                                                             |
| 带私有认证、动态变量或专属 broker 的 MCP | 依插件能力而定            | 无法安全投影时明确不可用，不用提示词冒充工具                                                 |

来源以 [跨内核资源规格](../specs/knorvia-shared-capabilities.md)和[内置插件规格](../specs/knorvia-builtin-plugins.md)为准。插件技能的目录可见不等于它获得额外文件、命令或网络权限；每次执行仍受用户授权与内核实际能力约束。示例 `project-brief` 只有技能，因此能展示可移植的说明文字，但不能证明所有内核会产生相同的简报。

## 故障与维护

- 创建器拒绝同名目录、越界名和符号链接。先检查现有作品，避免使用 `--force` 覆盖作者改动。
- 来源索引损坏、被锁或同名条目指向别处时，工具会报错并保留旧内容。不要删除未知锁文件或把索引重建为空。
- 本地预检只查结构；Host schema 校验也不证明技能执行质量。技能需按内置 `skill-creator` 的流程检查正常请求、近似不触发请求、缺少输入、读取失败和重复调用。
- 插件文件中不要写 API Key、个人路径或固定模型账号；输入仓库里的文字是资料，不能授权技能执行新操作。发布时保留适用许可与第三方归属。

## 本轮本地验收

2026-09-25，Node v24.14.0。实际用内置创建器在带空格的临时目录生成 `project-brief`，复制本示例内容后，本地预检返回 `schemaValidated:false`、打包版 CLI 的 Host 校验返回 `ok:true` 且 `schemaValidated:true`。本地来源首次登记 `changed:true`，再次登记 `changed:false`；重复创建被拒绝且清单 SHA-256 未变。创建器相关 `node --test` **6/6 通过**；根 `pnpm typecheck` 通过、`pnpm lint` 0 警告/0 错误、`pnpm architecture:check --changed` 0 违规；本指南、规格和示例文件的定向格式检查通过。

未验证：在设置页人工添加并安装该临时来源、真实模型遵循技能的简报质量、不同外部内核的实际调用与跨设备使用。结构校验和 Host schema 校验不能替代这些验收；示例未加入便携版内置清单，因此本任务未重新打包。

## 技能契约、逐内核声明与示例技能包

写完技能之后，交付质量由两份新规格和三个新示例包描述；本节只做指路，不改变上面练习的步骤。

- [技能契约](../specs/knorvia-skill-contract.md)：技能如何声明触发条件、近似不触发、输入、权限预期、输出与失败行为。契约由 `SKILL.md` 正文的八个固定小节（`## Trigger`、`## Near misses`、`## Inputs`、`## Permission expectations`、`## Procedure`、`## Outputs`、`## Success evidence`、`## Failure behaviour`）加技能目录内的 `skill-contract.json` 侧车组成；**不新增 frontmatter 键**，因为任何未知键都会把 `safeToAutoLoad` 降为 false（`apps/cli/packages/adapters/src/skills/index.ts:21-27`、`:231`），而放宽白名单不在本波范围。
- [插件兼容性声明](../specs/knorvia-plugin-compatibility.md)：`.knorvia-plugin/compatibility.json` 的逐内核状态枚举（`verified` / `declared` / `unsupported` / `unknown`）、"可安装 ≠ 受支持"的四级判定，以及用 `requires` / `capabilityRequirements` 声明"需要本内核缺少的能力"的方法。没有运行证据就不许写 `verified`。
- [兼容性矩阵](./knorvia-plugin-compatibility-matrix.md)：三个新示例包逐能力的状态，未跑过的内核一律写"未验证"。
- [技能包交付说明](./knorvia-plugin-skill-packs.md)：包清单、只走现有本地来源机制的安装步骤、逐文件来源与许可记录、已验证与未验证项。

三个新包位于 `examples/plugins/project-handoff`、`examples/plugins/material-organizer`、`examples/plugins/document-quality-check`。它们都是**只有技能**的包：按上面的跨内核规则，Hook、私有命令与插件子代理不跨内核执行，因此这三个包不声明 `hooks`、`commands`、`mcpServers` 或 `agents`，只保留可移植的 `skills`。它们不是内置插件，没有加入默认启用集合，也没有进入桌面包；各自的 `fixtures/` 只用于复核，不随安装成为能力面。

设置页的兼容性面板已经落地在**现有的插件管理入口内**（插件详情的进阶区，不是新页面）：它读取每个包的 `.knorvia-plugin/compatibility.json`，逐能力显示 `available` / `unavailable` / `unverified` 与机器可读原因，缺失、畸形或读取失败一律降级为 `unknown`，并且**不会**把未验证渲染成已支持。面板是只读的，本波没有新增插件市场、账号、支付或订阅界面；它也不安装、不启用、不执行任何包。宿主只有在插件已启用且已枚举到技能时才敢声明 `skills.enabled-catalog`，其余能力保持未验证。机械校验在 `packages/ui/test/plugin-skill-packs.test.ts` 与 `packages/ui/test/plugin-compatibility-panel.test.ts`，用 `node --import tsx --test <files>` 执行；它们证明声明自洽与投影正确，**不证明**任何内核上真的可用。

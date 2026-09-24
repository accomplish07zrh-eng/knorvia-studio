# Knorvia Studio 内置插件

本规格记录当前八个内置插件的功能、身份、打包链路和验收边界。2026-09-24 用户要求独立重写替代；四个文档类插件已切换为新编写的 0.2.0 资产，其余四个继续逐项处理。

## 范围与边界

- 内置插件（Builtin Plugin）指随桌面包分发的插件，市场 id 为 `knorvia-plugins-bundled`；身份与生命周期沿用 `CONTEXT.md`。
- 插件以资产包形式放在 `apps/cli/packages/<name>-plugin`：只包含运行与商店呈现需要的文件（`.knorvia-plugin/plugin.json`、`skills/`、`agents/`、`commands/`、`docs/`、`scripts/`、`dist/`、`hooks/`、`.mcp.json`），不保留 producer 的 TypeScript 源码与 `node_modules`。
- 内容插件不声明 `package.json`：pnpm workspace 只收录有构建步骤的包，资产目录不进入 workspace，也就不影响 `pnpm-lock.yaml`。
- 用户确认内置插件的所有用户可见署名统一为 `Knorvia Studio`：manifest、商店 listing、技能 frontmatter、脚本默认作者和新生成文件的作者元数据保持一致。此产品署名调整不替代发布授权记录，来源路径仍在本规格中保留。

## 插件清单

| 插件 id | 目录（`apps/cli/packages/`） | 版本 | 类型 | 默认启用 |
| --- | --- | --- | --- | --- |
| `browser-use` | `browser-use-plugin` | 0.6.0 | skill + client runtime | 是 |
| `node-repl-host` | `node-repl-host` | 0.7.0 | MCP runtime 宿主（无 listing、商店不露出） | 是 |
| `documents` | `documents-plugin` | 0.2.0 | skill + agent + inspector | 是 |
| `pdf` | `pdf-plugin` | 0.2.0 | skill + agent + inspector | 是 |
| `presentations` | `presentations-plugin` | 0.2.0 | skill + agent + inspector | 是 |
| `spreadsheets` | `spreadsheets-plugin` | 0.2.0 | skill + agent + inspector | 是 |
| `plugin-creator` | `plugin-creator-plugin` | 0.2.0 | skill + 脚手架脚本 | 是 |
| `skill-creator` | `skill-creator-plugin` | 0.2.0 | skill | 是 |

当前来源：仓库内插件新实现。原资产与逐文件核验记录保存在仓库外，见 `docs/knorvia-plugin-license-audit.md`。

明确不移植（用户范围限定，且各有产品原因）：

- `computer-use`：用户确认删除；本仓库的 CUA 运行时（`@knorvia/cua`）本身是占位实现，即使保留插件也无法实际控制桌面。
- `image-search`：MCP 地址来自本机不存在的 `KNORVIA_BASE_URL`，启用只会产生缺失变量错误。
- `knorvia-guide`、`android-emulator`、`ios-simulator`：不在指定插件集合内；模拟器插件还依赖 Xcode/Android SDK 与预编译产物。
- `restore-legacy-sessions`：读取 ZCode 旧版会话数据，与 Knorvia 独立数据目录的隔离原则冲突。

上述未移植插件在 `official-plugin-definitions.ts` 里的定义保留，但因为没有对应资产目录，discovery 不会解析出 root，因此不出现在商店、设置页与 CLI 列表里。

## 身份归一规则

对全部文本资产做确定性替换：

| 上游写法 | 本项目写法 | 说明 |
| --- | --- | --- |
| `.zcode-plugin/plugin.json` | `.knorvia-plugin/plugin.json` | 插件清单目录名 |
| `~/.zcode`、`.zcode/`、裸 `.zcode` | `~/.knorvia-studio`、`.knorvia-studio/` | 数据目录、技能/命令根 |
| `ZCODE_*` | `KNORVIA_*` | 环境变量、模板变量（`${KNORVIA_PLUGIN_ROOT}` 等） |
| `zcode.json` | `knorvia.json` | 工作区配置文件 |
| `zcode-plugins-official` | `knorvia-plugins-bundled` | 官方市场 id |
| `ZCode` | `Knorvia Studio` | 产品名 |
| 插件 manifest/listing、技能 frontmatter、脚本默认作者中的**产品署名** | `Knorvia Studio` | 用户可见产品署名统一。第三方 `author`/`license` 字段不在此列，保持上游原值 |
| `::zcode-file-citation` | 新输出 `::knorvia-file-citation` | 渲染器继续读取旧会话中的原格式；新技能示例只教新格式 |
| `/* zcode-workflow` | 新保存 `/* knorvia-workflow` | 读取已有工作流时接受两种起始标记；新工具说明只教新格式 |
| `Symbol.for("zcode.node-repl.computer-use-bridge")` | `Symbol.for("knorvia.node-repl.computer-use-bridge")` | 宿主和消费者同包同步更新，不向原版应用写入全局符号 |
| `zcode-artifact://`、`zcode/…` 响应元数据 | 新写入 `knorvia-artifact://`、`knorvia/…` | 旧会话的 artifact URI 和可持久化响应元数据继续可读 |
| `x-zcode-rpc-host-capability`、`__zcode_rpc_nested_uint8array_v1` | `x-knorvia-rpc-host-capability`、`__knorvia_rpc_nested_uint8array_v1` | 两端同版切换；远端旧 bundle 由能力检查触发更新 |

当前资产状态：

- documents、pdf、presentations、spreadsheets 使用本次新编写的 manifest、技能、审阅代理及检查脚本，随包 MIT 正文署名 Knorvia Studio。原资产完整保存在仓库外，不参与新版本构建。
- browser-use、node-repl-host、plugin-creator、skill-creator 已替换为新资产和适配层；宿主和浏览器依赖现有 core SDK，依赖的许可证继续适用。所有八项的原授权已经确认，无需重复询问。
- 模型提供商中的真实模型名称保留；内置插件不绑定具体厂商、账号或付费模型。
- 旧协议只用于必要读取迁移，新输出统一使用当前产品名称。

## 打包与开发链路

- 唯一清单与 staging 实现：`packages/desktop/scripts/official-plugin-staging.mjs`，由 dev 链（`scripts/build-desktop-agent-cli.mjs`）与打包链（`packages/desktop/scripts/prepare-agent-node-bundle.mjs`）共用。
- 每项插件声明 `requiredSeedPaths`，与 `official-plugin-definitions.ts` 的 `requiredSeedPaths` 一一对应；缺任一文件即打包失败。
- staging 先把目标插件目录整体清空再复制，避免重命名或删除文件后旧文件残留在安装包里。清空复制会忠实镜像 source，因此**许可正文与 manifest 归因必须在 source 里存在**；脚本已加入许可守卫，manifest 声明 `SEE LICENSE IN <path>` 而该正文缺失时打包直接失败。
- 资产复制沿用顶层白名单（`.mcp.json`、`.knorvia-plugin`、`agents`、`commands`、`dist`、`docs`、`hooks`、`output-styles`、`scripts`、`skills`、`templates`、`README.md`），排除 `node_modules`、`__pycache__`、`.venv`、`.pyc`、`.DS_Store`。
- Electron 产物把 `bundled-agents/win32-x64/knorvia` 整体复制到 `resources/knorvia`；Agent 启动时由 `bundled-plugins.ts` 的 filesystem seed 把插件写入 `<data>/.knorvia-studio/cli/plugins/cache/knorvia-plugins-bundled/<name>/<version>/`，并刷新官方市场目录。便携版沿用 `data` 目录，不读取 `~/.knorvia-studio`。

## 本轮优化约束

- `Settings → Plugins` 是唯一可见的插件管理入口。在该页提供本地来源目录的添加、刷新和移除，并在同一处安装来源中可用的插件；不恢复独立插件市场主页面。操作始终针对当前选中的 Host/工作区，失败须可见，不能报作安装成功。
- 插件创建器的指引必须对应上述真实入口。其本地预检默认只读检查文件；只有显式提供 Knorvia Studio CLI 的**绝对路径**时才运行 CLI schema 校验，绝不默默调用 PATH 上可能属于原版 ZCode 的 `zcode` 命令。
- 打包前逐个解析插件 manifest 并核对名称、版本及必需资产；全部源包先通过检查，之后才能清空并复制目标，避免一份坏源破坏已有 staged bundle。打包测试覆盖错名、错版本、缺文件及旧文件清理。
- 插件包的发行来源和权利依据需单独记录；用户已要求旧署名及新输出协议名称改为 Knorvia Studio，历史协议只读兼容。文本检索无旧署名不能单独证明可分发权利。

### 阶段 0 授权闸门（2026-09-24）

逐项当前状态见 `docs/knorvia-plugin-license-audit.md`。用户已确认覆盖 8 项的授权，并进一步要求独立替代；新插件资产以包内许可为准，既有 SDK 与第三方依赖保留各自许可。

## 验收

### 浏览器与执行宿主替代契约

- browser-use 0.6.0 与 node-repl-host 0.7.0 重新实现插件入口、操作说明和宿主适配层。继续依赖仓库 core 的浏览器 SDK、REPL 引擎及公开协议，不将这些依赖宣称为本次新编写。
- 宿主是调用队列、超时和一次性 Worker 的唯一所有者：请求 → 按会话串行 admission → 新 Worker → bridge → 现有 Host → 结果 → Worker 销毁。取消及关闭同时终止活动调用；排队请求在关闭后不得执行。
- Browser/CUA bridge 只接受命名空间请求上下文；缺会话、子代理、过期 generation、取消、鉴权失败均拒绝。IPC 按行传输 JSON，字节数有上限，响应 ID 必须匹配。调用结束后释放连接。
- 结果适配器保留结构化输出与图片，截图来源及应用身份仅信任宿主记录；不信任用户代码填写的同名元数据。CUA 仍为占位依赖，不新增桌面控制功能。
- 浏览器能力与方法签名使用当前 core 公共接口；说明、工作流及技能重新编写。旧包整体留在仓库外，新包不包含旧说明和脚本。
- 验收包含真实 stdio 初始化与 JS 调用、连续调用隔离、取消、会话队列、bridge 错误、输出来源防伪、打包及隔离插件发现。无外部模型调用。

### 独立替代实现（2026-09-24，用户追加决定）

- 8 个插件按能力与公开接口替换；新编写范围及复用依赖分别记录，不将整个应用或公共 SDK 宣称为本次从零实现。
- 原资产整体保存在仓库外，经逐文件 SHA-256 核对后才替换工作区对应目录。新包仅包含本次编写的 manifest、技能、审阅代理和离线检查脚本，不混入原模板、图片、脚本或许可正文。
- 四个内容插件版本升至 0.2.0；manifest、打包清单和启动 seed 同步升版，避免旧缓存继续服务新版本。保留插件 id、技能 id、文件引用协议和默认启用行为。
- 文档处理由模型根据技能生成任务脚本，使用用户环境现有的标准文档库；插件自带无第三方 Python 依赖的结构预检，校验 ZIP/XML 包、类型、必要部件和外部关系。渲染依赖缺失必须明示，不下载或自动安装工具，不以结构校验替代视觉验收。
- 新产物默认写新文件；编辑保留原件，不默默覆盖用户文档。模板、宏、批注、修订和公式缓存等保真限制在操作前识别，无法保留时不宣称已保留。
- 验收覆盖真实生成的四类文档、损坏输入、错扩展名、拒绝危险 XML/压缩包、打包源与 staged 资产一致、旧资产不进入新包。文档库和渲染器的许可仍属于各自第三方依赖，插件署名不替代依赖许可。

### 创建器替代契约

- skill-creator 与 plugin-creator 升至 0.2.0，原目录整体移出仓库并核验，当前仓库只放新实现及随包许可；不引入新市场页面。
- skill-creator 指导需求定位、触发条件、执行边界、输入输出、失败行为和回归案例，使用当前用户模型，不硬编码厂商或账户。
- plugin-creator 保持五个脚本入口和现有函数的调用边界：生成可选 skills/agents/commands/hooks/mcp 结构、本地预检、管理本地来源索引。索引是 Settings → Plugins 的已有本地来源文件，不访问在线服务。
- 创建前验证名称、组件、所有目标路径和索引冲突；拒绝符号链接/越界路径。默认不覆盖；显式 force 只覆盖脚手架对应文件并保留其他文件。写入失败应回滚本次修改，失败不可报成功。
- 本地来源索引只有带排他锁的写入路径，锁冲突明确失败；损坏索引不自动重建。已有条目指向其他目录时必须明确报冲突。预检默认只读，不调用 PATH 中的 CLI；显式绝对 CLI 路径才执行宿主校验。
- 验收覆盖完整脚手架与真实宿主 validate、重复创建保护、越界/符号链接拒绝、来源冲突、损坏索引不覆盖、显式模型无绑定，以及插件列表和打包资产完整性。


1. `pnpm typecheck`、`pnpm lint`（0 错误、0 警告）、`pnpm architecture:check --changed` 通过。
2. 打包期逐个插件校验 seed 资产；打包产物 `resources/knorvia/packages/<dir>` 与仓库源码一致（逐文件哈希）。
3. 用打包产物的 `resources/knorvia/knorvia.cjs` 在隔离存储根执行 `plugins list --json`：8 个内置插件全部出现且无 error 级诊断；默认启用集合为 browser-use、node-repl-host、documents、pdf、presentations、spreadsheets、plugin-creator、skill-creator；可见目录为 7 个能力插件，`node-repl-host` 不对用户展示。
4. 插件创建器预检无需全局 `knorvia`，设置页可完成本地来源添加与插件安装；真实插件功能还须以对应技能/运行时的代表性任务验证，不能仅凭插件列表推定可用。
5. 覆盖便携目录后，`data` 内既有文件逐一 SHA-256 不变；不生成重复便携目录或压缩包。
6. 回归验证新输出引用、工作流文件头、artifact URI 和 RPC 标识使用 Knorvia 名称，同时旧引用与旧保存文件仍能解析。

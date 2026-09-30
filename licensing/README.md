# 文件来源与许可范围

当前版本的根许可证仍为 [Apache-2.0](../LICENSE)。本目录记录向独立 Knorvia 实现迁移的证据，不把尚未替换的实现改称 MIT。第三方声明继续见 [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)；已单独声明 MIT 的插件仍以包内正文为准。

`upstream-baseline.json` 固定最初使用的上游提交及逐文件摘要；`current-files.json` 覆盖当前工作区文件；`reviews.json` 保存绑定文件摘要的复核决定。工具说明和完成标准见 [独立实现规格](../specs/knorvia-independent-implementation.md)。没有匹配上游文件只代表需要审查，不代表原创。目录级第三方声明可能仅覆盖文件中的部分内容。

新编写的 `scripts/provenance/` 审计工具、REPL 编译与会话执行器、`core/src/browser-client/` 中的 SDK 与安装入口、bootstrap 浏览器协议与本地 IPC 转发器、`shared/src/browser-use/` 共享线协议与 CLI 浏览器端口、执行宿主的本地帧传输、身份投影、能力桥、Computer Use 本地请求服务、结果呈现、单次执行/进程生命周期、MCP 调度与启动收尾、工具 schema 规范化、REPL 数据契约、core 的 REPL 工具入口、JSON Schema 校验器、模型输入错误呈现、工具诊断对象工厂、输入准备与执行校验边界、公共错误工厂、原因投影与工具失败结果、工具结果预算与持久化呈现、工具结果卡片投影、工作流结果快照投影、单次工具调用主流程、工具时钟与单次结算、工具批次执行与调度续接、工具依赖与安全分组规划、工具登记与模型合同投影、权限预览与应答仲裁、工具权限单次计划、审批就绪生命周期与客户端适配、权限策略判定程序与能力默认值解析、权限规则内容程序与有序身份合并、默认授权建议与项目/会话授权阶段、工具 Hook 适配与改写输入复核、Hook 输出投影与累积、Hook 批次与回调生命周期、项目权限存储单元与原子更新、完全访问授权提交协调、存储值编解码与权限载荷投影、会话条目与待办持久写入、消息与片段持久存储、会话元数据存储、输入历史持久存储、用量持久存储与统计、会话输入持久账本与同步提升、脚本工作流持久存储与同步借用事务、动态工作流 journal 持久存储、会话库初始化执行与升级快照、会话存储连接与复合提交、会话目标持久存储与运行记账、工作区钩子信任持久存储、存储故障注入端口、附件文件与派生缓存存储、HTTP响应字节读取、HTTP公网目的地与DNS回调、HTTP请求入口与Node响应桥、代理规则与同步CA配置、Fetch代理与返回流生命周期、子进程网络环境投影、MCP网络边界、MCP描述符与等待截止、MCP OAuth错误与发现缓存、MCP凭据配对与命名空间、MCP授权锁与运行期令牌提供器、MCP令牌刷新协调器、MCP交互式授权事务、MCP进程与资源遥测、MCP连接池与租约、MCP认证请求、MCP stdio进程边界、MCP客户端工厂与生命周期及宿主构建入口，以及对应的新契约文档和测试，采用本目录 [MIT 许可](MIT.txt)。具体文件与摘要见 `reviews.json`。这不改变被审计代码、其他协议、执行器其余边界、其余 MCP 宿主模块、执行后端和未确认文件的许可，也不表示应用已经完成独立替换。Zod、zod-to-json-schema、esbuild 等第三方依赖仍保留其原许可和署名，不计为 Knorvia 原创。新增 Knorvia 代码应注明许可并记录来源；修改现有文件须保留仍适用的版权及许可，贡献者不得提交无权提供的代码、素材或凭据。

旧版发行记录、许可证及附件不追溯改写。

日志三个旧模块本批按行为合同重实现为五个生产模块，永久 source/dist 门各 51/51，并完成真实旧→新→旧 JSONL 夹具。作者接触过旧源码且没有隔离角色，生产模块仍保留 Apache-2.0、未授予 MIT，不计入已收口的独立文件数；新编写的合同和测试单列 MIT。详见[日志来源状态](evidence/logging-runtime.md)与[验收](../docs/knorvia-logging-runtime-acceptance.md)。

命令执行的 24 份源码及插件发现、组件、Hook 与 MCP 投影的 16 份源码也已按逐文件证据独立替换；对应 42 份新测试与支撑文件采用本目录 MIT 许可。旧版、候选、主仓源码及实际 CLI 编译产物分别通过 62 项和 43 项契约验收，主仓完整离线 3798 项通过。详见[该批验收](../docs/knorvia-exec-plugin-runtime-acceptance.md)、[执行来源](evidence/exec-runtime.md)与[插件发现来源](evidence/plugin-discovery-runtime.md)。

随后八个插件来源与存储门面及其私有实现由 33 份独立源码接替。独立旧门为 225 通过加 24 项预登记缺陷，最终候选、主仓源码及实际 dist 各 249/249；69 份测试与支撑载荷通过两个顶层组纳入整仓 3800 项回归，全部通过。复制的 10 份生成公共声明仍保留 Apache-2.0 来源，功能 lint 配置只记性质，不与独立测试表达混为原创。详见[存储验收](../docs/knorvia-plugin-storage-runtime-acceptance.md)与[来源依据](evidence/plugin-storage-runtime.md)。

模型适配器的 51 份源码已按独立作者合同替换，26 份测试与支撑文件接入永久回归。旧门为 66 通过和九项预登记差异，最终候选及主仓 source/dist 各 75/75。源码切换后的完整离线回归 3800 项通过；后来新增的两个模型组另行通过，没有冒充一次含新增组的全量运行。25 份新测试表达采用 MIT，功能性类型配置只记性质；其余 SDK、公开类型依赖和共享协议维持原许可。首次失败、网络边界事件、修订输入和最终摘要见[模型验收](../docs/knorvia-model-adapter-runtime-acceptance.md)与[来源依据](evidence/model-adapter-runtime.md)。文件系统及其他模块仍在替换中，以上不表示整个应用已独立。

认证适配器的五份源码已按先行合同独立替换。旧版 source/dist、最终候选及主仓 source/dist 各 30/30；38 份永久测试及支撑文件通过两个顶层组接入回归。六份保留公开声明继续采用 Apache-2.0，标准许可文本和功能配置单列性质；候选首败与接入漏拷贝夹具的失败均保留。详见[认证验收](../docs/knorvia-auth-adapter-runtime-acceptance.md)与[来源依据](evidence/auth-adapter-runtime.md)。这次仅收口已验收部分，文件系统、日志和设备仍在仓外，不算已完成替换。

功能配置和标准许可正文可使用 `reviewed-retained` 记录“已核验性质、保留声明”。它必须填写 `NOASSERTION`，仅表示这次复核不新增许可判断，不能撤销文件中已有的有效声明，也不代表独立实现。上游路径、摘要和分类照常保留；`summary.reviewedNatures` 是与来源分类重叠的独立统计，不能相加当成总文件数。首批宿主配置依据见[性质复核记录](evidence/node-repl-host-retained.md)。

当前已验证范围见[迁移进展](../docs/knorvia-independence-progress-20260927.md)。

## 更新和检查

- 首次提取固定上游提交的摘要：`node scripts/provenance/cli.mjs --baseline-repo <仓库外的上游 Git 对象库>`。工具只读取该对象库，不联网或更新它。
- 审查文件改动及相应 `reviews.json` 决定后，运行 `pnpm provenance:report` 更新逐文件清单。
- Material Icon Theme 的精确来源证据在 `evidence/material-icon-theme.json`。重现命令：`node scripts/provenance/material-icons.mjs --source-repo <仓库外的发布者 Git 对象库> <输出 JSON>`；源提交固定，命令不会下载或替换图标。只有字节一致的项被确认为第三方 MIT，仍保留 Material Extensions 原许可；未知生成变体继续待审。
- `pnpm provenance:check` 检查已提交清单是否与当前文件一致，并拒绝过期或冲突的复核。UTF-8 文本允许 Git 检出的 CRLF/LF 差异，其他内容及二进制变化必须重新核验；报告的原始字节摘要和大小保留为采集时的证据。它通过仅代表清单新鲜，不代表全部文件已完成独立替换。
- `pnpm test:studio` 包含审计工具的离线回归。自动报告自身列为生成文件并明确不作自引用摘要，其余文件记录原字节和换行归一后的摘要。

# Windows Computer Use 插件接入（2026-09-27）

用户最后确认参考开源 Hermes 的 Computer Use，并取消独立桌面及不抢鼠标的硬限制。此次工作保留 Claude 的前端更新，沿用既有 Computer Use 插件开关、聊天模型和工具审批。

## 实现与来源

- 插件 `computer-use` 0.7.0，默认关闭；共享执行宿主 `node-repl-host` 0.8.0。
- Hermes 参考提交：`b4410b4baddbc83732241c655ff39ac72ffba865`。该提交使用 Cua 0.21.0；本次适配固定 Cua 0.30.1，不宣称是同版本复制或达到 ChatGPT 完整能力。
- Cua 发布提交：`039783f9221a08c0daf9cda65a460fc4f346fa6e`。Windows x64 官方 ZIP SHA-256：`96ebb5996c0e25adf40ed648a46959723d31df5d90f24ffe2fb2d3cc2ee780be`。
- 构建时验证归档与三个二进制摘要，宿主加载时再次核对固定摘要。运行时只启动包内 `mcp --direct --embedded`，独占 scope 进程，不连接全局 daemon。遥测、更新检查关闭；不安装感知模型或虚拟机。
- 提供列窗、当轮单窗口授权、截图与可用控件观察、动作和停止。原始 PNG 及其坐标保持一致，控件 token 绑定最新观察。动作返回真实 effect，交付输入不等于业务成功；未知结果不重放。
- 停止先禁止新动作，再关闭自有驱动，仅等待自身 scope/session，不被其他会话拖延。主任务结束或取消也发送清理，覆盖模型正在思考、没有在途工具、或模型工具规则隐藏 stop 的情况。

## 许可

随插件保留 Cua、Interface-Agent、Trope 原始 MIT 声明，并带上 `docs/THIRD-PARTY-NOTICES-CUA-DRIVER.md` 和机器可读清单。Windows 默认功能的保守依赖闭包含 337 个组件，328 个 registry 归档摘要均与固定 Cargo.lock 一致；609 份许可和声明原文已收集，清单记录零收集错误。

依赖许可还包括 Apache、BSD、MPL-2.0 等，不能统称 MIT。UniFFI 的 MPL 原文及未修改源码获取方式已列出。此清单保守包含构建依赖，不是链接器生成的精确 SBOM。可选 perception 与 ONNX 模型未打包。

## 验证记录

生产构建与包内验收均已完成。以下区分单元测试、真实应用验收和未验证项。

- 已实际运行成熟驱动与宿主两种实机路径，仅控制测试创建的深色窗口：150% DPI，原生 PNG 882×565，缩图 640×410，中文与 emoji 输入、截图坐标点击及独立窗口状态回读通过。
- 宿主路径执行停止后，再次动作被拒绝且测试窗口未变化。测试进程退出。测试仅模拟可信 Host 已审批后的派发；不等于用户审批界面端到端或真实模型推理验收。
- 最终 `pnpm test:studio`：896/896 通过，0 失败、0 跳过（228.7 秒）。`pnpm typecheck` 通过，中英文 5422 键一致；`pnpm lint` 为 0 错误、0 警告；`pnpm architecture:check --changed` 为 0 违规。`pnpm build:cli-packages` 17/17 成功。新鲜度检查 main 与 origin/main 同步。
- 此后补充的打包回归 2/2 通过：已有旧 runtime 不能跳过宿主重建，bootstrap 显式环境变量保留离线驱动归档路径。最终 lint（2764 文件）、架构检查和本轮脚本格式检查通过。
- 前端保护基线 2704 个文件：只有 `ComputerUseSection.tsx`、`cuaComposerEntryState.ts`、中英文词条四文件属于本任务接入改动。Claude 的样式、图标、动画及导航保持原有字节。
- 实际生产包的宿主和插件通过六组实机检查：自有窗口枚举、获准 scope 的截图、中文和 emoji 输入回读、截图坐标点击、高分屏滚动、停止后拒绝且窗口状态不再变化。150% DPI 的原生 1802×1025 截图缩为 1600×910；滚轮预期屏幕点 (1992,737)，实际 (1992,736)，列表 TopIndex 0→9，一次滚轮事件。驱动将点击和滚动标为 `unverifiable`，保留该原始结果；测试通过独立控件状态验证效果。仅控制自建深色窗口，宿主和夹具进程均已退出。
- 生产程序隔离启动与重开四项验收通过：新配置默认关闭；安装缓存三驱动摘要及许可完整；包内 Electron 启停工具门和缺失可信身份拒绝；重启后启用状态保留并可关闭。两次应用退出码均为 0，页面错误及资源错误均为 0。
- `KNORVIA_ENV=production` 下执行 `node packages/desktop/scripts/bundle.mjs --os win --arch x64` 成功，运行依赖与体积审计通过。Electron Builder 曾输出依赖未找到提示，随后既有 afterPack 流程补齐 22 项运行依赖，最终校验和真实启动通过。构建器另有既有弃用与资源体积提示，未把它们记成 lint 警告或无警告构建。

## 便携交付

- 新包：`C:\Users\17018\Desktop\Knorvia Studio Portable - Computer Use 20260927.zip`，版本 `0.8.0-preview.3`，241,089,914 字节。
- ZIP 内 135 个文件逐个核对长度与 SHA-256，全部与生产目录一致。包内含便携标记，不含用户 `data`；已生成同名 `.zip.sha256` 文件。
- ZIP SHA-256：`8fa7101a8ea0c2c9b80e5c28dee8152c8336bc817f2a6cb7a92b8a9dd20f876c`。
- 用户随后明确要求覆盖。确认目标程序已退出后，通过 `scripts/deliver-portable.ps1` 将同一已验收版本覆盖至 `C:\Users\17018\Desktop\Knorvia Studio Portable`，Robocopy 返回 3（成功）。排除 `data`，未新建备份；135 个程序文件 SHA-256 与生产包逐一相同。`data` 的 434 个文件、55,397,668 字节在覆盖前后逐文件散列完全一致。未启动真实用户配置，避免验收改变聊天数据。
- 覆盖日志：`D:\tools.cache\knorvia-cua-portable-overwrite-20260927.log`；目标目录的 `构建校验.json` 已记录本次版本、程序摘要及数据保护结果。
- 在新便携包的「插件」中启用「电脑控制」，通过本地 Knorvia 内核与支持图像的模型使用；仍需批准目标窗口的当轮控制。

原始验收证据保留于本机：`D:\tools.cache\knorvia-cua-studio-final-20260927.log`、`D:\tools.cache\knorvia-cua-package-20260927.log`、`D:\tools.cache\knorvia-cua-packaged-host-smoke-20260927.log`，以及 `C:\Users\17018\AppData\Local\Temp\knorvia-computer-use-8zgJ92\result.json`。

## 限制

本轮支持 Windows x64 本地 Knorvia 内核，其他系统、远程工作区和外部 CLI 不宣称可用。需要图像模型。前台动作可能改变焦点或鼠标；不承诺所有应用都支持后台输入。UAC、安全桌面、管理员窗口和任意桌面范围操作不提供。驱动不返回进程启动时间、输入 tick 或 DPI；没有伪造这些检查。

未进行真实模型推理、用户审批界面端到端验收、付费模型调用、人工目视复核、Git 提交推送或 GitHub Release 发布；不宣称与 ChatGPT 的全部 Computer Use 能力等价。实机动作测试模拟可信 Host 已批准后的派发，审批权限由独立的 Core 策略测试覆盖。

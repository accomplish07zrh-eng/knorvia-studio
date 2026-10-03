# TUI 发行 ESM / bundled CommonJS 的内置模块互操作

父任务授权修复 native PR25 head `598e1f117ebd1793620c6df4b926affd1be8a458` 的实际发行烟测失败。其 `docs/evidence/native-packaged-retest-ad712690-20261003/result.json`、原 smoke log 与产物摘录绑定中间 archive `ad712690`：TUI 的 ESM index 内联 YAML，esbuild commonjs wrapper 调用 `require("process")`；ESM module 没有该词法绑定，生成的 __require 抛 Dynamic require。旧 smoke 在原生导入时退出 1，尚未进入 render/keyboard。当前本路从精确 integration `902e35c6dbcfa4b829270352fecf03ebc07b219f` 继续，不把旧归档当作此统一树的产物。

## 所有者与最小修复

只改 `apps/cli/packages/tui/scripts/build.mjs` 的产物构建入口，继续 ESM 格式、node22 target、现有 workspace bundling，以及 OpenTUI/React/native/worker 的原外置边界。构建时给该模块提供 Node 原生 createRequire(import.meta.url) 的局部 require；esbuild CommonJS wrapper 由此使用真实 Node loader 访问内置模块及 module-relative 解析。第三方闭包、版本与代码不迁出，不改 package exports、UI/组件、CLI CJS/native dynamic import 或产品数据。

局部 require 只属于生成的 ESM 文件：不写 globalThis.require、不增加 loader hook、NODE_OPTIONS、NODE_PATH、provider API、配置或依赖，不伪造模块导出，也不在 smoke 中注入兼容层。使用原生 module URI 适配 Windows drive、空格与 Unicode 路径；不拼文件 URL。buildTui 可接收仅用于工作区/临时夹具的 directory 参数，默认仍为原 TUI package，所有构建选项由同一路径产生。

真实 staged 导入在 require-only checkpoint `dc63f521c42198e325f4d1da82fd509fe7526026` 越过 YAML 后，内联 TypeScript 的 getNodeSystem 报 `__filename is not defined`。因此同一 ESM 模块还提供原生 `import.meta.filename` / `import.meta.dirname` 的局部 CommonJS 文件上下文；仓库最低运行时 Node 22.16 原生支持这些字段。文件/目录属于生成产物，不能使用 cwd、源码路径或给全局赋值。另加独立 metadata fixture 先复现 require-only 失败，再确认物理产物路径、空格/Unicode 和 global absence，保留首轮失败而不写成完整修复通过。

## 定向合同

1. 用真正 buildTui 生成包含 top-level await 与 CommonJS builtin require 的 ESM 模块，在清空 NODE_OPTIONS/NODE_PATH 的新 Node 进程从仓库外导入。旧兼容行为先复现 Dynamic require，当前成功；process/fs/path/module/crypto 等导出是原生对象，require.resolve 与 module-relative data 查找正常，global require 不被设置。独立 fixture 核对 __filename/__dirname 为产物原生路径且不写全局。
2. 保持顶层 await、原 ESM export、包依赖 external 与入口路径。实际 bundle 构建后，真实 Node 导入 @knorvia/tui 的 runTui。以实际 collector 物化 runtime 闭包到临时发行 layout，并逐文件摘要核对；不能通过仓库 node_modules、源码 alias 或测试 loader 隐藏缺包。
3. 以真实 CLI CJS 入口和 Node/OpenTUI/PTY 运行导入、initialized render 和 Ctrl-C keyboard exit；不发 prompt，不调用模型或外部 API。使用独立合成 workspace/profile，并清理继承的 provider 凭据变量。真实启动显示默认 sessionDbPath 是显式 `~/.knorvia-studio/cli/db/db.sqlite`，仅 DATA_BASE_DIR 不会重定向该既有语义；烟测复用已有 KNORVIA_SESSION_DB_PATH / KNORVIA_STORAGE_DIR 配置将 DB 和 storage 放在临时 profile，不修改用户路径语义或申请 home 写权限。原根 smoke 缺少这两项隔离配置的需求交整合者，不在本路复写。
4. 为缺失的必要 workspace 输出仅按原配置准备 JS，不做完整类型检查。TUI 与必要 CLI 入口定向构建是本次授权范围，完整产品/平台包和质量套件仍留统一阶段。记录精确源码 checkpoint、配置/依赖、产物摘要、构建和 smoke 命令；若只物化 runtime layout而未重建完整 Web/desktop/archive，应如实标明。

## 真实键盘 smoke 暴露的入口阶段归属

`4ac5cc97` 的原生导入和完整输入界面已成功；隔离 storage 后双 Ctrl-C smoke 仍退出 130。只读 task-owned PTY mode 显示 -isig；临时 onExit stack 追踪确认是 TuiStartupScreen 回调在 appMounted=true 时仍触发 130，不是 OS SIGINT。诊断源码、map 与本地/staged 产物都在 finally 恢复，没有把诊断输出计作验收通过。短暂延迟不能修复此归属问题，最终 smoke 不保留该尝试。

仅在 `tui.tsx` 入口让 startup onExit 受已有 appMounted 阶段约束：loadStartupOptions 尚未完成时仍可 Ctrl-C 取消并返回 130；交给主界面后，旧 startup 回调不能再覆盖主界面的 double Ctrl-C guard / exit 0。renderer、React/OpenTUI、键盘组件、layout、数据、公开选项和 guard 规则不改。验收使用真实 staged CLI 的 native import、完整 render、双 Ctrl-C exit 0，以及同一真实 staged runTui API 的 pending-startup Ctrl-C exit 130，不改宽原断言、不用 mock/loader。

根 scripts/distribution-smoke、配置/CI、共享协议、全局来源/许可/evidence registry 和其他路生产源保持只读；需要根 smoke/test 登记就报告最小 patch。Apache、第三方及历史版权/NOTICE 保留，本修复不作法律独立性声明。未执行 full regression、lint、完整 typecheck、root/full product build、全量审计、真实 Windows/macOS/native driver 或全产品 UI/用户数据验收。最终新统一 SHA 的完整 archive 与原 distribution-smoke 仍由整合/native 阶段验收。

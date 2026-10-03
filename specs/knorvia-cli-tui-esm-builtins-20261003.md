# TUI 发行 ESM / bundled CommonJS 的内置模块互操作

父任务授权修复 native PR25 head `598e1f117ebd1793620c6df4b926affd1be8a458` 的实际发行烟测失败。其 `docs/evidence/native-packaged-retest-ad712690-20261003/result.json`、原 smoke log 与产物摘录绑定中间 archive `ad712690`：TUI 的 ESM index 内联 YAML，esbuild commonjs wrapper 调用 `require("process")`；ESM module 没有该词法绑定，生成的 __require 抛 Dynamic require。旧 smoke 在原生导入时退出 1，尚未进入 render/keyboard。当前本路从精确 integration `902e35c6dbcfa4b829270352fecf03ebc07b219f` 继续，不把旧归档当作此统一树的产物。

## 所有者与最小修复

只改 `apps/cli/packages/tui/scripts/build.mjs` 的产物构建入口，继续 ESM 格式、node22 target、现有 workspace bundling，以及 OpenTUI/React/native/worker 的原外置边界。构建时给该模块提供 Node 原生 createRequire(import.meta.url) 的局部 require；esbuild CommonJS wrapper 由此使用真实 Node loader 访问内置模块及 module-relative 解析。第三方闭包、版本与代码不迁出，不改 package exports、UI/组件、CLI CJS/native dynamic import 或产品数据。

局部 require 只属于生成的 ESM 文件：不写 globalThis.require、不增加 loader hook、NODE_OPTIONS、NODE_PATH、provider API、配置或依赖，不伪造模块导出，也不在 smoke 中注入兼容层。使用原生 module URI 适配 Windows drive、空格与 Unicode 路径；不拼文件 URL。buildTui 可接收仅用于工作区/临时夹具的 directory 参数，默认仍为原 TUI package，所有构建选项由同一路径产生。

## 定向合同

1. 用真正 buildTui 生成包含 top-level await 与 CommonJS builtin require 的 ESM 模块，在清空 NODE_OPTIONS/NODE_PATH 的新 Node 进程从仓库外导入。旧兼容行为先复现 Dynamic require，当前成功；process/fs/path/module/crypto 等导出是原生对象，require.resolve 与 module-relative data 查找正常，global require 不被设置。
2. 保持顶层 await、原 ESM export、包依赖 external 与入口路径。实际 bundle 构建后，真实 Node 导入 @knorvia/tui 的 runTui。以实际 collector 物化 runtime 闭包到临时发行 layout，并逐文件摘要核对；不能通过仓库 node_modules、源码 alias 或测试 loader 隐藏缺包。
3. 以真实 CLI CJS 入口和 Node/OpenTUI/PTY 运行导入、initialized render 和 Ctrl-C keyboard exit；不发 prompt，不调用模型或外部 API。使用独立合成 workspace/profile，并清理继承的 provider 凭据变量。
4. 为缺失的必要 workspace 输出仅按原配置准备 JS，不做完整类型检查。TUI 与必要 CLI 入口定向构建是本次授权范围，完整产品/平台包和质量套件仍留统一阶段。记录精确源码 checkpoint、配置/依赖、产物摘要、构建和 smoke 命令；若只物化 runtime layout而未重建完整 Web/desktop/archive，应如实标明。

根 scripts/distribution-smoke、配置/CI、共享协议、全局来源/许可/evidence registry 和其他路生产源保持只读；需要根 smoke/test 登记就报告最小 patch。Apache、第三方及历史版权/NOTICE 保留，本修复不作法律独立性声明。未执行 full regression、lint、完整 typecheck、root/full product build、全量审计、真实 Windows/macOS/native driver 或全产品 UI/用户数据验收。最终新统一 SHA 的完整 archive 与原 distribution-smoke 仍由整合/native 阶段验收。

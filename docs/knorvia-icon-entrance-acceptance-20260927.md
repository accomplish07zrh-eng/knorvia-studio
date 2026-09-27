# 丝带线图标语言与进入动画验收（2026-09-27）

用户要求：为 Knorvia Studio 设计一套新的图标语言（只换小图标，插件、创作等不能漏），加一段精致的进入动画，完成后打包覆盖 `C:/Users/17018/Desktop/Knorvia Studio Portable`。规格见 `specs/knorvia-icon-language.md`、`specs/knorvia-entrance-motion.md`。

## 实现

- 230 个 Knorvia 字形（`packages/ui/src/icons/glyphs/`），经 `knorviaIconsPlugin` 接管全部 `lucide-react` 导入；生成模块连同 lucide 别名一起覆盖。界面源码导入的 330 个图标名全部覆盖。
- 窗口最大化/还原两枚用户提供的图形保持原几何，改走 Knorvia 基座（成品验收发现它们原先绕过接管，已修复并加测试防回归）。
- 内置插件 8 个与建议卡片「文件」「终端」改为石墨色单色 SVG；删除 6 张插件 PNG、3 张文档技能 PNG、引导里的 finder/terminal PNG。飞书、内核、模型供应商等第三方品牌标记及文件类型图标不变。
- 桌面启动壳重写为入场/退场编排，保留原双条件退场与兜底时间。

## 验证（实际结果）

- `pnpm typecheck` exit 0；`pnpm lint` 0 warnings / 0 errors；`pnpm fmt:check` 通过；`pnpm architecture:check -- --changed` 0 violations。
- UI 离线测试 324/324 通过（含新增 `knorvia-icon-language.test.ts` 7 项与既有 `theme-identity` 测试）。
- 字形预览表与插件图块在深浅背景下截图目视检查；启动壳 0.2 / 0.45 / 0.7 / 1.1 s 关键帧在深浅主题下截图检查。
- 完整打包：`node packages/desktop/scripts/bundle.mjs --os win --arch x64`（Node 24.14.0，`KNORVIA_ENV=production`，`KNORVIA_SKIP_REMOTE_ASSETS=1`，输出 `dist-icon-language`），exit 0；修复窗口图标后以 `--skip-prepare` 重新打包，exit 0。日志：`D:/tools.cache/knorvia-icon-language-bundle-20260927.log`、`…-bundle2-20260927.log`。
- 成品验收 `scripts/studio-icon-entrance-acceptance.mjs`（隔离临时资料）：候选包与覆盖后的桌面 exe 各跑一次，均 12/12 PASS，页面错误与本地资源错误为 0。聊天、群聊、自动化、工作流、创作、插件、设置、深色聊天页的 `svg.lucide` 全部带 `knorvia-icon`；工具栏选中纸片底 0.2、常态 0.1、深色 0.14。
- 覆盖：`scripts/deliver-portable.ps1`，data 434 个文件、55,215,970 字节逐文件 SHA-256 前后一致；118 个程序文件与构建一致。EXE `62D90FCF115601D99B21C7E048993E9BF62E4E7A6BB4F576349AE550C0D64DAA`，app.asar `870B5BF88DCA50A05D876CD84E3F1AA1B0878CD1E44C67557D0450B5BD1C6724`。

## 未验证与边界

- 隔离环境插件列表停在加载态、没有已安装插件，因此插件图块只由单元测试、构建产物检查和独立渲染截图验证，未在成品插件卡片上目视确认。
- 首次启动走引导页，进入动画的「工具栏依次滑入」在隔离验收中没有可滑入元素（计数 0）；该段只在已有资料的正常启动时出现，未在成品中截帧。
- 覆盖后复查真实 data 时，用户已从资源管理器自行打开新版本（13:20:49），数据库文件被该会话占用，复查未完成；覆盖本身的 data 校验在交付脚本中已通过。
- Web 远控页启动壳、macOS/Linux 未验证；程序未签名；工作区中其他会话留下的未提交改动保持原样，均早于上一版便携包构建。

# Knorvia Studio 安装器品牌设计

设计方向来自本次委派：沿用正式图标、字体气质和配色，欢迎/安装/完成页面克制清晰，
主标题为 Knorvia Studio，说明短，保留清楚的进度与完成状态。UI 路仅提供新品牌
位图、文案与评审预览；native 拥有安装行为、配置、脚本、原生编译和出包。

## 可实现范围

基线 `b3b2fc5f51d2e76ff76c20aff44eb2b1d562c687` 使用 electron-builder
assisted NSIS，`oneClick: false`。现有模板通过 MUI2 提供 welcome、安装模式、
安装目录、instfiles 和 finish；本次三页预览只展示关键页面，不删掉中间原生流程。
MUI 的 welcome/finish 侧图采用 164×314；header 采用 150×57 并位于右侧。
这些尺寸、槽位和伸缩设置有 [NSIS 官方文档](https://nsis.sourceforge.io/Docs/Modern%20UI%202/Readme.html)
及当前安装的 `app-builder-lib` 模板支持。

新增图不含字体、文案、进度条、状态或按钮。正式透明 PNG 只按比例缩小，并为了
NSIS BMP 格式合成到白底；不裁剪、不调色、不改图形。侧图只放一次标志，header
只放小标志，不添加装饰性图形或泛化的机器人替代正式图标。

| 资源 | 编码 | 图形位置 | 用途 |
| --- | --- | --- | --- |
| `installerSidebar.bmp` | 164×314，RGB，24-bit，BI_RGB | 标志 124×124，左上角 (20, 90) | welcome / finish / 同品牌卸载页侧图 |
| `installerHeader.bmp` | 150×57，RGB，24-bit，BI_RGB | 标志 46×46，左上角 (96, 5) | instfiles / 其他原生 header |

标题与说明为原生文本，Windows 优先使用系统 Segoe UI / 中文系统回落；不随安装器
打包字体。最终字体命令与可读性由 native 确认。DPI 与语言会改变原生窗口尺寸，
保留 MUI 默认 FitControl，避免以固定像素坐标强改原生页面。进度使用系统原生
样式及真实 NSIS 进度，不增加猜测百分比、预计时长、仿应用侧栏或动态装饰。

## 页面文案

实际文本与映射保存为 [copy.json](copy.json)，供 native 使用现有 LangString/MUI
入口接入。两种语言的主标题都为 `Knorvia Studio`。欢迎页介绍下一步选择安装位置；
安装页保留进度、当前文件与现有详情区；完成页明确“安装完成”，沿用现有启动复选框。
文案不承诺不存在的安装选项、账号权限、网络状态、安装耗时或数据处理行为。

[preview.html](preview.html) 直接读取这批两张 BMP；欢迎、安装、完成各自有独立
截图，并提供中英文预览。设计说明位于窗口外，安装页的示例进度/文件名明确标注
为设计预览。它不是 Windows 原生运行截图，没有真实安装状态；按钮不模拟安装。
窗口比例与控件外观是 MUI 槽位示意，实际系统边框、字体、DPI、进度色由 Windows
和 native 配置决定。Linux 截图中文使用本机 Noto Sans CJK 回落，不随产品分发。

## 所有权与来源

仅新增 `packages/desktop/build/installer-branding-20261003/` 和本预览目录。
不修改 electron-builder、package.json、CI、安装脚本、应用 UI 或用户数据。
[INTEGRATION.md](INTEGRATION.md) 给出 native 的准确配置路径、文本映射与最小核验。

正式图来自 `packages/ui/src/assets/knorvia-logo.png`。仓库的
[图标来源说明](../../knorvia-icon-provenance.md) 记录了用户提供的参考、2026-09-22
内建图像编辑和用户批准的 mascot；本批只复用已入库图，不生成新图、不使用外部
图库或新字体。输入哈希和几何合成方法保存在资源目录的 `sources.json`，保留原有
版权、组件许可和来源记录，不据此声明素材权利核验或全项目独立替换完成。

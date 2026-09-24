# 外观材质验收 — 2026-09-23

实施规格：`specs/knorvia-appearance-materials.md`。

## 交付内容

- 原外观页新增玻璃效果、背景图片两张卡片，沿用字号与布局体系。窄窗口上下排列，宽窗口预览与滑块并排。
- 玻璃默认关闭，透明度默认 62%，阅读区域底色默认 86%。可实时调整、关闭后保留、单独重置参数。
- 背景默认关闭，支持 JPG / PNG / WebP、20 MB 上限、上传 / 拖入 / 替换 / 移除。仅本机保存，切页与重启保留。保存失败不覆盖已有图片；关闭或换图释放对象 URL。
- Windows 11 22H2 及以上接入原生 Acrylic；macOS 接入 vibrancy；不支持的宿主显示说明并保留稳定底色。系统减少透明度与强制高对比度优先。
- 背景只作用于显示层，不进入聊天上下文或 SSH 项目。保留背景色语义 token，避免影响反色文字、差异视图和终端游标。

## 已执行检查

| 检查 | 结果 |
| --- | --- |
| 外观状态离线回归 | 6 / 6 通过：非法配置、参数边界、重置、保存失败、过期异步结果、跨窗口更新、取消加载、损坏 JSON 恢复 |
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 0 错误，29 条原有警告 |
| `pnpm architecture:check --changed` | 0 违规 |
| Desktop renderer / preload 独立类型检查 | 通过 |
| `pnpm build:bootstrap` | 通过 |
| 打包完整性 | ASAR、程序完整性、透明图标、Agent bundle、便携目录标记通过 |
| 用户数据保留 | 原地更新前后 351 个文件逐项 SHA-256 一致 |

额外执行的 `packages/desktop/tsconfig.main.json` 独立类型检查没有通过：76 条诊断，涉及原有 applicationIcons、browserGuestManager、browserPlaywrightDOM、存储导出与 Main 集成等代码；本次外观新增文件无诊断。不能将此项写成通过。完整日志：`D:/tools/.cache/knorvia-appearance-main-types.log`。

## 实机检查范围

夜间使用深色，在隔离测试配置中验证了窄 / 宽窗口布局、原生磨砂开关、透明度 62 → 74、阅读底色 86 → 95、关闭保留数值、重置为 62 / 86、本地图片上传、返回聊天页保留背景、完整进程重启后恢复背景、玻璃与图片叠加、移除图片。没有调用付费模型。

实机截图保存在：

- `D:/tools/.cache/knorvia-appearance-dark.png`：玻璃与图片卡片。
- `D:/tools/.cache/knorvia-appearance-background-chat.png`：切页后的聊天背景。
- `D:/tools/.cache/knorvia-appearance-restart.png`：新构建重启后的背景恢复。
- `D:/tools/.cache/knorvia-appearance-portable.png`：交付便携版启动后，“设置 → 外观”的两个新入口可达，初始开关保持关闭。

拖放入口与文件选择共用校验和保存路径；跨文件管理器拖拽、macOS / Linux / 手机、系统高对比度没有本次实机环境验证，不列为已通过的实机项目。

## 便携版

原目录：`C:/Users/17018/Desktop/Knorvia Studio Portable`。更新于 2026-09-23 23:11:24，保留原托盘关闭偏好。用户配置中没有加入测试背景。

- ASAR integrity：`00385ee123796772a971497345e9aa4804ef59ed420a7b7044f4794e01fb1ddc`
- EXE SHA-256：`97ae8805fdaaaec1822222fef1f3dc9f24a91caf0a1b947cb9ecfe7f08f6c9da`
- 包内校验记录：`C:/Users/17018/Desktop/Knorvia Studio Portable/构建校验.json`

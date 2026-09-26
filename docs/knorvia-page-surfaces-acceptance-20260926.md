# 输入区对齐、工具页侧栏与材质修复

日期：2026-09-26。版本：0.8.0-preview.3。本次提交包含此前的工具栏、统一外框、图标改动及本轮界面修复；没有恢复文件。用户在便携交付后授权将源码推送到现有 GitHub 仓库的 main 分支。

## 修复与排查结果

- Knorvia 与 Codex 空草稿原有 12 CSS px 上下偏差。外部内核缺少原生草稿输入区的 `mt-3`，现在由 `conversationDraftLayout.ts` 统一提供间距。没有通过隐藏提示或改写 DOM 坐标来对齐。
- 创作、工作流和自动化不再显示无关的会话／群聊侧栏、分隔条、侧栏展开、新建任务及搜索按钮；公共历史导航继续工作。返回聊天恢复原侧栏偏好、宽度与草稿。
- 插件管理继续使用原页面，使用完整工作面；底部设置入口转到常规设置，其他设置仍有自己的分类导航。被覆盖工作区继续保持 inert。
- 找到并移除创作根层和底部、群聊根层、工作流根层与点阵画布的不透明结构背景；共用工作面提供阅读底色。群聊详情和工作流详情改用已有 card 材质，保持文字可读。
- 同时核查单聊、外部内核、自动化、插件、常规、外观、Agent 和模型设置。媒体／代码预览、图标底板、图表及内容卡片按原语义保留，没有全局清空 `bg-background`。

## 所有权和边界

实现属于现有 `ui` 模块。`WorkspaceShellLayout` 只从 `workspaceMainView` 派生当前是否显示侧栏，不新增偏好或写入路径。原导航、草稿 Store、侧栏宽度和 tabStore 的所有权不变；插件全宽从 `SettingsPage.activeSection` 派生。公共阅读底色仍归 `StudioWorkspaceFrame`，外观偏好仍归 `appearancePreferenceStore`。本轮未改变服务、Host、RPC 或会话时序。

规格先于实现更新：`specs/knorvia-activity-rail.md`、`specs/knorvia-appearance-materials.md`。使用 `.agents/skills/architecture-governance/SKILL.md`，修改前后架构检查均为 0 violations / 0 baseline / 0 new。

变更量说明：当前工作区相对 HEAD 的已跟踪差异为 33 文件、+609 / -321（净 +288 行），其中包含此前未提交成果，不能全部算成本轮新增。本轮另新增两个分工明确的交互验证脚本和本验收文档；没有新增生产模块或依赖。

## 验证

全部开发命令使用 Node 24.14.0。

| 检查                                             | 实际结果                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `node scripts/check-workspace-freshness.mjs`     | exit 0，main 与 origin/main 同步                                       |
| `pnpm typecheck`                                 | exit 0，包含 desktop main；5417 个中英文键一致                         |
| `pnpm lint`                                      | exit 0，2720 files，0 warnings / 0 errors                              |
| `pnpm architecture:check --changed`              | exit 0，0 violations / 0 baseline / 0 new                              |
| 导航、内核、草稿、插件、外观偏好、工作流离线测试 | 61 / 61 通过                                                           |
| 便携升级与数据隔离测试                           | 14 / 14 通过，包含真实交付脚本、8.3 短路径和篡改反例                   |
| 隔离 Electron 交互及几何、材质检查               | 14 组全部通过，pageErrors 为空                                         |
| production 便携构建与交付                        | exit 0；9 项新包检查通过；118 个程序文件一致，432 个 data 文件散列不变 |

离线测试显式使用 `TSX_TSCONFIG_PATH=D:/tools/knorvia-studio/packages/ui/tsconfig.json`，执行：

```powershell
node --import tsx --test packages/ui/test/studio-kernel-rail.test.ts packages/ui/test/studio-navigation.test.ts packages/ui/test/studio-kernel-catalog.test.ts packages/ui/test/studio-kernel-send-gate.test.ts packages/ui/test/studio-agent-store.test.ts packages/ui/test/settings-plugin-navigation.test.ts packages/ui/test/plugin-settings-visibility.test.ts packages/ui/test/appearance-preferences.test.ts packages/ui/test/studio-workflow.test.ts packages/ui/test/studio-workflow-action-scope.test.ts
node scripts/studio-activity-rail-smoke.mjs D:/tools.cache/knorvia-toolchain/electron-v41.0.3-win-x64/electron.exe
node --import tsx --test packages/desktop/test/portable-upgrade-preserves-data.test.ts packages/desktop/test/knorvia-isolation.test.ts
```

新增隔离场景由 `scripts/studio-page-layout-smoke.mjs` 和 `scripts/studio-page-materials-smoke.mjs` 承载。用真实页面动作测量，偏好开关、上传本地背景与系统媒体查询均走真实入口；仅内核发现与模型目录使用离线夹具，不启动 CLI 或推理。工作流只在临时目录创建空白定义并打开画布，不运行节点。测试窗口隐藏，不接触用户的便携 data。

最终交互结果：`C:/Users/17018/AppData/Local/Temp/knorvia-activity-rail-AfawaQ/result.json`；日志：`D:/tools.cache/knorvia-page-surfaces-smoke-20260926.log`。

输入框实测（CSS px）：

| 窗口       | Knorvia 输入框 y | Codex 输入框 y | 项目区域 y    | 输入框宽度 |
| ---------- | ---------------- | -------------- | ------------- | ---------- |
| 1360 × 900 | 494.0521         | 494.0521       | 双方 454.0521 | 双方 672   |
| 1100 × 650 | 421.5521         | 421.5521       | 双方 381.5521 | 双方 672   |

左右位置、高度、问候语坐标亦一致。900 × 650 的工具页无横向溢出，设置入口可达。深浅主题下页面结构背景为透明，公共工作面及表单、详情保持阅读材质。玻璃关闭且背景关闭、系统减少透明度时，工作面恢复不透明。

如实记录中间失败：修改前回归测到 12 px 偏差并失败；最初离线命令缺少 UI tsconfig，4 个测试文件无法解析别名，补上已有配置后 61 项通过。扩充脚本触发行数限制，拆分职责后 lint 清零；一次 E2E 选择器命中嵌套两个 aside，收窄到直接侧栏容器后完整重跑通过。以上失败均没有计为通过。

## 便携版交付

2026-09-26 23:34（北京时间）已覆盖 `C:/Users/17018/Desktop/Knorvia Studio Portable`。复制前确认构建目录和目标目录均没有运行中的程序；交付脚本使用 robocopy `/E`，排除源与目标的 `data`，没有额外备份。

- 完整运行 `node packages/desktop/scripts/bundle.mjs --os win --arch x64`，`KNORVIA_ENV=production`；只跳过远程资源下载，运行时准备和源码构建都执行。复用 `dist-workspace-outline` 输出目录。
- renderer 构建：7620 modules，17.90 秒；electron-builder：404952 ms；运行依赖完整性、原生资源、node-pty 与包大小检查均通过。打包期间提示缺失的 22 个运行模块由已有流程补齐，最终依赖检查 exit 0。Vite 大 chunk、构建器依赖收集及 Node 弃用提示仍存在；没有将这些提示写成错误。
- 实际成品启动：9 项检查全部通过；product 为 Knorvia Studio，版本 0.8.0-preview.3，`isPackaged=true`，隔离 data 生效，页面错误与本地资源错误均为空。确认新创作页材质、全宽工具页、插件布局、侧栏恢复和 10 个图标在成品里可用。
- 覆盖前后：`data` **432 个文件、215 个目录、55,061,649 字节**，逐文件路径、大小与 SHA-256 全部一致。**118 个程序文件**与构建产物逐文件 SHA-256 一致；robocopy exit 3（成功，有更新）。
- EXE SHA-256：`50756801B1E3FD4F11945F6AF1574C5707D652FFCB136741BBAB405F42524D19`。
- app.asar SHA-256：`60C231828F4F196D7DB7682A90B8D0F4F1FAA57608DC0D584C3D45D75F186349`。

成品检查：`C:/Users/17018/AppData/Local/Temp/knorvia-packaged-surfaces-vbJh9T/result.json`。构建、成品检查与交付日志分别为 `D:/tools.cache/knorvia-page-surfaces-bundle-20260926.log`、`D:/tools.cache/knorvia-page-surfaces-packaged-smoke-20260926.log`、`D:/tools.cache/knorvia-page-surfaces-delivery-20260926.log`；最终收据在便携目录 `构建校验.json`。目标说明同步更新，原历史验收记录保留。

## 未验证项与交付边界

按用户要求跳过人工目视复核。上述材质验证是计算样式、DOM 几何和真实设置动作，不声称 Windows 原生桌面合成效果已目视通过；macOS、Linux 和手机 Web 未运行实机验收。成品未签名。没有生产服务器访问或付费模型调用。源码与本记录一并提交，目标为 `accomplish07zrh-eng/knorvia-studio` 的 main；便携程序及 data 不作为 Git 文件上传，线上发行版没有变化。

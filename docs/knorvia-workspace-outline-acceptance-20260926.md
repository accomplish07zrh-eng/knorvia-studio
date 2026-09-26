# 工作面轮廓、插件入口与内核图标验收

2026-09-26，Windows x64，Node 24.14.0。源码基线为 main 分支的 `eddad4fd95331ddac7f5097805314b36ab221783`，在已有未提交工具栏改动上继续修改，保留原有成果。

## 完成内容

采用用户最后确认的 `IMG_20260926_220318.png` 红线轮廓。此前的活动聊天截图不作为布局参考；问候和输入框的位置保留。

- 最左侧 56px 工具栏位于外框之外。第二列会话列表与主内容共用一个圆角工作面，40px 标题栏位于上方；设置页采用同一结构。内部只保留分隔线，去除重复圆角、边框和阴影。
- 标题栏复用原历史导航、搜索和侧栏开关的回调，帮助与窗口控制只保留一组。设置覆盖工作区时，标题栏中的工作区导航也一并隐藏，避免 portal 绕过 inert。宽窄 Web 布局切换保留同一父组件结构，避免重新挂载聊天。
- 插件入口移至最左侧，直达既有插件管理页面。宽布局移除设置侧栏中的重复入口，窄 Web 保留原入口；没有新增插件页面或第二份插件状态。
- 共用 `StudioKernelIcon` 改用 10 份透明矢量素材，统一图标尺寸和深浅主题表现，去除快捷栏的全局灰度滤镜。原有无需替换的产品素材继续使用。
- 玻璃模式由共同工作面提供阅读底色，内部会话与设置面板透明，避免多层底色叠加。

图标来自 [Lobe Icons](https://github.com/lobehub/lobe-icons)，保留原始文件字节，不声称由厂商直接提供。来源与 SHA-256 记录于 `packages/ui/src/assets/cli-icons/kernel-icon-sources.json`。MIT 许可保存在 `third-party/ui/lobe-icons-LICENSE.txt`，桌面打包配置会将其复制到 `resources/licenses/lobe-icons-LICENSE.txt`。本轮 10 个文件与来源清单的散列比对一致。

## 所有权与改动范围

继续沿用唯一 `useStudioNavigation`、既有草稿 Store、tabStore 和设置分区状态。新增 `StudioWorkspaceFrame` 仅持有共同外框和标题栏 portal 挂载点，不接管业务导航。没有新增运行时、Service、Host 或 RPC 边界。

规格已更新至 [工具栏与内核切换条](../specs/knorvia-activity-rail.md)，AGENTS.md 与 DESIGN.md 同步记录了新的界面约束。架构上下文检查中 ui 与 desktop 无额外受管契约，变更前后架构检查均无新增违规。

最终 tracked diff 相对于基线为 24 个文件、553 行增加、299 行删除，包含上一轮工具栏改动，不代表本次调整的独立净变化；新组件、图标、测试脚本和文档另为未跟踪文件。未提交、未推送，未改动 Git 历史。

## 实际验证

| 检查                                         | 结果                                                 |
| -------------------------------------------- | ---------------------------------------------------- |
| `node scripts/check-workspace-freshness.mjs` | 通过；main 与 origin/main 一致，ahead 0 / behind 0   |
| `pnpm typecheck`                             | exit 0；包含 desktop main，5417 个中英文键一致       |
| `pnpm lint`                                  | exit 0；2718 files，0 errors / 0 warnings            |
| `pnpm architecture:check --changed`          | exit 0；violations 0 / baseline 0 / new 0            |
| 下列 7 个文件的离线回归                      | 41 passed / 0 failed / 0 skipped                     |
| `KNORVIA_ENV=production` 下的 renderer 构建  | exit 0；7620 modules，24.32s                         |
| 隔离桌面交互                                 | exit 0；10 组通过，page errors 0 / resource errors 0 |
| 图标来源清单散列检查                         | 10 files，0 mismatches                               |
| `git diff --check`                           | 通过                                                 |

离线回归在设置 `TSX_TSCONFIG_PATH=packages/ui/tsconfig.json` 后执行：

```text
node --import tsx --test packages/ui/test/studio-kernel-rail.test.ts packages/ui/test/studio-navigation.test.ts packages/ui/test/studio-kernel-catalog.test.ts packages/ui/test/studio-kernel-send-gate.test.ts packages/ui/test/studio-agent-store.test.ts packages/ui/test/settings-plugin-navigation.test.ts packages/ui/test/plugin-settings-visibility.test.ts
```

构建命令为 `pnpm --filter @knorvia/desktop exec vite build`，日志为 `D:/tools.cache/knorvia-workspace-outline-renderer-20260926.log`。大于 500 kB 的 chunk 与插件耗时提示仍存在。

交互命令：

```text
node scripts/studio-activity-rail-smoke.mjs D:/tools.cache/knorvia-toolchain/electron-v41.0.3-win-x64/electron.exe
```

最终结构化结果为 `C:/Users/17018/AppData/Local/Temp/knorvia-activity-rail-arph08/result.json`。十组检查覆盖：工具栏与有界内核区、共同圆角工作面与唯一标题栏、透明 SVG 加载、五个工具切换、同内核及设置往返保留草稿和 inert、插件直达与入口去重、跨内核草稿隔离、键盘访问溢出内核、第二列收起、深浅材质与短窗口可达性。

测试构建最新 renderer，使用本地 main、隔离 AppData/Home/Studio 数据目录和内核/模型夹具。真实编辑器输入通过仓库的 Lexical 桥接更新，验证实际草稿持久化。测试进程已退出，没有调用模型或外部 CLI。

## 后续便携版覆盖

用户随后要求更新便携包。2026-09-26 22:56（UTC+8）已覆盖 `C:/Users/17018/Desktop/Knorvia Studio Portable`，包含本次共同圆角外框、插件入口和透明图标改动。没有额外备份，版本仍为 `0.8.0-preview.3`，未发布新的在线发行版。

使用 Node 24.14.0，设置 `KNORVIA_ENV=production`，执行 `node packages/desktop/scripts/bundle.mjs --os win --arch x64`，没有跳过准备或构建。另设置 `KNORVIA_SKIP_REMOTE_ASSETS=1`、`KNORVIA_PORTABLE_BUILD=0`、`KNORVIA_DESKTOP_DIST_DIR=dist-workspace-outline` 和 `CSC_IDENTITY_AUTO_DISCOVERY=false`。覆盖来源为 `packages/desktop/dist-workspace-outline/win-unpacked`；目标已有便携标记保留并校验。

| 检查                                                | 实际结果                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 覆盖前 `node scripts/check-workspace-freshness.mjs` | 通过；main 与 origin/main 同步，ahead 0 / behind 0                                              |
| `pnpm typecheck`                                    | exit 0；包含 desktop main，5417 个中英文键一致                                                  |
| `pnpm lint`                                         | exit 0；2718 files，0 errors / 0 warnings                                                       |
| `pnpm architecture:check --changed`                 | exit 0；violations 0 / baseline 0 / new 0                                                       |
| 便携升级和身份隔离测试                              | 14 passed / 0 failed / 0 skipped                                                                |
| 完整 Windows x64 打包                               | exit 0；最终运行依赖、原生资源和 node-pty 校验通过；生成的安装产物 142.9 MiB，小于 500 MiB 限制 |
| 实际打包程序的隔离检查                              | exit 0；7 组通过，page errors 0 / resource errors 0                                             |
| 程序目录覆盖                                        | robocopy code 3，无复制失败；118 个程序文件 SHA-256 与新构建一致                                |
| 用户 data                                           | 430 个文件、214 个子目录、54,950,970 字节；覆盖前后逐文件路径、长度及 SHA-256 一致              |

本次离线回归命令：

```text
node --import tsx --test packages/desktop/test/portable-upgrade-preserves-data.test.ts packages/desktop/test/knorvia-isolation.test.ts
```

实包检查使用 `D:/tools.cache/knorvia-workspace-outline-packaged-smoke-20260926.mjs`，启动刚生成的 `win-unpacked/Knorvia Studio.exe`，没有替换 renderer 或使用模型目录夹具。独立 `KNORVIA_PORTABLE_DIR` 将测试配置写入临时目录，保留 Windows 的正常 AppData 环境。七组断言覆盖：新增图标许可字节一致、production 身份及隔离数据位置、56px 工具栏、共同圆角工作面和唯一标题栏、插件直达与 inert 边界、实际 Agent 管理中全部 10 个新 SVG 解码、设置往返和配置持久化。没有发送模型消息或连接远程服务器，测试进程已退出。

结构化结果：`C:/Users/17018/AppData/Local/Temp/knorvia-packaged-outline-Xo9pa9/result.json`。完整构建日志：`D:/tools.cache/knorvia-workspace-outline-bundle-20260926.log`；复制日志：`D:/tools.cache/knorvia-workspace-outline-delivery-20260926.log`。

覆盖前确认来源和目标程序均已退出，验证两个绝对路径后调用 `scripts/deliver-portable.ps1`。脚本使用 robocopy `/E`，同时排除两端的 `data`；复制前后对 data 逐文件取 SHA-256，再核对全部来源程序文件。目标《使用说明.txt》和《构建校验.json》已更新，未启动读取原有 data 的桌面实例。

最终 SHA-256：

```text
Knorvia Studio.exe  174114E371749D75CE623669BAFA7538400E418D3E7C13BE2C25C41902832F0E
resources/app.asar  E06976319B15EE23ED25B5CFDC19A5F2450B15A032EF303027F039A5A994EDE4
```

依赖收集提示由既有 afterPack 补齐，最终闭包检查通过。大于 500 kB 的 renderer chunk、插件耗时和 Node shell 参数弃用提示仍存在；程序未签名。

## 未验证与交付边界

- 按用户要求跳过目视复核。玻璃验证覆盖 CSS 材质及几何断言，未实测原生 Windows 桌面合成效果。
- 未在 macOS、Linux 或窄 Web 设备实机验收；响应式切换的组件结构已修正，但未另做窄 Web 浏览器回归。
- 桌面便携目录已按后续授权更新，新增图标许可已完成实包核验。源码和验收文档仍未提交推送，Git 历史未改动。
- 用户 data 仅作交付散列核验，文件内容没有改动。未连接 SSH、生产服务器或模型服务。

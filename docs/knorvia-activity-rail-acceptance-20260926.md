# 工具栏与内核切换条验收

2026-09-26，本地源码基线 `eddad4fd95331ddac7f5097805314b36ab221783`。

## 改动

依据 [工具栏规格](../specs/knorvia-activity-rail.md)，增加 56px 常驻窄栏：上方是单聊、群聊、自动化、工作流、创作，中段是最多四个内核快捷入口及完整菜单，下方是设置与偏好。第二列保留项目、会话、文件树、新建和历史导航，移除重复入口。设置页复用同一工具栏。

导航状态提升到常驻 Root，仍只有一个所有者。重复点击当前内核返回原会话；显式切换其他内核打开独立草稿。设置覆盖期间工作区保持 inert，收起的第二列也禁止获得键盘焦点。沿用现有黑白、纸片选中、圆形按钮、材质和中英文文案。

编辑器回归还复现了延迟初值覆盖已输入草稿的问题。现在初始回填会在卸载或 props 变化后取消，并比较最新内容，避免快速切换或后台恢复时清空新文字。

## 验证记录

Node 24.14.0，Windows x64。

| 检查                                             | 实际结果                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `node scripts/check-workspace-freshness.mjs`     | 通过；开始时 main 与 origin/main 一致，ahead 0 / behind 0           |
| `pnpm typecheck`                                 | 通过；包含 desktop main，5417 个中英文键一致                        |
| `pnpm lint`                                      | 通过；0 errors / 0 warnings                                         |
| `pnpm architecture:check --changed`              | 通过；violations 0 / baseline 0 / new 0                             |
| 下列 5 个文件的离线回归                          | 33 passed / 0 failed                                                |
| `pnpm --filter @knorvia/desktop exec vite build` | 通过；7616 modules，28.02s；仍有大于 500 kB 的 chunk 及插件耗时提示 |
| 隔离桌面交互                                     | 7 组通过，脚本 exit 0；renderer errors 0 / resource errors 0        |

离线回归设置 `TSX_TSCONFIG_PATH=packages/ui/tsconfig.json` 后运行：

```text
node --import tsx --test packages/ui/test/studio-kernel-rail.test.ts packages/ui/test/studio-navigation.test.ts packages/ui/test/studio-kernel-catalog.test.ts packages/ui/test/studio-kernel-send-gate.test.ts packages/ui/test/studio-agent-store.test.ts
```

交互脚本：`node scripts/studio-activity-rail-smoke.mjs D:/tools.cache/knorvia-toolchain/electron-v41.0.3-win-x64/electron.exe`。

最终结构化结果：`C:/Users/17018/AppData/Local/Temp/knorvia-activity-rail-PqLVvY/result.json`。测试进程已退出。

七组断言覆盖工具栏宽度与入口去重、五个工具切换、同内核及设置往返保留草稿和 inert、跨内核草稿隔离、键盘选择溢出内核、收起第二列、深浅主题与玻璃 CSS 继承和短窗口访问。输入通过仓库已有 Lexical 桥接更新真实编辑器并验证 onChange 持久化，不直接改写草稿 Store。

脚本将最新 renderer 构建到临时目录并以本地文件加载，使用独立 AppData、Home 和 Studio 数据目录；内核发现及模型目录使用夹具，不执行外部 CLI，不发送消息。窗口隐藏，测试进程内关闭后台节流并模拟焦点。

早期启动因 Windows 用户目录重定向无法解析 `appData`，即本轮用户截图中的错误；临时 bootstrap 已在导入 main 前显式设置路径。HTTP 开发/预览加载曾出现空白和动态资源失败，现使用 `file:` 加载。脚本曾误读草稿存储层级，已改为验证实际持久化 envelope；随后复现的延迟回填问题已在源码修复。上一轮七组断言均通过、renderer/resource errors 均为 0，但末尾截图超时，未记为脚本通过。最终脚本按用户要求跳过目视复核，移除了截图环节。

## 后续便携版覆盖

用户随后明确要求覆盖桌面便携包。2026-09-26 21:50（UTC+8）已完成，目标为 `C:/Users/17018/Desktop/Knorvia Studio Portable`；没有额外备份，也没有修改版本号或发布新的在线发行版。

使用 Node 24.14.0 和 `KNORVIA_ENV=production` 执行 `node packages/desktop/scripts/bundle.mjs --os win --arch x64`。本地环境同时设置 `KNORVIA_SKIP_REMOTE_ASSETS=1`、`KNORVIA_PORTABLE_BUILD=0`、`KNORVIA_DESKTOP_DIST_DIR=dist-activity-rail` 和 `CSC_IDENTITY_AUTO_DISCOVERY=false`。覆盖来源为 `packages/desktop/dist-activity-rail/win-unpacked`，目标已有的便携标记保留并校验。

| 检查                                                    | 实际结果                                                                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 覆盖前重跑 `node scripts/check-workspace-freshness.mjs` | **未通过**；GitHub fetch exit 128，`schannel: failed to receive handshake, SSL/TLS connection failed`。远端新鲜度在本次覆盖前未重新核验，按用户允许跳过问题的指示继续本地交付 |
| `pnpm typecheck`                                        | 通过；包含 desktop main，5417 个中英文键一致                                                                                                                                  |
| `pnpm lint`                                             | 通过；2717 files，0 errors / 0 warnings                                                                                                                                       |
| `pnpm architecture:check --changed`                     | 通过；violations 0 / baseline 0 / new 0                                                                                                                                       |
| 下列便携升级与身份隔离测试                              | 14 passed / 0 failed / 0 skipped                                                                                                                                              |
| 完整 Windows x64 打包                                   | exit 0；运行依赖、原生资源及 node-pty 检查通过；生成的 Windows 安装产物 143.2 MiB，小于 500 MiB 限制                                                                          |
| 实际打包程序的隔离启动                                  | 4 组通过，exit 0，page errors 0；未出现截图中的 appData 启动异常                                                                                                              |
| 目录覆盖                                                | 完成；robocopy code 3，无复制失败；118 个程序文件 SHA-256 与新构建一致                                                                                                        |
| 用户 data                                               | 431 个文件、214 个子目录、54,930,656 字节；覆盖前后逐文件路径、长度、SHA-256 一致                                                                                             |

```text
node --import tsx --test packages/desktop/test/portable-upgrade-preserves-data.test.ts packages/desktop/test/knorvia-isolation.test.ts
```

实际启动使用 `D:/tools.cache/knorvia-activity-rail-packaged-smoke-20260926.mjs`，运行本次生成的 `win-unpacked/Knorvia Studio.exe`，没有使用 renderer 夹具。通过独立 `KNORVIA_PORTABLE_DIR` 将测试配置写入临时目录，保留正常的 Windows 用户目录环境，避免测试环境再次破坏 appData 解析。四组断言覆盖 production 产品身份及隔离数据位置、真实打包界面的 56px 工具栏、设置往返和临时目录内的配置持久化。测试窗口隐藏，未发送模型消息；测试进程已退出。

启动结果：`C:/Users/17018/AppData/Local/Temp/knorvia-packaged-rail-PmURc8/result.json`。完整构建与复制日志分别为 `D:/tools.cache/knorvia-activity-rail-bundle-20260926.log`、`D:/tools.cache/knorvia-activity-rail-delivery-20260926.log`。

覆盖前确认目标目录下没有运行中的程序，随后调用仓库维护的 `scripts/deliver-portable.ps1`。它使用 robocopy `/E` 并排除来源及目标的 `data`，不删除目标独有文件；复制前后逐文件核对 data，再核对全部来源程序文件。已更新便携目录的《使用说明.txt》和《构建校验.json》，未启动使用原有 data 的桌面实例。

最终 SHA-256：

```text
Knorvia Studio.exe  94A22DC3ED05F8C8BA365189329747996E1041F7CA0933D129252B1E46B04B1F
resources/app.asar  6CBD15AD3D5A8F0BD6020009662929D5090547FAD1E7FB132CF7CA5BB3970A73
```

打包日志中的依赖收集提示由既有 afterPack 补齐，最终运行依赖校验通过。大于 500 kB 的 renderer chunk、插件耗时和 Node shell 参数弃用提示仍存在；没有把这些提示写成构建失败，也没有将远端检查失败记为通过。

## 边界

- 按用户要求跳过目视复核。材质检查仅覆盖 CSS token 继承，未验证原生 Windows 玻璃的桌面合成效果。
- 未在 macOS、Linux 或窄 Web 设备实机验收；窄 Web 保留既有导航路径。
- 未连接模型服务、SSH 或生产服务器；未做联网推理。
- 桌面便携程序已按后续授权更新；用户 data 保持不变。本轮源码与验收文档尚未提交或推送远端，Git 历史未改动。

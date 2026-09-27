# 本地稳定性收尾（2026-09-27）

本轮完成用户选择的三项：升级数据保护、三条打包界面流程验收、启动优化与界面回归。基线 `d4b5515`，工作目录 `D:/tools/knorvia-studio`，Node 24.14.0 / pnpm 10.33.2；保留既有工作与黑白视觉语言。

## 完成结果

1. **升级保护**：Agent 会话库迁移前保存包含已提交 WAL 的一致快照；快照失败停止升级。Agent 与任务索引拒绝任意未知迁移 id，并给出明确、不可由旧程序直接重试的提示。真实 SQLite、故障注入、进程中断和并发启动均有回归。见 [升级记录](knorvia-upgrade-protection-20260927.md)。
2. **打包验收**：三个技能包实际安装、启停和重开状态 5/5；多文件接纳、冲突保留、业务身份收据与重开 3/3；图片生成、人工批准、参考图编辑、界面解码和重开不重放 7/7。合计 **15/15**，全部使用真实新包与隔离资料。新增 `pnpm test:studio:packaged` 统一入口。见 [打包记录](knorvia-packaged-acceptance-20260927.md)。
3. **启动与界面**：存储准备直达既有存储实现，减少通用 CLI/Agent 模块加载；不提前宣称 ready，不略过数据库工作。两轮顺序相反的共 20 次测量中，冷启动中位数 **3866.5→3711.5 ms**，暖启动 **3695→3464.5 ms**；数据库准备两轮首冷均值 **1898→1647 ms**。**3 秒目标未达**。14 组输入框几何、侧栏、草稿、材质与短窗口回归通过，并提供 `pnpm test:studio:ui` 入口。见 [性能记录及全部样本](knorvia-startup-performance-20260927.md)。

## 实际门禁

| 命令/检查                                                         | 结果                                                                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/check-workspace-freshness.mjs`                      | 退出 0，main 相对 origin/main 0 ahead / 0 behind                                                                                    |
| `pnpm typecheck`                                                  | 退出 0，包含桌面 main；中英文 5419 键一致                                                                                           |
| `pnpm lint`                                                       | 退出 0，0 warnings / 0 errors                                                                                                       |
| `pnpm architecture:check --changed`                               | 退出 0，0 violations / 0 baseline / 0 new                                                                                           |
| `pnpm --dir apps/cli typecheck` / `lint`                          | 均退出 0                                                                                                                            |
| `pnpm build:cli-packages`                                         | 16/16 构建成功                                                                                                                      |
| `pnpm test:studio`                                                | **838 tests / 838 pass / 0 fail / 0 skipped**                                                                                       |
| `pnpm test:studio:packaged '<仓库外完整新包>/Knorvia Studio.exe'` | **15/15，通过**                                                                                                                     |
| `pnpm test:studio:ui '<固定 Electron 41.0.3>/electron.exe'`       | **14 组，通过**                                                                                                                     |
| 生产构建                                                          | `KNORVIA_ENV=production node packages/desktop/scripts/bundle.mjs --os win --arch x64` 退出 0；安装产物 142.9 MiB，低于 500 MiB 门限 |

程序产物为 `packages/desktop/dist-stability-20260927/win-unpacked`，最终验收使用其完整外置副本 `D:/tools.cache/knorvia-candidate-20260927/win-unpacked`。源码目录内的包会沿父目录误用开发 CLI，现已由验收入口明确拒绝；全部最终结果核对了包路径、散列及 resourcesPath。

## 未验证与交付状态

没有调用真实模型、外部 CLI、付费服务或生产服务器；技能安装成功不代表模型输出质量或跨内核支持已经验证。媒体证据覆盖图片生成与参考图编辑，不扩展为视频或 Agent 理解图片。人工目视与原生玻璃观感继续按用户要求跳过；大库升级、真实断电与磁盘耗尽未实机测试。

本轮完成本地源码、文档和生产构建验收，**源码尚未提交、推送或创建 Release**。随后按用户“覆盖”授权交付桌面便携版：118 个程序文件核对一致，439 个 data 文件及 215 个目录未变化，覆盖后隔离启动通过，见 [便携交付记录](knorvia-portable-delivery-20260927.md)。真实用户数据与运行中的旧便携程序未改动。历史报告保留当时的验证边界，当前任务表和桌面规划已更新到本记录。

# Knorvia Studio 当前交付验收

2026-09-24。按用户最新范围，完成插件替换、首页侧栏与玻璃修复、私有快照提交和便携版覆盖后停止；不继续开展凭据安全审计或下一阶段功能。

## 保护与源码

- 完整工作区备份：D:/tools/knorvia-stage0-backup-20260924-195205/workspace，排除 node_modules。源与备份均 26,938 个文件，路径/大小无差异，关键文件散列核验一致。
- 原 Git 历史仅保留在本地备份引用；远端仅发布最新预览版快照。refs/backup/pre-ui-redesign-20260924 保留。
- GitHub 插件确认 accomplish07zrh-eng/knorvia-studio 为 private，仓库 ID 1385394772。只推送 origin，不推送 upstream。
- 提交身份为 Knorvia / accomplish07zrh@gmail.com，仅本仓库配置。源码快照排除用户 data、便携包、凭据和测试缓存。
- 候选快照密钥扫描为 0。27 项原始命中均是第三方 inventory 的已审阅校验和；与上次核验文件逐字节一致，只按具体指纹处理，没有目录级豁免。

## 插件替换

八项新插件已进入构建与启动清单。具体版本、作者范围、依赖归属和原件备份见[插件记录](knorvia-plugin-license-audit.md)。原目录位于仓库外，不参与新版本发布。

- 由实际构建的 Agent 在隔离配置中执行 plugins list --json：8 项存在，全部默认启用，error 诊断为 0。
- 源资产、staged 资产和隔离安装缓存逐文件 SHA-256 一致：browser-use 14、node-repl-host 6、四个内容插件各 6、plugin-creator 11、skill-creator 4，共 59 个文件。缓存没有残留资产。
- 上述 staged 插件包括生成的运行 bundle，扫描旧产品/厂商字段为 0，不绑定具体模型提供商。
- 四类真实生成文件通过新结构检查器；Python 预检覆盖恶意/损坏包。创建器真实宿主校验通过，覆盖越界、符号链接、锁冲突和保留用户文件。
- 新宿主 10 项测试通过：真实 stdio 调用、连续调用与模块缓存隔离、超时后继续服务、同会话排队、子代理拒绝、过期/取消 bridge、输出来源防伪及局部鉴权。

## 本地质量检查

| 命令                              | 结果                                   |
| --------------------------------- | -------------------------------------- |
| pnpm typecheck                    | 退出 0，已包含 desktop main            |
| pnpm lint                         | 0 错误、0 警告                         |
| pnpm architecture:check --changed | 0 违规、0 baseline、新增 0             |
| pnpm --dir apps/cli typecheck     | 退出 0                                 |
| pnpm --dir apps/cli lint          | 0 错误、0 警告                         |
| pnpm test:studio                  | 480/480 通过，0 失败、0 跳过，96.65 秒 |

日志在 D:/tools.cache/knorvia-final-typecheck.log、knorvia-final-regression.log 和 knorvia-close-cli-\*.log。Windows Actions 配置通过本地 YAML 检查，仅提供手动触发入口；未运行云端 CI，无联网推理。

## 界面与便携交付

首页纸片阴影原先误选中了顶部浮层、拖拽条与内容外壳，造成多重框线。选择器现在仅作用于实际阅读面板，与设置页统一。玻璃模式下外部内核的 section 曾保留不透明背景；现在由外层 frame 统一承载阅读底色。黑白配色、操作形状、选中纸片、字体与布局保留。

Windows 生产身份打包命令：设置 KNORVIA_ENV=production 后运行 node packages/desktop/scripts/bundle.mjs --os win --arch x64，退出 0。运行依赖与原生资源检查通过，安装包 143.2 MiB，低于 500 MiB 限制。构建出现 chunk 体积、弃用接口和 hoisted 依赖提示；打包钩子补齐 22 个运行依赖后，最终依赖检查通过。

使用实际打包程序和隔离数据，通过界面切换浅色/深色、玻璃关闭/开启、首页/外部内核聊天/设置共 12 个场景，全部通过。核验截图及计算样式：D:/tools.cache/knorvia-final-ui/verification.json。首页浮层和侧栏不再叠加纸片阴影，外部聊天玻璃背景为透明；没有调用模型。

已覆盖 C:/Users/17018/Desktop/Knorvia Studio Portable。覆盖前确认程序未运行；按用户最后指示不新增备份。仅镜像程序 resources，根目录复制排除 data；data 共 360 个文件，覆盖前后逐文件 SHA-256 全部一致。交付记录：便携目录中的构建校验.json，以及 D:/tools.cache/knorvia-portable-final-verification/verification.json。旧运行资源目录已清除，便携成品中的 8 项插件共 59 个文件与新源码、staged 资产及隔离安装缓存一致。

## 未验证及留待后续

- 凭据安全专项审计 T0.6 已在后续完成，结果见 [knorvia-security-audit.md](knorvia-security-audit.md)。
- 真实付费模型推理、生产服务器、跨设备联调、复杂 Office 版式/宏/修订保真与完整 Computer Use 未验证。
- 本轮不连接生产服务器，不调用付费模型，不新增页面或登录流程。
- 桌面规划中的本地任务均已完成并移除；最终交付状态见 [本地交付摘要](knorvia-final-local-delivery-20260925.md)。

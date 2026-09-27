# 便携版覆盖交付（2026-09-27）

用户在本地稳定性收尾后授权“覆盖”。目标为 `C:/Users/17018/Desktop/Knorvia Studio Portable`，来源为已经完成 15 项打包验收的 `D:/tools.cache/knorvia-candidate-20260927/win-unpacked`，版本 `0.8.0-preview.3`。

- 覆盖前核对 exe、asar、CLI 散列与原验收证据一致；确认源、目标和 data 及其子目录无 junction/symlink，目标目录未被程序或相关 Node 进程使用。另一个 `Knorvia Old Portable` 的既有进程未停止或改动。
- 使用既有 `scripts/deliver-portable.ps1`，robocopy `/E` 并排除源与目标 `data`，返回码 3（正常复制，存在目标独有文件）。没有删除目标独有文件，没有额外备份。
- 覆盖前后 **439 个 data 文件、59339884 字节逐文件 SHA-256 完全一致**；**215 个目录**的相对路径清单完全一致。
- **118 个程序文件**逐文件 SHA-256 与验收包一致。目标 `构建校验.json` 已写入此次回执。
- 使用临时资料启动已覆盖的目标 exe，确认生产包版本、实际 resourcesPath、隔离 userData、可交互引导页和正常退出；结果 `C:/Users/17018/AppData/Local/Temp/knorvia-delivered-startup-xZ2QAX/result.json`。启动检查前后再次比较真实 data 全部文件，仍逐字节一致。未使用用户真实配置启动，未做人工目视。
- 本次根 typecheck、lint、`architecture:check --changed` 均退出 0；便携升级回归 **7/7 通过，0 失败、0 跳过**；新鲜度检查通过。

程序 SHA-256：`725116fafd965e73f58b067d0049bba841892afaa7dc7296a2590839815af928`。

asar SHA-256：`b8776dcfd981b58cf7c2c6b853a48d948604671f135bdbb3aa21adf7d610f915`。

源码仍未提交推送，未创建 Release。此前实现和全部验收见 [本地稳定性收尾](knorvia-local-stability-20260927.md)。

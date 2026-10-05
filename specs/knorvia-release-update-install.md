# 更新检测与一键安装

2026-10-05，用户要求加入更新检测：每次更新都去 GitHub 手动重下太麻烦。本规格替代 `knorvia-stage1-local-delivery.md` T1.2 中「空 URL 不联网」「只提醒，不下载、不安装」两条；其余规则（单一设置所有者、有界 JSON、semver 比较、正式版不提示预发布版、失败不冒充最新、每 24 小时检查一次、状态不写入配置）继续有效。

## 产品规则

- 默认更新源：项目官方 GitHub 发布接口 `https://api.github.com/repos/accomplish07zrh-eng/knorvia-studio/releases/latest`。`releaseInfoUrl` 留空即使用官方源；填写后改用自定义源。「自动检查更新」开关默认开启，关闭后定时与手动检查都不发请求。
- App ready 后 30 秒首次检查，此后每 24 小时一次；发现新版本时系统通知提醒一次（同进程同版本不重复）。设置 → 常规 →「更新」可手动检查。
- 有新版本时：
  - Windows 安装版（打包、非便携）：显示「下载并安装」。Main 从发布记录的资产列表中选择与当前架构匹配的 `Knorvia-Studio-<版本>-win-<arch>-setup.exe` 及同名 `.sha256`，下载到临时目录并校验 SHA-256，一致后启动安装程序（交互式，沿用原安装目录），随后退出应用。
  - 便携版、Linux、macOS、开发态或发布中缺少匹配安装包：显示「前往下载」，打开发布页。
  - 两种情况都可打开发布说明页。
- 失败（离线、超时、HTTP 错误、校验不一致、文件过大、启动失败）显示真实原因，不退出应用、不删除已安装版本；下载的临时文件在失败时删除。

## 安全边界与状态所有者

- Settings Service 仍是 `releaseInfoUrl` / `releaseChecksEnabled` 的唯一持久所有者。
- Desktop Main 是检查结果与安装流程的唯一运行时所有者。安装 IPC 不接受任何参数：Renderer 不能传入下载地址；Main 在安装时重新检查一次，从发布记录取地址。
- 下载地址只接受 HTTPS，主机限定 `github.com`、`objects.githubusercontent.com`、`release-assets.githubusercontent.com`（GitHub 资产重定向目标）；不带凭据；安装包上限 600 MB，校验文件上限 4 KB；校验值须为 64 位十六进制。
- 同一时刻只允许一个安装流程；进行中再次请求直接返回 `busy`。

```text
Renderer「下载并安装」→ IPC install（无参数）
  → Main checkReleaseUpdate()（重新取发布记录）
  → 选择 setup.exe + .sha256（主机白名单）
  → 下载校验文件 → 流式下载安装包并计算 SHA-256（≤600MB）
  → 比对一致 → 启动安装程序（detached）→ app.quit()
  任一步失败 → 删除临时文件 → 返回 failed(reason)
```

## 验收

离线测试以替代 fetch 覆盖：留空使用官方源、关闭不发请求、资产选择（架构、便携/非 Windows 不提供安装）、主机白名单拒绝、校验一致启动安装并退出、校验不一致不启动且删除临时文件、超限拒绝、并发返回 busy。根 typecheck、lint、fmt、架构检查按实际结果报告。真实 GitHub 下载与安装需在 Windows 实机复核。

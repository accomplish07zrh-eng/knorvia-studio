<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# Windows Python 启动诊断记录

这是针对现存云端失败的诊断，尚未宣称修复。产品代码、Python 资源测试、
10 秒启动上限和发布检查未改。设计边界见[规格](../specs/knorvia-python-startup-diagnostic.md)。

## 已确认的失败

原始提交 `c439b5d991e9e52f8da3e46ebda9cf869911ff74`，run
[36581928597](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36581928597)，attempt 1：

- Linux job `109452052130`：3798 项，3791 通过、7 平台跳过。
- Windows job `109452052645`：3798 项，3797 通过、1 失败。
- 失败命令为 `C:\hostedtoolcache\windows\Python\3.13.15\x64\python.exe --version`；
  实际等待 10117.8096ms，`ETIMEDOUT` / errno -4039，status null、SIGTERM，空输出。
- 失败发生于解释器版本探测，办公资源检查脚本没有启动。原测试并发上限为 2。
  当前证据不能归因为路径引号、PATH 选择、某个 DLL 或安全软件。

## 新增的观测

手动工作流 `python-version-diagnostic.yml` 在三个全新 Windows job 中各执行
一次相同的 10 秒探测：setup 后、依赖及 CLI 构建后、与本地诊断测试并发时。
setup-python 的精确路径由环境端口传入；没有重试、回退或真实模型请求。
依赖安装禁用生命周期脚本，以免引入未记录的 Python 预热。

每次记录原生进程结果、时间与有限机器信息；启动环境只保存允许名单中的
presence/SHA-256。独占创建 JSON 并上传原始日志，任何失败保持非零状态。
成功只代表这次未复现，不追溯修改原 run 结果。

诊断草稿由独立代理根据冻结失败证据编写，根代理完整审阅并重核 11 个文件
的字节数与摘要，0 差异。草稿 manifest SHA-256 为
`3bc9b837b0ffb58e0e278aafb180f68c67527b08b0b3c3ad5802c84a9b36cfa6`；
初始接入仅增加许可头。仓外原件、读取账及首轮有限验证保存在
`D:/tools.cache/knorvia-python-ci-diagnostic-draft`；接入证据保存在
`D:/tools.cache/knorvia-python-ci-integration`。

## 验证状态

接入后实测 `pnpm typecheck` 通过（含 desktop main，5422 个中英文键一致）；
`pnpm lint` 检查 2785 文件，0 警告、0 错误；
`pnpm architecture:check --changed` 为 0 违例。

8 项有限验证通过：单次假进程成功、超时、非零退出、异常版本输出、信号退出，
证据文件排他写入，以及 direct/node:test 两种真实 Node 目标控制。两个 Node
目标均产生原生状态 0，再因并非 Python 3.13 正确使诊断退出 1；原日志保留。
这些验证没有运行 Python，也不证明其可启动。诊断之外没有产品代码变动，
因此本次没有重复本地完整 3798 项回归。推送后的原始云端结果如下。

## 推送后观测

受检提交 `bf4fb5c7da7f8cfc3bf2111defd03805f1689fcc` 的原始质量
[run 36595564060](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36595564060)
（attempt 1）双平台成功，全部前置步骤成功。Windows job `109499439400`
为 3798/3798，0 失败、取消、跳过，471782.2966ms；Linux job `109499439740`
为 3791 通过、7 平台跳过、0 失败/取消，212673.522328ms。

手动诊断 [run 36595606453](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36595606453)
（attempt 1）三个独立 Windows job 均成功，每个只执行一次原定的 10000ms 探测。

| 阶段               | job          | 耗时        | 原生结果                 |
| ------------------ | ------------ | ----------- | ------------------------ |
| Python 设置后      | 109499597977 | 816.1014ms  | status 0，Python 3.13.15 |
| 依赖与 CLI 构建后  | 109499598660 | 581.6628ms  | status 0，Python 3.13.15 |
| 与本地诊断测试并发 | 109499598217 | 3205.0795ms | status 0，Python 3.13.15 |

三个进程的 error、signal 均为空；并发作业的两项测试通过。运行环境为
Node 24.14.0、Windows Server 2025，image `win25-vs2026 / 20260925.250.1`。
这只表示原始 Python 启动超时在本次未复现，原因仍未确定，也不构成修复。
原始失败保留，未重跑、增加重试、预热或延长时限。

根核对受检提交、attempt、全部步骤与完整原始 job 日志。元数据、五份日志和
本地摘要保存在上述接入目录的 `remote-final-run-metadata.json`、
`remote-job-*.json`、`remote-log-receipt.json`。GitHub 返回的三个诊断 artifact
metadata/digest 已记录，但 ZIP 未下载，不声称做过 ZIP 的本地散列核验。
这次云端结果不覆盖之后才接入的插件存储或模型替换，也不证明桌面打包结果。

主许可证、预览版号、现有发布记录保持不变。

格式检查首轮仅来源复核清单的 JSON 排版失败，原输出保留；对该清单格式化
后重新生成来源报告，再检查最终格式和来源一致性，不改变其复核决定。

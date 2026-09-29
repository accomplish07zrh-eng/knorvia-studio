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
因此本次没有重复本地完整 3798 项回归。新云端观测仍待推送后执行。

主许可证、预览版号、现有发布记录保持不变。

格式检查首轮仅来源复核清单的 JSON 排版失败，原输出保留；对该清单格式化
后重新生成来源报告，再检查最终格式和来源一致性，不改变其复核决定。

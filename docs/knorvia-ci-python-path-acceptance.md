<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# CI Python 解释器路径验收

2026-09-29。基线 `0c4a64d4243b188647636bef108de5f05cce496e`，先更新[测试稳定性规格](../specs/knorvia-test-stability.md)，再修改可复用质量工作流。

## 问题与改动

历史 GitHub run [36442320129](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36442320129) 的 Windows 结果为 2,258 通过、1 失败；office 测试的两个解释器版本探测各遇到 ETIMEDOUT，资源检查脚本没有开始。setup-python 已安装 CPython 3.13.15，但缺少实际命中路径证据，首因仍未确定。本机原样测试 2/2 通过只说明未复现。

工作流给 setup-python 步骤增加 id，并将其 `python-path` 输出传入离线回归步骤的既有 `KNORVIA_TEST_PYTHON`。安装步骤决定使用哪个解释器，测试仍负责真实版本探测及资源检查；显式路径失败就报错，不回退、不跳过，也不延长现有 10 秒/30 秒预算。输出含义依据该失败 runner 使用的[官方 action 声明](https://github.com/actions/setup-python/blob/a26af69be951a213d495a4c3e4e4022e16d87065/action.yml)。本次消除选择歧义，不宣称已修复历史超时。

没有改测试期望、测试数量、产品代码、模型配置、数据或 UI，也没有新增环境变量。Windows 与 Linux 复用同一输出绑定，不硬编码安装位置。配置与旧规格保持原有来源状态，本报告仅为新的验收记录，不能据小改动认定整个工作流为独立实现。

## 已运行

- 开工 freshness 通过：main 与 origin/main 同步，ahead 0 / behind 0。
- 读取架构策略后确认 `.github/workflows` 与测试路径不在管理源代码根内；desktop 为未管理模块。最初误用未注册的 `tooling` 上下文命令退出 1，纠正为实际 desktop 上下文后成功；前后架构检查均为 0 违规/基线/新增，不改政策或基线来放行。
- 固定 Node v24.14.0，以本机实际 CPython 3.13.14 的绝对可执行路径设置同一个环境变量，运行 `node --test packages/desktop/test/office-plugin-assets.test.mjs`：**2/2 通过**，0 失败/跳过/取消，979.0674 ms。覆盖既有解析器显式路径成功/失败不回退，以及真实 Python 资源检查脚本。
- `pnpm typecheck` 通过，含 desktop main；中英文 5,422 键及值/占位符匹配。
- `pnpm lint` 通过：2,781 文件、0 警告/错误。
- `pnpm architecture:check --changed` 通过：0 违规、0 基线、0 新增。

格式、来源新鲜度及暂存扫描作为提交前门禁单独记录。没有为这项工作流配置改动重复构建产品或重跑整套本机回归；基线的 **2,326/2,326** 是此前会话门面提交的实际结果，不能冒称本配置新提交的完整验证。

## 提交后的 CI 实证

检查点 `3e0192215e90fee24c1715b24ea7a62ef8a2bb52` 已提交并推送。GitHub run [36451934515](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36451934515) 的两平台 job 和全部质量步骤均成功；主代理通过插件读取实际日志，而非仅依赖绿色状态：

- Windows job `109028929333`：离线步骤的 `KNORVIA_TEST_PYTHON` 为 setup-python 安装的 CPython 3.13.15 `python.exe` 绝对路径；**2,326/2,326 通过**，0 失败/跳过/取消，341837.3524 ms。office 资源检查本身通过，4449.2638 ms。
- Linux job `109028929586`：同一环境变量为 CPython 3.13.15 的 `bin/python` 绝对路径；**2,319 通过、0 失败、7 平台跳过、0 取消**，192422.873015 ms。office 资源检查本身通过，1512.707213 ms。

前一个会话门面 run `36451250014` 的两个回归步骤被后续推送触发的既有同分支取消策略中止，其结果是 cancelled，不能补记为通过。上述新 run 包含该门面提交，分别记录其真实结果。

本次证明路径绑定及这一轮检查成功，不能反向证明历史 Python 超时的具体原因已修复；另一个文档工作流交付等待超时亦未由本次修改处理。整仓独立替换、最终许可调整、稳定版双产物与官网发布继续按总目标推进。

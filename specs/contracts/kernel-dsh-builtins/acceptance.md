# kernel-dsh-builtins 验收

## 一、范围

| 项         | 内容                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 包         | `kernel-dsh-builtins`（M2 接入包）                                                                                                                                          |
| 认领 issue | #219                                                                                                                                                                        |
| 合同分支   | `contract/kernel-dsh-builtins`（基线 `origin/main` `526825db`）                                                                                                             |
| 实现分支   | `replace/kernel-dsh-builtins`（合同合并后开）                                                                                                                               |
| 依据       | 计划书「内核方案调整」（含 2026-10-20 kernel-bridge-01 审查结论）、「接入包流程」、「接入门禁」；`specs/knorvia-builtin-kernel-dsh.md`；`specs/knorvia-internal-plugins.md` |
| 前置       | `kernel-dsh-00` v1（#198）、`kernel-bridge-01` v1（#218）已合并                                                                                                             |

## 二、合同阶段（本 PR）验收

| 项                       | 判据                                                                                                | 结果   |
| ------------------------ | --------------------------------------------------------------------------------------------------- | ------ |
| 合同文件齐全             | README / behavior(B1–B24) / interface / callers / known-differences / acceptance / tests / fixtures | ✅     |
| 合同测试可立即通过的两条 | `default-engine.test.mjs`（B23/B24）                                                                | 见 §五 |
| 门禁                     | `pnpm typecheck`、`pnpm lint`、`pnpm fmt:check`、`pnpm test:studio`                                 | 见 §五 |
| CI                       | Linux 与 Windows 全绿                                                                               | 见 PR  |

接入包例外：本包无"旧实现"可录 `gate-old.json`；行为依据是 DSH 公开契约 + 旧内核当前实现的效果（只读对照）。新增路径的测试随实现 PR 落地。

## 三、实现阶段验收（替换 PR 填写）

| 项             | 判据                                                                                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 契约测试双入口 | 源码入口（`KNORVIA_KERNEL_ENTRY=source`）与 dist 入口 100% 通过、0 跳过                                                                                                                                                      |
| 上游回归       | `specs/contracts/kernel-bridge-01/tests/**` 20/20 仍全过（挂载没破坏协议面）                                                                                                                                                 |
| 基础回归       | `specs/contracts/kernel-dsh-00/tests/**` 全过（D1/D2 的期望值升级后）                                                                                                                                                        |
| 相似度         | 对旧 `core/src/context/**`、`core/src/compact/**`、`core/src/tool/**`、`core/src/permission/**` 与上游 `872ad960`：行包含率 < 0.20 且最长段 < 8（<10 行必须 0）、结构 < 0.40；normal 与 declaration 两门都跑，未过计数取并集 |
| 来源登记       | 新文件登记 `original`；DSH 子包按第三方依赖登记，不跑相似度                                                                                                                                                                  |
| 无回退路径     | 全仓搜 `not implemented: kernel-dsh-builtins` 为零                                                                                                                                                                           |
| SPDX           | 每个新文件首行 `// SPDX-License-Identifier: Apache-2.0`                                                                                                                                                                      |

## 四、审查结论两处修正的验证方式

> 这一节是本包的核心。实现 PR 必须把**真实命令与真实输出**贴进来，不接受"已挂载"式的表述。

### 修正一：工具子进程环境快照

**要证明的用户视角行为**（三条断言，缺一不可）：

| #   | 断言                                                    | 判定方式                                                                                                                                                                                                     |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (a) | 用户普通变量在 shell 工具子进程里**可见**               | 测试进程环境设 `KNORVIA_TEST_PLAIN_MARKER=<unique>`；boot 后调 shell 工具输出该变量，断言等于设定值                                                                                                          |
| (b) | **凭据形命名**的用户变量在 shell 工具子进程里**也可见** | 测试进程环境设 `MY_SERVICE_API_KEY=<unique>`（非 DSH/供应商内建名）；同上断言                                                                                                                                |
| (c) | `DSH_*` 在 shell 工具子进程里**不可见**                 | 测试进程环境设 `DSH_KNORVIA_INHERITED=<unique>`，并挂 `dsh-shell-env`（它会托管注入 `DSH_HOME`/`DSH_SHELL`）；断言子进程里 `DSH_KNORVIA_INHERITED`、`DSH_HOME`、`DSH_SHELL`、`DSH_TELEMETRY_DISABLED` 全为空 |

**附加断言**（防止"注入成功就算过"）：

| #   | 断言                                                                               | 对应条目      |
| --- | ---------------------------------------------------------------------------------- | ------------- |
| (d) | 进程级仍删 `ANTHROPIC_API_KEY`（`process.env` 里已无），但子进程里有且值等于启动时 | B12           |
| (e) | boot 后新增的 `KNORVIA_TEST_AFTER_BOOT` 不进子进程                                 | B13           |
| (f) | 快照不落盘、不进日志：日志行里不出现任何快照键名或键值                             | interface §二 |

**复现命令（实现 PR 填写实测输出）**：

```powershell
# 仓库根目录；先 pnpm build:cli-packages
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" exec node --test specs/contracts/kernel-dsh-builtins/tests/child-env.test.mjs
```

**合同阶段的可行性实测**（已完成，见 §六 E1–E7）：三条断言在执行器子类方案下**全部成立**，不需要退化成 known-differences。

### 修正二：系统提示运行环境信息

**要证明的字段清单**（取自旧内核实际产出，不是凭印象）：

| #   | 字段       | 旧内核出处                                                                                            | 断言方式                                    |
| --- | ---------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | 主工作目录 | `core/src/context/sections/env-info.ts` `buildEnvInfoSection` 的 `- Primary working directory: <cwd>` | 渲染文本含该行且值 = 会话 cwd               |
| 2   | 平台       | 同文件 `- Platform: <platform>`                                                                       | 值 = `process.platform`                     |
| 3   | shell      | 同文件 `- Shell: <shell>`                                                                             | win32 `pwsh`，POSIX `bash`                  |
| 4   | OS 版本    | 同文件 `- OS Version: <osVersion>`                                                                    | 非空且等于 `os.release()`（或等价宿主读数） |
| 5   | 当前日期   | `core/src/context/sections/current-date.ts` `Today's date is <date>.`                                 | 值 = 注入时钟的本地日期                     |
| 6   | 时区       | 旧内核由宿主日期采集间接体现；本包显式给出 IANA 时区                                                  | 非空                                        |

**附加断言**（防止打开开关就算过）：

| #   | 断言                                                                                                                                                                                                    | 对应条目                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| (g) | 日期与 cwd **随装配时刻变化**（两次不同时钟/会话 → 不同值），证明是求值不是常量                                                                                                                         | B15                       |
| (h) | 装配结果**无 DSH 品牌**：不含 `powered by DeepSeek Harness`、不含 `You are an AI agent powered by DeepSeek Harness.`、不含 `@deepseek-ai/`、`sections` 无 `harness:identity`，且以 Knorvia persona 开头 | B16                       |
| (i) | `includeHarnessIdentity:false` 保持不变                                                                                                                                                                 | B16 / `kernel-dsh-00` B11 |

**复现命令（实现 PR 填写实测输出）**：

```powershell
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" exec node --test specs/contracts/kernel-dsh-builtins/tests/runtime-context.test.mjs
```

## 五、门禁（合同 PR 实测）

在 `wt/exec-kernel`（`contract/kernel-dsh-builtins`）跑，命令与结尾输出：

```powershell
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" typecheck
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" lint
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" fmt:check
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" build:cli-packages
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" test:studio
```

结果：见本 PR 描述（贴结尾输出）。**失败如实写。**

## 六、可行性实测记录（合同阶段已做，2026-10-20，Node 24.14.0 / Windows）

> 这些探针在仓库外的临时目录对 `@deepseek-ai/dsh@0.2.0-rc.2` 运行，只用于确认"两处修正能用公开 API 做到"，**不是契约测试**。探针代码不入库（避免把 DSH 侦察工件当产品代码）；结论与输出记录在此。

### E1 三条断言全部成立（执行器子类 + 丢弃 `dshEnv`）

组合：`llm` + `system-prompt`(`includeHarnessIdentity:false`) + `tools` + `subprocess`(`dsh-subprocess-local`) + `shell-env`(`dsh-shell-env`) + `shell`(Knorvia 子类插件)
启动前环境：`KNORVIA_PROBE_PLAIN=plain-value`、`MY_SERVICE_API_KEY=user-credential-value`、`DSH_KNORVIA_ECHO_TEST=host-inherited-dsh-value`、`DSH_HOME=<temp>`

```text
CHILD ENV (dshEnv dropped): {"KNORVIA_PROBE_PLAIN":"plain-value","MY_SERVICE_API_KEY":"user-credential-value","DSH_KNORVIA_ECHO_TEST":"NULL","DSH_HOME":"NULL","DSH_SHELL":"NULL"}
```

→ (a) ✅ (b) ✅ (c) ✅（含托管注入的 `DSH_HOME`/`DSH_SHELL` 也被挡住）

### E2 对照组：不做显式 env 叠加时，凭据形变量被清掉

直接用 `ctx.subprocess.spawn`（scrub 发生处）：

```text
A) explicit snapshot (only DSH_* removed):
   {"KNORVIA_PROBE_PLAIN":"plain-value","MY_SERVICE_API_KEY":"user-credential-value","DSH_SHOULD_HIDE":null,"DSH_HOME":null}
B) control, no explicit env:
   {"KNORVIA_PROBE_PLAIN":"plain-value","MY_SERVICE_API_KEY":null,"DSH_SHOULD_HIDE":null,"DSH_HOME":null}
```

→ 证明 E1 的差异真由我们注入显式 `env` 造成，而 `childEnv(extra)` 在 scrub **之后**合并。

### E3 反例：只靠插件 Config 传 env 不行

`{ id: "pwsh", name: "@deepseek-ai/dsh-pwsh-local", config: { env: snapshot } }`：

```text
PWSh result: {"KNORVIA_PROBE_PLAIN":"plain-value","MY_SERVICE_API_KEY":"NULL","DSH_SHOULD_HIDE":"NULL","DSH_HOME":"NULL"}
```

→ `PwshLocalExecutor.Config` 没有 `env` 字段，未知键不会变成子进程环境。**必须走执行器子类**。

### E4 平台事实

`dsh-tool-bash`/`dsh-bash-sandbox` 在 win32 被 `disabled`；本机（无 WSL）bash 行执行失败，pwsh 行正常。→ 修正一必须同时覆盖两支。

### E5 系统提示可补齐且无品牌

组合：`llm` + `system-prompt`(`includeHarnessIdentity:false`,`includeRuntimeContext:true`,`personaPrefix:<Knorvia 开场>`) + Knorvia context 插件行

```text
SECTIONS: ["deployment:persona-prefix","deployment:persona-suffix"]
CONTEXTS: ["knorvia:runtime-context"]
--- renderContextSnapshot ---
Current runtime context. This snapshot supersedes earlier runtime-context snapshots.

# Environment
You have been invoked in the following environment:
- Primary working directory: D:\knorvia studio开发\.scratch-exec6-dsh
- Platform: win32
- Shell: pwsh
- OS Version: 10.0.26200
- Today's date is 2026-10-20.
- Time zone: Asia/Taipei.
```

→ 六个字段全部可补齐；无 `harness:identity` 段、无 `DeepSeek Harness` 字样。`renderContextSnapshot` 自带的中性前缀不含品牌（D22）。

### E6 `dsh-shell-env` 是工具行硬依赖，会主动注入 `DSH_*`

`dsh-tool-bash`/`dsh-tool-pwsh` 的 `inject` 均为 `["tools","shell","systemPrompt","shellEnv"]`；`collect()` 无条件返回 `{DSH_HOME, DSH_SHELL}`。只注入用户快照而不摘 `dshEnv` 的结果：

```text
shellEnv.collect keys: ["DSH_HOME","DSH_SHELL"]
CHILD ENV: {"KNORVIA_PROBE_PLAIN":"plain-value","MY_SERVICE_API_KEY":"user-credential-value","DSH_KNORVIA_ECHO_TEST":"NULL","DSH_HOME":"C:\\Users\\...\\dsh-probe-MMHaOf","DSH_SHELL":"1"}
```

→ 断言 (c) 会被托管注入破坏，必须同时摘掉 `spec.dshEnv`（E1 即该做法）。

### E7 结论

两处修正都能在**不改 DSH 源码**的前提下、通过 DSH 文档明示的公开扩展点（执行器子类、`systemPrompt.context()`）做到，三条断言与字段清单全部可判定。**无需向协调 Agent 报 DSH 能力缺口。**

## 七、未覆盖的内容

| #   | 项                                         | 说明                                                     |
| --- | ------------------------------------------ | -------------------------------------------------------- |
| 1   | 真实模型驱动的工具调用、压缩触发、目标轮次 | 需要模型与网络；归 `kernel-switch` 真实模型冒烟（D25）   |
| 2   | 真实 MCP 服务器连通                        | 离线用哨兵/夹具断言行生成；真机归 `kernel-switch`（D24） |
| 3   | macOS 上的 bash 支                         | 无实机；Linux CI 覆盖 POSIX 语义（D23）                  |
| 4   | 安装版/便携版的 DSH 运行时树与原生模块     | `kernel-dsh-00` G1–G3 已记录；实测归 `kernel-switch`     |

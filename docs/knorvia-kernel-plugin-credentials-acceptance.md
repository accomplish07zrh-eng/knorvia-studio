# kernel-plugin-credentials 实现验收

> 合同 v1 见 [specs/contracts/kernel-plugin-credentials/](specs/contracts/kernel-plugin-credentials/)。
> 本文件是**实现 PR** 的验收记录：范围、接线证据、计分模式判定、语义核实、门禁输出、未覆盖内容。

## 一、范围

| 项         | 内容                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------- |
| 包         | `kernel-plugin-credentials`（M2 接入包：模型供应商与凭据）                                          |
| 认领 issue | #235                                                                                                |
| 实现分支   | `replace/kernel-plugin-credentials`，基于交接分支 `handoff/kernel-plugin-credentials`（`0bc88d38`） |
| 依据       | 计划书「内核方案调整」新增接入包表、合同 v1、用户对 10 条缺口的裁决                                 |

**继承文件数**：`-0`（接入包，不替换既有实现）。

**合同来源**：`exec-legacy` 交接（合同 10 份 + 实现 6 个 + 测试 3 个，交接时双测试门 11/11 green）。
本包在其成果上完成**接线**与验收，合同内容未改写。

**本包改动的文件**：

| 类别                   | 文件                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 实现（交接）           | `bootstrap/src/kernel-plugin-credentials/{index,provider,provider-table,credentials-request,reference,logger}.ts` |
| **接线（本 PR 新增）** | `bootstrap/package.json`（新增导出）、`bootstrap/src/kernel/builtins-modules.ts`、`bootstrap/src/kernel/host.ts`  |
| 测试（本 PR 修正）     | `specs/contracts/kernel-dsh-builtins/tests/composition-builtins.test.mjs`（B1 期望值跟随真实路径）                |

## 二、★ 核心交付：补上「凭据 provider 从未挂载」的缺口

### 2.1 缺口是什么

`bootstrap/src/kernel/composition.ts` 支持可选参数 `credentialProviderModuleId`，
但 `host.ts` **从不传它** → `credentialRows` 恒为空 → `ctx.credentials` 无人提供。

**为什么这会让真实模型调用失败**（三个事实串成因果链）：

1. `dsh-llm-pi-ai` 的 `authContextFrom(ctx).env(name)` 走
   `ctx.get("credentials")?.resolve(credentialRef(name))` —— **可选调用**（`?.`）；
2. 服务缺席时该表达式静默返回 `undefined`，随后**回退**到
   `launchEnvironmentOf(ctx).get(name)?.value`；
3. 而 `kernel-dsh-00` 的启动路径已**清空全部 `*_API_KEY`**（进程级清洗），
   **所以回退必然拿不到 key**。

**挂上本行后这条链才成立。**

### 2.2 修了什么

```ts
// bootstrap/src/kernel/builtins-modules.ts
export interface KernelPluginModuleIds {
  readonly runtimeContext: string;
  readonly bash: string;
  readonly pwsh: string;
  readonly credentials: string; // ← 新增
}
```

```ts
// bootstrap/src/kernel/host.ts
const moduleIds = kernelPluginModuleIds();
const rows = createKernelPluginRows(prepared.dshHome, {
  platform: process.platform,
  cwd: prepared.cwd,
  moduleIds,
  credentialProviderModuleId: moduleIds.credentials,   // ← 新增
  ...
});
```

```jsonc
// bootstrap/package.json —— 第 6 个同类子路径导出（既有 5 个：kernel / kernel-engine /
// kernel/runtime-context / kernel/shell-environment-bash / kernel/shell-environment-pwsh）
"./kernel-plugin-credentials": {
  "types": "./dist/kernel-plugin-credentials/index.d.ts",
  "import": "./dist/kernel-plugin-credentials/index.js"
}
```

**为什么需要 `package.json` 导出**：DSH Loader 只认磁盘上可解析的模块（裸包名子路径或绝对文件地址）。
没有子路径导出，`@knorvia/bootstrap/kernel-plugin-credentials` 无法解析，行会被 Loader 判为不可用。

### 2.3 接线证据（实测行数变化，不是「应该会挂上」）

验证方法：直接调用 `createKernelPluginRows`，对比「不传 / 传 `credentialProviderModuleId`」两种情况的落盘行数，
并统计 `knorvia-credentials` 行的出现次数。

```
module ids: {
  "runtimeContext": "@knorvia/bootstrap/kernel/runtime-context",
  "bash": "@knorvia/bootstrap/kernel/shell-environment-bash",
  "pwsh": "@knorvia/bootstrap/kernel/shell-environment-pwsh",
  "credentials": "@knorvia/bootstrap/kernel-plugin-credentials"
}
rows without credentialProviderModuleId: 56, credentials rows: 0    ← 修复前的行为
rows with    credentialProviderModuleId: 57, credentials rows: 1    ← 修复后
credential row name: @knorvia/bootstrap/kernel-plugin-credentials
OK: credentialRows only appears when the module id is wired
```

**判据：修前 0 行、修后 1 行，总行数 56 → 57。** 这不是推测，是实测。

**附带结论**：`credential row name` 等于模块 id（不是服务名 `"credentials"`）——
行注册名与服务名是两件事，D1 已固定服务名由基类构造函数给出。

## 三、三条语义核实（每条附证据来源）

`exec-legacy` 在交接时口头强调了三条语义。本 PR 逐条**亲自核实**并记录证据。

### 3.1 `super(ctx, "credentials")` 由基类构造函数完成，不需要 `ctx.set`

**证据来源**：`node_modules/@deepseek-ai/dsh-credentials/lib/index.js`

```js
class CredentialProvider extends Service {
  constructor(ctx) {
    super(ctx, "credentials"); // ← 服务名在此固定
  }
}
```

**结论**：`provider.ts` 第 76 行只写 `super(ctx)` 是**正确的**；再调 `ctx.set("credentials", …)` 是重复注册。

### 3.2 `configured` 的判据是「record 是否存在」，不是「有没有值」

**证据来源**：DSH 类型文档原文

> 「`*absent everywhere` — `resolve` skips it, `describe` reports it unconfigured —
> **so a blank never masquerades as a configured secret.**」

**结论**：`describeRecord()` 用「能否取到材料（record 存在）」判断，**不是**用「有没有 `key` 值」判断 —— 正确。
这条影响 `testModelConnectivity`：必须区分**三种状态**（未配置 / 已配置但走 ambient / 已配置且有材料），
混为一谈会让用户去设置页找不存在的配置项。

### 3.3 `resolve()` 返回 `undefined` 只表达「不归我管」

**证据来源**：合同 `interface.md` §3.5 + `provider.ts` 实现

| 情形                                         | 实现行为                         |
| -------------------------------------------- | -------------------------------- |
| 引用名不在本 provider 命名空间（前缀不匹配） | 返回 `undefined`（+ debug 日志） |
| Host 明确拒绝（`headersApplied: false`）     | **抛错**                         |
| 通道缺席 / 超时 / 应答非法                   | **抛错**                         |

**结论**：正确。否则 Host 临时故障会被误读成「用户没配 key」，把人导向错误排查方向。

## 四、计分模式判定（避免审查质疑）

按计划书 **L359** 的适用范围：

> 「**合同写死的纯数据常量表**（键名与数值都由合同规定、不含逻辑）：…用**声明模式**计分；
> **表中夹带的逻辑与文件其余代码照常计分。**」

即：**声明模式仅适用于「纯数据常量表」与「纯声明文件」**，不是「所有带导出声明的文件」。

**本包 4 个模块的实现行 / 声明行占比**：

| 文件                     | 行数 | 实现行 | 声明行 | 性质                     |
| ------------------------ | ---: | -----: | -----: | ------------------------ |
| `reference.ts`           |   20 |     11 |      0 | **纯实现**（三个纯函数） |
| `credentials-request.ts` |   47 |      7 |     14 | 实现 + 声明              |
| `provider-table.ts`      |   98 |     12 |     27 | 实现 + 声明              |
| `index.ts`               |   86 |     16 |     26 | 实现 + 声明              |

**没有一个是「纯数据常量表」或「纯声明文件」** → 按 **normal 模式**计分。

| 文件                     | normal containment | run | 判定 |
| ------------------------ | -----------------: | --: | ---- |
| `reference.ts`           |          **0.050** |   1 | PASS |
| `index.ts`               |          **0.081** |   2 | PASS |
| `credentials-request.ts` |          **0.106** |   1 | PASS |
| `provider.ts`            |          **0.108** |   1 | PASS |
| `provider-table.ts`      |          **0.122** |   3 | PASS |
| `logger.ts`              |          **0.000** |   0 | PASS |

**说明**：交接方未记录计分模式（`gate-old.json` / `gate-dsh.json` 只含测试门）。
本 PR 按计划书 L359 判定为 normal。若审查者认为应走 declaration，请指出依据
（declaration 适用的是纯数据常量表 / 纯声明文件，本包 4 个模块均不属此列）。

## 五、测试结果

| 门                                        | 结果                   |
| ----------------------------------------- | ---------------------- |
| **旧门**（默认引擎）                      | **11/11 PASS**，0 skip |
| **dsh 门**（`KNORVIA_KERNEL_ENGINE=dsh`） | **11/11 PASS**，0 skip |
| **`kernel-dsh-00`**（启动契约，下游）     | **25/25** ✅           |
| **`kernel-dsh-builtins`**（组合，下游）   | **56/56** ✅           |

**两门用同一套用例、同一份断言，只有引擎变量不同**（合同 `acceptance.md` 的口径）。
`assertionsRelaxed: false` / `forcedExit: false`（记录在 `gate-*.json`）。

### 5.1 B1 测试修正（原本会红，红得对）

`specs/contracts/kernel-dsh-builtins/tests/composition-builtins.test.mjs` 的 B1 断言
「落盘的行 == 公开物化结果」。本 PR 的接线让真实启动多了一行凭据行，
**所以断言里的期望调用也必须传 `credentialProviderModuleId`** ——

**没有放宽断言，而是让断言跟上新的真实路径**：落盘内容必须如实反映代码路径，
这正是 B1 存在的意义。修正后 56/56。

## 六、门禁输出（实测）

| 检查                      | 结果                                                    |
| ------------------------- | ------------------------------------------------------- |
| `pnpm fmt` / `fmt:check`  | exit 0 / exit 0                                         |
| `pnpm typecheck`          | exit 0                                                  |
| `pnpm lint`               | exit 0（257 warnings / 0 errors，本包文件域**零警告**） |
| `pnpm architecture:check` | exit 0（**violations: 0**）                             |
| `pnpm build:cli-packages` | exit 0（15/15 tasks）                                   |
| **相似度 normal 门**      | **6/6 PASS**                                            |
| `pnpm test:studio`        | 交 CI                                                   |

## 七、未覆盖的内容

| #   | 项                                          | 归属                                                                                                                                                                                                     |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **真实模型往返**（发一次真请求看连通性）    | `kernel-switch` 实机冒烟                                                                                                                                                                                 |
| 2   | **纯 header 场景（无 apiKey）的按请求注入** | 合同 `known-differences.md` D2：`PiAiProviderProfile.headers` 是配置级静态值，按请求注入需重建 profile → 会打断流并改变 DSH 配置生命周期语义。**不在包内 workaround，如必须支持建议在 DSH 上游提需求。** |
| 3   | 连接性真测                                  | 离线只覆盖「请求构造 + 失败语义」；`testProviderConnectivity` **不会伪造 `success: true`**（B10 有断言）                                                                                                 |

## 八、安全约定（自查）

- 无任何进程级清理：实现与测试零命中 `taskkill` / `pkill` / `killall` / `process.kill`；
- 不碰真实用户目录：测试用固定夹具，不读写 `~/.dsh`；
- **不在代码 / 日志 / 夹具写凭据值**：`resolve()` 与 `readRecord()` 只在 debug 日志记「有没有」，记 header 名不记值（S2/B9）；
- 四个写入方法一律抛错（D3）：静默成功会让配置界面误以为写入生效。

## 九、交接说明

合同与实现骨架来自 `exec-legacy` 交接分支 `handoff/kernel-plugin-credentials`（`0bc88d38`）。
本 PR 在其上完成：接线（`package.json` / `builtins-modules.ts` / `host.ts`）、
三处语义的逐条核实与证据记录、B1 测试修正、计分模式判定、验收文档。
**合同内容未改写。**

# kernel-plugin-credentials 合同（供应商与凭据插件）

**合同版本：v1**（2026-10-20）

本目录是 M2 接入包 `kernel-plugin-credentials` 的合同。它冻结三件事：**Knorvia 供应商配置 → DSH
`dsh-llm-pi-ai` 的 provider 表映射**、**凭据按请求经 Host 获取**、**凭据清理只约束 DSH 与模型适配**。

- 分支：`contract/kernel-plugin-credentials`（基线 `origin/main`，含 `kernel-bridge-01` #218、
  `kernel-dsh-builtins` #228、`kernel-bridge-legacy` #230）
- 认领 issue：**#235**
- 前置合同：[`kernel-bridge-legacy`](../kernel-bridge-legacy/README.md) v1（反向请求通道）、
  [`kernel-dsh-builtins`](../kernel-dsh-builtins/README.md) v1（组合与工具子进程环境）、
  [`kernel-bridge-01`](../kernel-bridge-01/README.md) v1（v4 命令面）
- 依据：`specs/knorvia-builtin-kernel-dsh.md`（能力映射「模型路由」行、与本机 DSH 隔离）、
  `specs/knorvia-internal-plugins.md` 内核层、计划书「内核方案调整」「接入包流程」
- 事实来源：`@deepseek-ai/dsh@0.2.0-rc.2` 的**公开类型与实现**（`dsh-llm-pi-ai`、
  `dsh-credentials`、`dsh-launch-environment`）、旧模型适配实现（`adapters/src/model/**`、
  `bootstrap/src/model-factory.ts`）、以及 `kernel-bridge-legacy` 已交付的
  `channelForHostRequests()`。**不读 DSH 源码仓库、不改 DSH。**

---

## 一、范围

### 1. 本包做什么

1. **供应商表**：把 Knorvia 的供应商配置（`providers` + 各 provider 的端点/协议/模型表）
   映射成 `dsh-llm-pi-ai` 的 `Config.providers`（`PiAiProviderProfile` 字典）；三种 provider
   协议格式（Anthropic / OpenAI-compatible / OpenAI-Responses）照旧支持。
2. **凭据服务 provider**：实现 `@deepseek-ai/dsh-credentials` 的**抽象基类**
   `CredentialProvider`，在插件 `apply(ctx)` 里供出 `ctx.credentials`；`resolve(ref)` 里
   **按请求**经 Host 反向请求（`interaction/requestProviderRuntimeHeaders`）取 Knorvia 凭据。
3. **凭据清理边界**：只约束 DSH 与模型适配（进程内不缓存明文凭据、不写日志）；
   **工具子进程仍用启动时用户环境快照（只去 `DSH_*`）** —— 那是 `kernel-dsh-builtins` 已交付
   的行为，本包**不得回退**。
4. **模型连接性测试**：`provider/testModelConnectivity` 归本包（见 §四）。
5. 合同测试全部走**公开协议入口或公开插件入口**；同一套用例对默认引擎与 `dsh` 引擎各跑一遍
   （凡两引擎都成立的部分）。

### 2. 本包不做什么

| 不做的事                                                                              | 归属                                 | 依据                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| 改 `kernel-bridge-legacy`（含 `channelForHostRequests`）                              | 已交付 #230 + #239                   | #235 Lead 裁决：**只调用，不修改**；通道能力不足先报 Lead   |
| 改 `bootstrap/src/kernel/**`（组合、`credential-provider.ts` 行、`llm-pi-ai` 组合行） | `kernel-dsh-builtins`（exec-kernel） | #235 裁决 + #236 已提供 `KERNEL_CREDENTIAL_PROVIDER_ROW_ID` |
| 改 `bootstrap/src/kernel-bridge/**`（除 legacy 之外）                                 | `kernel-bridge-01/02/03`             | 冻结面                                                      |
| v4 协议字段、旧协议方法、`KNORVIA_*` 变量、数据目录                                   | 冻结面                               | 计划书选择 8                                                |
| 工具子进程环境                                                                        | `kernel-dsh-builtins` 已交付         | #235：**不得回退**                                          |
| fork / vendor / 改 DSH 源码                                                           | —                                    | 规格「不做」                                                |

---

## 二、现状与缺口（实测）

### 1. DSH 侧的关键事实（读 `node_modules` 的公开产物得到）

**a) `dsh-credentials` 只导出抽象基类，不能作为组合行挂载**

`@deepseek-ai/dsh-credentials` 的 `lib/index.js` 里 `CredentialProvider extends Service`，构造函数
`super(ctx, "credentials")`。它**没有** `Config`、**没有**自定义 `apply`（若有 `apply` 那是
`Function.prototype.apply`）。因此**不能**像普通 DSH 插件那样写进组合行。

**b) `dsh-llm-pi-ai` 的凭据解析：先问 `ctx.credentials`，再回退启动环境**

`dsh-llm-pi-ai/lib/index.js` 的 `authContextFrom(ctx).env(name)`：

```js
async env(name) {
  if (isCredentialRefName(name)) {
    const hit = await ctx.get("credentials")?.resolve(credentialRef(name));
    if (hit !== void 0) return hit.value;
  }
  return launchEnvironmentOf(ctx).get(name)?.value;
}
```

**c) 回退路径在 dsh 引擎下必然落空**

`kernel-dsh-00` 的进程级清洗删掉了所有 `*_API_KEY`（`bootstrap/src/kernel/environment.ts` 的
`sanitizeProcessEnvironment`），所以 `launchEnvironmentOf(ctx)` 拿不到模型 key。
**结论：必须有 `ctx.credentials` 提供者，否则真实模型调用必然失败。** 这是本包存在的直接理由。

**d) 组合行位置已由 `kernel-dsh-builtins` 提供（#236）**

```ts
// apps/cli/packages/bootstrap/src/kernel/credential-provider.ts
export const KERNEL_CREDENTIAL_PROVIDER_ROW_ID = "knorvia-credentials";
export interface KernelCredentialProviderRow {
  readonly rowId: string;
  readonly moduleId: string;
}
export function createKernelCredentialProviderRow(moduleId: string): KernelCredentialProviderRow;
```

**分工**：`kernel-dsh-builtins` 只给「挂在哪一行、行长什么样」的约定；**本包提供被 `moduleId`
指向的 provider 插件模块**。

**e) 挂载时序由 DSH `boot()` 保证，不由行顺序保证（2026-10-20 更正）**

曾误以为「row 在 `composition.ts` 里排在前面就能先挂载」。**实测源码推翻了这个假设**：

1. `cordis-plugin-loader` 的行之间是**并发挂载**（`Promise.all(ids.map(...))`）——**行顺序不决定挂载顺序**；
2. `dsh-app-boot` 的 `boot()` 在返回前 `await ctx.get("loader")?.await()`，后者循环等到所有
   import/生命周期任务归零；
3. `kernel/process.ts`：`bootKernel()`（含上述 await）→ 写就绪行 → `runBridge()` 才开始接收命令。

**所以「provider 晚于首次模型请求挂载」不会发生**：任何 v4 命令都必然在所有插件挂载完成后才被接受。
本包依赖的是 **DSH 的公开契约**，不是 `composition.ts` 的实现细节。

### 2. 本包要补的缺口

| #   | 缺口                                                         | 本包做法                                                       |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| G1  | dsh 引擎下没有 `ctx.credentials` 提供者 → 模型 key 拿不到    | 实现 `CredentialProvider` 子类并以插件模块供出                 |
| G2  | Knorvia 供应商配置不是 `PiAiProviderProfile` 形状            | 写映射（§三 B3）                                               |
| G3  | 凭据按请求从 Host 取，且不支持缓存                           | `resolve()` 每次走 `interaction/requestProviderRuntimeHeaders` |
| G4  | 拿不到凭据时若无 key 继续调模型，会得到远端 401 而非明确失败 | 明确失败（B6）                                                 |

**红线**：以上缺口一律在本包内适配，**不改 DSH**、**不改 legacy**、**不回退 builtins**。

---

## 三、锁定的不变量

实现阶段以下任何一条变化即视为破坏合同，必须升版本并重录旧门。

| #   | 不变量          | 内容                                                                                                  | 断言  |
| --- | --------------- | ----------------------------------------------------------------------------------------------------- | ----- |
| L1  | 引擎门          | 仅 `KNORVIA_KERNEL_ENGINE=dsh` 走本包新实现；缺省/其他值逐字节保持旧行为                              | 旧门  |
| L2  | 供应商表形状    | 产出的 `Config.providers` 每个路由都是合法 `PiAiProviderProfile`；路由 key = Knorvia `providerId`     | B3    |
| L3  | 三种协议        | Anthropic / OpenAI-compatible / OpenAI-Responses 三种格式都能产出可用的 `api` 字段                    | B4    |
| L4  | 凭据按请求      | `resolve()` **每次调用**都发一次反向请求；进程内**不缓存**明文凭据                                    | B5/B7 |
| L5  | 运行时校验      | 反向请求的应答**必须**经 `knorviaProviderRuntimeHeadersResponseSchema.parse()` 校验（不信任类型签名） | B5    |
| L6  | 明确失败        | 拿不到凭据 → 明确失败；**不得**静默降级到无凭据调用                                                   | B6    |
| L7  | 不回退 builtins | 工具子进程环境仍是启动时用户环境快照（只去 `DSH_*`）                                                  | B8    |
| L8  | 无凭据泄漏      | 凭据不出现在日志、错误消息、异常堆栈、夹具                                                            | B9    |
| L9  | 组合行契约      | 插件模块可由 `createKernelCredentialProviderRow(moduleId)` 挂载；行 id 为 `knorvia-credentials`       | B2    |

---

## 四、行为条目（摘要；完整版见 behavior.md）

| 编号 | 主题           | 一句话                                                                            |
| ---- | -------------- | --------------------------------------------------------------------------------- |
| B1   | 插件模块形态   | 导出 DSH 插件入口，`apply(ctx)` 里供出 `ctx.credentials`                          |
| B2   | 组合行契约     | 与 `KERNEL_CREDENTIAL_PROVIDER_ROW_ID` / `createKernelCredentialProviderRow` 对齐 |
| B3   | 供应商表映射   | Knorvia 供应商配置 → `PiAiProviderProfile` 字典                                   |
| B4   | 三种协议格式   | Anthropic / OpenAI-compatible / OpenAI-Responses                                  |
| B5   | 按请求取凭据   | `resolve()` 每次走 Host 反向请求 + 运行时 schema 校验                             |
| B6   | 拿不到凭据     | 明确失败，不静默降级                                                              |
| B7   | 不缓存明文     | 进程内不保存凭据；不写日志                                                        |
| B8   | 工具子进程环境 | 保持 builtins 已交付的「用户环境快照」语义                                        |
| B9   | 凭据不泄漏     | 日志/错误/夹具/PR 均无凭据                                                        |
| B10  | 模型连接性测试 | `provider/testModelConnectivity` 归本包                                           |
| B11  | 平台差异       | Windows / POSIX 路径与主目录、无真实 `~/.dsh` 读写                                |

---

## 五、接口

见 [interface.md](interface.md)：插件模块导出面、`CredentialProvider` 实现要点、
供应商配置 → provider 表的映射函数签名、以及本包与 `kernel-dsh-builtins` / `kernel-bridge-legacy`
的依赖方向。

**依赖方向（冻结）**：

```text
kernel-dsh-builtins  ──(提供组合行位置)──>  kernel-plugin-credentials
kernel-bridge-legacy ──(提供 channelForHostRequests)──>  kernel-plugin-credentials
```

本包**不**被上述两者 import（它们不依赖本包）；本包对它们的依赖是「调用 + 被挂载」。

---

## 六、调用方

见 [callers.md](callers.md)。

---

## 七、复用清单（接入包流程第 2 条）

**已有契约测试中，走公开入口、对新运行时同样适用的**：

| 套件                                                               | 入口                                         | 对新运行时的要求               |
| ------------------------------------------------------------------ | -------------------------------------------- | ------------------------------ |
| `specs/contracts/kernel-bridge-legacy`                             | 旧协议公开入口（spawn `app-server --stdio`） | **继续全过**；本包不改旧协议面 |
| `specs/contracts/kernel-bridge-01`                                 | v4 协议公开入口                              | **继续全过**；本包不改 v4 面   |
| `specs/contracts/kernel-dsh-00/tests/engine-selection.test.mjs`    | CLI 进程引擎选择                             | 继续通过                       |
| `specs/contracts/kernel-dsh-builtins`                              | 公开组合/插件入口                            | 继续通过；本包不改其组合       |
| `specs/contracts/contracts-*`、`shared-*`、`apps-cli-packages-01*` | 包级纯模块                                   | 与运行时无关，期望不变         |

**只测旧内部端口、不迁移**：`specs/contracts/core-*`（直接 import `apps/cli/packages/core/src/**`），
随 `core` 包删除；其中与模型/凭据相关的 **`adapters/src/model/**`的旧实现**由本包的`callers.md` 列出并作为行为对照，不迁移测试。

---

## 八、门禁

```bash
# 仓库根目录；先 pnpm build:cli-packages
node specs/contracts/kernel-plugin-credentials/tests/run-gate.mjs              # 旧门/新运行时门
node specs/contracts/kernel-plugin-credentials/tests/run-gate.mjs --engine dsh
```

| 门               | 入口                                   | 判据         | 产物            |
| ---------------- | -------------------------------------- | ------------ | --------------- |
| 旧门（合同阶段） | 旧实现 + 默认引擎                      | 全部用例通过 | `gate-old.json` |
| 新运行时门       | 同套用例 + `KNORVIA_KERNEL_ENGINE=dsh` | 全部用例通过 | `gate-dsh.json` |

- 接入包**无 stubs**（不替换既有实现，因此不需要桩门）。
- 离线可测的部分只断言「配置映射 + 反向请求调用契约 + 失败语义」；**真实模型调用**需要 key，
  归 `kernel-switch` 的实机冒烟（见 acceptance「未覆盖」）。
- 夹具**不得**含真实凭据；一律用形如 `"fixture-credential-value"` 的假值。

---

## 九、与相邻包的接缝

1. **`kernel-bridge-legacy`（已合并 #230，访问器在 #239）**：本包通过
   `bridge.channelForHostRequests()` 拿到 `LegacyHostChannel`，用它发
   `interaction/requestProviderRuntimeHeaders`。**不改 legacy**；通道能力不足先报 Lead。
2. **`kernel-dsh-builtins`（已合并 #228，行位置在 #236）**：本包提供被
   `createKernelCredentialProviderRow(moduleId)` 指向的插件模块；**不改**其 `bootstrap/src/kernel/**`，
   **不回退**其工具子进程环境行为。
3. **`kernel-bridge-02`（并行在途）**：回合执行；若它需要 provider 解析，走本包公开面（不反向依赖）。
4. **`kernel-switch`**：真实模型冒烟与默认引擎切换归它；本包只交付「配置 + 凭据 + 连接性测试」。

---

## 十、`provider/testModelConnectivity` 归属（Lead 2026-10-20 裁决）

**归本包。** 理由：它测的是「用当前 provider 配置发一次最小请求」，本质是供应商与凭据能力，
不是协议面。实现上它需要真实凭据 → 离线只断言「拿不到凭据时明确失败」与「有凭据时构造出正确请求」，
真实往返归 `kernel-switch` 实机冒烟。

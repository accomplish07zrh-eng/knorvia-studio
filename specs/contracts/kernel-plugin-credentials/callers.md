# kernel-plugin-credentials 调用方

`pnpm dep:refs --list-exports` 与源码扫描的结果。本包不新增公开模块路径，调用方分三类：
**挂载方**（组合根）、**消费方**（DSH 的模型适配）、以及**被本包调用的既有端口**。

---

## 一、挂载方（谁把本包挂进组合）

| 调用方                         | 位置                                                                              | 关系                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `kernel-dsh-builtins` 的组合根 | `apps/cli/packages/bootstrap/src/kernel/composition.ts`（**已交付 #228 / #236**） | 通过 `createKernelCredentialProviderRow(moduleId)` 产出组合行，`moduleId` 指向本包插件模块 |

**契约**：`composition.ts` **不 import 本包任何代码**——它只写一个 `moduleId` 字符串，由 DSH Loader
按该标识解析并挂载。因此本包与 `kernel-dsh-builtins` 之间**没有编译期依赖**，只有运行期约定。

`KERNEL_CREDENTIAL_PROVIDER_ROW_ID = "knorvia-credentials"` 是**行的注册名**，不是服务名
（服务名由 `CredentialProvider` 基类固定为 `"credentials"`）。

---

## 二、消费方（谁使用本包供出的 `ctx.credentials`）

| 消费方                        | 位置                                               | 用法                                                                    |
| ----------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `dsh-llm-pi-ai`（第三方依赖） | `authContextFrom(ctx).env(name)`                   | `ctx.get("credentials")?.resolve(ref)` → 取 `hit.value`（**单字符串**） |
| 同上                          | `credentials.readRecord(recordKeyFor(providerId))` | 取结构化 `ApiKeyRecord`（`key` + `env`）                                |

**这两条通道的形状差异决定了本包的映射设计**（见 [interface.md](interface.md) §2.4）。
本包**不修改** `dsh-llm-pi-ai`（第三方依赖，锁版本）。

其它可能消费 `ctx.credentials` 的 DSH 插件（`dsh-user-approval`、`dsh-authorization` 等）**不在本包范围**：
本包只负责 `llm-pi-ai` 需要的凭据面；它们各自的服务名与记录 scope 不同，互不干扰。

---

## 三、被本包调用（本包的上游）

| 上游                                               | 位置                                                                                           | 用途                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `LegacyHostChannel`                                | `bootstrap/src/kernel-bridge/legacy/index.ts` 的 `channelForHostRequests()`（**已合并 #239**） | 发 `interaction/requestProviderRuntimeHeaders` 反向请求 |
| `knorviaProviderRuntimeHeadersRequestParamsSchema` | `packages/shared/src/protocol/index.ts`                                                        | 请求参数校验（既有 schema，不改）                       |
| `knorviaProviderRuntimeHeadersResponseSchema`      | 同上                                                                                           | **应答运行时校验**（L5：不信任类型签名）                |
| `knorviaProviderRuntimeHeadersCancelledSchema`     | 同上                                                                                           | 取消/超时通知（由 legacy 侧发射，本包不重发）           |

**依赖方向**：本包 → 上述；上述**不** import 本包。

---

## 四、旧实现对照（本包的行为参考，不是调用方）

本包**不替换**这些文件（它们是旧引擎的实现，随 `kernel-switch` 与旧模型适配一起删除），
但行为以它们为准，故在此登记以便审查对照：

| 旧实现位置                                             | 提供的行为                                                                    | 本包对应                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/cli/packages/adapters/src/model/**`（53 个文件） | Vercel AI SDK 三种 provider 格式、流式、重试、tool 转换、失败分类             | B4（协议格式）、B3（供应商表）                                  |
| `apps/cli/packages/bootstrap/src/model-factory.ts`     | `createModelAdapter` 的唯一构造点                                             | 由 DSH `llm-pi-ai` 取代                                         |
| `bootstrap/src/protocol/provider-runtime-headers.ts`   | `createProviderRuntimeHeadersPort`：**180_000ms** 总时限、中止/超时发取消通知 | B5（按请求取凭据）、超时默认值                                  |
| `bootstrap/src/protocol/account-provider-config.ts`    | `provider/updateAccountConfig` 的账户配置同步（`-32018` 未配置）              | 归 `kernel-legacy-sessions`/`kernel-switch`；本包只消费配置结果 |

**旧实现里与本包相关但不在本包范围**的：

- `adapters/src/model/runner-*.ts`（流式与重试细节）→ DSH `llm-pi-ai` 自身承担；
- `adapters/src/model/failure-*.ts`（失败分类）→ DSH 的 `LlmError` 承担，本包只把「拿不到凭据」映射成明确失败。

---

## 五、跨进程边界

- **Host 进程**（`packages/desktop`、`packages/server`、`packages/services`）：拥有 Knorvia 凭据服务，
  通过 `interaction/requestProviderRuntimeHeaders` **应答**本包的反向请求。代码不改。
- **Renderer**：不直连；不感知凭据。
- **外部内核（ACP）**：另一条链路，不经本包。
- **`packages/provider`、`packages/provider-node`**：Knorvia 供应商配置的领域层（provider 注册表、
  endpoint 解析）。本包**消费**其配置输出，**不改**它们。

---

## 六、测试引用

- `specs/contracts/kernel-plugin-credentials/tests/**`：本包契约测试。
- `specs/contracts/kernel-bridge-legacy/tests/host-channel.test.ts`（B18a–e）：本包所依赖的
  反向请求通道访问器——**它已绿**，本包不重复测它，只在集成用例里当作真实前置使用。
- `specs/contracts/kernel-dsh-builtins/tests/composition-builtins.test.mjs`：组合行相关；本包
  只保证「`moduleId` 指向的模块可以 `apply` 出 `ctx.credentials`」，挂载动作归该包。

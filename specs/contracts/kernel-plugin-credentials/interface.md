# kernel-plugin-credentials 接口合同

本包**不新增公开模块路径到 `@knorvia/bootstrap` 根入口**，也不改协议。接口 = ①一个 DSH
**插件模块**（由组合行以 `moduleId` 指向）；②包内冻结的**映射与解析函数**（供组合根与测试使用）。

依赖方向固定：

```text
kernel-dsh-builtins  ──(提供组合行位置)──>  kernel-plugin-credentials
kernel-bridge-legacy ──(提供 channelForHostRequests)──>  kernel-plugin-credentials
```

本包**不得**被上述两者 import，也不得反向 import 它们的内部模块。

---

## 一、插件模块（本包的核心交付面）

**模块路径**：`apps/cli/packages/bootstrap/src/kernel-plugin-credentials/index.ts`
（由 `createKernelCredentialProviderRow(moduleId)` 的 `moduleId` 指向；取值由组合根决定，
可用裸包名子路径或绝对文件地址）

**导出面**：

```ts
import type { Context } from "@deepseek-ai/cordis";

/**
 * DSH 插件入口。挂载后 `ctx.credentials` 可用。
 *
 * **服务名由基类构造函数固定**：`CredentialProvider` 的 `super(ctx, "credentials")`
 * 已完成服务注册——因此本包**只需** `new KnorviaCredentialProvider(ctx, deps)`，
 * **不需要**（也不应该）自己 `ctx.set("credentials", ...)`：那会重复注册。
 *
 * 挂载时序：`llm-pi-ai` 每次请求都 `ctx.get("credentials")?.resolve(...)`（可选调用），
 * 因此 provider 必须在首次模型请求时已可用。**保证它的是 DSH `boot()` 的语义**（见 §六），
 * 不是组合行的排列顺序。
 */
export function apply(ctx: Context, config: KnorviaCredentialsConfig): void;

/**
 * 组合行必须传的配置。
 *
 * `config` 本身**不是可选的**：缺了接线字段的插件无法工作，晚失败会比早失败贵得多
 * （症状会出现在第一次模型请求，而根因在装配期）。因此 `apply` 在缺少必需字段时**立即抛错**。
 */
export interface KnorviaCredentialsConfig {
  /**
   * 取当前反向请求通道。**必需。**
   *
   * 组合根接线：`() => bridge.channelForHostRequests()`
   * （`kernel-bridge-legacy` 的公开访问器，PR #239 已合并）。
   *
   * 为什么是 getter 而不是值：桥在 `attach()`/`detach()` 之间状态会变，
   * 而 `resolve()` 是按请求调用的（B5/D4）——每次调用都应看到当前通道。
   *
   * 返回 `undefined`（桥未 attach）时 `resolve()` **必须明确失败**（B6 ①），不得静默回退。
   */
  readonly hostChannel: () => LegacyHostChannel | undefined;

  /**
   * 当前会话上下文。**必需。**
   *
   * 反向请求的参数要求 `sessionId` / `workspace` / `modelSelection`（既有 schema 的必填字段）。
   * 组合根负责把当前请求的上下文传进来；本包不推测这些事实。
   */
  readonly sessionContext: () => {
    readonly sessionId: string;
    readonly workspace: { readonly workspacePath: string; readonly workspaceKey: string };
    readonly modelSelection: { readonly providerId: string; readonly modelId: string };
  };

  /**
   * Knorvia 供应商配置。**必需**（可以是空数组）。
   *
   * 由组合根从 Host 下发的供应商配置构造；本包把它映射成 `PiAiProviderProfile` 字典（B3/B4）。
   * 空数组是合法的（没有配置就没有可选模型，不伪造默认 provider）。
   */
  readonly providers: readonly KnorviaProviderEntry[];

  /**
   * Knorvia 凭据引用的命名规则前缀，用于把 DSH 的 CredentialRef 映射到 Knorvia providerId。
   * 缺省 `KNORVIA_`。不新增环境变量——这只是**引用名的构造规则**，值仍由 Host 按请求提供。
   */
  readonly credentialRefPrefix?: string;
  /** 单次 `resolve()` 的反向请求超时；缺省 180_000ms（既有 `provider-runtime-headers` 总时限）。 */
  readonly credentialRequestTimeoutMs?: number;
  /** 日志面；缺省无操作。任何调用点都不得把凭据值放进 fields（S2）。 */
  readonly logger?: KnorviaLogger;
}
```

**为什么导出 `apply` 而不是默认导出**：DSH 的插件行按 `moduleId` 解析模块并调用其 `apply`，
与 `kernel-dsh-builtins` 已在用的行形状一致。

### 接线约定（`composition.ts` ↔ 本包，冻结）

| 项                         | 内容                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **谁传**                   | `apps/cli/packages/bootstrap/src/kernel/composition.ts`（owner：`kernel-dsh-builtins`）                       |
| **怎么传**                 | 组合行 `createKernelCredentialProviderRow(moduleId)`，`moduleId` 指向本包模块；三个必需字段随行的 config 传入 |
| **必需字段**               | `hostChannel` / `sessionContext` / `providers`                                                                |
| **缺席行为**               | `apply` **立即抛错**（早失败）：配置错误应在装配期暴露，而不是拖到第一次模型请求                              |
| **为什么不在本包补默认值** | 这三个字段都是「当前运行时的事实」，本包凭空造值会伪造状态（如伪造 sessionId）                                |

**为什么不新增 B 条**：接线约定是**组合根与本包之间的契约**，不是「本包自身的行为」。
B 条目描述的是本包对外可观测的行为（B1–B11）；接线属于装配期约定，故写在 §一。

---

## 二、`CredentialProvider` 实现要点（本包实现，DSH 基类）

### 1. 服务名由基类固定

`@deepseek-ai/dsh-credentials` 的 `CredentialProvider` 是**抽象基类**：

```js
class CredentialProvider extends Service {
  constructor(ctx) {
    super(ctx, "credentials");
  } // ← 服务名在此固定
}
```

**因此本包的做法是**：写 `class KnorviaCredentialProvider extends CredentialProvider`，
构造函数调 `super(ctx)` 即可（服务名由基类写死为 `"credentials"`）。
**不是**自己 `ctx.set("credentials", ...)`——那会绕开基类的通知与生命周期。

### 2. 必须实现的方法（本包版本）

| 方法                             | 本包语义                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `resolve(ref)`                   | **按请求**经 Host 取凭据；成功→`{value, source}`；拿不到→`undefined`（基类契约：`undefined` = 未配置） |
| `describe(ref)`                  | 只回「是否已配置 / 来源 / 是否可写」，**绝不**返回值                                                   |
| `set(ref, value)`                | **不支持写**：Knorvia 凭据由 Host 侧凭据服务持有，CLI 侧只读 → 抛明确错误                              |
| `unset(ref)`                     | 同上                                                                                                   |
| `readRecord(key)`                | **本包实现**（见 §2.4）：把 Knorvia 的鉴权材料投影成 `ApiKeyRecord`                                    |
| `describeRecord` / `listRecords` | 只回存在性与归属，**绝不**返回值                                                                       |
| `modifyRecord` / `deleteRecord`  | 不支持写 → 抛明确错误（Knorvia 凭据不信源在 CLI 侧）                                                   |

> **`set`/`unset`/`modifyRecord`/`deleteRecord` 抛错而不是静默成功**：静默成功会让配置界面
> 误以为写入生效（基类文档明确警告「read-only source 遮蔽时写入会看似成功」），属放宽行为。

### 3. `resolve()` 不可缓存（冻结）

`resolve()` **每次调用**都必须发一次反向请求（基类文档：`resolve` 是 per call，消费者必须每次
操作重新解析，不得跨操作缓存——否则改凭据后要重启才生效）。
**进程内不保存明文凭据**：结果只在本次调用内使用，不写字段、不进 Map、不进日志。

### 3.5 `resolve()` 返回 `undefined` 的语义（冻结，易错）

基类契约：`resolve()` 返回 `undefined` 表示**「这个引用没有配置」**，
**不是**「这次取失败」。两者后果完全不同：

| 情形                                             | 应返回/抛出 | 为什么                                                           |
| ------------------------------------------------ | ----------- | ---------------------------------------------------------------- |
| 引用名不在本 provider 的命名空间（前缀不匹配）   | `undefined` | 本 provider 不负责它；消费者会问下一个来源                       |
| Host 明确拒绝提供凭据（`headersApplied: false`） | **抛错**    | 这是「取失败」，当成「未配置」会误导用户去设置页找不存在的配置项 |
| 通道缺席 / 反向请求超时 / 应答非法               | **抛错**    | 同上                                                             |

一句话：**`undefined` 只能表达「不归我管」，不能表达「这次没取到」。**

### 3.6 `describeRecord` 的 `configured` 语义（冻结，DSH 设计意图）

`CredentialRecordInfo` 的字段是 **`configured`**（不是 `present`）。基类文档明确：

> 「record 的**存在**本身就是事实：`ApiKeyRecord` 即使既无 `key` 也无 `env`，
> 也表示 owner 确认该路由走 **ambient 认证**，**是 configured 而非 blank**。」

因此：

- `configured` **不能**用「有 key 或 headers 值」来判断；
- 正确的判断是**「record 是否存在」**——`readRecord()` 返回了 record 就是 configured；
- 这个区别会影响 `provider/testModelConnectivity`（B10）：「未配置」与
  「配置了但走 ambient 认证」是**两种不同的状态**，不能都报成「没配」。

### 4. 两条并行的凭据通道（这是本包的关键设计，经实测确认）

`dsh-llm-pi-ai` 有**两处**会读 `ctx.credentials`，形状不同：

**通道 A —— `authContextFrom(ctx).env(name)`（读取 `resolve()`）**

用于 `apiKeyEnv` 声明的那一个 key：

```js
async env(name) {
  if (isCredentialRefName(name)) {
    const hit = await ctx.get("credentials")?.resolve(credentialRef(name));
    if (hit !== void 0) return hit.value;      // ← 只能是一个字符串
  }
  return launchEnvironmentOf(ctx).get(name)?.value;
}
```

因此：**`resolve()` 只能承载单个 api key**，不能承载多 header。

**通道 B —— `readRecord(recordKeyFor(providerId))`（读取记录）**

`dsh-llm-pi-ai` 在需要「完整凭据对象」时读记录，`ApiKeyRecord` 的形状是：

```ts
interface ApiKeyRecord {
  readonly kind: "api-key";
  readonly key?: string; // api key
  readonly env?: Readonly<Record<string, string>>; // 额外 provider 环境值
}
```

`recordKeyFor(providerId)` = `credentialKey("llm-pi-ai", providerId)`（scope 固定 `"llm-pi-ai"`）。

**本包的实现映射（冻结）**：

| Knorvia `requestAuth`          | `resolve()`（通道 A）                       | `readRecord()`（通道 B）                         |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------ |
| `{ apiKey }`（无 headers）     | `{ value: apiKey, source: "knorvia-host" }` | `{ kind: "api-key", key: apiKey }`               |
| `{ apiKey, headers }`          | `{ value: apiKey, source: "knorvia-host" }` | `{ kind: "api-key", key: apiKey, env: headers }` |
| `{ headers }`（**无 apiKey**） | `{ value: <见下>, source: "knorvia-host" }` | `{ kind: "api-key", env: headers }`              |
| `headersApplied: false`        | **抛出明确错误**（B6）                      | 同左                                             |

**无 apiKey、只有 headers 时的处理（本次实测后的裁决）**：

- `resolve()` 仍必须回一个非空字符串（否则 `env()` 会落到已清空的启动环境）。本包回
  **`env()` 不实际使用该值**——因为 `PiAiProviderProfile.headers` 才能让 header 真正上到请求上，
  而它是**配置级静态值**（`requestHeaders(profile.headers)`），不能按请求变化。
- **所以纯 header 场景的终态是「本次请求的 header 无法按请求注入」**：这是 **DSH 的接口边界**，
  不是本包能绕过的。本包的处理：
  1. `readRecord()` 把 headers 放进 `ApiKeyRecord.env`（结构完整保留，供将来 llm-pi-ai 支持时使用）；
  2. `resolve()` 回一个**明确标记的占位值**（见 known-differences D2），并在**日志 `debug` 记一条**
     「header-only credential：headers 已进 record，但当前 llm-pi-ai 版本不按请求注入 header」；
  3. **不静默成功**：若该 provider 既无 apiKey 也无 `PiAiProviderProfile.headers` 静态配置，
     **`resolve()` 抛明确错误**（拿不到可用鉴权材料必须失败明确，B6）。
- **登记位置**：`known-differences.md` D2 + #235 + acceptance「未覆盖」。

> 为什么这样而不是直接抛错：`headers` 确实被 Host 回传了（事实存在），把它完整放进
> `ApiKeyRecord.env` 是对事实的保真投影；抛错会丢掉「Host 已经给了材料」这个信息。
> 但**最终请求能否带上 header 由 DSH 决定**，本包如实登记这个边界，不假装支持。

---

## 三、包内冻结的映射函数（供组合根与测试）

### 3.1 供应商配置 → `PiAiProviderProfile` 字典

```ts
/** Knorvia 侧一个供应商的配置（来源：Host 下发的供应商配置）。 */
export interface KnorviaProviderEntry {
  readonly providerId: string;
  /** 三种协议格式之一：见 §3.2。 */
  readonly protocol: KnorviaProviderProtocol;
  readonly baseURL: string;
  readonly displayName?: string;
  readonly models: readonly KnorviaProviderModel[];
  /** 可选：配置级静态 header（来自 Knorvia 供应商配置，**不含凭据**）。 */
  readonly staticHeaders?: Readonly<Record<string, string>>;
}

export interface KnorviaProviderModel {
  readonly modelId: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly reasoning?: boolean;
}

/** 产出可直接交给 `dsh-llm-pi-ai` 的 `Config.providers`。 */
export function buildPiAiProviderTable(
  entries: readonly KnorviaProviderEntry[],
): Readonly<Record<string, unknown>>;
```

**契约**：

1. **路由 key = `providerId`**（`PiAiProviderProfile`：「`providers` dict key IS the route」）。
2. `api` 取 §3.2 的协议字面量；`baseURL` 原样透传（不做尾斜杠归一）。
3. `apiKeyEnv` 写**引用名**（`KNORVIA_<providerId>` 规范化），其值由 `resolve()` 按请求从 Host 取；
   **不写任何真实 key**。
4. `staticHeaders` 存在时才写 `headers`（DSH 会 `assertValidHeaders` 校验，本包在写入前先自查，
   避免把一个非法 header 名字带进配置）。
5. 空 `entries` → 空字典（合法：没有配置就没有可选模型，不伪造默认 provider）。

### 3.2 三种协议格式（字面量与 `dsh-llm-pi-ai` 的 `PROTOCOLS` 表一致）

```ts
export type KnorviaProviderProtocol =
  | "openai-completions" // OpenAI-compatible（含大多数第三方网关）
  | "openai-responses" // OpenAI Responses API
  | "anthropic-messages"; // Anthropic Messages API
```

> 这三个字面量**不是**本包自造：它们就是 `dsh-llm-pi-ai` 的 `supportedProtocols()` 返回值
> （`PROTOCOLS` 表的键）。旧实现的「三种 provider 格式」按此一一对应。

### 3.3 凭据解析（`resolve` 的内部实现，冻结）

```ts
/** 把 DSH 的 credentialRef 映射到 Knorvia 的 providerId（引用名规则，见 §一 config）。 */
export function providerIdOfCredentialRef(ref: string, prefix?: string): string | undefined;

/** 按请求向 Host 取凭据。成功返回本次请求的鉴权材料；拿不到抛错（不返回 undefined）。 */
export function requestProviderCredentials(input: {
  readonly channel: LegacyHostChannel;
  readonly sessionId: string;
  readonly workspace: KnorviaWorkspaceRef;
  readonly providerId: string;
  readonly modelSelection: KnorviaModelSelection;
  readonly timeoutMs: number;
  readonly trace?: Readonly<Record<string, unknown>>;
}): Promise<{ readonly apiKey?: string; readonly headers?: Readonly<Record<string, string>> }>;
```

**契约**：

1. 反向请求方法名固定 `interaction/requestProviderRuntimeHeaders`，参数先用既有
   `knorviaProviderRuntimeHeadersRequestParamsSchema` 校验再发。
2. **应答必须运行时校验**：`knorviaProviderRuntimeHeadersResponseSchema.parse()`（L5）。
3. `headersApplied: true` → 返回 `requestAuth`；`headersApplied: false` → **抛出明确错误**（B6）。
4. 超时/无客户端/取消沿用既有 `-32022` / `-32020` / `-32021`（由 `LegacyHostChannel` 提供）；
   本包**不新增错误码**。

---

## 四、依赖方向（冻结）

| 方向                                 | 内容                                                              | 允许                                           |
| ------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------- |
| `kernel-dsh-builtins` → 本包         | 组合行 `createKernelCredentialProviderRow(moduleId)` 指向本包模块 | ✅（不 import 本包代码，只按 `moduleId` 挂载） |
| `kernel-bridge-legacy` → 本包        | 无（legacy 不认识本包）                                           | ✅                                             |
| 本包 → `kernel-bridge-legacy`        | 调用 `channelForHostRequests()`（#239 已合并的公开访问器）        | ✅                                             |
| 本包 → `kernel-dsh-builtins`         | **无**：不 import `bootstrap/src/kernel/**`                       | ❌ 禁止                                        |
| 本包 → `kernel-bridge-01/02/03` 内部 | **无**                                                            | ❌ 禁止                                        |

**判定命令**（实现阶段自查）：

```bash
git grep -n "bootstrap/src/kernel/\|kernel-bridge/\(entry\|bridge-engine\|projection\)" -- apps/cli/packages/bootstrap/src/kernel-plugin-credentials/ || true
```

期望：零命中（注释里说明禁止方向的文字除外）。

---

## 五、兼容面

- **不新增** `@knorvia/bootstrap` 根入口导出；不新增 CLI bin 或参数。
- **不新增环境变量**：`KNORVIA_KERNEL_ENGINE` 仍是唯一引擎开关。§一 的 `credentialRefPrefix`
  是组合行 config，不是环境变量。
- 不改 `packages/shared/src/protocol/**`、`protocol-v4/**` 的任何字段、schema、常量、导出。
- 不改旧数据目录、旧会话库、`.knorvia-studio`、凭据文件位置。
- 不改 `bootstrap/src/kernel/**`（组合与组合行归 `kernel-dsh-builtins`）。
- 不改工具子进程环境（`kernel-dsh-builtins` 已交付的「启动时用户环境快照、只去 `DSH_*`」）。

---

## 六、挂载时序由 `boot()` 保证，不由行顺序保证（2026-10-20 源码核实）

**结论**：provider 在首次模型请求时**必然已挂载**。保证它的是 **DSH `boot()` 的语义**，
**不是** `composition.ts` 里组合行的排列顺序。

四条证据（逐条读源码核实）：

1. **`cordis-plugin-loader` 的 `await()`** 循环等到任务归零才返回：
   ```js
   async await() {
     while (true) {
       const tasks = this.getTasks();
       if (!tasks.length) return;
       await Promise.allSettled(tasks);
     }
   }
   ```
2. **`dsh-app-boot` 的 `boot()`** 在返回前等待全部插件：
   ```js
   await mountRootInclude(...);
   await ctx.get("loader")?.await();   // ← boot() 返回时所有插件已加载完
   ```
3. **组合行之间是并发挂载**（`cordis-plugin-loader` 用 `Promise.all(ids.map(...))`）——
   **所以行顺序本来就不决定挂载顺序**。
4. **`kernel/process.ts` 的时序**：`bootKernel()`（含上述 `loader.await()`）→ **写就绪行** →
   `runBridge()` 才开始接受命令。

因此「provider 晚于首次模型请求挂载」这个场景**不会发生**：任何 v4 命令（含首次模型请求）
都必然发生在所有插件挂载完成之后。

**为什么这个区别重要**：

| 说法                    | 依赖什么                    | 稳定性                       |
| ----------------------- | --------------------------- | ---------------------------- |
| ❌「行位置保证」        | `composition.ts` 的实现细节 | 脆弱（改顺序就失效）         |
| ✅「`boot()` 语义保证」 | DSH 的公开契约              | 稳定（且上面有四条源码证据） |

**本包依赖后者。** 另注：`composition.ts` 的**输出顺序**（credentials 行早于 mcp-client 行）由
`kernel-dsh-builtins` 的测试锁住——那是**确定输出顺序**的保证，与**挂载时序**是两个不同的保证。

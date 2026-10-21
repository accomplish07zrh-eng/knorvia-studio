# kernel-plugin-credentials 已知差异

每条写理由与对应测试。**门槛不因此放宽**：这些是「必须保持的既有行为」或「DSH 接口的真实边界」，
不是为过门槛找的出口。

---

## D1 `dsh-credentials` 不能作为组合行挂载（DSH 接口事实，非缺陷）

- **现象**：`@deepseek-ai/dsh-credentials` 只导出**抽象基类** `CredentialProvider extends Service`；
  自身静态属性只有 `length` / `name` / `prototype`，**没有 `Config`**、**没有自定义 `apply`**
  （若看到 `apply` 那是 `Function.prototype.apply`，不是插件入口）。
- **理由**：它是「凭据引用能力」的服务契约，把**实现**留给使用方（其模块注释明确写
  "providers own the actual values and their storage"）。
- **本包处置**：本包提供实现该基类的插件模块（`apply(ctx)` 内实例化并令 `ctx.credentials` 可用）；
  组合行位置由 `kernel-dsh-builtins` 提供（`KERNEL_CREDENTIAL_PROVIDER_ROW_ID = "knorvia-credentials"`
  - `createKernelCredentialProviderRow(moduleId)`）。
- **不是本包的 workaround**：这是 DSH 的既定设计，不是绕过。
- **对应测试**：B1（插件 `apply` 后 `ctx.credentials` 可用）、B2（组合行契约对齐）。

---

## D2 纯 header 场景的 headers **无法按请求注入**（DSH 接口边界，如实登记）

- **现象**：当 Knorvia 的 `requestProviderRuntimeHeaders` 应答是 `{ headersApplied: true }` 且
  `requestAuth` **只有 `headers`、没有 `apiKey`** 时，本次请求的 headers **无法按请求生效**。
- **原因（三层，均已读源码确认）**：
  1. `llm-pi-ai` 的 `authContextFrom(ctx).env(name)` 只接受 `resolve()` 返回的**单个字符串**
     （`hit.value`），无法承载 `Record<string, string>`；
  2. `PiAiProviderProfile.headers` 存在且真的会上请求（`requestHeaders(profile.headers)`），
     但它是**配置级静态值**——每请求读取的是同一份配置，不随 Host 应答变化；
  3. 要让按请求的 headers 生效，只能在每请求**重建 profile**——那会打断正在进行的流，
     并改变 DSH 的配置生命周期语义（属「用公开 API 做非预期的事」，违反「不 fork、只用公开配置」）。
- **本包处置（三条，缺一不可）**：
  1. **保真**：把 headers 完整放进 `ApiKeyRecord.env`（`Record<string, string>` 结构不丢），
     通过 `readRecord()` 交给 `llm-pi-ai`——该通道能承载结构化 `env`（`ApiKeyRecord.env`）；
  2. **明确失败**：若该 provider 既无 `apiKey`、也无配置级静态 `headers`，
     `resolve()` **抛明确错误**，不返回占位值让请求裸奔；
  3. **不假装支持**：`resolve()` 在纯 header 场景返回占位值时，**记一条 `debug` 日志**说明
     「headers 已进 record，但当前 `llm-pi-ai` 版本不按请求注入 header」。
- **影响与归属**：仅影响「自定义 header 鉴权且**无 apiKey**」的供应商（实践中较少；主流供应商用 apiKey）。
  若将来必须支持，建议在 **DSH 上游**提需求（提供按请求 header 注入的公开接口），
  **不在本包做 workaround**。
- **对应测试**：B5（四条映射分支逐条断言，含纯 header 分支的占位值 + 日志）、B6（明确失败）。

---

## D3 `set` / `unset` / `modifyRecord` / `deleteRecord` 一律抛错（只读凭据面）

- **现象**：本包的 `CredentialProvider` 实现里，四个写入方法全部抛明确错误。
- **理由**：Knorvia 凭据由 **Host 侧的凭据服务**持有并写入；CLI 侧只是**读取方**。
  若静默成功，配置界面会误以为写入生效——基类文档明确警告「read-only source 遮蔽时写入会
  看似成功而解析仍回旧值」。静默成功属放宽行为。
- **本包处置**：抛错并说明「Knorvia credentials are owned by the host」。
- **对应测试**：B7（写入面拒绝 + `describe` 的 `writable: false`）。

---

## D4 `resolve()` 不缓存（基类契约，必须保持）

- **现象**：每次 `resolve(ref)` 都发一次反向请求，即使 1 秒内被问 10 次。
- **理由**：基类文档明确要求「resolution is per call: consumers re-resolve at each operation and
  must not cache across operations — that per-operation read is what makes a changed credential
  reach the next operation without a restart」。
  缓存会让「用户在设置里换了 key」在重启前不生效，属功能退化。
- **本包处置**：不缓存明文、不缓存解析结果；每次调用真实往返。
- **对应测试**：B5（同一 providerId 连续两次 `resolve` → 观察到两次反向请求）。

---

## D5 工具子进程环境**不因本包收紧**（既有行为，必须保持）

- **现象**：本包只约束「DSH 与模型适配」的凭据来源；工具子进程（bash 等）仍使用
  **启动时的用户环境快照**（只去掉 `DSH_*`）。
- **理由**：那是 `kernel-dsh-builtins` 已交付并经审查的行为（`kernel-dsh-00` 审查结论第 ① 条：
  「新内核也必须让工具子进程拿到启动时的用户环境（仅去掉 `DSH_*`），只禁止 DSH 自身和模型适配
  从环境读凭据」）。本包**不得回退**它。
- **本包处置**：不动 `bootstrap/src/kernel/**`；只在模型适配侧提供 `ctx.credentials`。
- **对应测试**：B8（断言工具子进程环境不含 `DSH_*`、其余变量保留）。

---

## D6 `provider/testModelConnectivity` 的离线边界

- **现象**：离线只能断言「拿不到凭据时明确失败」与「有凭据时构造出正确请求」；
  **真实往返**需要真实 key 与网络。
- **理由**：连接性测试的本质是发一次最小模型请求，无法离线验证。
- **本包处置**：离线覆盖失败路径与请求构造；真实往返归 `kernel-switch` 的实机冒烟。
- **对应测试**：B10（离线部分）。

# kernel-plugin-credentials 验收

## 一、完成定义

本包完成 = 合同 PR 合并 + 实现 PR 合并 + 默认引擎**零回归** + `dsh` 引擎下供应商表与凭据通道
按合同生效 + 复用清单中的测试继续通过 + 来源登记 + Linux/Windows CI 全绿。

**默认引擎切换不在本包**（`kernel-switch`）。**真实模型往返**也不在本包（需真实 key，归 `kernel-switch` 实机冒烟）。

---

## 二、合同阶段（PR「contract: kernel-plugin-credentials v1」）

| 项                 | 判据                                                                                                                         | 状态 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---- |
| 范围与不在范围     | [README.md](README.md) §一（含「不做什么」表与归属列）                                                                       | ⬜   |
| 现状与缺口         | README §二（4 条 DSH 侧实测事实 a–e、缺口 G1–G4）                                                                            | ⬜   |
| 锁定不变量         | README §三 L1–L9                                                                                                             | ⬜   |
| 复用清单           | README §七（哪些既有契约测试对新运行时同样适用）                                                                             | ⬜   |
| 行为条目           | [behavior.md](behavior.md) B1–B11                                                                                            | ⬜   |
| 接口               | [interface.md](interface.md)（插件 `apply` 面、`CredentialProvider` 各方法、**两条凭据通道映射表**、映射函数签名、依赖方向） | ⬜   |
| 调用方             | [callers.md](callers.md)（挂载方无编译期依赖、消费方两条通道、旧实现对照）                                                   | ⬜   |
| 已知差异           | [known-differences.md](known-differences.md) D1–D6                                                                           | ⬜   |
| 合同测试           | `tests/*.test.mjs` 走公开入口；**凭据夹具为虚构占位值**                                                                      | ⬜   |
| 旧门               | `node .../run-gate.mjs`：全过                                                                                                | ⬜   |
| 新运行时门         | `--engine dsh`：全过                                                                                                         | ⬜   |
| 格式 / Lint / 类型 | `pnpm fmt:check`、`pnpm lint`、`pnpm typecheck`                                                                              | ⬜   |
| 来源               | `licensing/reviews.json` 程序化追加；`provenance:report` / `check`                                                           | ⬜   |
| CI                 | Linux + Windows 全绿                                                                                                         | ⬜   |

**接入包无桩门**：本包不替换既有实现（旧模型适配随 `kernel-switch` 删除），因此不需要 stub。
「桩门证明用例非自证」的要求改由**失败路径断言**承担：每个成功路径都配一条「拿不到凭据时
必须明确失败」的断言（B6），因此空实现过不了。

合同阶段产物：

| 文件                               | 内容                                               |
| ---------------------------------- | -------------------------------------------------- |
| `gate-old.json`                    | 默认引擎运行记录（端口方法在旧引擎下由旧实现承担） |
| `gate-dsh.json`                    | 新运行时运行记录                                   |
| `fixtures/credentials-fixture.mjs` | **虚构**供应商配置与凭据占位值（见 §五 安全约定）  |
| `tests/entry.mjs`                  | 入口解析与引擎判定（只用产品开关）                 |
| `tests/run-gate.mjs`               | 旧门 / 新运行时门运行器                            |

---

## 三、实现阶段（PR「replace: kernel-plugin-credentials」）

### 1. 功能判据

- [ ] `KNORVIA_KERNEL_ENGINE=dsh` 时，插件挂载后 `ctx.credentials` 可用（B1）。
- [ ] 供应商配置能映射成合法 `PiAiProviderProfile` 字典，路由 key = `providerId`（B3）。
- [ ] 三种协议字面量与 `dsh-llm-pi-ai` 的 `supportedProtocols()` **逐字一致**（B4）。
- [ ] `resolve()` **每次调用**都发一次 `interaction/requestProviderRuntimeHeaders`（B5、D4 不缓存）。
- [ ] 应答经 `knorviaProviderRuntimeHeadersResponseSchema.parse()` **运行时校验**（B5、L5）。
- [ ] 四条映射分支（只有 apiKey / apiKey+headers / 只有 headers / `headersApplied:false`）逐条符合
      interface.md §2.4（B5、D2）。
- [ ] 拿不到凭据 → **明确失败**，不静默降级（B6、L6）。
- [ ] 四个写入方法抛错，`describe` 报 `writable:false`（B7、D3）。
- [ ] 工具子进程环境**未被收紧**（B8、D5）。
- [ ] 凭据不出现在日志/错误/夹具（B9、L8）。
- [ ] `provider/testModelConnectivity` 的离线部分：拿不到凭据 → 明确失败；有凭据 → 构造出正确请求（B10、D6）。
- [ ] 默认引擎行为不变（旧模型适配未改）。

### 2. 离线可判定行为（明确边界，不含真实网络）

| 行为               | 离线判定方式                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 供应商表映射       | 纯函数：给固定输入断言输出（B3/B4）                                                                                                |
| 凭据按请求获取     | 用可控的假 `LegacyHostChannel`（实现 `request`/`notify`），断言**每次 `resolve` 都收到一次调用**，并按四次映射分支喂不同应答（B5） |
| 拿不到凭据明确失败 | 四种失败输入（`headersApplied:false` / 通道 undefined / 通道抛 `-32020` / 通道抛 `-32022`）各断言抛出（B6）                        |
| 写入面拒绝         | 四个方法各断言抛出，并断言 `describe().writable === false`（B7）                                                                   |
| 工具子进程环境     | 断言子进程环境无 `DSH_*` 且用户自定义变量仍在（B8）                                                                                |
| 凭据不泄漏         | 捕获本包产出的全部日志字段与错误消息，断言不含夹具里的占位凭据值（B9）                                                             |
| 连接性测试请求构造 | 断言构造出的请求参数过得了既有 schema（B10）                                                                                       |

**不在离线范围**：真实 API 往返、真实 401/403、网络重试、流式中断。归 `kernel-switch` 实机冒烟。

### 3. 复用清单回归

| 套件                                                               | 实现阶段要求                                   |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| `specs/contracts/kernel-bridge-legacy`                             | 旧门与 `--engine dsh` 全过（本包不改旧协议面） |
| `specs/contracts/kernel-bridge-01`                                 | 全过（不改 v4 面）                             |
| `specs/contracts/kernel-dsh-00/tests/engine-selection.test.mjs`    | 全过                                           |
| `specs/contracts/kernel-dsh-builtins`                              | 全过（不改其组合）                             |
| `specs/contracts/contracts-*`、`shared-*`、`apps-cli-packages-01*` | 全过                                           |

### 4. 门禁（实现 PR 贴全表）

| 检查         | 命令                                                                                                         | 结果 |
| ------------ | ------------------------------------------------------------------------------------------------------------ | ---- |
| 类型         | `pnpm typecheck`                                                                                             | ⬜   |
| Lint         | `pnpm lint`                                                                                                  | ⬜   |
| 格式         | `pnpm fmt:check`                                                                                             | ⬜   |
| 架构（全量） | `pnpm architecture:check`                                                                                    | ⬜   |
| 构建         | `pnpm build:cli-packages`                                                                                    | ⬜   |
| 离线回归     | `pnpm test:studio`（含本目录测试自动发现）                                                                   | ⬜   |
| 旧门         | `run-gate.mjs`                                                                                               | ⬜   |
| 新运行时门   | `run-gate.mjs --engine dsh`                                                                                  | ⬜   |
| 未使用       | `pnpm knip`（本包零新增条目）                                                                                | ⬜   |
| 来源         | `pnpm provenance:report` + `provenance:check`                                                                | ⬜   |
| 相似度       | 新增代码登记 original；对旧模型适配（`adapters/src/model/**`、`model-factory.ts`）与上游 `872ad960` 跑两道门 | ⬜   |
| 依赖方向     | `git grep` 断言本包不 import `bootstrap/src/kernel/**` 与 kernel-bridge 内部                                 | ⬜   |
| CI           | Linux + Windows 全绿                                                                                         | ⬜   |

**DSH 按第三方依赖登记、不跑相似度**（计划书接入包流程第 3 条）。

---

## 四、安全约定（本包红线，逐条实测）

| #   | 约定                                 | 判定方式                                                                                               | 结果 |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---- |
| S1  | **凭据不得出现在代码**               | 全仓检索夹具占位值以外的疑似 key 格式；本包源码不改写任何真实凭据                                      | ⬜   |
| S2  | **凭据不得出现在日志**               | B9：捕获本包全部日志字段，断言不含凭据值                                                               | ⬜   |
| S3  | **凭据不得出现在错误消息与异常堆栈** | B6/B9：断言错误消息与 `cause` 链均不含凭据                                                             | ⬜   |
| S4  | **凭据不得出现在夹具**               | 夹具只用虚构占位值（见 §五）                                                                           | ⬜   |
| S5  | **凭据不得出现在 PR 文本**           | PR 自查（人工确认）                                                                                    | ⬜   |
| S6  | **反向请求应答必须运行时校验**       | B5：断言未经 schema 校验的应答**不会**被当作凭据使用                                                   | ⬜   |
| S7  | **拿不到凭据必须失败明确**           | B6：四种失败输入各断言抛出                                                                             | ⬜   |
| S8  | **无进程级清理**                     | 夹具只对自己 `spawn` 的句柄 `kill`，且只在 `after` 钩子里；全目录 grep 无 `taskkill`/`pkill`/`killall` | ⬜   |
| S9  | **无真实 `~/.dsh` 读写**             | 夹具把 `HOME`/`USERPROFILE`/`DSH_HOME` 指向 `mkdtemp` 临时根                                           | ⬜   |

---

## 五、夹具安全（虚构值与防御性设计）

### 1. 凭据一律虚构（硬性）

**夹具一律使用明确虚构的占位值**，不得使用任何真实 key 的格式：

```js
// 正确：一眼可辨为虚构
export const FIXTURE_API_KEY = "fixture-api-key-0001";
export const FIXTURE_HEADER_VALUE = "fixture-header-value";

// 禁止：模仿真实前缀或长度（例如 "sk-" + 32/48 位十六进制）
```

理由：真实 key 格式的假值容易被误认为泄漏、会触发凭据扫描告警，且不利于审查者快速判断。

**自证断言**（B11）：测试里断言 `FIXTURE_API_KEY.startsWith("sk-") === false` 且
`FIXTURE_API_KEY.length < 20`——**防止夹具"看起来像真 key"**。这条不是形式检查：
它把「虚构」这个约定变成了可执行断言，将来有人换成 `sk-` 开头的假值会立刻红。

### 2. 端点一律用 `.invalid` 保留域名（防御性设计）

夹具里所有 `baseURL` 都用 **RFC 2606 保留域名 `.invalid`**：

```
https://fixture-openai-completions.example.invalid/v1
```

`.invalid` 保证**永不解析**，因此**即使测试逻辑有 bug、忘了给某个用例打桩也不会误连真实服务**。
这是防御性夹具设计：把「不可能失败成真实网络请求」变成结构保证，而不是靠每处都记得打桩。

---

## 六、为什么用源码扫描做 B8 的反向断言

B8 要求「本包**不得**收紧工具子进程环境」。这是**否定性约束**（「不存在某类代码」），
无法用运行时断言证明——**你没法在运行时证明"某段代码不存在"**。

因此 B8 用**源码扫描**：

```js
const forbidden = [
  /delete\s+process\.env/u,
  /process\.env\[[^\]]+\]\s*=/u,
  /sanitizeProcessEnvironment/u,
  /DSH_PREFIX/u,
  /API_KEY_SUFFIX/u,
];
// 逐个 .ts 文件断言上述模式一个都不命中
```

并额外禁止 import 组合层（防止越界）：

```js
/from\s+["'][^"']*\/kernel\/(composition|host|environment|credential-provider)\./u;
```

**它保护的是「本包不该有某类代码」这个否定性约束**——将来若有人在这个包里
「顺手把环境也清干净」，这条会红。同理，`kernel-bridge-legacy` 的 B18b 也用「
`"setChannel" in channel === false`」这类否定性断言证明窄接口没有外露管理面。

---

## 七、合同阶段 gate 预期红（应然状态，不是缺陷）

合同阶段 `apps/cli/packages/bootstrap/src/kernel-plugin-credentials/**` **尚不存在**，
因此 `tests/credentials.test.mjs` 的源码加载会失败 → 门是红的。

**这是应然状态**，与 `kernel-bridge-legacy` 的 dsh 门在合同阶段 1/10 是同一性质：
先冻结断言、留待实现转绿。

为了让审查者能区分「合同阶段故意红」与「实现阶段真失败」，`run-gate.mjs` 在 gate json 里显式记录：

| 字段                               | 合同阶段                                         | 实现阶段           |
| ---------------------------------- | ------------------------------------------------ | ------------------ |
| `phase`                            | `"contract"`                                     | `"implementation"` |
| `baseline.reason`                  | `"implementation absent"`                        | `null`             |
| `target.expected`                  | `"11/11 pass, 0 skip"`                           | 同左（判据不变）   |
| `assertionsRelaxed` / `forcedExit` | `false`                                          | `false`            |
| 门的判定                           | 允许红，但必须**红得符合预期**（实现确实不存在） | **必须全绿**       |

实现阶段应达到 `target.expected`；判据（`skipped === 0`、`timedOut`、`signaled`）在合同阶段
就已冻结，实现阶段不得放宽。

---

## 八、未覆盖（如实标注）

| 项                                                 | 原因与归属                                                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **真实模型往返**                                   | 需真实 key 与网络；本包只覆盖请求构造与失败语义。归 `kernel-switch` 实机冒烟                                                                           |
| **纯 header 场景按请求注入**                       | DSH 接口边界（`PiAiProviderProfile.headers` 是配置级静态值）。headers 保真进 `ApiKeyRecord.env`，但不保证按请求生效（D2）。将来需要则在 DSH 上游提需求 |
| **凭据写入（`set`/`unset`/record 写）**            | Knorvia 凭据由 Host 持有，CLI 侧只读（D3）                                                                                                             |
| **模型流式与重试细节**                             | 由 DSH `llm-pi-ai` 承担，不在本包                                                                                                                      |
| **账户配置同步（`provider/updateAccountConfig`）** | 归 `kernel-switch` / 既有 Host 链路；本包只消费配置结果                                                                                                |
| **`composition.ts` 的行顺序与挂载时序**            | 归 `kernel-dsh-builtins`；本包依赖 DSH `boot()` 的 `loader.await()` 语义（README §二 e）                                                               |
| **macOS 实机**                                     | 未验证，如实标注                                                                                                                                       |

---

## 九、首次失败与修正

（合同阶段与实现阶段各自记录；本节在实现 PR 时填写实测。）

---

## 十、完成度

| 项                                                                        | 状态 |
| ------------------------------------------------------------------------- | ---- |
| 合同 v1（README/behavior/interface/callers/known-differences/acceptance） | ⬜   |
| 合同测试 + 夹具                                                           | ⬜   |
| 旧门 + 新运行时门录制                                                     | ⬜   |
| 实现（供应商表 + 凭据 provider + 连接性测试）                             | ⬜   |
| 相似度两道门                                                              | ⬜   |
| 来源登记 + provenance                                                     | ⬜   |
| 双平台 CI                                                                 | ⬜   |

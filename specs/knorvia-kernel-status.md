# Knorvia 内核分层状态与能力验收（T04）

更新：2026-09-25。延续 `specs/knorvia-cli-expansion.md` 的候选登记、探测与运行边界，以及 `packages/services/src/studio-runtime/adapters/kernels/README.md` 的隔离探测与短时缓存设想。本规格只描述服务端（`packages/services`）的探测结果契约、能力判定与验收；UI 与文案另有后续 wave，本轮不改界面。

## 产品规则

内核可用性必须分层表达，不再把所有异常折叠成一句 `installed:false`。一次探测固定分为四段，顺序为 `locate`（定位）→ `version`（版本）→ `protocol`（协议）→ `auth`（账号）。每段独立捕获：后段失败不得抹掉前段已经取得的证据（可执行路径、版本号、更新入口）。

- `installed` 由定位、版本，以及（描述符协议为 `acp` 时）协议握手共同决定；非 ACP 内核的协议段为 `skipped`。
- `origin` 只由定位段决定：定位失败为 `missing`，定位成功按可执行文件归属为 `managed` 或 `external`（内置 Knorvia 仍为 `builtin`）。因此“程序存在但协议握手失败”= `origin:"external"` + `probe.stages.protocol.status:"failed"`，“未安装”= `origin:"missing"` + `probe.stages.locate.status:"failed"`。两者在界面与管理页必须能区分。
- 旧字段（`installed`、`origin`、`version`、`executablePath`、`capabilities`、`error`、`externalUpdate`、`management`、`displayName`、`remoteWorkspacePath`、`remoteEnvironmentLabel`）语义与取值域保持不变，只新增唯一可选字段 `probe`。不新增 `origin` 成员（UI 依据 `origin` 生成 i18n key），不挪作他用 `error`。
- 外部更新入口探测（`externalUpdatePlan`）与隔离目录清理（`isolation.close()`）都是附加动作：它们失败只能记录，不能把已经成立的成功状态改写成 `missing`。
- 账号段永不自动执行，也永不调用任何登录命令或写入任何凭据：只有显式 opt-in 的请求才允许探测；“ACP 握手成功”只代表协议可用，绝不等于“账号可用”。
- 能力（`capabilities` 的五个布尔值）来自版本化矩阵，而不是散落的 `if`。矩阵只能“如实收紧”：未核验、探测失败、用户显式授权的例外三种状态必须互相可区分，从不静默升级能力。

## 探测结果契约

`packages/services/src/studio-runtime/adapters/kernels/probeResult.ts`（浏览器安全：只有类型与纯函数，不导入任何 Node 模块）。阶段执行、附加动作与协议缓存位于 `adapters/kernels/kernelInspection.ts`，它是分层探测的唯一所有者；`kernelRegistry.ts` 只提供在飞去重、运行租约与注册表生命周期（按架构策略的文件行数上限拆分）。

```ts
type ProbeStage = "locate" | "version" | "protocol" | "auth";
type ProbeStageStatus = "ok" | "failed" | "skipped" | "cancelled" | "timeout";
interface ProbeStageResult {
  status: ProbeStageStatus;
  reason?: string; // 人读原因；失败/取消/超时必须给出
  code?: string; // 机器可读代码；见下表
  ms: number; // 该段实际耗时
}
interface StudioKernelProbe {
  stages: Record<ProbeStage, ProbeStageResult>;
  durationMs: number;
  probedAt: number; // Unix ms
  cached?: boolean; // 协议段命中短时缓存时为 true
}
class ProbeError extends Error {
  readonly code: ProbeCode;
}
```

`StudioKernelStatus` 只增加 `probe?: StudioKernelProbe`。`probe` 缺失（旧数据、远端记录、自定义清单被拒）时，消费方按旧的 `installed`/`origin`/`error` 语义处理即可。

阶段状态语义：

| 状态        | 含义                                                      | 是否算该段通过 |
| ----------- | --------------------------------------------------------- | -------------- |
| `ok`        | 该段完成并取得结果                                        | 是             |
| `skipped`   | 该段按规则不适用或未获授权（非 ACP 协议、未请求账号核验） | 是（不阻塞）   |
| `failed`    | 该段执行并确定失败                                        | 否             |
| `timeout`   | 该段在固定期限内没有结果                                  | 否             |
| `cancelled` | 用户/关闭动作取消了该段                                   | 否             |

失败代码词表（`probeResult.ts` 导出为联合类型）：

```text
locate.ok / locate.registry-closed / locate.manager-unavailable / locate.path-invalid
locate.launcher-unresolved / locate.missing / locate.failed
version.ok / version.spawn / version.exit / version.timeout / version.cancelled
version.output-invalid / version.unparsable / version.failed
protocol.ok / protocol.unavailable / protocol.mismatch / protocol.rpc / protocol.transport
protocol.timeout / protocol.cancelled / protocol.failed
auth.ok / auth.not-requested / auth.unavailable / auth.failed / auth.timeout / auth.cancelled
stage.not-reached
```

`stage.not-reached` 用于前序阶段失败导致本段根本没有执行的场合，与“按规则跳过（`skipped`）”区分：非 ACP 内核的 `protocol.unavailable`、未请求账号核验的 `auth.not-requested` 属于后者。`auth` 只要定位与版本已经完成就记为 `auth.not-requested`（与协议结果无关）；只有定位或版本失败时才保留 `stage.not-reached`。

取消、超时、协议不匹配必须在抛出点使用 `ProbeError`，让这些原因以稳定代码穿过捕获层，而不是重新退化为一句话：

| 抛出点                                          | 代码                     | 消息（保持原样）           |
| ----------------------------------------------- | ------------------------ | -------------------------- |
| `processTransport.captureVersion` 取消          | `version.cancelled`      | `版本探测已取消`           |
| `processTransport.captureVersion` 8 秒超时      | `version.timeout`        | `CLI 版本探测超时`         |
| `processTransport.captureVersion` 非零退出      | `version.exit`           | 原 stderr/退出码文本       |
| `processTransport.captureVersion` 输出超限      | `version.output-invalid` | `无效的版本输出`           |
| `processTransport.ProtocolProcess.request` 超时 | `protocol.timeout`       | 原 `<method> 等待响应超时` |
| `acpProbe` 收到 abort                           | `protocol.cancelled`     | `ACP 探测已取消`           |
| `acpProtocol.initializeAcp` 协议版本不符        | `protocol.mismatch`      | `CLI 未通过 ACP v1 握手`   |

非 `ProbeError` 的异常按阶段兜底：协议段的 RPC 错误应答记 `protocol.rpc`，进程早退/传输错误记 `protocol.transport`，其余记 `protocol.failed`；定位段记 `locate.failed`（`reason` 保留原始文本，例如收据/完整性/路径错误）。信号已 abort 时，无论异常类型一律记为 `cancelled`。`locate` 尚未细分的自由文本（受管收据、完整性、越界启动器等）保留在 `reason` 中；这些抛出点位于本轮写入范围之外，细分代码在后续 wave 通过让 `executable.ts` / `managedKernels.ts` 抛 `ProbeError` 完成。

旧失败模式到新代码的映射（用于回归验收）：

| 旧失败模式                                                                     | 现在的阶段/代码                                                                  |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 注册表已关闭 `kernelRegistry.ts:74`                                            | `locate` / `locate.registry-closed`                                              |
| 运行租约或管理锁不可用 `kernelRegistry.ts:78`                                  | `locate` / `locate.manager-unavailable`                                          |
| 受管收据/完整性 `managedKernels.ts:44,54,59`                                   | `locate` / `locate.failed`（reason 保留原文）                                    |
| 可执行文件不存在 / 非绝对路径 / 无法解析的启动器 `executable.ts:163,73-74,144` | `locate` / `locate.missing`、`locate.path-invalid`、`locate.launcher-unresolved` |
| 隔离目录建立/清理失败 `isolatedInspection.ts:16,42`                            | 建立失败 `locate` / `locate.failed`；清理失败只记录，不改状态                    |
| 版本进程 spawn 错误 `processTransport.ts:286`                                  | `version` / `version.spawn`                                                      |
| 版本非零退出 `processTransport.ts:288`                                         | `version` / `version.exit`                                                       |
| 版本超时 8 秒 `processTransport.ts:278`                                        | `version` / `version.timeout`                                                    |
| 版本取消 `processTransport.ts:277`                                             | `version` / `version.cancelled`                                                  |
| 版本输出过大/无效 `processTransport.ts:281`                                    | `version` / `version.output-invalid`                                             |
| 版本号不可解析 `kernelRegistry.ts:110`、`kernelPolicy.ts:71-73`                | `version` / `version.unparsable`                                                 |
| ACP 握手超时 25 秒（DSH 45 秒）`acpProbe.ts:34`                                | `protocol` / `protocol.timeout`                                                  |
| ACP 协议版本不匹配 `acpProtocol.ts:21`                                         | `protocol` / `protocol.mismatch`                                                 |
| ACP 探测取消 `acpProbe.ts:31-32`                                               | `protocol` / `protocol.cancelled`                                                |
| ACP 早退/传输错误 `acpProbe.ts:21-30`                                          | `protocol` / `protocol.transport`、`protocol.rpc`                                |
| 外部更新入口解析失败 `kernelRegistry.ts:128-130`                               | 不进入任何段：非致命，成功状态保持，`externalUpdate` 省略                        |
| 隔离目录清理失败 `kernelRegistry.ts:132-134`                                   | 不进入任何段：非致命，成功状态保持                                               |

`error` 字段填第一条非 `ok`/`skipped` 阶段的原因文本（`probeSummary`），成功时为 `undefined`。`version` 与 `executablePath` 在定位成功后就写入结果，即使版本段失败也保留（这是分层探测相对旧实现的行为改进）。

## 结果缓存

探测缓存只缓存 ACP 协议握手这一步（`running` 仍只做在飞去重），因为版本探测便宜而握手昂贵（DeepSeek Harness 首次隔离握手约 20 秒，见 kernels/README.md:9）。

- Key：`内核 id | 可执行文件绝对路径 | 版本号 | 环境指纹 | 工作区标识`。环境指纹 = 该次探测注入的隔离环境（`HOME`/`DSH_HOME` 等）加上 `PATH`、`SystemRoot`、`APPDATA`、`LOCALAPPDATA`、`USERPROFILE`、`HOME`、`NODE_OPTIONS` 的稳定拼接；工作区标识 = 本次探测的工作目录（隔离目录 `cwd`，否则注册表数据目录）。键的任一组成变化即自然失效。
- TTL 5 分钟（`PROBE_CACHE_TTL_MS`），条数上限 32（先进先出淘汰），只缓存协议段为 `ok` 的结果；失败、取消、超时、跳过都不写入，避免把瞬时故障固化。
- 隔离探测（`qoder-cn`、`deepseek-harness`）的临时 HOME/`DSH_HOME` 每次都是新建目录；其等价性由契约保证（同版本、每次都是空配置目录），因此键把隔离环境与工作区标识归一为 `<isolated>`，否则这两个内核永远无法命中、缓存失去意义。归一只作用于键，不改变实际探测使用的真实环境。
- 命中时 `probe.cached` 为 `true`，协议段沿用原探测的时刻与耗时，其余阶段照常执行。
- 失效触发器：`manage()` 任何动作成功后清空；`dispose()` 清空；`refresh` 显式重探绕过缓存并覆盖条目。
- 缓存不改变事实：受管安装的收据与完整性校验在定位段每次都重新执行，缓存只跳过握手。

## 能力矩阵

`packages/services/src/studio-runtime/domain/capabilityMatrix.ts` 是唯一的五能力来源，替换 `kernelPolicy.ts:27-35` 的硬编码分支，并被 `assertKernelPermission` 与 ACP 原生声明（overrides）共用。该文件不导入任何其它模块（domain 层不得有 IO，也避免与 `kernelTypes.ts` 形成循环依赖）。

证据等级（`StudioCapabilityEvidence`）：

| 证据             | 含义                                           | 是否授予能力   |
| ---------------- | ---------------------------------------------- | -------------- |
| `verified`       | 命中版本化的已核验行（版本满足该行下限）       | 是             |
| `declared`       | 版本未知时适配器自身的既有声明（当前线上行为） | 是             |
| `advertised`     | 探测期原生协议声明（ACP `initialize`）         | 是             |
| `adapter`        | Studio 适配器自身实现，与原生声明无关          | 是             |
| `unsupported`    | 明确不支持（例如不能保证强制只读）             | 否             |
| `unverified`     | 版本已知但不在已核验范围内                     | 否（失败关闭） |
| `user-exception` | 用户显式授权的例外，只能由调用方显式传入       | 是             |

版本化表按“内核/家族 + 版本区间”组织行。当前行的能力值与既有硬编码分支逐一等价（`knorvia` 五能力 T/T/T/F/T；`codex` T/T/T/T/T；`claude-code`、`grok-build` T/T/T/F/T；`antigravity` T/F/F/F/T；其余外部与 `acp:*` F/F/F/F/F）。已核验下限取本仓库实测过的版本（`README.md:47,44`）：`codex ≥ 0.151.0`、`claude-code ≥ 2.1.220`、`grok-build ≥ 1.0.3`、`antigravity ≥ 1.2.2`。规则：

1. 版本未知（运行期 `assertKernelPermission` 的现有调用方不传版本）→ 使用 `declared` 行，行为与今天完全一致。
2. 版本已知且满足下限 → 该行为 `verified`。
3. 版本已知但低于下限 → 该行原本为真的能力降级为 `unverified` 且布尔值为 `false`（失败关闭）；原本为 `unsupported` 的保持 `unsupported`。
4. 无已核验行的家族（全部 ACP 与自定义 `acp:*`）与版本无关，保持 `adapter`/`unsupported`，以便握手后仍能按原生声明升级 `resume` 与 `approval`。
5. ACP 原生声明只允许升级 `resume`（`loadSession` 或 `sessionCapabilities.resume`）与 `approval`（握手成功即适配器可路由 `session/request_permission`），证据为 `advertised`/`adapter`；`readOnly`、`fullAccess`、`questions` 永不由原生声明升级。探测失败时不得留下任何“已升级”的痕迹。
6. `unsupported`/`unverified` 不允许被声明升级。用户例外必须由调用方显式传入（`exception`），永远不会自动产生。

`assertKernelPermission(id, permission, options?)` 继续只拦 `read-only`（`full-access` 由协议层核验原生模式，本轮不放宽也不收紧），消息保持 `… 当前接入不能保证强制只读，请选择询问模式；不会自动放宽权限`。`options.version` 传入时启用版本化收紧；`options.exception` 只在用户显式授权时传入。运行层 `kernelRun.ts:126` 目前不传版本，因此运行期行为不变；把发现到的版本接入运行层的权限断言是后续 wave 的工作（本轮 `kernelRun.ts` 不在写入范围）。

## 状态与事件顺序

```text
inspect(configs, {refresh?})
  └─ inspectOne(kernel)                                    【kernelInspection.ts 唯一拥有分层探测与协议缓存】
       locate   : resolveKernel（收据/完整性/路径）→ isolation 建立        ── 失败 ⇒ origin=missing, installed=false
       version  : captureVersion(--version) → versionFrom                 ── 失败 ⇒ 保留 executablePath, installed=false
       auth     : 定位+版本通过后即记为 skipped(auth.not-requested)        ── 永不自动探测、永不代登录
       protocol : 缓存命中 → 复用；否则 ACP initialize（仅 acp 描述符）    ── 失败 ⇒ origin 仍为 external, installed=false
       附加     : externalUpdatePlan（独立捕获，失败不改变状态）
       清理     : isolation.close()（独立捕获，失败不改变状态）
  → StudioKernelStatus{ ..., probe }
manage(kernel, action) → 清缓存 → 管理操作 → inspectOne(refresh: true)
dispose() → 清缓存 → abort 在飞探测
```

## 验收

- 程序存在但协议失败与未安装可区分：两者都 `installed:false`，但前者 `origin:"external"`、`probe.stages.protocol.code:"protocol.mismatch"`，后者 `origin:"missing"`、`probe.stages.locate.status:"failed"`。
- 取消与超时各有稳定代码：`version.cancelled` 与 `version.timeout` 不等价，都不写成 `failed` 泛化文本。
- 清理/更新入口失败不再抹掉成功状态：注入 `isolation.close()` 与 `externalUpdatePlan` 失败后，状态仍为 `installed:true`、`origin:"external"`、`version` 保留。
- 缓存：同版本第二次探测不再发起 ACP 握手（`probe.cached === true`）；`refresh: true` 必须重新握手；`manage()`/`dispose()` 后缓存失效；版本或路径变化自然未命中。
- 能力矩阵：`codex` 强制只读在未核验版本上被拒绝（失败关闭），`claude-code`/`grok-build` 始终拒绝只读，ACP 内核握手后 `resume`/`approval` 可按原生声明升级而 `readOnly`/`fullAccess` 不被升级；用户例外必须显式传入。
- 旧字段不变：`installed`、`origin`、`version`、`executablePath`、`capabilities`、`error`、`externalUpdate`、`management`、`displayName`、`remote*` 的取值与语义与之前一致，既有 `studio-kernels-*.test.ts`、`studio-acp-discovery.test.ts`、`studio-antigravity-protocol.test.ts` 全部保持通过。
- 账号段：任何自动探测路径下 `probe.stages.auth.status === "skipped"` 且代码为 `auth.not-requested`；代码中不存在任何登录调用。

## 协议依据

ACP 初始化与能力声明沿用 <https://agentclientprotocol.com/protocol/v1/initialization> 与 <https://agentclientprotocol.com/protocol/v1/session-setup>；Codex app-server、Claude Code stream-json、Grok Build ACP 与 Antigravity headless 的探测命令与版本下限见 `packages/services/src/studio-runtime/adapters/kernels/README.md` 的“协议依据与验证”。缓存只影响 Studio 自己的探测节奏，不改变原生 CLI 的认证、配置与登录状态。

## UI 呈现（T04 UI 波次，2026-09-25 追加）

本节追加于后端落地之后（commit `18acac7`）；它取代文首“本轮不改界面”的表述，其余各节保持原文不变。实现集中在
`packages/ui/src/studio/agents/**`、`packages/ui/src/settings/LocalDiagnosticsSettings.tsx`、
`packages/desktop/src/main/localDiagnostics.ts` 与 `packages/shared/src/localDiagnostics.ts`。

### 动作与所在界面

不新增页面或面板：全部动作都落在既有的 Agent 管理（设置 · Agent 管理）、安装与维护对话框、会话编辑器与设置 · 导出诊断信息四个面内。

| 动作           | 所在界面                                                            | 行为                                                                                                                                     |
| -------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 选择程序       | Agent 管理 → 配置（`StudioAgentConfigDialog` 的可执行文件路径输入） | 保存后写入连接配置，并立刻走一次「重新探测」；路径变化本身也会让缓存键未命中                                                             |
| 重新探测       | Agent 管理卡片底部、安装与维护对话框底部、发送被拒提示旁            | 调用 `reprobe()` → `inspectKernels({ refresh: true })`，绕过协议缓存并要求显示本次真实结果；协议段命中缓存时界面显式标注“协议段来自缓存” |
| 查看诊断       | 每张卡片的分层探测摘要行「查看诊断」                                | 展开四段的状态、机器代码、原因与耗时（只读，不发请求）                                                                                   |
| 去原 CLI 登录  | 分层探测摘要行下方（仅在失败原因指向认证时出现）                    | 只读提示：说明 Studio 不代登录、不保存凭据、也不写入任何 CLI 配置；没有任何执行登录的入口                                                |
| 导出诊断       | 设置 · 导出诊断信息                                                 | 显式勾选后才附带阶段字段                                                                                                                 |
| 安装/更新/卸载 | 安装与维护对话框（不变）                                            | 管理动作结束后强制走 `reprobe()`，不吃缓存                                                                                               |

### 阶段与原因的渲染规则

- 阶段顺序固定为 `locate → version → protocol → auth`，逐段显示，不把失败折叠成一句“未安装”。
- 阶段状态按 `probeResult.ts` 的取值域渲染：`ok` = 通过、`skipped` = 跳过（按规则不适用或未获授权，不算失败）、`failed` = 失败、
  `timeout` = 超时、`cancelled` = 已取消；不在该取值域内的取值（未来新增或载荷损坏）一律渲染为“未知”，**永不**渲染为通过。
- 机器代码原样以等宽字体展示（它是稳定词表），仅对已登记的代码附带人读解释；未登记的代码只显示代码本身，不为未知代码猜语义。
- 阶段 `reason` 由宿主给出，作为可选中复制的原始证据展示；界面不解析、不改写它。
- 每段附带实际耗时（`ms`），整体耗时显示 `probe.durationMs`；`probe.cached === true` 时在协议段旁标注来自缓存，避免把缓存结果当成一次新的握手。
- 卡片徽标按分层证据给出：四段全通过 → 已检测到/内置；`locate` 失败 → 未检测到安装；**定位成功但版本/协议/账号失败 → “已安装但不可用”**，与“未安装”必须不同。
- `probe` 缺失（旧记录、远端快照、被拒清单）时沿用旧的 `installed`/`origin`/`error` 语义显示徽标，并在详情处明确写出“此记录没有分层探测证据，不能据此确认可用”。

### 未知与未核验的呈现

- 未检测、未知阶段状态、版本未核验都按“不可确认”呈现，绝不写成“可用”。徽标在未检测时为“尚未检测”，检测后仍无可用证据时为“未检测到安装/已安装但不可用”。
- 能力行只使用宿主上报的 `capabilities`（其中已包含 ACP 协商后的升级），界面不重算、不升级；只补充证据说明：
  `verified`（本地版本化矩阵对这个版本已核验）、`reported`（按当前接入声明/协商结果）、`unverified`（版本已知但不在已核验范围内，失败关闭）、`unsupported`（明确不支持）。
  “版本未核验”与“明确不支持”必须可区分；版本未核验时另外显示一行说明，提示更新内核或重新探测后再确认。
- 诊断导出中的阶段字段是 opt-in：默认不导出，勾选后只导出状态、机器代码、原因与耗时；原因与代码先过既有凭据脱敏（`redactDiagnosticText`），
  再把路径形状归一为 `[path]`；可执行路径、环境变量与凭据永不进入诊断包。阶段形状不可信（缺段或未知状态）时宁可不导出该内核的阶段信息。

### 发送前校验

会话编辑器的发送入口（`submitStudioChat`）在创建会话与发送之前做一次真实能力校验；不满足要求时**不发出任何命令**，并抛出带可解释原因的拒绝：

- `status-unknown`：该内核尚未检测；提示先检测。
- `remote-offline`：SSH 远端已断开。
- `not-installed`：定位段失败或旧字段表明不可用。
- `probe-failed`：程序存在但某段未通过；原因里给出该段与机器代码。
- `version-unverified`：版本已知但不在已核验范围内，所需能力失败关闭。
- `permission-unsupported`：内核明确不支持所选权限档。

硬性规则：

1. 校验只做“拒绝或放行”，**从不**替换模型、**从不**把权限降级或提升，也从不写入别的内核或模型；放行时 `selection` 与 `permission` 原样传递（`send` 命令本身不携带权限字段）。
2. `read-only` 必须由内核证明（能力 `readOnly`），`full-access` 必须由内核证明（能力 `fullAccess`）；`ask` 沿用 CLI 自身的审批流，不额外收紧。
3. 拒绝文案解释“哪一段/哪个能力/哪个权限档不成立”，并提供不改变权限或模型的出口：重新探测、查看诊断、只读的登录提示。
4. 不得用“自动切换模型/内核”或“静默放宽权限”让发送成功；这两种行为在本轮实现中不存在，测试对放行路径断言选择与权限未被改写。

### UI 验收

- “程序存在但协议失败”与“未安装”在卡片上徽标、阶段行与发送拒绝文案三处都可区分。
- 未知阶段状态渲染为“未知”，不会渲染为“通过”；`probe` 缺失时显示“没有分层探测证据”。
- 重新探测走 `refresh: true`；在飞检测期间的重探会在本轮结束后再跑一轮，并保留 refresh 语义。
- 认证提示只在失败原因指向认证时出现，且不联网、不启动进程、不写凭据。
- 诊断导出默认不含阶段字段；勾选后含阶段字段且不含路径/凭据。

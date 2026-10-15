# shared-03 行为规格（v1，进行中）

范围：`packages/shared/src` 继承剩余的 34 件（清单见 `README.md` §一.3 六簇）。
编号发布后不重用；每条在 README「条目 → 测试」对照表里至少有一个断言。

通用约定（适用于所有条目，条目内不再重复）：

- **时序与并发**：除注明的文件 IO 外全部为纯函数/短 IO；无长驻定时器、无后台任务。
- **幂等**：纯函数天然幂等；文件改写类条目单列「再跑一次」结果。
- **资源释放**：临时文件/句柄的关闭写在对应条目；其余无资源。
- **日志级别**：本包**不写日志**，错误以返回值或抛错交给调用方。
- **平台差异**：路径类条目在 Windows 与 POSIX 同时成立（分隔符、大小写、换行、权限位差异写在条目里）。
- **状态所有者**：默认无状态；状态归调用方（services / CLI / desktop / ui）。唯一例外见 B11/B12 的写文件面。
- **金样口径**：配置/协议面做「旧写→新读→新写→旧读」往返（逐字节）；事件类做 gate 握手断言（fixtures 由旧实现录制）。

---

## H1. workspace-hook 六件（B1–B12）

### B1 workspace-hook 配置 schema 形态（`workspace-hook-config.ts`）

- 输入：`workspaceHooksConfigSchema.parse(value)`；子 schema `workspaceHookProcessConfigSchema`、
  `workspaceHookCommandConfigSchema`、`workspaceHookMatcherConfigSchema`。
- 输出：
  - process 定义：`type:"process"`、`command` 非空串；可选 `enabled`、`args: string[]`、
    `timeoutMs`（正有限数）、`statusMessage`（非空串）；**passthrough**（未知键保留）。
  - command 定义：`type:"command"`、`command` 非空串；可选 `enabled`、`async`、
    `shell: true | 非空串`、`timeout`（正有限数，秒）、`timeoutMs`、`statusMessage`；**passthrough**。
  - matcher 组：`matcher`（可选非空串）+ `hooks`（1..n，判别联合 type=command|process）；**strict**。
  - 配置根：可选 `enabled`、`timeoutMs`、`maxOutputBytes`（正有限数）、`events`（strict 对象，
    键恰好 `WORKSPACE_HOOK_EVENT_NAMES` 七项、每项 matcher 组数组）；**strict**。
- 错误语义：zod 校验失败抛 `ZodError`（`readWorkspaceHookProjectSources` 捕获进 errors）。
- 时序与并发：纯解析。幂等。资源释放：无。平台差异：无。状态所有者：无。日志：无。
- 语义常量（逐字冻结）：`WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION = 1`、
  `DEFAULT_WORKSPACE_HOOK_TIMEOUT_MS = 60000`、`DEFAULT_WORKSPACE_HOOK_MAX_OUTPUT_BYTES = 32768`、
  `WORKSPACE_HOOK_EVENT_NAMES = ["SessionStart","UserPromptSubmit","PreToolUse","PermissionRequest",
  "PostToolUse","PostToolUseFailure","Stop"]`（7 项、此序）。

### B2 配置发现与读取（`workspace-hook-config.ts`）

- 输入：`discoverWorkspaceHookConfigPaths({workingDirectory, explicitProjectConfigPath?})`（同步）与
  `readWorkspaceHookProjectSources(同参)`（异步）。
- 输出：候选文件 = 每级目录的 `knorvia.json` 与 `.knorvia-studio/config.json`；
  目录序：从 `resolve(workingDirectory)` 向上收集，遇到含 `.git`（文件或目录）的 worktree 标记即停并**反转**
  （祖先在前、工作目录在后）；**没有任何 worktree 标记时整体回落为 `[start]`**（不向上扫）。
  显式项目配置路径存在时追加 `{path, explicitProjectConfig: true}`。
  去重按 `resolve(path)` 的规范化键保序。读取版：逐 ref 读 UTF-8 → `JSON.parse`；
  非对象根或无 `hooks` 字段**静默跳过**；schema 失败/读失败进 `errors[]`（`{path, error}`），不中断其余源。
- 错误语义：读/解析失败不抛，归入 errors。时序：发现序即 `discoveryOrder`。幂等：纯读。
- 资源释放：无句柄。平台差异：`.git` 两种形态都算标记；路径用 `resolve` 规范化，Windows 大小写按 fs 语义。
- 状态所有者：无。日志：无。

### B3 源输入构造（`workspace-hook-config.ts` `createWorkspaceHookSourceInput`）

- 输入：`{path, workingDirectory, hooks, discoveryOrder, explicitProjectConfig?}`。
- 输出：`canonicalPath = resolve(path)`；`baseDir` = 配置目录，但目录名是 `.knorvia-studio` 时上提一级；
  `configFileKind`：explicitProjectConfig → `"explicit"`，否则按文件名 `knorvia.json` → `"knorvia.json"`，
  其余 → `".knorvia-studio/config.json"`；`editable` = 非显式 且 canonicalPath 恰等于
  `resolve(workingDirectory, ".knorvia-studio", "config.json")`。
- 其余八项同通用约定（纯函数、无错误分支、无状态）。

### B4 限额解析（`workspace-hook-config.ts`）

- `resolveWorkspaceHookTimeoutMs(hook, defaultTimeoutMs)`：`timeoutMs` 优先；缺席且 type=command 且给了
  `timeout`（秒）→ `timeout*1000`；否则默认值；最终 `Math.max(1, Math.round(value))`。
  **注意**：process 定义的 `timeout` 字段不参与换算（schema 里 process 无 timeout）。
- `resolveWorkspaceHookMaxOutputBytes(v)` = `Math.max(1, Math.round(v))`。
- `resolveWorkspaceHookRuntimeRoot(roots)`：按数组顺序逐根覆盖——`enabled` 仅 `=== true` 才置真（不回退），
  `timeoutMs`/`maxOutputBytes` 给了就覆盖；缺省 60000 / 32768；出口再走 1 取整钳制。
  `undefined` 根跳过。**enabled 不因后续根缺省而回 false**（单调置真）。
- 时序：纯函数；幂等；无资源；平台差异无；状态所有者无；日志无。

### B5 配置态门（`workspace-hook-config.ts` `resolveWorkspaceHookConfiguredGates`）

- 输入：`{sourceEnabled?, declarationEnabled?, runtimeHooksEnabled}`。
- 输出：`sourceRootEnabled = sourceEnabled !== false`、`declarationEnabled = declarationEnabled !== false`
  （**undefined 按 true**）、`runtimeHooksEnabled` 原样、`configuredEnabled = 三者与`。
- 返回对象键序固定（sourceRootEnabled、declarationEnabled、runtimeHooksEnabled、configuredEnabled）。
- 其余八项同通用约定。

### B6 声明摘要（`workspace-hook-digest.ts` `createWorkspaceHookDeclarationDigest`）

- 输入：`{sourceRelativePath, sourceDiscoveryOrder, event, matcher, matcherIndex, hookIndex, hook,
  defaultTimeoutMs, resolvedMaxOutputBytes}`。
- 输出：sha256 hex（64 小写）of `JSON.stringify(payload)`，payload 元组序：
  `["workspace-hook-declaration", 1, sourceRelativePath, sourceDiscoveryOrder, event, matcher,
  matcherIndex, hookIndex, execution, resolvedTimeoutMs, resolvedMaxOutputBytes]`。
  `execution`：process → `["process", command, args副本]`；command → `["command", command, async===true,
  shellMarker]`，`shellMarker` = undefined→`["unset"]`、true→`["true"]`、字符串→`["string", shell]`。
  `resolvedTimeoutMs` 用**传入的 defaultTimeoutMs**（审阅时默认）走 B4 同一换算。
- 摘要依赖 JSON.stringify 的键序与数组序 → 载荷结构与顺序是契约的一部分（金样敏感）。
- 其余八项同通用约定（纯函数）。

### B7 条目解析（`workspace-hook-digest.ts` `resolveWorkspaceHookEntries`）

- 输入：`{workspacePath, sources, runtimeRoot}`。
- 输出：遍历序 = sources 序（discoveryOrder）→ `WORKSPACE_HOOK_EVENT_NAMES` **固定七序** → matcher 数组序
  → hooks 数组序。每条含：`reviewItemId = "workspace-hook-<sourceFileIndex>-<event>-<matcherIndex>-<hookIndex>"`、
  索引四元组、`sourceRelativePath`（workspacePath 相对、`\`→`/`、空串回退 basename）、
  `matcher`（缺省为 null）、`command`、`resolvedTimeoutMs`（B4，默认=runtimeRoot.timeoutMs）、
  `resolvedMaxOutputBytes`（=runtimeRoot.maxOutputBytes）、门字段（B5）、`editable`、
  `hookDeclarationDigest`（B6）。可选字段**只在有值时在场**：`statusMessage`（truthy）、
  process 的 `args`（非空数组时拷贝）、command 的 `async`（仅 true）与 `shell`（给定即带）。
- 其余八项同通用约定（纯函数、键序固定、金样敏感）。

### B8 bundle 快照（`workspace-hook-digest.ts` `buildWorkspaceHookBundleSnapshot`）

- 输入：`{workspaceIdentity, workspacePath, sources, runtimeRoot, discoveredAt?}`。
- 输出：**hooks 为空 → `undefined`**（不是空快照）。否则返回深冻结快照：
  `schemaVersion=1`、`workspaceIdentity`、`discoveredAt`（缺省 `new Date().toISOString()`）、
  `sourceFiles[]`（每源：canonicalPath/baseDir/discoveryOrder/configFileKind/explicitProjectConfig/editable/
  hooksRoot——三个可选根字段仅在源里显式给出时在场）、`hooks`（B7）、`digestAlgorithm:"sha256"`、
  `bundleDigest`。
- `bundleDigest` = sha256(JSON.stringify(["workspace-hook-bundle", 1, sourceTuples, hookTuples]))；
  sourceTuple = [相对路径, discoveryOrder, configFileKind, explicitProjectConfig,
  optionalMarker(enabled), optionalMarker(timeoutMs), optionalMarker(maxOutputBytes)]，
  `optionalMarker`：undefined→["unset"]，否则["set", value]；hookTuple = [hookDeclarationDigest,
  sourceRootEnabled, declarationEnabled, runtimeHooksEnabled, configuredEnabled]。
- **bundleDigest 不含 discoveredAt 与 workspaceIdentity**（同输入不同时间 → 同摘要）。
- 深冻结：返回值全对象 `Object.freeze` 递归（freezeSnapshot），下游不得改写。
- 其余八项同通用约定。

### B9 review 单调性裁决（`workspace-hook-review-monotonicity.ts`）

- 输入：`current: {reviewFlowId, generation, interactionId} | undefined`，`candidate` 同形。
- 输出六 verdict：`no_current`（无当前→接管）；`cross_flow`（flowId 不同）；`same_flow_advance`
  （generation 更高）；`same_flow_stale`（更低）；`same_flow_replay`（同 generation 且同 interactionId）；
  `same_flow_conflict`（同 generation、不同 interactionId）。
- 比较**只看三元组**；裁决是纯函数，应用策略（drop/defer/接新权威）归调用方。
- 其余八项同通用约定。

### B10 trust store schema 与解析（`workspace-hook-trust-store-file.ts`）

- 常量（逐字冻结）：`WORKSPACE_HOOK_TRUST_STORE_SCHEMA_VERSION = 1`；记录字段：
  `workspaceIdentity`（trim 非空）、`hookDeclarationDigest`（`/^[a-f0-9]{64}$/`）、
  `digestAlgorithm` 字面 `"sha256"`、`decision` 字面 `"trusted"`、`grantedAt`（ISO datetime）、
  可选 `lastUsedAt`/`bundleDigestAtGrant`/`eventAtGrant`（7 事件枚举）/`displayCommandAtGrant`/
  `sourcePathAtGrant`/`sourceDiscoveryOrderAtGrant`（非负整数）/`matcherAtGrant`（可空串）/
  `matcherIndexAtGrant`/`hookIndexAtGrant`/`appVersionAtGrant`；记录与文件**strict**。
- 文件体：`schemaVersion` 字面 1 + `records` 数组；superRefine 要求
  `workspaceIdentity + "\u0000" + hookDeclarationDigest` 键唯一（违反 → issue 指向 records、
  message `"workspace identity and declaration digest keys must be unique"`）。
- `parseWorkspaceHookTrustStoreContent`：JSON 语法错与 schema 失败**统一** `{status:"invalid"}`
  （fail-closed、无部分结果）；成功 `{status:"ok", file}`（zod 输出）。
- 平台差异：无（纯解析）。状态所有者：文件在调用方。日志：无。

### B11 原子写配置（`workspace-hook-mutation.ts` `atomicWriteWorkspaceHookConfig`）

- 输入：`filePath`、`value`（plain object）、`options.beforeRename?`。
- 输出：目录递归创建；临时文件 `.<basename>.<pid>.<Date.now()>.<随机hex>.tmp` 于同目录，
  `open(..., "wx", 0o600)` → 写 `JSON.stringify(value, null, 2) + "\n"`（UTF-8）→ `fsync` → close →
  可选 `beforeRename()` → `rename` 到目标。**成功后目标内容是 2 空格缩进 JSON + 尾随换行**（往返金样口径）。
- 错误语义：任何一步失败 → 关句柄（吞关闭错）、`rm(tmp, {force:true})`（吞清理错）后**原样抛出**；
  临时文件不残留、目标文件不受影响（rename 前失败）。
- 并发：`wx` 保证临时名不撞；rename 原子替换。幂等：同 value 再写结果相同（字节稳定）。
- 平台差异：`rename` 覆盖已存在目标在两平台按 Node 语义（Windows 下目标被占用可能 EPERM，错误原样抛）。
- 状态所有者：目标文件归调用方；本函数无内部状态。日志：无。

### B12 开关写入（`workspace-hook-mutation.ts` `writeWorkspaceHookConfiguredToggle`）

- 输入：`{configPath, snapshot, reviewItemId, enabled, writeOptions?}`。
- 校验链（不满足即抛 `WorkspaceHookMutationError`）：
  ① 目标条目存在且 `entry.editable` 且对应 `source.editable` 且 `source.configFileKind === ".knorvia-studio/config.json"`
  且 `resolve(source.canonicalPath) === resolve(configPath)` → 否则 `workspace_hooks_snapshot_mismatch`
  （"…not the current editable project config"）；
  ② 读文件/JSON.parse 失败 → `workspace_hooks_config_unreadable`（cause=原错误）；
  ③ 根非对象 / `hooks` 无 schema / 无 hooks 对象 / 无 events 对象 / 事件数组缺失 / matcher 或 hooks 数组缺失 /
  声明非对象 / 解析后声明缺失 → 均 `workspace_hooks_snapshot_mismatch`（各带固定 message）；
  ④ 用**快照里的 resolvedTimeoutMs 作 defaultTimeoutMs** 复算 B6 摘要，与 `entry.hookDeclarationDigest`
  不一致 → `workspace_hooks_snapshot_mismatch`（"…changed after review"）——审阅后声明被改则拒写。
- 通过后：仅把 raw 中该声明的 `enabled` 置为入参，`atomicWriteWorkspaceHookConfig` 整文件重写（B11）。
- 错误类：`WorkspaceHookMutationError`，`name="WorkspaceHookMutationError"`，`code` 四值
  （snapshot_mismatch / bundle_changed / config_unreadable / config_write_failed；后两者为保留位）。
- 幂等：重复 toggle 到同一值 → 同文件字节。并发：同文件写按 B11 原子性；两次 toggle 串行结果取最后。
- 平台差异：同 B11。状态所有者：配置文件归调用方。日志：无。

---

（H2 起的条目续写：B13…）

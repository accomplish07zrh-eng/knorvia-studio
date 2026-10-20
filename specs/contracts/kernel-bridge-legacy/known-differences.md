# kernel-bridge-legacy 已知差异

每条写理由与对应测试。**门槛不因此放宽**：这些是「必须保持的既有行为」，不是为过门槛找的出口。

## D1 新运行时不发 `startup/storageState`

- **现象**：旧运行时启动时向 stdout 发 27 条 `startup/storageState`（`checking → migrating ×22 → committing → ready`），新运行时一条都不发（实测两引擎对比）。
- **理由**：DSH 会话持久化是 JSONL，不写旧 `<数据根>/cli/db/db.sqlite`，因此「数据库迁移进度」这个事实不存在。伪造一份迁移进度会误导 Host 与 UI。
- **Host 影响**：`KnorviaStorageStartupGate` 只在 `requireStorageStartup` 为真时等待首个状态（默认 30 s 超时）；`agentProcessManager` 只对 bundled 命令置 `supportsStorageStartup: true`，dsh 路径不要求。
- **对应测试**：`protocol-surface.test.mjs` B16（两引擎都断言 stdout 只含协议行，不假设通知条数）；实现阶段在 B14 断言「通知名冻结但按 D1 可缺席」。

## D2 域错误折叠为 `-32603`

- **现象**：旧运行时在插件不存在、marketplace 源非法、provider 未注册等域错误上，把内部异常折叠成 `-32603`（`data.name` 保留原错误类型，如 `ModelProtocolError`、`ZodError`），而不是专门的业务码。
- **理由**：这是旧实现的既有行为，Host 侧已按此适配（不依赖 message 文本，见 `isProtocolRequestTimeout` 等判断）。
- **实现要求**：新实现必须给出**同一错误码语义**（同一类失败 → 同一码），**不得**改写成成功或新的错误码。是否把 `-32603` 细化为业务码属协议变更，不在本包。
- **对应测试**：`legacy-methods.test.mjs` B5（`outcome: "either"` 的分支允许 `-32603`；`outcome: "ok"` 的分支不允许任何错误）。

## D3 不存在会话的错误码与文案

- **现象**：`session/read`、`session/messages`、`session/events`、`session/compact`、`session/setMode` 对不存在会话回 `-32004`，文案分别为 `Session is not active: <id>`；`session/subagents` 回 `-32004` + `Session not found: <id>`。
- **理由**：错误码是冻结面，文案不是。Host 侧按码判断。
- **实现要求**：同一方法族用同一码；文案可自写（不透出 DSH 字样）。
- **对应测试**：B5（`outcome: "error"` 的三条）、B7（只读面空数组形状）。

## D4 `session/requestRuntimePreferences` 是反向请求

- **现象**：它出现在 74 方法表里，但方向是 CLI → Host；客户端反向发来必须是 `-32601`。
- **理由**：Host 是运行时偏好的所有者，CLI 在物化会话前必须问它。
- **对应测试**：B8（方向不可反）、实现阶段 B11（反向发起与超时）。

## D5 端口未注册时的临时态（soft，随 02/03 关闭）

- **现象**：`kernel-bridge-02/03` 尚未把回合类方法实装到执行端口时，新引擎下这批方法回 `-32031`（capability 缺席）。
- **理由**：计划书把 02 定义为「输入与回合」、03 定义为「其余 v4 命令」，legacy 的终态验收依赖它们；本包允许先合并，但不得伪造成功。
- **不新增错误码**：复用既有 `-32031` 与 `fault.command.capabilityUnsupported` 词表。
- **关闭条件**：`kernel-switch` 合并前，02/03 实装到端口、legacy 侧这批评测转绿。Lead 已把该条记为 `kernel-switch` 准入项。
- **对应测试**：实现阶段 B10（端口未注册 → `-32031`；注册后 → 正常结果）。
- **临时态清单（认领 issue 也列明）**：`session/send`、`session/stop`、`session/cancelBackgroundTask`、`session/compact`、`session/fork`、`session/goal`、`session/resume`、`session/subscribe`、`session/setModel`、`session/setThoughtLevel`、`session/setMode`、`session/close`。

## D6 `usage/stats`、`session/usage` 等已弃用方法的兼容保留

- **现象**：Host 已改走 v4 的 `v4/usage/stats`、`v4/conversation/usage`；旧方法仍留在协议表里。
- **理由**：老版本 Host 兼容；删除属 `kernel-switch` 的协议清理范围。
- **对应测试**：B5（`outcome: "either"`：必须被应答，允许成功或业务错误）。

## D7 Windows 上测试夹具的清理纪律（已修，非产品行为）

- **现象（首轮）**：`dsh` 引擎下 `node --test` 在断言全部结束后仍不退出，`--test-timeout` 也救不了。
- **根因（2026-10-20 实测定位）**：**测试夹具自己的缺陷**，不是产品/DSH 的句柄。`node:test` 的 `after` 钩子按注册 FIFO 执行，且**前一个钩子抛错后后续钩子不再执行**。首轮把 `app.close()` 写在用例体里、只把「删临时目录」挂进 `t.after`：一旦用例断言在 `close()` 之前失败（dsh 引擎下 B16 正是如此），`close()` 根本不会执行 → 子进程常驻 → runner 等不到事件循环清空 → 挂死。挂点在用例体之外，`--test-timeout` 覆盖不到。
- **修法（已落地）**：
  1. `_protocol.mjs` 新增 `app.registerCleanup(t, [home])`：把「收子进程」与「删临时目录」放进**同一个** after 钩子，各自 try/catch，任何一步失败都不阻断另一步，也不阻断其它测试的清理。
  2. 所有用例统一改为 `app.registerCleanup(t, [home])`，不再把 `close()` 写在用例体里。
  3. `removeTempDir` 加 `maxRetries: 10, retryDelay: 100`，覆盖 Windows 上子进程句柄延迟释放导致的 `EBUSY`/`EPERM`。
- **结论**：修完自然退出（旧门 53 s、dsh 门 53 s），因此**门禁运行器不用 `--test-force-exit`**；运行器另保留 15 min 兜底超时，且把「超时」判为失败（夹具回归必须红，不能无限等）。
- **为什么这条重要**：CI 的 `test:studio` 直接收集 `specs/contracts/*/tests/*.test.mjs`，不带任何强制退出开关——夹具一处挂死就会让 main 的 Windows CI 永久红。
- **对应测试**：`run-gate.mjs`（三道路径都用同一命令，且 `timedOut` 记为失败）。

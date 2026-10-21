# services-01 已知差异（v1）

替代路径：`specs/contracts/services-01/README.md`。
本文件是**重写阶段的红线清单**——列出「新旧实现即使正确也必然不同」的实现差异面，以及「必须逐字保持、严格不变」的协议与行为面。

---

## 1. 预登记差异（允许的实现层差异）

| 面                 | 旧实现                                                                                              | 新实现（要求）                                                                                                 | 验证口径                                                    |
| :----------------- | :-------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------- |
| **文件组织结构**   | 60 个继承文件按目录平铺，巨型单文件（`taskServiceAdapter.ts` 5,742 行、`agentService.ts` 4,916 行） | 按 `design.md` 拆分为 8 个功能模块（`agent-kernel`、`agent-session`、`task-index` 等），原公开入口作为兼容导出 | 兼容面 58 个模块与 336 条顶层导出保持不变（`interface.md`） |
| **注释与实现命名** | 旧有注释与内部局部变量名                                                                            | 全量自写、与旧代码完全不同                                                                                     | 源码相似度门禁检查通过（替换阶段）                          |
| **内部辅助函数**   | 散落在各个大文件内部的私有工具函数                                                                  | 集中在对应功能模块内部组织，去除冗余重复声明                                                                   | 黑盒测试两入口 100% 覆盖通过                                |
| **组合根注册机制** | 三处组合根散落各自定义描述符与实现                                                                  | 组合根基于统一的功能模块清单注册，无冗余重复声明                                                               | `design.md` 约定的模块注册规范与单元测试                    |

---

## 2. 必须逐字保持（红线清单，测试即守门）

1. **协议常量与字段名**：
   - 所有的 JSON-RPC、v4 协议信封（`sendText`、`sendConversationCommandV4` 等）、状态字（`accepted`、`running`、`idle`）一字不改；
   - 错误码字面值必须完全一致：`KNORVIA_AGENT_RUNTIME_UNAVAILABLE`、`KNORVIA_AGENT_MCP_STATUS_MODE_UNSUPPORTED`、`KNORVIA_SESSION_TARGET_NOT_FOUND`、`STALE_TASK_OWNER_COMMAND`、`OWNER_COMMAND_FAILED`；
   - CUA 权限状态机字段与 socket 通信协议保持与 `@knorvia/cua` 契约逐字段对齐。
2. **数据格式与线格式**：
   - 凭据密文存储格式：`enc:v1:` 前缀、12 字节随机 IV、AES-256-GCM 密文与 Tag 序列化规则；损坏备份文件名后缀规范（`.corrupt-<sha256>.bak`）；
   - 用户命令 Markdown 文件：YAML frontmatter 格式（`description`、`argument-hint`）、换行与多行折叠缩进规则；
   - 任务会话与轨迹日志：JSONL 格式与事件字段，保持行日志结构不变。
3. **环境变量**：
   - `KNORVIA_CREDENTIAL_SECRET`：外部主凭据密钥；
   - `KNORVIA_CUA_BROKER_SOCKET`：CUA Broker 通信地址；
   - `KNORVIA_CUA_BROKER_UNAVAILABLE`：CUA Broker 不可用标记；
   - `KNORVIA_LOG_DIR`：系统日志根目录覆盖路径。
4. **数据目录与存储路径**：
   - 凭据文件：`.knorvia-studio/v2/credentials.json` 及其互斥文件锁；
   - 命令文件目录：工作区 `.knorvia/commands/`；
   - 任务索引数据库：`tasks-index.sqlite`。
5. **行为时序与并发纪律**：
   - 凭据读改写受进程内并发锁与跨进程目录文件锁双重保护；
   - Host 命令队列调度必须由上游 ready 事件驱动出队（drain），严格保证每任务串行执行；
   - 模式切换与模型参数变更遵循 v4 CAS 乐观锁版本对账与重试收敛。

---

## 3. 平台边界

- **IPC 通信**：CUA Broker 在 POSIX 平台上采用 Unix Domain Socket（位于 `/tmp` 下带有权限检查），在 Windows 平台上采用命名管道（`\\.\pipe\`），跨平台仅依据 basename 断言；
- **路径规范化**：工作区根目录、命令路径、符号链接目标在 Windows 下支持大小写不敏感与反斜杠，在 POSIX 下保留原始大小写与正斜杠；
- **跨平台原子文件写**：采用 write-to-temp 后 rename 策略，Windows 下重命名覆盖若遇并发锁拒绝时提供安全回退。

---

## 4. 不在此列

- **协议字段、数据格式、环境变量、数据目录**：严禁借重构之名进行任何非兼容性改造；
- **黑盒测试与金样**：替换阶段测试断言只增不减，已有断言与测试用例严格只读。


---

## KD-x：recover 的 bare-proof 路径无法终止「root 已退出但子进程仍活」的场景

**这是产品侧的已知缺陷（不是测试问题）**，记录在此以免后续被误判为 flake。

### 现象（本地直接观测，不是超时推断）

```
phase=ready, rootPid=34304, proof.identities 两个进程都活着
f.io.recover(proof) → false（耗时 9150ms），调用后两个 pid 仍然存活
重复调用 → 仍 false
```

**注意**：这是**直接观测到的返回值与进程存活状态**，与机器负载无关。

### 根因（源码事实）

1. `workspaceRuntimeProcess.ts` 的 `recover` 用 `processReference(proof.rootPid, true)`
   合成一个 `exitCode = 0` 的 ChildProcess；
2. `terminateProcessTreeAndWait` 对「已退出」child 走 `resolveCurrentOwnedIdentitiesAsync`，
   该函数在 `hasExited(child)` 为真时返回 `childStillOwned: false`；
3. 若 `filterCurrentProcessIdentitiesAsync` 因时序窗口返回空，则 `hasTargets` 为 false
   → **跳过终止** → `remainingPids` 非空 → 返回 `false`。

**这是逻辑上的自相矛盾**：把 root 伪装成「已退出」，终止逻辑却因此认为「没有要杀的目标」。

### 两条路径的行为差异

| 路径 | 结果 |
| :--- | :--- |
| **owner stop**（`owner.request({action:"stop"})`） | 带真实 `ownedProcessGroupId` 等上下文 → 终止成功 → `stopped` |
| **bare-proof**（`io.recover(proof)` 直调） | 可能跳过终止 → 返回 `false` → 运行时进入 `cleanup-required` |

### 影响

`workspaceRuntime` 在 stop 时因 `cleaned === false` 进入 `cleanup-required`。
**这曾被误判为「测试取了中间态」，实际是 recover 失败后产品给出的正确报告。**

### 处置

- **集成交互测试走 owner 路径**；
- `studio-workspace-runtime-health.test.ts:60` 的 `assert.equal(await f.io.recover(row.proof), true)`
  因此**稳定失败**（3/3），**保持原状待产品修复**，不在时序测试 PR 里改动；
- bare-proof 的终止逻辑待修（另开 PR；它影响所有 workspace runtime 清理，需谨慎）。

### 附：一条与负载有关的边界（不要混淆）

`workspaceRuntime` 的健康检查循环以 `active.process.alive()` 为唯一退出条件，
而 `alive()` 只看 root 的 `ChildProcess` 字段。
**在机器高负载时（实测并发 44–72 个 node 进程、CPU 达 100%），服务启动与 HTTP 就绪
可能超过测试 `wait()` 的 12 秒预算，表现为 `phase` 停在 `starting`。**

**那是测量环境问题，不是本文档记录的产品缺陷** —— 两者的区别是：
- **KD-x 缺陷**：recover 返回 `false` 且进程未死（直接观测，与负载无关）；
- **负载假象**：`wait()` 超时、`phase` 停在 `starting`（换到低负载即消失）。

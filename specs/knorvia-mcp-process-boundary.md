<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP stdio 进程边界

2026-09-29。本规格固定 `stdio-transport.ts`、`process-tree.ts` 与 `windows-job-object.ts` 的兼容替换边界。目标是保留当前 MCP stdio 的消息元数据、退出观察、进程树回收和可选 Windows Job Object 行为，不扩张为新的进程管理器，也不改变现有失败与竞态语义。

```text
SDK StdioClientTransport ─ spawn / pipe / protocol / ordinary close
             │
             └─ ProcessTreeStdioClientTransport
                ├─ per-message request meta
                ├─ first child exit observation
                ├─ current Windows Job controller
                └─ dispose: job → process tree → SDK dispose/close

one terminate call ─ temporary PID snapshot / escalation / diagnostics
one job controller ─ one native handle + closed flag
one module ─ one cached native-API loading promise
```

## 公开面与所有权

- `stdio-transport.ts` 只有运行时导出 `ProcessTreeStdioClientTransport`。它继承 SDK transport；SDK 继续拥有 spawn、stdio、协议缓冲与普通 `close`。子类拥有创建时捕获的 meta provider、Job factory、最近观察到的 child、首次 exit 信息和当前 Job controller。
- `process-tree.ts` 只有运行时导出 `terminateMcpStdioProcessTree`。每次调用独立拥有 PID 快照、递归访问集合、升级阶段和等待窗口；没有跨调用缓存或锁。
- `windows-job-object.ts` 运行时导出 `attachProcessToWindowsJobObject`，并导出 controller 类型。每个成功 controller 独立拥有 handle 与 closed 标志；模块只共享一次 native API 加载 Promise。
- 三个公开函数/构造器保留一个必需参数及默认第二参数，公开导出、方法 arity 与 controller own-key 顺序保持现有合同。

## Transport 行为

构造器先把原 server 对象交给 SDK，再捕获 `requestMetaProvider` 和 nullish-fallback 后的 Job factory。provider 与 factory 后续都以 transport 为 receiver；修改原 server/options 不替换已捕获函数。

每次 `send` 都先等待 provider，包括 response 与最终不改写的消息。provider 失败直接传播。只有消息通过普通 `in` 判定具有 `method`，且 meta 存在 own enumerable string key时，才创建浅拷贝：非 null、非 array object 的 params 与 `_meta` 被保留，request meta 最后覆盖同名旧键。原消息及嵌套引用不冻结，不新增串行队列。

每次 `start` 在 SDK start 前记录开始时间。SDK 成功后读取 SDK child：已退出 child 立即记录首次 exit；活 child 注册一次 `exit` 观察。首次 exit 在后续 restart 中不重置。只有精确 `win32` 且 PID 非 nullish 才调用 Job factory；attach 失败被吞并清空当前 controller。没有 attach generation fence，晚到结果、并发 start 与旧 controller 覆盖继续按现有竞态语义处理。

`terminateWindowsJobObject` 先摘除当前引用，再同步调用 `terminate` 与 `close`，分别吞掉同步错误，不等待声明外 Promise。普通 `close` 仍由 SDK 继承。

模块求值时只读取 SDK prototype 自有 `_dispose` descriptor 的 value，并在子类 prototype 安装 configurable、non-enumerable、non-writable 的 async own hook。hook 捕获 PID，依次等待 Job 清理、对正整数 PID 尝试进程树清理，再调用初始捕获的 SDK hook；没有该 hook 时调用当前 `this.close()`。树清理失败被吞，PID读取、覆写的 Job 清理、SDK dispose/close 失败按阶段传播。多次 dispose 不合并。

## 进程树行为

入口先按 `options.platform ?? process.platform` 分流，并用 `kill(pid, 0)` 判断 root 活性；只有对象错误上可见的精确 `EPERM` 仍视为存活。入口本身不校验 PID。注入的 kill、execFile、clock 与 sleep 均按使用时读取并以普通函数调用。

Windows 路径只调用一次 `taskkill /PID <pid> /T /F`，UTF-8、2000ms、隐藏窗口。fulfilled 结果仅在 error truthy 或非 null/非零 status 且 root 再次存活时抛固定错误；executor reject 直接传播，不重试。

POSIX 路径对每个访问 PID 串行执行 `pgrep -P`，失败或无有效成功输出时按当时 platform 回退到 `ps -axo`（darwin）或 `ps -eo`。深度优先收集后按首次出现去重并 reverse，得到尽量 child-before-parent 的列表。随后执行：

1. process group 与逐 PID `SIGINT`，250ms 分段等待；
2. 仍存活则发送 `SIGTERM`，750ms 分段等待；
3. 仍存活则刷新后代，先探活再逐 PID `SIGKILL`，最后给 group `SIGKILL`，等待250ms并收集全部 survivor。

信号调用错误被吞；命令 rejection、clock/sleep 错误传播。等待没有总 deadline，停滞的注入 clock 仍可能使等待不结束。PID reuse、未发现后代与进程组归属不增加身份保护。

## Windows Job Object 行为

非 Windows、非正整数 PID 在读取 API 前返回 undefined。注入 API 或默认 API 的选择在 create/assign try 之外；accessor 与 native loader 选择错误按既定边界处理。create/assign 失败只补偿 attach 已取得的 handle；controller `terminate` 可重复，`close` 先消费 ownership 后调用 native close，失败后不重试。

默认 API 只在有效 Windows attach 时动态导入字面量 `koffi`，加载结果（包括 undefined）永久缓存。它按合同声明的字段顺序创建 basic、IO 与 extended Job 限制结构，按 `__stdcall` 依序绑定六个 kernel32 函数。Job 配置只设置 kill-on-job-close；进程句柄请求 `PROCESS_SET_QUOTA | PROCESS_TERMINATE` 并在 finally 中关闭。native BOOL 返回不被扩展成新的失败政策，也不调用 GetLastError。

## 验收边界

先行冻结的五 suite、两 fixture 共36个 top-level case。它们只能通过 owned SDK、child events、kill/execFile、clock/sleep/timer、Job API 与 Koffi loader seam 观察公开行为及明确记录的 `_dispose` SDK 接入 descriptor。未知 dependency fail closed；编译后唯一运行时 `import("koffi")` 被替换为 owned import port，任何其他 dynamic import 被拒绝。

验收覆盖 metadata、首次 exit、attach/dispose race、普通 close、Windows/POSIX 命令与升级、controller ownership、native加载缓存与 ABI 绑定。它不启动真实 MCP/子进程，不发真实 signal，不调用真实系统命令或 Koffi/native library，不证明真实 Windows ABI、绝对进程树清理、整仓兼容或许可迁移完成。

整合时保持候选三源字节不变；主仓测试只允许追加标准 MIT 头，并把 fixture 的三个 target URL 与 esbuild URL 改为可移植的 `import.meta.url` / `import.meta.resolve` 绑定。不得改断言、超时、依赖路由或合同限制。整合后须完成实际 SDK 类型/构建、main-source 36、compiled 36、完整离线回归、架构与来源审计。

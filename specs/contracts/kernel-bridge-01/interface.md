# kernel-bridge-01 接口合同

本包**不新增公开模块路径**。接口 = 既有 `app-server --stdio` 进程面与 v4 NDJSON 协议面在 DSH 引擎上的等价实现；实现可以重组桥内部代码，但下列字段、方法与时序不得改变。

## 一、进程契约

| 项       | 契约                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------- |
| 启动     | `knorvia app-server --stdio`；`agent-server --stdio` 同一入口                                      |
| 引擎     | `KNORVIA_KERNEL_ENGINE` 去首尾空白后严格等于 `dsh` 走新桥；缺省/空/其他值保持旧运行时逐字节不变    |
| stdout   | 只写 UTF-8 NDJSON 协议行（request/response/error/notification），每行 `\n`；不得混入日志或就绪标记 |
| stderr   | 日志与诊断；不承载协议消息                                                                         |
| stdin    | 逐行读取；EOF 触发正常收尾                                                                         |
| 退出     | stdin EOF 或 SIGTERM 后释放 DSH host 并以 0 退出；启动/桥初始化失败以 1 退出                       |
| 单实例   | 每个进程只启动一个 DSH host；不得在桥内启动第二个 Cordis 树或第二个 agent loop                     |
| 默认路径 | 无 `dsh` 开关时不加载任何 `@deepseek-ai/*`、不创建 DSH 对象、行为与基线一致                        |

## 二、消息外壳

物理载体是 NDJSON，不是带 `jsonrpc` 的 JSON-RPC。四类消息（`packages/shared/src/protocol/index.ts`）：

```text
request       {"id": <string|number>, "method": <string>, "params"?: <any>, "trace"?: <object>}
response      {"id": <string|number>, "result": <any>}
error         {"id": <string|number>, "error": {"code": <int>, "message": <string>, "data"?: <any>}}
notification  {"method": <string>, "params"?: <any>, "trace"?: <object>}
```

- 全部 strict：不接受未知键；`jsonrpc` 字段会被拒绝。
- server → client 的反向 request（如 `session/requestRuntimePreferences`）沿用同一外壳，客户端必须应答。
- 服务端不得用 notification 冒充 request 响应；订阅的 initial/resume 帧是在 subscribe 响应之后发出的 notification。

## 三、方法面

合同测试实际驱动的方法：

| 方法                          | 请求                                                          | 响应                                                          |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `v4/command`                  | `CommandEnvelope`                                             | `CommandAck`                                                  |
| `v4/commands/query`           | `{commands: [{sessionId, commandId}], clock?}`（1–64）        | `{results: [{key, result: CommandAck \| "unknown"}], clock?}` |
| `v4/conversation/subscribe`   | `{topic, connectionId, clientMode, base?, workspace?, ...}`   | `{ack: {subscriptionId, mode, logEpoch, openTiming?}}`        |
| `v4/conversation/resync`      | `{topic, connectionId, subscriptionId, base, forceSnapshot?}` | `{ack: {subscriptionId, mode, logEpoch}}`                     |
| `v4/conversation/unsubscribe` | `{topic, connectionId, subscriptionId}`                       | 既有空结果                                                    |
| `v4/connection/flow`          | `{connectionId, state: "saturated" \| "drained" \| "closed"}` | `{}`                                                          |

- 方法名、参数键、响应键、顺序语义不得改名或增删。
- `v4/command` 的期望失败（未知会话/CAS 失配/非法 payload）走 **ACK**，不是协议 error；参数外壳无法解析时才走协议 error。
- `subscribe/resync/unsubscribe/flow` 的非法参数在请求边界拒绝（协议 error），不建订阅、不改投递状态。
- 其余 `V4_METHODS`（rowsRange、plans、fileChanges、usage、attachment*、workflow* 等）必须继续按既有参数/结果 schema 提供；桥未实现的能力按既有 `fault.*` / capability 错误返回，不新增错误码、不静默降级。

## 四、命令信封与 ACK

### 1. 信封

```ts
{
  commandId: string;            // 客户端生成；重试不变
  clientId: string;
  sessionId: string | null;     // createSession 为 null
  baseRevision?: number;        // CAS 命令必带
  baseLogEpoch?: string;        // 行定位命令必带
  type: CommandType;
  payload: unknown;
  issuedAt: number;             // 客户端时钟，仅遥测
  ttft?: object;                // 可选遥测
}
```

- `CommandType` 全集的 payload schema 归 `@knorvia/shared/protocol-v4`，桥不得改写。
- `parseCommandEnvelope` 的准入规则原样保留：CAS 命令缺 `baseRevision`、行定位命令缺 `baseLogEpoch` 都按 `proto.invalidPayload` 拒绝。
- `sessionId` 是不透明字符串；桥内部可映射到 DSH session id，但对外必须稳定到会话生命周期结束。

### 2. ACK

```ts
{
  commandId: string;
  status: "accepted" | "rejected" | "stale" | "duplicate" | "noop" | "failed";
  reasonCode?: string;
  message?: string;
  revisionAtDecision: number;
  result?: CommandResult;
  memoryEnabled?: boolean;
  ttftExcluded?: "capacity";
}
```

合同冻结的裁决（顺序即 `CommandInbox` 的裁决顺序）：

| 情形                                                  | status      | reasonCode              | revisionAtDecision      |
| ----------------------------------------------------- | ----------- | ----------------------- | ----------------------- |
| 信封/payload 非法、CAS 缺 base                        | `rejected`  | `proto.invalidPayload`  | 0                       |
| 会话不存在                                            | `rejected`  | `proto.sessionNotFound` | 0                       |
| 行定位命令 `baseLogEpoch` 不等于当前 logEpoch         | `stale`     | `proto.staleLogEpoch`   | 当前 revision           |
| `baseRevision` 不等于当前 revision                    | `stale`     | `proto.staleRevision`   | 当前 revision           |
| 同 key 已 settled（执行终态或 noop）且 commandId 重复 | `duplicate` | 首次 reasonCode         | 首次 revisionAtDecision |
| 首次成功执行                                          | `accepted`  | —                       | 执行前 revision         |

- `duplicate` 必须回放**第一次**的终态（含 `result` 与 `revisionAtDecision`），不按新 payload 重算。
- 拒绝与 stale 不入 settled 缓存；同一 `commandId` 重试重新裁决，状态未变时得到相同拒绝/stale，而不是 `duplicate`。
- `createSession` 的幂等键是 `{sessionId: null, commandId}`（全局桶）；重复请求返回同一 `result.sessionId`。
- `v4/commands/query` 对已 settled 的 key 返回缓存 ACK；不得对已 settled 的命令回 `"unknown"`。
- 其余 `reasonCode` 来自既有命令执行层；桥不得新增、改名或把失败改写成 accepted。

## 五、订阅与帧

### 1. subscribe

```ts
request: {
  topic: "conversation/<sessionId>";
  connectionId: string;
  clientMode: "desktop-continuous" | "web-remote-replayable";
  base?: { logEpoch: string; seq: number };
  workspace?: { workspacePath: string; workspaceKey: string };
  visibility?: "foreground" | "background";
  legacyTaskIds?: string[];
  resumeThoughtLevel?: string;
}
response: { ack: { subscriptionId, mode: "snapshot" | "resume", logEpoch, openTiming? } }
```

- 响应严格只含 ACK；initial/resume 数据帧在响应之后作为 notification 发出。
- `base` 有效（同 logEpoch 且 seq 在可续传范围）→ `mode: "resume"`；否则 `mode: "snapshot"`。
- 同一 `(connectionId, topic)` 重订阅替换旧订阅；不同连接互不影响。

### 2. 帧外壳

notification `v4/conversation/frame` 的 `params`：

```ts
{
  wireVersion: 3;
  kind: "complete";                 // 分片帧是同一 wire 的另一 kind；小帧必须 complete
  deliveryKind: "initial" | "online" | "recovery";
  logicalFrameId: string;
  logicalFrameOrdinal: number;      // 正整数，单调
  topic: string;
  subscriptionId: string;
  frame: {
    topic: string;                  // 与外壳一致
    subscriptionId: string;         // 与外壳一致
    fromSeq: number;
    toSeq: number;
    sentAt: number;
    payload:
      | { kind: "snapshot"; snapshot: ConversationSnapshot }
      | { kind: "deltas"; deltas: ConversationDelta[] };
  };
}
```

- 字段集合与层级固定；不得增加兼容字段、不得把分片信息塞进 complete 帧。
- `deliveryKind` 由服务端权威标记：首帧 `initial`，在线增量 `online`，同订阅 resync 快照 `recovery`。
- `fromSeq`/`toSeq` 是**逻辑帧级**序号；分片与重组不改变它。

### 3. 快照与增量

- snapshot 帧：`fromSeq = 0`；`snapshot.seq = toSeq`。
- deltas 帧：区间 `(fromSeq, toSeq]` 按**事件水位**记账；每个被投影的源事件使 seq +1（含无可见变更的 0 delta 事件），因此 `toSeq - fromSeq` 是区间内事件数，`deltas` 数组可以更短或为空。同一订阅 `next.fromSeq = prev.toSeq`；不得跳号、重号、乱序。
- `snapshot.protocolVersion = 1`；必须含 `sessionId`、`logEpoch`、`seq`、`revision`、`control`、`rows`、`goal`、`plan`、`config` 等既有字段；草稿会话为 `control.phase: "draft"`、`rows.window: []`、`totalCount: 0`、`firstRowId: null`。
- `revision` 是用户可见状态的 CAS 版本：每次可见状态变更 +1；同值配置命令不产生 delta，也不递增 revision（B9）。
- `logEpoch` 是订阅水位代际：与 ACK 的 `logEpoch` 一致；base 失配时必须回落 snapshot，客户端据此整体替换状态。

### 4. resync 与 unsubscribe

- `resync` 只作用于已存在的 subscription；`forceSnapshot: true` 必须回 `mode: "snapshot"` 并发出 `deliveryKind: "recovery"` 的快照帧（`fromSeq = 0`）。
- `unsubscribe` 只移除指定 `(topic, connectionId, subscriptionId)`；其他订阅继续收帧。

### 5. flow control

- `saturated` 暂停该 `connectionId` 下的帧投递；其他连接不受影响，publisher 状态继续推进。
- `drained` 按原序补发暂停期间的帧；不丢帧、不合并成跳号区间。
- `closed` 保留既有语义；本包不改变其含义。

## 六、DSH 映射义务（实现阶段）

桥消费 `kernel-dsh-00` 的 `KernelHost.context`，只使用 DSH 公开 API；不改 DSH 源。

1. **会话身份**：`createSession` 返回的 v4 `sessionId` 必须稳定映射到 DSH `Session`；映射可由桥持有（内存 + 持久元数据），不得把 DSH 内部对象暴露给协议层。
2. **草稿会话**：`createSession` 无 `firstInput` 时只建会话/订阅数据面，不启动 agent turn；快照必须是 B8 的空草稿形态。
3. **命令执行**：所有 v4 命令先经现有 `CommandInbox`；桥只提供执行端口。`accepted` 的副作用与 ACK 返回顺序必须与旧运行时一致（执行快返回，不等待整轮结束）。
4. **事件投影**：DSH `session/event`、`session/flush` 等是会话事实的唯一来源；桥把它们送入既有 projection，产出与旧运行时同词汇的 deltas。不得从模型输出或 UI 侧补造事实。
5. **序号记账**：v4 `seq` 按桥投影的**源事件**独立分配：每个源事件 +1，可对应 0..N 个 v4 delta；不得按 delta 数推断，也不得直接复用 DSH `Session.seq`。分配是单写者、按源事件 append 顺序；0 delta 事件也要占位并可产生空 deltas 帧。
6. **代际**：`logEpoch` 由桥在会话元数据中持久化。同一会话跨冷恢复时，能稳定复用则复用；不能稳定复用时必须让 base 校验失配并回落 snapshot，不能返回错误代际却声称 resume。
7. **行身份**：v4 `rowId` 必须稳定到行生命周期（resume/冷恢复后同一消息仍解析到同一 `rowId`）；桥负责建立 DSH 事件/消息到 v4 row 的持久映射。
8. **视图分离**：DSH 自有 ACP/SDK/Web 表面不暴露给 v4；DSH 事件也不直接透传，只按 v4 delta 词表投影。
9. **双链路**：两个 `clientMode` 共用同一 publisher 与同一帧流；profile 只在订阅侧过滤/缓冲，不改变帧内容。
10. **资源**：DSH host 的唯一所有者是 app-server 进程；stdin EOF/信号后先停止投递、再 dispose，最后退出。

## 七、兼容面

- 不新增/删除 `@knorvia/shared/protocol-v4`、`@knorvia/bootstrap` 根入口或 CLI `bin` 的导出。
- 不新增环境变量；测试专用变量 `KNORVIA_BRIDGE_ENGINE`、`KNORVIA_BRIDGE_ENTRY` 只存在于合同测试进程，不进入产品代码。
- 不修改旧协议方法、旧数据目录、旧会话库。
- 桥内部模块路径由实现决定；若需新增包内导出，只供桥与测试使用，并在实现 PR 的 `interface` 变更说明中列出。

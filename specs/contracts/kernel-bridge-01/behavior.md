# kernel-bridge-01 行为合同（B1–B16）

编号发布后不重用。每条按九项写：输入、输出、错误语义、时序与并发、幂等、资源释放、平台差异、状态所有者、日志级别。

术语：

- **旧运行时**：`bootstrap` 现有 `runKnorviaProtocolAgent` / v4 gateway 路径（默认引擎）。
- **新桥**：`KNORVIA_KERNEL_ENGINE=dsh` 下，把 v4 命令/订阅映射到 DSH 会话与事件的运行时。
- **会话**：v4 `sessionId` 标识的 conversation topic 数据面；桥内部映射到 DSH `Session`。
- **水位**：subscription 已确认的 `(logEpoch, seq)`。

---

## B1 引擎门与默认路径

- **输入**：`app-server`/`agent-server` 进程环境中的 `KNORVIA_KERNEL_ENGINE`。
- **输出**：去首尾空白后严格等于 `dsh` → 新桥；缺省、空、其他值 → 旧运行时，行为与基线逐字节一致。
- **错误语义**：非法值不报错，按旧运行时处理；不得因该变量产生 DSH 副作用。
- **时序与并发**：引擎选择在加载运行时之前完成；旧路径不得静态或动态 import 任何 `@deepseek-ai/*`。
- **幂等**：同一进程只选择一次；运行期改环境变量无效。
- **资源释放**：旧路径不创建 DSH 对象；新桥只创建一个 host。
- **平台差异**：值比较区分大小写；Windows 环境变量名大小写不敏感由操作系统处理。
- **状态所有者**：CLI 进程入口（`apps/cli/packages/cli/src/run.ts`）+ `@knorvia/bootstrap/kernel-engine`。
- **日志级别**：`info` 记录 `kernel.engine=legacy|dsh`；不记录其他环境变量值或凭据。

## B2 NDJSON 物理面与字段冻结

- **输入**：stdin 的任意 request/notification 行。
- **输出**：stdout 只出现四类严格消息；v4 请求的结果/错误键、通知外壳与 `packages/shared/src/protocol-v4` schema 完全一致。
- **错误语义**：JSON 解析失败或外壳非法按既有协议错误边界处理；不把错误写到 stdout 的非协议行。
- **时序与并发**：每行一条消息；同一连接上的响应与帧按服务端产生顺序写出，不交错半行。
- **幂等**：只读请求（query/rowsRange 等）可安全重发；command 由 `commandId` 幂等。
- **资源释放**：stdout 写入失败/EPIPE 时停止投递并退出，不悬挂。
- **平台差异**：统一 `\n`；UTF-8；Windows 不写 `\r\n`。
- **状态所有者**：协议入口与连接层。
- **日志级别**：原始 NDJSON 只在 `debug`；生产日志不写完整命令 payload 或凭据。

## B3 createSession 全局幂等

- **输入**：`v4/command`，`type=createSession`，`sessionId=null`，`payload.workspaceId`，`commandId`。
- **输出**：首次 `status=accepted`，`result={type:"createSession", sessionId}`；同 `commandId` 再次提交返回 `status=duplicate`、同一 `sessionId`、`revisionAtDecision=0`；`v4/commands/query` 以 `{sessionId:null, commandId}` 查到 `accepted`。
- **错误语义**：非法 workspace/配置按既有 `proto.invalidPayload` 或执行 fault 返回；不因重复创建产生第二个会话。
- **时序与并发**：全局桶按 `(null, commandId)` 串行；并发重复提交只有一个执行，另一个等待并回放终态。
- **幂等**：是；缓存跨重试保持，直到 settled 容量淘汰。
- **资源释放**：duplicate 不分配新会话；首次创建的草稿在会话删除/进程退出时由既有生命周期回收。
- **平台差异**：无；workspace 路径按既有平台规则校验。
- **状态所有者**：`CommandInbox` 全局桶 + host `createSession`。
- **日志级别**：`info` 会话创建；`debug` 重复命令命中。

## B4 CAS 命令缺 baseRevision

- **输入**：`v4/command`，CAS 命令（如 `setFollowupMode`）不带 `baseRevision`。
- **输出**：`status=rejected`，`reasonCode="proto.invalidPayload"`，`revisionAtDecision=0`，不产生副作用、不产生 delta。
- **错误语义**：信封准入阶段拒绝；`message` 来自既有 schema 校验，不新增词表。
- **时序与并发**：拒绝发生在 inbox 获取 session gate 之前；不得先执行再校验。
- **幂等**：拒绝类 ACK 不进入 settled 缓存；同一 `commandId` 重试按当前状态重新裁决，状态未变时得到相同 rejected ACK（不是 duplicate）。
- **资源释放**：无分配。
- **平台差异**：无。
- **状态所有者**：`CommandInbox.handle` 解析分支。
- **日志级别**：不新增日志；`debug` 可记拒绝原因。

## B5 过期 baseRevision

- **输入**：会话当前 revision 为 `R`，命令带 `baseRevision < R`（或 > R）。
- **输出**：`status=stale`，`reasonCode="proto.staleRevision"`，`revisionAtDecision=R`；状态与快照保持 `R` 对应内容。
- **错误语义**：stale 不是协议错误；不写任何状态、不产生 delta、不递增 revision。
- **时序与并发**：裁决在 session gate 内基于最新 revision；并发成功命令不会让 stale 判断读取旧值。
- **幂等**：stale ACK 不进入 settled 缓存；同一 `commandId` 重试重新裁决，状态未变时仍为 stale；不同 `commandId` 可重复得到 stale。
- **资源释放**：无。
- **平台差异**：无。
- **状态所有者**：`CommandInbox.decide` + publisher 的 `getRevision`。
- **日志级别**：`debug` 记录 stale 与 revision。

## B6 重复 commandId 回放首次 ACK

- **输入**：同会话同 `commandId`，第二次携带不同 payload（如不同 `mode`）。
- **输出**：`status=duplicate`，`commandId` 相同，`revisionAtDecision` 与 `result` 取首次终态；快照仍反映首次执行结果；`commands/query` 返回首次 `accepted` ACK。
- **错误语义**：不因新 payload 非法而重新拒绝；重复键优先。
- **时序与并发**：首次未 settle 时第二次等待同一 in-flight promise，不并行执行；settle 后从 settled 缓存回放。只有执行类终态与 `noop` 进入 settled；拒绝/stale 不入缓存。
- **幂等**：是；重复不改变 revision、不产生 delta。
- **资源释放**：等待者共享同一终态，不复制执行。
- **平台差异**：无。
- **状态所有者**：`CommandInbox` 的 in-flight/live/settled 三层查找。
- **日志级别**：`debug` 重复命中层级。

## B7 边界拒绝与行定位失配

- **输入**：`sessionId` 不存在；payload 非法（如 `mode="invalid-mode"`）；行定位命令的 `baseLogEpoch` 不等于当前 epoch；行定位命令 `baseRevision` 正确。
- **输出**：未知会话 → `rejected proto.sessionNotFound`（`revisionAtDecision=0`）；非法 payload → `rejected proto.invalidPayload`（0）；epoch 失配 → `stale proto.staleLogEpoch`（当前 revision）。三者均无副作用。
- **错误语义**：全部走 ACK，不抛协议 error；判定顺序为会话存在性 → CAS 字段完整性 → logEpoch → revision → 行定位。
- **时序与并发**：先于任何宿主状态写入；epoch 与 revision 在同一裁决点读取。
- **幂等**：拒绝/stale 不进入 settled 缓存；同一 `commandId` 重试重新裁决，不伪造 duplicate。
- **资源释放**：未知会话不创建空会话、不 hydrate。
- **平台差异**：无。
- **状态所有者**：`CommandInbox.decide` + host 行定位校验。
- **日志级别**：`debug` 记录 reasonCode；不记录完整 payload。

## B8 initial snapshot 身份

- **输入**：新草稿会话上 `v4/conversation/subscribe`（无 base，或 base 无效）。
- **输出**：ACK `{subscriptionId, mode:"snapshot", logEpoch}`；随后 notification 帧：`wireVersion=3`、`kind="complete"`、`deliveryKind="initial"`、`fromSeq=0`；`payload.kind="snapshot"`；`snapshot.protocolVersion=1`、`sessionId` 一致、`logEpoch=ack.logEpoch`、`seq=toSeq`、`revision=0`、`control.phase="draft"`、`control.sessionEnded=false`、`rows={window:[],totalCount:0,firstRowId:null}`、`goal=null`、`plan=null`、`config.followupMode="queue"`。
- **错误语义**：topic 非法/参数非法在请求边界拒绝（协议 error），不发 ACK、不建订阅。
- **时序与并发**：响应行先于 initial frame；同一订阅只发一次 initial；并发订阅各自独立。
- **幂等**：重订阅同一 `(connectionId, topic)` 替换旧订阅并重新按 base 决定 snapshot/resume。
- **资源释放**：断连/取消订阅释放订阅与缓冲。
- **平台差异**：无。
- **状态所有者**：publisher 的 snapshot + subscription registry。
- **日志级别**：`info` 订阅建立（sessionId、mode、subscriptionId 的哈希/短 id）；`debug` 帧大小。

## B9 事件水位连续与 revision

- **输入**：已订阅会话上执行可见状态变更（如 `setFollowupMode guide`、`switchCollaborationMode plan`）。
- **输出**：`deliveryKind="online"` 的 deltas 帧；`fromSeq` = 上一帧 `toSeq`；每次 accepted 配置命令占一个源事件序号，故本用例 `toSeq = fromSeq + 1`；最后一个 `state.updated` 携带递增后的 `revision` 与完整 `config`；快照状态与 delta 合并结果一致。
- **错误语义**：命令被拒绝/stale 时不产生帧；accepted 但无可见变更的事件产生空 deltas 帧（`deltas: []`），仍推进水位。
- **时序与并发**：同一会话按 admission 顺序推进；不同订阅收到同一逻辑帧的等序副本。帧区间按事件水位记账，`deltas.length` 可小于 `toSeq - fromSeq`（被过滤或空事件）。
- **幂等**：同值配置命令 `accepted` 但快照不变、revision 不递增；下一条命令仍可用原 `baseRevision`。
- **资源释放**：帧缓冲按订阅上限；超限触发 resync，不丢帧后继续。
- **平台差异**：无。
- **状态所有者**：publisher 的 projection + 序号记账。
- **日志级别**：`debug` 每帧 fromSeq/toSeq；`warn` 订阅缓冲溢出触发 resync。

## B10 resume 与 snapshot 回落

- **输入**：订阅携带 `base={logEpoch, seq}`。
- **输出**：base 与当前 epoch 一致且在可续传范围 → ACK `mode="resume"`；之后的 delta 帧 `fromSeq >= base.seq`，不重放已确认区间。epoch 不符/seq 超范围 → ACK `mode="snapshot"`，initial snapshot 反映当前 `seq/revision`。
- **错误语义**：base 字段缺失/类型非法按请求 schema 拒绝；不因失配返回错误，客户端按 ACK mode 处理。
- **时序与并发**：ACK 决定与订阅建立在同一临界区；resume 期间的新 delta 不得落到水位之前。
- **幂等**：重复 resume 同一 base 不产生重复数据；客户端可安全重试。
- **资源释放**：回落 snapshot 时丢弃旧订阅缓冲。
- **平台差异**：无。
- **状态所有者**：publisher 的 log/journal + connection facade。
- **日志级别**：`info` resume/fallback（短 id）；`debug` 水位。

## B11 resync 与 unsubscribe 隔离

- **输入**：对已有订阅 `v4/conversation/resync`（`forceSnapshot:true`）；对其中一个订阅 `v4/conversation/unsubscribe`。
- **输出**：resync ACK `{subscriptionId 不变, mode:"snapshot"}`，并发出 `deliveryKind="recovery"`、`fromSeq=0`、`toSeq=当前 seq`、`snapshot.seq=toSeq`、`revision=当前 revision` 的快照帧。unsubscribe 成功后该订阅不再收帧；其他订阅继续收到后续 delta。
- **错误语义**：不存在的订阅 resync/unsubscribe 按既有边界错误处理；不影响其他连接。
- **时序与并发**：resync 与在线 ingest 串行化，recovery snapshot 必须包含调用点之前的全部状态；unsubscribe 在临界区内移除路由。
- **幂等**：重复 resync 可重复得到快照；重复 unsubscribe 不误删其他订阅。
- **资源释放**：unsubscribe 释放该订阅缓冲与 ownership；帧流其他部分不重建。
- **平台差异**：无。
- **状态所有者**：publisher 的 subscription registry；连接层只做转发。
- **日志级别**：`info` resync/unsubscribe；`debug` subscriptionId。

## B12 两条链路的帧同构

- **输入**：同一 topic 分别以 `desktop-continuous` 与 `web-remote-replayable` 订阅。
- **输出**：两侧 wire `params` 键集合相同；`wireVersion=3`、`kind="complete"`、`deliveryKind="initial"`；snapshot 的 `sessionId/logEpoch/seq/revision/control.phase` 相同。
- **错误语义**：链路选择只由 `clientMode` 决定；同一连接不得混用两种模式。
- **时序与并发**：两侧可不同时打开；每次订阅按各自水位发 snapshot/resume，语义一致。
- **幂等**：重复订阅按替换语义处理。
- **资源释放**：任一链路断开不影响另一链路。
- **平台差异**：无；投递节奏差异不属于协议差异。
- **状态所有者**：同一 publisher；connection facade 只应用 profile 过滤。
- **日志级别**：`debug` 记录 profile 与投递统计。

## B13 同一变更的等序增量

- **输入**：同一会话状态变更（`setFollowupMode guide`）发生时，两个链路均已订阅。
- **输出**：两帧 `fromSeq`/`toSeq` 相同，`payload` 深度相等（同一 deltas），`deliveryKind="online"`；后续变更继续在两侧保持同一序号。
- **错误语义**：任一链路饱和只影响其投递，不改变 publisher 的序号或另一侧内容。
- **时序与并发**：publisher 单写者推进；两侧读取同一逻辑帧。
- **幂等**：同一逻辑帧可被不同订阅各投递一次；不因重连重复推进状态。
- **资源释放**：单侧缓冲溢出只让该订阅 resync，不重建 publisher。
- **平台差异**：无。
- **状态所有者**：publisher 的 delta log + 各订阅 buffer。
- **日志级别**：`debug` 两链路序号对照（仅诊断）。

## B14 connection flow 只影响投递

- **输入**：对某 `connectionId` 发送 `{state:"saturated"}`，期间产生状态变更；随后 `{state:"drained"}`。
- **输出**：saturated 后该连接不收到 delta 帧，其他连接照常收到；drained 后按原序补发，帧区间连续（如 `fromSeq=1,toSeq=2`），内容与另一链路一致。两个请求均返回 `{}`。
- **错误语义**：非法 state/connectionId 在请求边界拒绝；不改变 publisher 状态。
- **时序与并发**：saturated 立即生效并缓冲后续帧；drained 按产生顺序 flush，不合并、不跳号。
- **幂等**：重复 saturated/drained 幂等；未饱和连接 drained 无副作用。
- **资源释放**：连接关闭（`closed`）释放该连接缓冲；不影响其他连接。
- **平台差异**：无。
- **状态所有者**：connection flow 状态表 + 每订阅 buffer。
- **日志级别**：`debug` flow 状态变化。

## B15 clientMode 边界校验

- **输入**：`subscribe` 携带 `clientMode` 不在 `desktop-continuous|web-remote-replayable` 内。
- **输出**：协议 error；不创建订阅、不发帧。
- **错误语义**：strict schema 边界拒绝；错误形状沿用既有协议错误，不新增 code。
- **时序与并发**：校验先于任何 session/publisher 访问。
- **幂等**：无副作用，可安全重试。
- **资源释放**：无分配。
- **平台差异**：无。
- **状态所有者**：协议入口的 schema 校验。
- **日志级别**：`debug` 记录拒绝，不记录完整参数。

## B16 生命周期与 stdout 纯净性

- **输入**：完成一次 v4 交互（createSession）后关闭 stdin。
- **输出**：进程以退出码 0、无信号退出；stdout 所有行均可解析为协议消息；无反代/日志行。
- **错误语义**：关闭期间不得写出半帧；未完成的 command 等待既有收口或按进程退出语义终止。
- **时序与并发**：先停止接收新请求，再释放 subscriptions/publisher，最后 dispose DSH host；退出前 flush 已排队 stdout。
- **幂等**：重复关闭/信号无额外副作用。
- **资源释放**：DSH host、会话文件句柄、订阅缓冲全部释放；不删除用户数据。
- **平台差异**：SIGTERM 在 Windows 由平台映射；行为以既有 CLI 入口为准。
- **状态所有者**：协议入口 + 桥 runtime。
- **日志级别**：`info` 运行时就绪/关闭；`debug` 释放顺序；不记录凭据。

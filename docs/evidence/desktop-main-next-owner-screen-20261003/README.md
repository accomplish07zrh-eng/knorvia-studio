# Desktop main：三项归属询问，明确可分配集为空

本次小范围筛选仅使用 desktop main 清单元数据、PR8–12 发布 head/变化路径、既有公开 declaration/contract 与 source digest；未读三个目标 body、未开 author、未改源或执行 runtime/compiler。基线 E `cfbe2282d26af2adabe3d57098170b24dbcdb4cd`，原分支/远端/工作区均就绪。Sol/high/Fast 既有状态不变。

只保留以下三个有明确状态职责的**归属询问项**。当前明确可分配集为 **空集**，不是不存在剩余实质 owner；root 须先确认其旧接受、私有 checkpoint 覆盖和当前归属。没有找到本地 exact-path review 不能否定旧接受，也不能授权替换。

| 询问项 | 当前 SHA256 | 公开职责依据与 HOLD |
| --- | --- | --- |
| broadcastHub.ts | `a1216b85285bd6830b6c5afffe8e94b7e2b623882c127ffceedfd0e3374cf11e` | BroadcastHub 的 windowId/UtilityProcess register、unregister 与 diagnostics；既有 Host contract 指定注册/退出注销顺序。根 Host 直接协作者，须确认旧接受/私有 checkpoint 与广播 authority/lifetime 归属。 |
| taskRealtimeBus.ts | `21ff17c445ecff554d377a20ef072923f609f3aa24c73224d26049f7ce850b90` | TaskRealtimeBus 的 hostId/windowId/child/workspaceKeys/deliveryKind 注册、注销、workspace 更新与 seenEventLimit；公开 Host contract 明确区分其注册与 broadcast，不在 Host exit 添加新 realtime unregister。属于 Host/workspace/replay 权责，不能按简单投影分配，须确认 root/B/G 边界和旧接受。 |
| databaseStartupRelay.ts | `095ff63dc2363cbba63bd31bb65049ee3ffe0646c82e2e9fbcc8543736a51a55` | bindDatabaseStartupRelay 的 receive(DatabaseStartupState)/startupId；既有 contract 明确 relay 拥有 startup-generation/cancellation/failure policy，Host 只消费其端口。紧邻 root startup/Host 工作，私有 checkpoint 可能覆盖，HOLD 不补写。 |

三个文件均为当前 inventory 的 `upstream-modified` / `NOASSERTION`，实际摘要与该逐文件条目相同。精确 bytes、Git blob、上游 blob/normalized digest 和固定 publisher commit、source URL 见 [screen-results.json](screen-results.json)。这是现有 origin 记录核对，未重新取 publisher source，未作授权或 whole-file MIT 判断。

排除范围：PR8–12 先前各自 merge-base 的已发布改动；PR12 最新 `b2c58b67915ec98f21f952aec6fb588f177fad0d` 的增量；G 当前 browserPlaywright 三 owner（保守排除 browserView/browserPlaywright 范围）；root network/runtimeEnv；已知已接受候选、已知私有 HOLD、许可材料和轻量 facade/data/helper。当前 PR9/10/11 head 未变化，PR8 仅上次 evidence 提交；PR12 新增 network policy，未读取该目标 body。候选均不在已发布排除路径中。

职责根据既有 [公开依赖声明](../desktop-platform-host-root-packet-20261003/dependency-api.d.ts) 和 [Host contract](../desktop-platform-host-root-packet-20261003/contract.md) 第58–62/72行，未从名称/行数推断 purity，也未声称这些有限公开方法覆盖完整 owner 内部状态。现有独立 log metadata 只显示旧 preview snapshot 与格式提交，不能证明所有历史旧接受不存在。没有访问/恢复 root 私有文件、Library403、凭据或用户数据；不扩大扫描、不重试阻塞来源。

21 材料义务继续 OPEN。三处 PR8/11 scheduler 碰撞仍留到全部实现完成后的最终整合。本次0新 owner/0新材料关闭/0源改动/0测试复跑，仅记录筛选与 HOLD。

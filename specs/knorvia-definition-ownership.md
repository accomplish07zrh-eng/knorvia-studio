# 群聊与工作流定义的唯一所有权

2026-09-25。延续 `specs/knorvia-backend.md`：Host 内 `StudioRuntimeService` 是群聊、工作流定义与运行的唯一写入入口；Renderer 只保留未提交草稿与 pending optimistic overlay。本规格收紧两个缺口，不改变界面、不新增页面。

## 现状缺口

1. **保存无并发保护**。`save-group` / `save-workflow` 为后写覆盖。两个桌面窗口，或桌面与手机 Web 同时编辑同一群聊或工作流时，后保存的一方会静默覆盖先保存的修改。
2. **群聊定义在 localStorage 保留完整副本**。`knorvia-studio:groups:v1` 在迁移完成后仍持续写入全部定义、`importedIds` 与 `backendRevisions`，形成第二份定义来源；每次挂载都重新跑导入判断。

工作流画布的 `knorvia-studio:workflow-drafts:v1` 保存的是尚未提交的画布编辑（撤销历史、未保存节点），属于合法草稿，存储格式不变，只新增每个草稿的服务端基准版本 `baseUpdatedAt`。

## 规则

- 保存命令增加可选 `baseUpdatedAt`：编辑器打开或上次成功保存时看到的服务端定义 `updatedAt`。
  - 缺省：新建或旧客户端，行为不变。
  - 提供且服务端记录存在但 `updatedAt` 不同：拒绝，错误文案「此群聊/工作流已在其他窗口修改，请重新打开后再保存」，不写入。
  - 提供但服务端记录已删除：拒绝，文案「此群聊/工作流已被删除」。
  - `onlyIfAbsent` 导入不受影响。
- 冲突判定在 Host 的同一 SQLite 事务内完成，与命令幂等记录一起提交；重复同一 `commandId` 返回原结果，不重复判定。
- 群聊 localStorage 迁移为仅草稿：
  - 新键 `knorvia-studio:group-drafts:v2`，内容仅 `{ version: 2, drafts: { [groupId]: string } }`。
  - 启动时若存在 v1：把 v1 中每个群聊以 `onlyIfAbsent` 提交 Host；全部被 Host 确认（成功，或已存在/已删除）后，把 v1 中的输入草稿写入 v2，**立即删除 v1 键**（用户 2026-09-25 确认迁移成功后立刻删除，不保留回退副本）。任一导入失败则保留 v1、不删除，界面显示可重试的导入错误。
  - v1 损坏或不可读：不删除、不覆盖，保留现有「存储问题」提示。
- 群聊列表只来自服务快照；保存成功到快照追上之间的 pending overlay 只在内存保留，不落盘。输入草稿不属于定义，修改草稿不改变 `updatedAt`。
- 工作流草稿记录其基准版本：只有采用服务端定义（本地无未保存修改、新出现的定义、保存成功或用户选择载入最新）时才前进；本地有未保存修改时服务端更新不推进基准。保存被拒且服务端版本已不同于基准时，页面提示冲突并提供「载入最新版本」，放弃本地修改后采用服务端定义；用户也可先「复制」保留自己的版本。

## 所有者与事件顺序

```text
Renderer(窗口 A)            Host StudioRuntimeService (SQLite 事务)          Renderer(窗口 B / 手机)
打开编辑 base=U1  ─────────────────────────────────────────────────────────  打开编辑 base=U1
保存(base=U1) ──► admission: 记录 U1 == base → 写入 U2, revision+1 ──► 广播 onDidChange
                                                                             保存(base=U1)
                  admission: 记录 U2 != base → 拒绝(不写入)  ◄──────────────
                                                                    提示冲突，重新打开得到 U2
```

启动迁移：

```text
读取 v1 → 对每个群 command(save-group, onlyIfAbsent) → 全部确认 → 写 v2(drafts) → 删除 v1
                                     └─ 任一失败 → 保留 v1，显示重试
```

## 验收

1. 服务测试：带过期 `baseUpdatedAt` 的保存被拒绝且不写入；匹配时成功；记录已删除时拒绝；同一 `commandId` 重放返回原结果。
2. UI 测试：v1 数据导入成功后 v1 键被删除、草稿保留在 v2；导入失败时 v1 保留；v2 只含草稿文本。
3. 群聊编辑表单在保存冲突时显示错误且不关闭，重新打开后得到最新定义；工作流冲突显示「载入最新版本」，载入后基准前进、冲突提示消失。
4. typecheck、lint、架构检查与 `pnpm test:studio` 通过。

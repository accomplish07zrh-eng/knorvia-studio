# UI 分组 hook / 拖拽：先行生命周期契约

固定 UI 路与 PR #15，起点 `3b1ff0f715a43cbc51c576fd524479a08e58e203`。
作者已读旧 useGroupedTaskView、WorkspaceGroupedTasksSection、既有 view commands
与直接 services/store 签名；是 source-exposed，权利核验待整合，不授 MIT。
本规格先于本批正文。B1–B5 既有功能、记录和既有 UI 必须保留。

## Hook remote 数据 owner

- 同 key 同世代进行中请求共享原 Promise；fetch 在 microtask 中启动，允许
  同步抛错经 Promise rejection 传递。每次 load 都算最新 demand，包括命中缓存。
- 全局只保存一份已完成 key/value；不同 key 可并发，只有最后 demand 所属请求
  可写已完成缓存。同 key 再次共享会把该请求重新标为最后 demand。
- key 命中返回 Promise.resolve 同一 value。isCurrent 判 key 和 value `===`。
  invalidate 使全部旧 demand/缓存/pending 无效；旧调用者仍可收到原 Promise
  结果，但旧 finally 不能删除新世代同 key pending，也不能回填缓存。
- 跨挂载 view 缓存继续按原 scope 签名保留最多 8 项，只在写时刷新淘汰次序；
  读取不刷新次序。只在成功 authoritative refresh 写入，既有旧数据优于空白
  的窗口保持，不新增 TTL/存储 key/数据库数据。
- 首屏、membership/structure 的 key、Controller sessions join、optimistic
  projection 和 promoted draft 持久化规则不借本批改动。原 hook 仍拥有 view。
- 首屏 refresh 仅在当前 view 无节点时 loading=true；最新请求不论成功/失败
  最终 loading=false 且初始化门禁结束。仅当前请求记录一次错误；接受还须通过
  remote cache 的 key/value 判定。build/join/accept 抛错沿用同一错误日志。
- 后续 refresh 接受权 owner 批次：scope/service 替换、卸载和 effect replay
  撤销旧 refresh 接受权并 invalidate remote cache。旧调用者仍可收到 Promise
  完成，但不得回写 view/carry cache、关闭新 loading 或重开新初始化门禁。
  此为旧 hook 没有 refresh cleanup 的显式修复；RPC 不增加 abort 接口。
- 缓存及 refresh owner 的替换不能称整个 hook 已重写。mutation、overlay 和
  promoted persistence owner 仍保留在未完成清单，不以本批撤销其写入权限。

## 拖拽目标投影

- 仅按原 data.type 和 string taskKey/groupId 解码；空 id 在投影入口仍无操作。
  保留 task key 的 workspace 身份及 NUL 分隔规则，不改 drag/drop data 格式。
- group 拖拽只允许 task 与 grouped-group-over 参与 closestCenter；task 或未知
  actor 保留所有非 grouped-group-over 容器。碰撞筛选只看 type，不因缺 id 改筛选。
- group over group/task 调用原对应结构命令。task over task 依 direction 放前/后；
  collapsed group 放 root 组前/后；header before 放 root 前，after 放组首；footer
  before 放组尾，after 放 root 后；empty zone 放组首。其它目标 no-op。
- 同 task/group、无 over、无有效 actor 和 signature 不变不发 preview。signature
  的 token/分隔保持原表达，排序与展示本身由既有 view owner 决定。
- 本批仅替换目标路由与碰撞准入 owner。原 drag start 宽度单次测量、方向反转
  重新 preview、collapsed snapshot、Workbench pointer tracker、布局动画和保存
  回滚仍在消费者中；不能通过提取文案把这些称已独立重写。
- 保留原取消边界：task cancel 恢复 origin；group cancel 恢复 collapsed snapshot
  后 reset，不额外还原 preview。group/task end signature 相同恢复 origin；变更
  持久化失败恢复 origin 并用原 toast。Workbench 接受 task drop 不保存列表顺序。
  此边界看似不对称，需最终用户/DOM 验收，不在本批静默调整。

## 未验证

不执行 tests/lint/types/build/架构或全量审计。新增 owner 合同只写不跑；仅源码
阅读、差异与 Git/远端 metadata 检查。最终仍需 React、DndKit、真实保存/回滚、
scope 恢复、IME、动画、desktop/Web 和数据兼容验收。所有来源记录在本路独立
ledger/evidence，不更新全局 inventory、LICENSE/NOTICE 或第三方许可证。

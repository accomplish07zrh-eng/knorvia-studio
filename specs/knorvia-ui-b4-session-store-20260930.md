<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# B4 最小 session store 纯逻辑合同

2026-09-30。基线为实际 PR #7 `43f0abada1946266108df2bf6b93a1c525a0c6ef`；B3 已交接，不回写。生产范围最多 `sessionStoreSelectors.ts`、`sessionStoreNavigation.ts`、`sessionStoreTypes.ts`。本批选择前两份为重构目标，第三份保留原字节。新 tests/spec/docs 使用 B4 唯一名称。不改 sessionStore 本体、workspace/task slices、hooks、服务、shared schema、来源 inventory、lockfile 或 global config。

## 来源与保留边界

三文件均在来源清单中为 unreviewed、upstream:null、无原创 review；此状态不是原创证据。固定上游 `zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521` 存在相应 `zcodeSessionStoreSelectors/Navigation/Types.ts` 别名。当前文件从本地发布快照 `7619e41b950bd52073ebf36754146cf25659d9fa` 可见，navigation 后有格式化提交；历史重命名不能消除归属。

Types 包含接口、常量、默认值工厂与模块 singleton，不是纯类型。保留这份文件，不为统计修改或授予原创；缺省 Apache-2.0 及共享 owner 依赖继续适用。作者已读三旧源、消费者、依赖与固定上游字节，属于 source-exposed。候选源码保留 Apache-2.0 和待审说明；新合同表达的 MIT 不覆盖生产或依赖。来源 alias/摘要及外部独立 authorship/license 审查由唯一主整合者处理。

## Owner 与候选设计

```text
Host/session facts → existing workspace/task slice admission → one Zustand store
                                                       ├→ read selectors → current UI
local navigation intent → existing history policy → navigation action → same store
desktop continuous / mobile replay → supplied store state → same pure selectors
```

选择器不接管 accepted state、异步新鲜度、重放、审批或持久化。`updateWorkspaceState` 返回单一 workspaces patch，由既有 slices/Zustand 写入；不新增缓存、第二状态源或清理/迁移动作。导航 history 的语法、去重、50 项上限与删除回退仍归既有 `taskNavigationHistory`。导航 adapter 只集中 deferred history update 与同步 cursor move 两种提交路径。

selectors 的候选设计将首次 identity 迁移表达为有限字段投影：六个 workspace 展示字段与九个 task 字段按固定求值顺序应用到 fresh defaults；不动态合并 identity/path、不复制其他字段。只合并重复的 workspaces patch 写入路径，不更换查找或 shared metadata merge owner。默认值、singleton 及声明签名保留；小 accessor 的不可约合同表达不因换名被认定原创。

## workspace、task 和引用合同

- key 为 `workspaceIdentity?.trim() || workspacePath`，path 不 normalize；null/undefined/空白 identity 回退 path。读取先取得 path/default，再求 key；identity 未有 truthy bucket 时回退原 path/default，存在时返回 identity bucket 原引用，不动态混入 path maps。普通继承属性继续参与读取，不增加 own-only 验证。
- 更新先求 key，local 路径继续通过已有读取规则；identity key 使用现有 nullish bucket 或一次性 seed。updater 只调用一次；返回同一 current 引用时保留原 workspaces 引用，不能因 seed 创建而 materialize identity bucket。变更仅复制外层 workspaces 并写一个 key；保留其他 bucket、symbols、未知值与 next 的引用。异常公开，不新增 schema 校验或吞错。
- seed 先创建默认 workspace，再由 cache 的顺序和 optimistic Object.values 收集 trimmed identity 匹配 taskId 的 union。cache 随后仅按这个 ID union filter；同 ID 不同 identity 的历史条目仍可共同保留，不能顺便改变旧迁移规则。六个展示字段按原顺序读取并保留引用。仅 union 非空时迁移 active ID、optimistic/config/status/cache/version/runtime/ui/unread；record 仅选 own enumerable string entries，值保留引用，`__proto__` 为普通 own data key。其他草稿/运行/unknown 字段回 fresh defaults。没有 path seed 时返回 fresh defaults，selected provider 按现有 shared factory 规则建立。
- getTaskRuntimeState/getTaskUiState/getWorkspaceInitState 只作 nullish 缺省，fallback 是原模块常量稳定引用；不修正 malformed truthy/falsy 值。displayed task 在 active ID falsy 时取 draft，否则原 task runtime；终态、未知 status、空 error 原样展示，不新增终态推导。
- metadata 查找先读 optimistic 对应 key，再取 cache 第一个 taskId 匹配；仅一方时直接返回原引用，双方时调用现有 merge owner。visible metas 按 cache 插入顺序，duplicate cache value 最后项胜但位置首次固定；optimistic 依 Object.values 顺序补入/覆盖，并继续按每个 value.taskId 调用同一 metadata 查找。record key 与 value.taskId 不一致的行为不能自行纠正。返回 fresh array，无深克隆或输入 mutation。
- unread 优先 stored meta；stored 存在但 own unreadAt 为 undefined 时不能改用 fallback。Boolean(unreadAt) 或兼容 map 严格 `=== true`；零、NaN、空串和非 boolean map 值不得被新增规则解释。metadata own keys、未知字段、nested 引用及错误继续归原 merge owner。
- Types 的五个 runtime exports、常量 own keys/undefined、workspace 工厂字段顺序、fresh maps/arrays 与 cloned init、稳定 default workspace 引用冻结；不把常量改为 freeze 或深拷贝。整个 Types 源码 SHA 保持不变，以类型检查同时覆盖实际 store/slices 消费者。

## navigation adapter 合同

- 六个切片 own keys 顺序固定：history、push automations、push plugin、back、forward、remove。每个 factory 有独立 history/entries/action closures。
- push/remove 只调用 `set(function)`，不先调用 get，不预计算 history；被延后执行的 callback 读取执行时 state。返回 void，patch 只含 taskNavHistory；重复 push/remove missing 仍提交 callback，history 可保持原引用。
- back/forward 只 get 一次，再调用既有 history helper；边界或 hole 返回 null 且不 set。有结果时先 `set(object patch)` 再返回原 entry 引用；entries 数组保持原引用。get/helper/set 失败直接抛出，不能提前返回或做 rollback。
- raw workspace/identity/automation/tab 字节、空可选字段省略、相邻去重、forward 截断、删除当前 task 的 fallback 和非 task entries 保留均沿用 history owner。导航动作不选择 task/workspace，不改 runtime、permissions、draft、serialized task 数据；实际 store/slices 的消费链另测。

## 验收

先在旧 source 上执行永久合同并提交，再改生产。source 与实际 UI dist 均运行选择器、导航 ports 及真实 sessionStore 消费者测试；实际 Zustand mutation/subscription 单元不是 React DOM/native UI。root typecheck、测试 noEmit、lint/verify、full architecture、owned format/diff、相关 Web build 与 source-map 精确字节/实际提交回执绑定必须通过。

有限 old/new 对照核对输出、own keys/顺序、异常类别、输入不变性、输出引用与 set/get traces；标准数据之外的任意 stateful Proxy/getter 或被篡改 builtin 不承诺完全等价。未冻结 DOM/native、Windows/macOS、真实模型或升级场景不能称原生 UI 验收。最终 SHA 和组合 head 由提交后回执绑定；来源决定与全量整合 CI 不由本批代写。

# UI 文件树与任务分组投影的行为契约

2026-10-03。本路持久分支 `rewrite/ui-20261003` 从整合基线
`3b1ff0f715a43cbc51c576fd524479a08e58e203` 建立。此规格只覆盖 UI
内部纯投影；已有 B1–B5 实现保留，不重复实施。实现阶段不运行任何测试、lint、
类型、格式、架构、构建或全量审计，下面的场景是待执行合同，不是通过记录。

## 文件树：所有者与兼容边界

`useWorkspaceFileTreeData` 独占目录加载、错误、展开及刷新状态，现有服务提供文件和
Git 事实。`useWorkspaceFileTreeRows` 从这些事实派生展示行；新纯模块不缓存事实，
不发请求，不修改输入 Map/Set/节点，不读写用户文件。原 `model.ts` 的导出路径和
函数签名继续可用。React JSX、样式、图标、行高、键盘、菜单、拖拽、移动端和
预览消费者保持原调用。身份、存储 key、协议、数据迁移和平台操作不改变。

```text
file/Git service → useWorkspaceFileTreeData（唯一加载 owner）
                              ↓ 当前 Map/Set
                   Git deleted 行只读投影 → 深度优先行投影
                              ↓
                   现有 useWorkspaceFileTreeRows → 原 JSX
```

路径比较继续大小写敏感，只把反斜线换成正斜线并去末尾分隔符，不 resolve `..`、
不合并中间双分隔符、不访问文件系统。根同自身得到相对路径 `.`；根外路径相对
展示使用既有 `getPathLeaf`。祖先及父级输出保留 workspace 根的原前缀：全反斜线
输入采用反斜线，否则采用正斜线。根和根外没有父级，子目录深度按非空段计数。
这些是展示工具，不能当成文件系统权限判断。

同一文件的 Git 合并优先级为 untracked > added > deleted > renamed > modified >
ignored；untracked section 或 flag 覆盖 kind。目录只聚合真正后代，顺序为
ignored > modified > 其余；同优先级按首次出现保序。Git 可用须可执行且属于仓库。
忽略集合按同一路径比较；deleted 文件行只有非目录才视为删除。丢失的 deleted
文件仅加入已存在的父目录列表，目录优先、同类按既有 localeCompare 名称排序。
没有插入时返回输入 Map；有插入时只复制 Map 和改动父级列表，现存节点保留引用。

展开树按服务提供的子节点顺序做前序深度优先遍历，不重排、不去重。空目录链仅在
启用扁平化、当前目录已加载且不 loading、无 error map 条目、唯一孩子是非软链
目录时合并。软链可以手动展开，不能自动并入链。合并名称使用 `/`，路径/类型及
loaded/loading/error 属于链末端；任意链内路径展开即展开合并行。深度和子孙 offset
按旧合同累计，包含嵌套合并链；不能因换遍历算法修正现有 offset 表达。error 对象
保留引用。实现采用显式遍历栈，替换原递归，不引入新的深度上限。

changedOnly 先过滤：文件必须有非 ignored 直接状态，目录可因任何后代状态（包括
ignored）保留。搜索 trim + toLocaleLowerCase 后按行名称子串匹配，保留命中行、
命中行的目录祖先及命中目录的后代；仅从 changedOnly 后的集合取行并保持原顺序
及引用。没有两个过滤条件时返回原 rows 数组。

搜索索引结果仍以 relativePath 作名称，深度 0、各状态 false/error null。目录 reveal
先确认属于 workspace，再依序给出祖先及目标原路径。刷新次序固定为 root、已加载、
已展开，排除根外路径并按原始字符串去重（不归一成同一个请求）。预览继续委托
现有 CodeViewer 检测：非 SVG 图片、媒体、普通文件，title 取既有叶名称。

## 本批待执行场景

1. POSIX、Windows、UNC、混合分隔符、大小写、根自身/外部路径、重复分隔符。
2. 重复 staged/untracked 状态、目录前缀隔离、优先级和同级稳定顺序。
3. deleted 行只加入已加载父级，Map copy-on-write、原节点和错误对象引用。
4. 展开/折叠、加载中/错误阻止合并、软链边界、链内展开、嵌套深度 offset 和深树。
5. 空搜索引用、changedOnly + search 顺序、相同名称不同路径、祖先/后代保留。
6. 搜索 reveal 与 root/loaded/expanded 刷新順序，包括原始路径别名。
7. 最终实际 React/DOM、Web/desktop 产物、各平台 UI 和数据恢复组合验收由整合阶段执行。

## 来源限制

作者为提取行为已阅读当前 model/search/refresh 和直接 hook 消费者，属于
source-exposed。新的算法和状态分解必须按此合同重新表达，不能把抽文件、改名或
格式化算作独立替换。保留 Apache-2.0 过渡声明和所有第三方归属；原清单和 review
不在本路更新。新字节、接口表达、preview 依赖、作者权利与最终来源决定待整合者
逐文件复核，不宣称 clean-room、MIT-ready 或全模块完成。

## 任务分组：结构编辑与滚动契约

正式结构、排序与任务事实属于现有 task/session service；`useGroupedTaskView` 和
现有 store 继续拥有 optimistic overlay。`view.ts` 的所有公开函数保持原导出，
新结构编辑只产生临时 view，不调用服务、不写 store、不新建持久事实。
`WorkspaceGroupedTasksSection` 仍用 authoritativeView 算持久排序，归档过滤后的
view 只渲染，不能把临时隐藏行写成永久删除。公共 taskKey 继续使用既有身份 owner
及 NUL 分隔符，同路径不同 workspaceIdentity 的 task 不得相互移动/替换。

```text
service structure + sessions-index → useGroupedTaskView / existing overlay
                                             ↓ authoritativeView
                       现有 drag/menu → 纯结构编辑 → 原 setView / save command
                                             ↓
                                     原 JSX 与虚拟列表
```

编辑采用位置 cursor 和单次局部剪接事务：先从原结构定位源，取回原 task 对象，
移除后重新定位目标；只复制受影响的组及顶层数组，其他节点引用保留。组不能嵌套，
拖到组内 task 等同拖到所属组。目标是自己/自己的组、源不存在、目标不存在的拖拽
返回原 view。任务拖到另一任务前后随目标父级，组内向后移动不能沿用移除前 index。
向组开头/末尾、组前后和顶层 task 前后分别保持原行为。

菜单移出组放在原组之后，顶层菜单置顶放第一，组内菜单置顶只移到当前组第一。
移到同一组返回原 view。须保留旧菜单特殊边界：非空但不存在的目标 groupId 会先
移除源而不插入；空字符串目标不按有效组处理。它们不由本批暗中修正，最终需明确
产品决定后另立规格。drag 的无效目标继续完整回退原 view。

`cloneView` 浅复制所有节点及每个 tasks 数组、保留 task/group 对象。删除 helper
按组优先找第一个匹配（即使更早的顶层节点也有同 key），仍复制整个 view；
普通 find/移动按顶层扫描顺序找第一个匹配。replace 替换所有匹配，所有组节点及
tasks 数组重建，未命中 root 节点保留引用。归档过滤在没有命中时返回原 view，
有命中时保留空组与未改变节点引用。折叠集合仅保留已知组，按原集合顺序；没有组
不算全展开，草稿根据目标 task 父级选 group/top，不新造群定义。

虚拟滚动仍由消费者的同一 DOM scrollElement 所有。overflowY 接受包含
auto/scroll/overlay 的原字符串规则。无 scrollElement 不滚动；滚动目标为 offset
+ adjustments，按 horizontal 写 left/top，behavior 原样传递。仅在 vertical、
offset=0、adjustments=0、behavior undefined、DOM scrollTop>0 且 cached
scrollOffset=0 的初始失配时忽略旧 0，同消费者原 initialOffset 一起防止列表重挂载
回顶。显式 behavior/非零调整/正常缓存的滚动不被拦截。不得新增计时或复制 DOM
滚动状态。保留阈值 80、overscan 12、动态行高测量、UI JSX/CSS 与无障碍。

待执行场景：跨 root/group 的前后移动；同组向后；拖 group 到成员；无效目标/自身
no-op 引用；重复 task key 的查询/删除差异；原 task/不受影响节点引用；菜单离组
位置和原无效目标边界；workspaceIdentity 隔离；隐藏归档行的过滤与恢复；垂直回顶
屏障、显式零滚动、横向滚动及无 element。所有场景本阶段未运行。

## Studio 群任务进展：只读事实关联

当前 `groupProgress.ts` 的全局来源记录是 unreviewed，已有 Git history 包含
`acc547409bc0edf042371456eb394dd00645efe3` 的功能新增及后续格式提交，不存在
accepted MIT review。不能据目录或新功能身份宣称归属已闭合。本批只替换这一个
纯进展 owner，保留群定义/草稿/发送、store、全部组件和既有新增功能；未审文件
不按目录批量重写或授权。

进展只读取 `StudioTimeline` 的第一个 run。没有 timeline、不是 group、不是任务
模式或没有 members 定义则没有进展；旧 task run 不能越过首个更新的自由讨论。
不从聊天文字/排序猜测状态，不累计用量，不读写 checkpoint。公开 GroupProgress、
GroupTaskProgress、GroupProgressState 以及 `groupProgress` 导出保持原消费者路径。

新实现先为当前 run/attempt 建立只读 turn 与 pending interaction 关联，再解码 plan
并投影成员，不创建运行状态副本。每个 step 及主持人选第一个符合 run/attempt 的
turn，不用较晚的重复记录覆盖。主持人 step 只接受既有 plan/review/steering 前缀。

plan 只接收 version 1、非负安全整数 round、tasks/steering/complete phase 及 tasks
数组；任务必须有 string id/instruction，成员属于定义。有效任务保留原引用及
dependsOn，不迁移/修复历史 payload。review 只需安全整数 round、complete/revise
status 和 string summary，保持原历史允许负数 review round 的边界及对象引用。

任务状态按事实优先级选第一个成立项：运行中 turn 的取消请求且 run 活跃 →
stopping；活跃 run 的 pending 交互 → waiting；活跃 run 的 running turn → running；
resultKnown=false 或 checkpoint/turn interrupted → unknown；checkpoint 或 turn
succeeded → completed；failed → failed；cancelled → stopped；残留 running turn
且 run resultKnown=false → unknown；残留 running turn 且 run cancelled → stopped；
queued/running/waiting run 且未取消 → queued；其他 unassigned。checkpoint 成功
仍优先于 turn 失败，不能在纯重写中变更既有冲突解释。

仅 queued task 遇到已存在且未 succeeded 的本 round dependency 时为 blocked。
缺失依赖记录仍 queued；原行为不在此阶段修复。证据来自相同步 checkpoint，只有
workspacePath 或 changesSummary 为 truthy 才返回 evidence，保留其原字段。

主持人状态继续按原规则加入自身成员：running 时优先 stopping，其次 run
interrupted/resultKnown=false → unknown，其次 pending → waiting，其他 running；
主持人 succeeded/failed/cancelled/interrupted 映射原终态，没有 plan 的 queued/failed
run 映射 queued/failed。成员总体优先级为 unknown > stopping > waiting > running >
failed > blocked > queued > stopped > completed，空任务 unassigned。成员顺序与重复
定义成员原样保留。phase 无 plan 为 planning；steering 原样；complete plan + queued
run 为 steering；tasks plan + running review host turn 为 reviewing；其余 tasks。

待执行场景包括旧 round/attempt 隔离、重复 turn 首条选择、pending/取消/未知冲突、
依赖缺失或失败、缺 plan/旧 payload、负数 review round、证据缺省、主持人和成员
优先级、首个 run 边界。既有 `studio-group-progress.test.ts` 及原 GroupProgressPanel
消费者留给最终统一执行，本阶段无通过结论。

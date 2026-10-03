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

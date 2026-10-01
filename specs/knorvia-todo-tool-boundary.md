# Todo 工具入口冻结合同

基线为 `08255eca46ea14de63dcead1a2ca76194187b772`。本批先补入口的 source/emitted 行为证据，不改存储实现、公共 schema、提示文案或许可判断。已阅读旧实现，不声明隔离作者或独立替换完成。

## 唯一所有者与顺序

会话列表唯一所有者仍为 SessionStorePort；工具不缓存列表、不接管仓储事务。读取：schema admission → 要求 session store → readTodos(sessionID) → 返回原列表。写入：schema admission → 要求 session store → 读旧列表 → 写入解析后的完整列表 → 成功后统计并返回。仓储原子性由既有 `knorvia-entry-todo-storage.md` 约束，入口不得自行重试或回滚。

## 精确行为

- 输入 schema 先于缺失端口错误；顶层未知字段拒绝，条目未知字段按既有 schema 去除。空白 content、重复条目、空列表、多项 in_progress 保持当前允许行为。提示中的单项建议不等同 schema 硬拒绝，本批不改这个既有差异。
- 缺端口使用 ConfigurationError、不可恢复，原工具名及 toolCallId 上下文保持。
- 端口调用保持 receiver、sessionID、次序和恰好一次。读取失败阻止写入，写入失败原样传播；无额外补偿调用。
- read 返回原列表身份，write 返回读到的 oldTodos 和实际传给 updateTodos 的解析列表身份；summary 在 updateTodos 成功后计算。待办顺序、文本和 priority 不规范化。
- 入口目前没有独立 abort 检查；已取消上下文是否到达工具由外层执行器处理。本合同只记录直接 handler 调用，不能声称覆盖执行器取消保障。
- 合同覆盖源码与真实构建 dist，使用自有假端口，不打开真实用户数据库或文件。原 entry declaration、权限、预算、超时和显示策略不在修改范围。

<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 工具登记、别名与模型合同

2026-09-28。独立替换 core/tool/registry.ts，保留公共 ToolRegistry、ToolRegistryImpl、ToolRegistryRegisterOptions、createToolRegistry 与现有调用者。已读取旧源码，不作无接触声明；固定字段、文案、标准集合操作及协议转发不声称为发明，拆分/改名和测试通过不单独证明独立。

## 所有权与实现选择

每个注册表由一个有序绑定账本拥有 canonical 条目绑定及 alias 目标绑定，名称槽位索引仅引用这些同一对象。槽位允许两者并存，不能使用互斥标签，因为空名目标可形成既存重叠状态。覆盖在原绑定中更新，删除后重登记追加新绑定；列表/快照投影 canonical，路由清理迭代 alias。统一账本的原生有序迭代保留登记次序以及迭代期间的删除/追加语义，不额外保存数值序号或失效历史节点。

公开驱动沿既有阶段改变账本并请求警告；警告为本地 console 适配边界，保留其 receiver 与同步异常，不引入回滚事务。模型合同投影消费 canonical 快照，不缓存，不持有注册状态。条目本体、schema、permission、resultBudget 继续引用调用方对象，注册表不复制工具、不执行 handler。

```text
登记/移除命令 → 唯一名称账本 → canonical/alias 路由
                  ↓
          canonical 有序快照 → 完整 visibility 过滤 → 模型合同投影
```

Runtime 的工具缓存失效仍由已有调用者负责；不增加第二条自动缓存刷新通路。Desktop 与 Web 使用原执行器身份归一与同一合同，权限/事件/重放协议不变。内部文件归属现有 unmanaged CLI，无新增跨模块依赖。

## 登记与路由

- 条目按原引用登记，不 trim 或验证名称。真实同名覆盖保留 canonical 列表位置，删除后重登记放末尾；重复相同别名不多发警告。
- 普通非空 alias 被同名 canonical 夺回时，先删除 alias，再按严格 silentDuplicateWarning !== true 警告；覆盖已有 canonical 则先警告，之后清其原别名再替换条目。
- 新条目登记后逐个处理 aliases：自身名称、已有 canonical、指向其他目标的 alias 均逐项跳过并按规则警告；前面已成功的别名不回滚。新别名指向当时登记名称，后续 metadata.name 改变不自动改路由。
- 删除正常 alias 只删该路由；删除 canonical 清除指向它的 aliases，不修改 entry.aliases。未登记名称无额外效果。
- get 按 alias 目标的 nullish 回退查询 canonical；has 和 getMetadata 继续经公开 get 方法。list 不含只有 alias 的槽位。
- 空名目标的既存例外必须保留：登记 name=""/alias="x" 后再登记 name="x"，list 为 ["", "x"]，get("x") 仍指向空名条目；unregister("x") 删除 canonical x 却保留 alias。truthy 清理和 nullish 查找的区别不在本批悄悄修正。
- 同一条目外部改名后再登记可占有两个 canonical 键；显示合同读取新 metadata，查找键保持登记时值。修改 aliases 数组不立即更新路由。
- 同步 getter、迭代器或警告异常原值透传，保留当时已提交的部分状态。不得先快照所有输入、先验证后原子替换或默认吞掉日志错误。
- 复核补充：console.warn 方法必须在警告消息插值之前读取。若 name getter 在插值时替换日志方法，本次仍用先前的方法和 console receiver；先补首版包装函数上的失败测试，再把此本地适配调用留在原阶段。

## 模型合同

先快照 canonical 条目数组，完成全部 providerVisible 过滤，再逐条投影；只排除严格 false，隐藏条目仍可通过名称执行。过滤/投影中新增工具不进入本次快照，下一次可见。

字段顺序保持 name、description、capability、executionMode、providerNative、inputSchema、outputSchema、可选 strict、readOnly、destructive、concurrentSafe、requiresUserInteraction、maxOutputBytes、timeoutMs、needsApproval、sideEffectScope、permission、resultBudget、execute。除 strict 在 undefined 时省略外，缺席值仍保留 own undefined；execute 固定 undefined。strict 首次非 undefined 时再次读取；requiresUserInteraction 优先用 entry，nullish 时才读 metadata，false 不丢失。

description 先读取原说明，再对 modelInstructions 逐条 trim、过滤空项和稀疏槽位，保留重复和内部换行；非空指令以 Usage: 和逐条 "- " 组成，不 trim 原说明，原说明非空时用两个换行连接。不额外清理、截断或序列化 schema 与其他引用字段。

## 验收与许可边界

先锁定旧版登记/删除顺序、冲突、空名例外、引用与改名、警告三阶段失败、模型字段与惰性读取、可见性两阶段快照和描述文本；复用实际 Windows Computer Use MCP 登记测试和单次工具调用测试，验证别名仍到原权限与 handler。再以独立名称账本与投影实现，有限新旧操作序列对照、编译产物及完整离线回归。

新实现、规格和测试逐文件记录来源；MCP、内置工具、合同、Runtime 缓存和其他相邻文件不随本批改为 MIT。无模型/设备调用，不改变 UI、用户数据、根许可、版本或旧发行；全量迁移与稳定发布继续进行。

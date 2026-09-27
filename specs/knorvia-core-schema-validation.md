<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 内置工具的 JSON Schema 校验

2026-09-28。替换 core 的 `validateJsonSchemaValue(value, schema)` 执行实现，保留公开返回 `valid/errors/issues` 与执行器入口。不是替换 contracts 的模型 schema 规范化，也不宣称实现完整 JSON Schema 标准。已有源码访问明确披露，兼容关键字、诊断字段与接口形状不作原创依据。

## 所有权与接口

每次调用独占工作栈、活动节点集合和两个有序诊断序列，不缓存跨调用状态，不写文件、网络或用户数据。新的内部 `schema-validation/` 模块负责遍历和约束评估，稳定入口负责公开调用和类型导出。既有 `tool-input-validation-issues.ts` 继续负责错误对象投影；本轮不将该文件或整个执行器声明为已独立替换。

```text
输入/工具 schema → 当前调用的显式工作栈 → 标量与结构约束
                              ├→ 分支收集器 → oneOf 恰好一支成功
                              ├→ 缺失字段收集器 → 只投影问题
                              └→ 延后动作 → 保留 errors / issues 各自顺序
                                  ↓
                          valid + errors + issues → 原执行器/模型错误呈现
```

使用链式路径，仅实际生成问题时展开为路径数组；不因深层嵌套复制每层完整数组。相同 schema/value 只有在同一活动祖先链再次出现时才形成循环问题，共享 schema 在不同兄弟位置仍分别校验。分支和缺失字段的临时收集器均属于本次调用，不形成第二个持久状态所有者。

## 保留的校验子集

- 缺省或空 schema 成功；未知关键字不扩大为额外校验。`anyOf/allOf/$ref/pattern/format`、schema 形式的 additionalProperties、元组 items 等仍保持现有支持边界，不能把这次替换宣传成支持它们。
- 完整由对象组成的 oneOf 数组优先于其他约束，仅恰好一个分支无错误才成功；零分支或多分支命中均返回原诊断。分支内 issue 路径从根重新开始，外层 union 保存所在路径；无效元素导致不采用该 oneOf。保持原样的分支顺序与诊断对象字段顺序。
- const 与 enum 用 Object.is 判断，保持对象身份、NaN、负零等内存调用语义；不是深层 JSON 比较。值约束失败后仍保留旧 errors 的 type 诊断，但不重复增加 invalid_type issue。
- 已知 type 与联合 type 保持当前接受范围；unknown type 仍忽略，不做强制类型转换或输入修剪。number 要求有限数，integer 使用整数判断；对象指非 null 且非数组对象，不新增普通对象限定。
- 字符串长度按 JavaScript length；数值 minimum/maximum 含边界；数组 minItems/maxItems、对象 required/properties/additionalProperties=false 保留。数组跳过空槽位；对象字段存在性沿用 in/undefined 检查，未知键仅检查 own enumerable keys。
- errors 先列 required 缺失、再字段约束、最后额外键；issues 按 properties 顺序，缺失字段先用自身 schema 生成问题，仍没有问题才用推断类型。required 中未在 properties 声明的缺失字段随后报告。数组 errors 先长度后元素，issues 先元素后长度；不能用统一排序破坏当前 UI/模型诊断。
- 不修改输入/schema；冻结的普通数据仍可读。仍不承诺恶意 getter、Proxy、并发修改或不可序列化 const/enum 的诊断字符串安全；原有 JSON.stringify 异常不伪装为成功。

## 明确补齐的行为

- 数值 `exclusiveMinimum` / `exclusiveMaximum` 分别检查 `>` / `<`，输出 inclusive=false 的原问题类型。保持此前 inclusive minimum/maximum 的顺序，再追加 exclusive 下限/上限；布尔式旧 draft 关键字不在本接口的新增支持范围内。
- REPL 的零或负 timeout_ms 原先会通过这一层，但后续 Zod handler 拒绝。本轮让原执行器的 inputSchema 校验就拒绝，不把原缺口声称为已成功执行非法预算。正常 1–120000 整数、可选预算及历史/新调用 title 规则不改。
- 显式工作栈支持深层对象/数组而不消耗递归调用栈。活动祖先中的同一 schema/value 重入属于结构性失败，立即结束本次校验并返回一个 custom 问题及错误，oneOf 的成功兄弟分支不能掩盖它。检测位置使用当前分支的既有相对路径规则。有限值配合递归 schema、兄弟节点共享同一 schema/value 仍正常校验；循环内存对象不是可传输的 JSON，不保证序列化成功。
- 已核实既有模型错误 formatter 对极深嵌套 invalid_union 树仍使用 JSON.stringify，约千层可能栈溢出；本轮只替换 validator，不能把其深层支持扩大为整个执行器/模型呈现链无深度限制。深层普通字段的单一问题、常规 union 与真实 REPL 拒绝分别经过原执行器验收；嵌套 union 的呈现改造保留为后续边界，不截断问题或掩盖失败。

## 验收

先对原入口运行正常/错误/排序/边界契约，记录独占上下限和深层/循环的实际失败，再实现显式遍历。新用例进入现有离线测试扫描；使用真实 REPL 模型 schema 及执行器验证前置拒绝。对固定替换前提交的有限、非新增约束输入做确定种子的结果和 JSON 字段顺序对照，不靠复制旧算法生成新源码。

执行根/CLI 类型和 lint、变更严格 lint、架构、CLI 构建、实际编译入口与完整离线回归。保留当前界面、模型错误呈现接口、权限/Hook 执行顺序和输出 parser 不清洗原对象的既有边界。逐文件记录新实现/测试/规格的 MIT 范围，不改变尚未迁移的错误投影、整个 core 或根许可证。

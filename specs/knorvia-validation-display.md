<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 工具输入校验的模型错误呈现

2026-09-28。独立替换 `createInitialInputValidationModelContent` 的问题合并与文案实现，保持首次调用才附加模型错误的生命周期。错误对象工厂、输入 normalization、Hook/权限与执行器顺序不在本批替换范围。已读取旧源码，不作无源码接触声明。

## 所有权与流水线

一次呈现调用独占运行时展开栈、匹配候选及已认领索引、两个投影结果和输出片段。输入问题及 schema 均只读，无会话缓存、文件、网络、模型或用户数据副作用。

```text
JSON 问题索引 + runtime 问题 → 显式展开 runtime union
                                     ↓
                       按 JSON 顺序认领最早可用 runtime 项
                                     ↓
                      参数类 JSON 投影 / 约束类 runtime 投影
                                     ↓
                    数组长度后移 → 参数文案或完整 JSON 错误树
                                     ↓
                    原 tool_use_error / InputValidationError 包装
```

内部 `validation-display/` 模块分离问题身份、runtime 方言适配、投影、文本和联合错误树编码。仍通过既有 issue 工厂生成标准对象，不把该未替换文件一起改称独立实现。每个源码文件小于 400 行。

## 保持的合并规则

- runtime 缺席或空时直接呈现全部 JSON 问题，不去重、不反推 inputSchema。
- runtime 的 invalid_enum_value / invalid_literal 对应 invalid_value，invalid_string 对应 invalid_format；缺失值的 invalid_type（received 为字符串 undefined）也可匹配 invalid_value。问题按路径逐段严格相等匹配，不能把数字索引与字符串字段合并，也不能把 NaN 路径互相判等。
- 没有匹配 JSON 问题的 runtime invalid_union 展开其 unionErrors 内有效 issues，按深度优先源顺序处理；已有同路径/类型 JSON union 时保留该项不展开。空或畸形分支不假造成功。
- 按 JSON 顺序认领最早尚未使用的匹配 runtime 项，一个 runtime 项不能重复使用。无 runtime 匹配的 unrecognized_keys 仍保留；缺失类型问题仅当路径 schema 没有自己的 default 才保留。继承 default 与自有 default 的边界保持。
- 被保留 JSON 投影包含 invalid_type 或 unrecognized_keys 时优先使用它；其他情况按 runtime 顺序使用配对的 JSON 问题或规范化 runtime-only 问题。没有可呈现 runtime 问题时回到全部 JSON 原问题。
- 有 runtime 时按 code、JSON 序列化路径、message 去重，保留最早内容；认领仍发生在去重前，不能借重复问题再次使用 runtime 项。
- runtime-only 支持 custom、URL/regex 的 invalid_string，以及具有有效 origin、数值限额和路径的 too_big/too_small。保持 inclusive/exact、原 URL 文案规范化、从 properties/items 查询正则、缺省 Invalid input 文案和字段插入顺序；其他 runtime 形态保持现有回退行为。
- 数组长度问题位于其后出现的严格后代问题之后，同时保持当前其余问题的相对顺序。以原索引最小的就绪堆发布结果，只有数组限额登记后代依赖；没有依赖时直接保留顺序，避免一般错误列表反复全表扫描。按现有算法实测结果验收，不用宽泛的“排序”描述替代具体字节兼容。

## 文案与深层错误

- 参数摘要仍按缺失、额外字段、错误类型三组输出；路径使用点号和方括号，错误类型继续从既有 message 的 received 片段读取。单数/复数、换行、反引号和外层 XML 样式包装保持。
- 稀疏额外字段列表跳过空槽；路径匹配按索引读取空槽所呈现的 undefined，不改变输入数组。匹配身份与去重身份仍分别遵循严格比较和原 JSON 路径表示。
- 没有参数摘要时输出 2 空格缩进 JSON，字段与数组顺序保持，BigInt 按字符串编码。标准错误树的 invalid_union/分支数组使用显式输出栈；普通 issue 及其值继续使用原生 JSON 序列化，使 const/enum 中日期、数值对象、undefined 等保留既有行为。不缩短或截断问题来躲避栈溢出。
- 原生编码通过受控外层返回的单字段容器保留父键/数组索引上下文，名为 toJSON 的数据字段不能被当成容器根钩子，toJSON 的返回对象不能被额外转换一次。具有 toJSON 的容器交给原生编码；字段及数组元素在轮到时读取，使前序 hook 更新后续内容时仍按原顺序呈现。
- 目标是消除标准联合错误树和 runtime union 展开对 JS 递归栈的依赖；不宣称任意用户自定义 toJSON/getter/Proxy 或极深任意 enum 载荷都无资源限制。正式 issue 是工厂生成的普通数据对象；内存、最大字符串长度和原生载荷序列化限制仍存在。
- runtime union 的活动祖先循环抛出明确 TypeError；相同对象在兄弟分支可重复展开。JSON 错误树循环仍抛 TypeError，不返回空数组或成功文案；不承诺引擎原生循环异常中附带的构造器路径文字完全相同。

## 验收与迁移

先建立文案、投影、runtime 方言、索引与路径、去重和数组排序契约；在原实现复现深层 union 展开/呈现失败。新实现与固定旧提交对照有限输入的完整字符串和异常形态；加入深层真实校验器→首次执行器呈现链测试。

根/CLI 类型和 lint、新源码/测试严格 lint、架构、构建、实际编译产物及完整离线回归均须实跑。许可只覆盖本批独立实现、测试和规格，原 issue 工厂与未迁移内核仍保留适用声明。保留当前 UI、权限、数据和已发布版本。

# Model option map 运行时替换候选

2026-10-03，整合 checkpoint `e74c1b5468294324519881299dc5fbbcb3ccde36`。父任务已明确把 `packages/model-option-map/**` 分配给本整合任务；现有 runtime 最后提交为 `7619e41b950bd52073ebf36754146cf25659d9fa`。作者已读源码及 shared/model-config、provider/CLI 的调用边界，属于 source-exposed 候选；不宣称 clean room、已接受表达独立性、贡献权利或全量 MIT。

## 所有者与接口

公开编译器、tokenizer、types/error、ordered merge patch、compileModelOptionMaps 接口与 package exports 保持。声明、固定语法词、错误文本、标准 JSON/CEL 数值与视觉无关的配置保留原来源。只改本包 runtime，不改 shared/provider/provider-node/CLI 消费者、全局 inventory、LICENSE/NOTICE。

编译驻留改为每 cache key 一个 entry，持有唯一 expression 和两个独立可选 program；只成功 parse 后驻留 expression，只成功编译后发布对应冻结 program。parser 改为 precedence-climbing cursor，tokenizer 使用独立 cursor scanner。求值改为显式任务栈：每表达式先安排 continuation，再安排操作数；短路和条件只安排被选分支。请求 patch 使用路径前缀 trie 记录首位所有者、以最早 registration 决定冲突；一个深克隆的请求 body 是合并唯一写入目标，不写源对象或参数值。

```text
normalized source + variable → 一个 cache entry → AST → lazy evaluation task stack
                                               ├→ restricted frozen program
                                               └→ object-map frozen program
reasoning / max tokens frozen values → ordered patches → path claims → cloned body
```

## 必须保留的产品规则

- source.trim、`${variableName}\0${source}` key、空表达式错误、重复编译返回相同 frozen program；两个编译 API program 身份独立但共享成功 parse。失败不留下半个 program，object-map 顶层只允许 object 或所有分支递归为 object 的 conditional，失败 offset 不变。
- tokenizer 返回冻结数组而非冻结每 token；offset/end 是 UTF-16 索引。ASCII identifier、原数值 grammar/leading-zero 分词、两种 quote、简单/unicode escape、Unicode whitespace、newline/EOF/unsupported token 错误文本与位置保持。
- AST 形状、原 precedence、左结合 binary、右结合 ternary/unary、括号保持；object string keys、重复 key、禁止 function/member、尾随 token、逗号和缺失 delimiter 的首个错误保持。array elements/object entries 数组冻结，其他 AST/entry identity 不额外冻结。
- input 仍只接受 string 或 JSON-safe number；所有 number literal/result 有 finite/safe-integer 规则。bool 不强制转换，string + string 只拼接，numeric operands 与 result 的错误 offset 分开；比较只接受同类型 string/number，JSON equality 保留 Object.is、signed-zero 和数组/object own-key 语义。
- `&&`/`||` 与 conditional 不求值未选分支；其 bool 错误归操作数/condition offset。object 是 null-prototype、own enumerable writable/configurable 属性；array/object 返回值递归冻结，输入 primitive 与原 expression 不修改。
- merge patch 的 null 删除、array/scalar 替换、嵌套 object 递归合并、empty object 写路径、body 无别名、null prototype 与 `__proto__` own-data 规则保持。路径是 segment 列表，父/子都冲突，兄弟不冲突；点号只用于显示，不作为身份。冲突报告新 path 与**最早**旧 option，包括重复同名 option。
- reasoningLevel 先编译/求值、maxOutputTokens 后编译/求值；reasoning undefined 首先抛原有效值错误；两个 patch 都成功求值后才合并。公开 apply 的 freeze/receiver/同步抛错与错误类保持。

## 后续统一验收

本阶段不执行测试、lint、类型检查、格式/架构检查、构建或完整审计。统一阶段需覆盖缓存与失败、全部 precedence/short-circuit、字符串/数值边界、错误位置、AST/data identity、深嵌套 expression、path overlap 的首-owner、literal dot/`__proto__`/empty object/null/array、不变输入以及真实 model config/provider/CLI 请求。源码阅读与候选提交不是通过证明；原权利与许可 HOLD 保留。

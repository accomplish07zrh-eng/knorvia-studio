# REPL 单元编译器独立实现

2026-09-27。属于[全量独立实现](knorvia-independent-implementation.md)的第一个可单独验证的执行内核边界；不表示整个 REPL、浏览器 SDK 或内核已替换。

## 边界与行为

当前公开行为来自 `NodeReplSession` / `ReplExecutor` 的类型契约和调用者：执行 JavaScript 单元，支持顶层 await、动态 import、显式 return、最后表达式值及顶层声明跨调用保留。编译器只转换语法，不执行代码、访问文件、创建会话或处理权限。

新的 `compileReplCell(source)` 返回可交给既有 VM 执行器的源码和声明名称清单；编译状态完全局限于单次调用。执行上下文、同步中断预算、AbortSignal、结果收集、受信截图来源和 CUA 身份仍由现有运行时所有者管理。

```text
源单元 → 一次语法分析 → 有序文本编辑计划 → 编译单元
                                              ↓
现有执行器 → 同一 VM context / 时间预算 → 既有结果与错误通道
```

- 解析器继续使用独立第三方 Meriyah；不复制其实现。编译器按本规格新编写，不读取或改写旧 `instrument.ts` 的实现正文。
- 单次解析在 async function 语法环境中完成，因此能识别顶层 await 和 return。所有改动依赖语法节点位置，不能用正则搜索 `import(` 代替语法分析。
- 顶层变量声明（含解构、默认值及 rest）、函数和类在声明语句成功执行后导出到当前上下文。局部函数、块内声明及循环作用域不泄漏。后续语句失败时已导出的声明保留。
- 单元最后的表达式返回值；声明结尾不额外回显。注释、字符串、模板文本、正则字面量以及没有变化的源码段保持原样。
- 动态 import 委托会话提供的 `importModule`，包括嵌套函数和模板表达式中的 import；不改变字符串或注释中的同名文本。保持参数与可选 import attributes 的语法结构；实际加载语义由宿主决定。
- 内部上下文参数名不得与输入单元的标识符碰撞。只用标准 JavaScript 语法，不新增 Node VM experimental flags。
- 语法错误沿已有结构化错误通道返回；不执行无法正确分析的源码作为静默兜底。静态 import/export 不属于脚本单元支持范围。
- 既有同步 VM timeout 和异步 AbortSignal 不变，不能因换用不能限时的 REPL evaluator 而降低停止能力。VM 仍不是操作系统安全沙箱。

## 验收

先通过现有执行器建立行为用例，再切换编译入口。覆盖跨单元绑定、Unicode 名称、解构、函数/类、顶层 await/return、最后值、部分失败、作用域隔离、动态 import 的嵌套及文本陷阱、语法错误、预取消、等待中取消和同步无限循环中断。

原编译器源码从构建输入移除，不保留旧实现 fallback。执行根 typecheck/lint/architecture、CLI typecheck/lint/build、相关 REPL/插件测试以及完整离线回归。界面文件不在这一替换边界内。

桌面打包资源增加 `licensing/MIT.txt`，与根 NOTICE 的逐文件许可范围说明一同分发；不把审计用的完整文件清单或上游源码打进安装包。清除已删除源文件对应的旧编译产物，并检查新 CLI 的 source map 不含旧编译器。

新编译器与新行为测试按 `licensing/reviews.json` 的逐文件记录采用 MIT；执行器、会话宿主和现有依赖在后续完成来源审查与独立替换前仍保持原许可。Node 标准运行时能力参见 [Node.js 24 REPL](https://nodejs.org/download/release/v24.14.0/docs/api/repl.html)；本实现使用既有 VM 执行边界，不接入交互式 REPL evaluator。

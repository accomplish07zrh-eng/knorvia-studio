# CLI 参数与 disallowed-tool 规则接纳

目标为 `apps/cli/packages/cli/src/arguments.ts` 的四个公开入口及同步 tool-rule lexer。精确历史只有 `7619e41b` 导入与 `805754fa` 发行参数扩展；saved source 为 upstream-modified / NOASSERTION，未发现完整替换记录。新 helper、测试和文档均属于本路，不改 root 配置、contracts、run/main、权限实际执行或用户配置。

## 保留接口与固定配置

保留 `parseGlobalArgs`、`isProtocolServerInvocation`、`isStoragePreparationInvocation`、`extractDisallowedToolsArgs` 名称及参数/返回类型。Node `util.parseArgs` 继续唯一负责 strict global 参数解析、positionals、native错误与 alias/multiple 语义；现有 options 表完整保留，属于固定功能配置，不强制重写或计 originality。所有现有 flags、short aliases、顺序和默认缺值行为不变，没有新 flag、环境变量或 permission policy。

Protocol 判读先调用同一 parser；prompt 或 target 存在（含空字符串）、help/version truthy 都排除协议模式，首 positional 只有 app-server/agent-server 才接受。parser 失败只按 raw argv[0] 判读，以保留 stdout 保护。Storage 判读先要求 raw argv 包含精确 --prepare-storage，再解析并要求 prepare-storage/stdio === true、恰好一个协议 positional、values key 仅 prepare-storage/stdio/cwd；解析失败返回 false。不能扩大这个窄入口。

## 独立 tool-rule lexer

实现从冻结行为写出 token-range admission 和 substring-span segmentation：先区分 inline assignment、bare alias 与 forwarded argv；bare alias 通过连续非 option token 的范围接纳，随后独立 lexer 从原值切片，再用有序集合归一、去重。原逐字符字符串累加、flush closure 和嵌套 index mutation 不作为实现模板。

- 两个精确 alias：--disallowedTools、--disallowed-tools；inline assignment 保留现有正则的完整匹配边界，不改变行终止符等原语义。这是固定参数语法，不赋新权利。
- bare alias 必须消费至少一个后续 token，否则原样抛出 `<flag> requires at least one tool.`；任何以 ASCII `-` 开头的 token 都阻断消费，包括 --、-、-3。
- 非 alias argv 原顺序返回，不修改输入。遇到 -- 后 extraction 仍扫描后续 token，沿原行为；不能自行引入新的停止规则。
- Rule 仅在括号外的 ASCII space/comma 分隔，片段 trim，空片段跳过；tabs/其他 whitespace 不被额外用作分隔。
- 括号状态是原有 boolean：任意 `(` 进入、任意 `)` 离开，不改为计 depth、不增加括号验证。
- web_search 精确整名或 web_search( 前缀归一为 WebSearch；其他大小写及名称不变。归一后按首次出现稳定去重。
- 返回 own keys 始终为 args、toolDisallowlist；零条有效 rule 的 latter 为 undefined。空 inline assignment 或实际消费的空值不新增错误。

本执行者先读现 owner/类型/调用方再冻结契约，来源暴露明确；不是 clean room。新控制流与 lexer 依据以上行为重新实现，固定 options、语法、错误词汇和通用 primitives 的来源性质仍单独保留，whole-file 来源/独立表达/贡献权/MIT 核验尚未完成。

新增包内测试覆盖 native aliases、多值、协议参数值歧义、storage 窄范围、两种 disallow alias、括号/分隔符、稳定归一、-- 与错误。全部 **未执行**；本阶段不运行 lint、类型/格式/架构检查、测试、构建或全量审计。最终根显式 test 列表由整合者维护，本路只报告新 test 路径。

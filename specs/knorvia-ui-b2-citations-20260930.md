<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# UI B2 文件引用与 Markdown 投影合同

2026-09-30，修改前建立。基线 PR #7 `8e8f6310d5ca70a57a454054e44f7b61db30b83f`；本批仅 `packages/ui/src/lib/fileCitation.ts`、`fileCitationRemarkPlugin.ts` 及唯一命名的新测试/文档。不回写 B1，不改 parser/path resolver、组件、schema、许可清单、global config、视觉或数据。B3/B4 未授权。

沿用 `knorvia-builtin-plugins.md` 的旧会话读取规则、新输出品牌规则和 `knorvia-independent-implementation.md` 的功能保留范围。作者读过旧两文件、既有调用方与依赖公开行为；上游存在 zcodeFileCitation/zcodeFileCitationRemarkPlugin 别名。新实现不以改名、逐行翻译或测试通过证明原创。生产修改保留 Apache-2.0，source exposure 和来源决定仍待独立复核，不宣称 clean-room 或 MIT-ready。

## 无状态边界与设计

```text
message text → existing directive grammar owner → ordered citation records
                                          ├→ stream-tail cut decision → visibleText
                                          └→ existing preview-kind/path policy → cards
mdast text node → accepted citation edits → buffered text/link pieces → parent child splice
                                                        ↓
existing MessageResponse rehype rewrite + Streamdown safety plugins → file/link renderer
```

parser 继续独占参数、引号/escape/代码范围语法；现有 raw-path resolver 继续独占 Home、URI 和跨平台路径。新的 citation adapter 用单次投影记录和显式 stream cut 决策；remark 用每个原 text node 的局部 edit buffer 收集全部替换，保留 child 数组与既有未替换节点身份。只替换文本/链接节点，不构造 HTML，不新增 URL 白名单、编码/解码或另一套路径规则。

## 固定公共行为

- 保留所有导出、两个 directive 名称的数组顺序和可变性。解析 Knorvia 与 legacy 名称，分别依赖 `extractAssistantDirectives`，允许 1/2/3 冒号与成对智能引号，拒绝连续四冒号和大小写变体；合并后按 start 稳定排序。
- extractor 输出键序为 start/end/raw、可选 path/purpose/artifactKind。path trim 后非空才有 own path；purpose/artifact_kind 只判 undefined，空字符串与空白保留。缺/非法参数仍输出完整 directive 区间但不生成 citation；相同参数末次值由 grammar owner 决定。未知参数不投影。
- raw/start/end 保持原字符串 UTF-16 切片。完整 extractor 本身不跳过 Markdown code，不增加反斜杠转义规则；代码与 link 等节点的保护由 streaming 或 remark owner 决定。智能引号、未知反斜杠（Windows 路径）、已知引号/反斜杠转义、quoted brace 都使用原 parser。
- streaming=false 或空内容原样返回 own visibleText。streaming=true 时先取得现有 code ranges，再依名字顺序查询 unclosed start，取非 null 最小值；只有全部为空才查询尾部名称 prefix（含 code-comment）。单冒号最短 suffix 长度 6；双/三冒号继续沿用 parser 的现有前缀规则。
- 一旦命中 cut，只 slice 原文，不能 trim 周围空白、移除完整 citation 或跨过代码保护。未闭合内容是否仍为参数前缀由现有 parser 决定：newline 本身不保证可见，普通尾词也可能符合参数名 prefix；不按旧注释新增修复。
- preview 类型：扩展名大小写不敏感、只 trim path 两端；Office/PDF/media 的原映射保持，不剥 query/hash/line suffix 或 decodeURI。artifactKind undefined 才直接取扩展名；提供时 trim/lower 后必须是 document/workbook/presentation/video/audio，且与扩展名一致；空值、unknown、pdf 类型词或不匹配返回 null。
- invalid runtime string/params/tree 的 TypeError/getter/path-resolver 异常继续公开抛出，不新增兜底吞噬或 partial-success claim。

## Remark 与消费者边界

- `createKnorviaFileCitationRemarkPlugin(workspacePath, homePath?)` 保留 Plugin 工厂，transform 原树并返回 undefined。只遍历具有 children 的节点；code/html/image/inlineCode/link 是完整子树保护边界。text node 自己的 children 不递归。
- text.value 缺省 nullish 当空字符串。extract 无 citation 或所有 path resolver 拒绝时，原 text node/parent children 引用不变。有接受项时以有序 text/link 替换原节点；保留前缀、中间、尾部原字节，不插空 text，不重新处理新插入的 link。
- 每个 citation 仍调用现有 `resolveAssistantRawFilePath(workspacePath, citation.path, {homePath})`。拒绝项不消费 cursor，所以原 syntax 在后续 accepted citation 前的 text 或最终 suffix 内保留。link.url 使用原 citation.path；label 使用 resolved path 的 getPathLeaf，空时回退原 path。保留 children/link/text 的键序，不携带旧 text 节点 metadata 到新节点。
- 完整文件路径与 home/Windows/UNC/file URL/percent escapes/line suffix/dot-dot 的语义由现有依赖决定，不能改成 resolved path href。`assistantFileReferences` 对 citation 完整区间保护并按 preview 类型生成卡片，既有 MessageResponse 的 citation 开关、workspace gate、默认 GFM、Windows escape 插件、rehype rewrite 与安全插件顺序不变。
- remark 投影本身不是 sanitizer：既有 resolver 可以接受某些 scheme 文本并产生 raw-href link；必须继续经过现有 Streamdown defaultRehypePlugins 的 sanitize/harden。测试冻结 raw AST 与经过真实 safety plugin 的拒绝结果，不将 pre-sanitize AST 称为安全可直接 DOM 插入。label 是 text，HTML/事件属性不能由本批投影为节点或属性。

## 验收

先冻结旧字节，在旧版本上跑固定期望测试，再提交先行合同；包括语法/escape/offset/absent、stream prefix/代码/异常、preview-kind、remark 身份/拒绝项/skip 子树、多引用/嵌套、实际 remark parse + 默认 safety 管线与 card/path 消费者。有限对照比较值、own keys/order 和节点身份；再验证 source/实际 dist、根 typecheck/lint、架构、owned 格式、Web build 与两文件 source-map。整仓 CI/来源清单/发行由主线统一，有限测试不证明全产品或法律独立。

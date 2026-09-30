<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# UI B2 文件引用交接与来源审查

2026-09-30。专用分支 `ui/b2-file-citations-20260930-01`，开工时实际抓取的 PR #7 head 为 `8e8f6310d5ca70a57a454054e44f7b61db30b83f`。先行合同提交 `aecfcbca3efdd3b33a2f1a7d749fe3869ad6edc2`；实现与本证据为其下一提交。仅按此顺序 cherry-pick，两提交一起验收。

生产仅修改 `packages/ui/src/lib/fileCitation.ts`、`fileCitationRemarkPlugin.ts`。新增文件是本批两个唯一命名测试、spec、本报告及 JSON 证据。不回写 B1，不改组件、parser/path owner、协议、sessionStore/logger、许可 inventory、lockfile 或全局配置。B3/B4 不在本轮范围。

## 最终实现与固定行为

`fileCitation.ts` 保留 grammar owner，按合同独立设计有序记录投影与 stream cut 决策；预览扩展名及 artifactKind 由一份类型策略表建立 Map。`fileCitationRemarkPlugin.ts` 先为一个原 text node 收集接受的 citation edits，再生成 text/link pieces 并提交原 parent children 的 splice。生产两文件净增 3 行；行数与名称变化不是来源判定依据。

旧名称仍读取历史消息，raw 字节、UTF-16 offsets、own keys/顺序、缺属性与空字符串、智能引号、已知/未知 escaping、四冒号边界、代码保护及 streaming prefix 保持。完整 extractor 本身不跳过代码；后续 remark/code owner 负责该边界。newline 后的普通尾词仍可能是未完成参数 prefix，因此没有照旧注释新增隐藏规则修复。

预览映射仍只按 trim/lower 后的完整后缀及可选 artifactKind 判断，不 decodeURI 或删除 query/hash/行号。旧路径解析、Home、Windows/UNC/file URL/percent 与 dot-dot 语义仍归既有依赖。拒绝 citation 保留原文本；link href 为原 citation.path，label 为路径 owner 的 leaf text，parent children 与未替换 sibling 身份保持。异常仍抛出；后续 sibling 失败不会回滚先前 sibling 已提交的替换。

remark 不是 sanitizer。现有 raw path resolver 可以接受部分 scheme 文本并在 sanitize 前保留原 href；测试同时检查该 AST 和真实 Streamdown `defaultRehypePlugins` 后的结果。javascript/data/vbscript 未穿过既有 safety pipeline，HTML-like label 只生成 text，不生成标签或事件属性。MessageResponse 的开关/workspace gate、Windows escape、rehype rewrite、安全插件与 renderer 顺序未修改。

## 已执行验证

| 检查                                           | 结果                                                          |
| ---------------------------------------------- | ------------------------------------------------------------- |
| 修改生产前冻结的旧版本合同                     | 42/42，0 skip，先提交合同                                     |
| 最终旧版本合同（增加可变 names/hole 边界）     | 43/43，0 skip                                                 |
| 最终源码合同及既有 citation protocol 测试      | 45/45，0 skip                                                 |
| 两个实际 UI dist 模块的 B2 合同                | 43/43，0 skip                                                 |
| 有限值/own-key-order/AST/身份对照              | 51,166 comparisons，0 differences                             |
| 大输入 extraction                              | 150,001 citations，长度与最后记录一致，无新增 spread 参数上限 |
| 根 `pnpm typecheck`                            | 通过；i18n 5,422 matching keys                                |
| 新增两测试的独立 `tsc --noEmit`                | 通过；临时 tsconfig 在仓库外                                  |
| 根 `pnpm verify:pre-push`（lint + 架构）       | 通过；架构 baseline/new violations 均 0                       |
| owned `oxfmt --check` / `git diff --check`     | 通过                                                          |
| `pnpm --filter @knorvia/web build`             | 通过，10.26s                                                  |
| 最终两 source 与 Web source-map sourcesContent | 字节完全一致；JSON 记录 SHA-256 与 artifact                   |

Web 构建报告既有 >500 kB chunk 与 PDF/PPTX/Office 静态加动态 import 警告，未作为本批改动处理。Linux/Node 24.14.0、pnpm 10.33.2 执行；本批没有跑桌面实机/浏览器视觉 E2E、Windows/macOS 或全 `test:studio`，统一组合 CI 由主线负责。

最初冻结测试对 bare `a%2520b.pdf` 的 leaf 期望写成 `a%20b.pdf`，旧实现实际保持 `a%2520b.pdf`；在先行合同提交前修正期望并重跑全部 42 项，生产没有为此改变路径行为。测试类型检查首次发现两个只抛异常的 getter 被推断为 void，补上 Node[]/string 返回类型后通过，运行时负例保持。

有限对照包含 6,800 语法输入：名称/冒号/空值/引号/escape/参数/结束符与代码包装组合；逐前缀切片、preview extension/artifact/suffix 组合、保护/嵌套 mdast、第二次转换及节点身份。对照时 baseline remark 的 citation alias 指向 candidate，而 citation 公共输出另行逐项对照；不能把该对照视为 parser/path 的独立重实现验证。最终旧合同用仓库外 alias 配置把旧 remark、card consumer 的 citation 依赖也指向保存的旧 fileCitation；最终 dist 合同把该 alias 指向实际 dist fileCitation，两个 B2 模块均加载 dist，未改依赖源码。

复跑源码合同：

```sh
TSX_TSCONFIG_PATH=packages/ui/tsconfig.json node --import tsx --test \
  packages/ui/test/ui-b2-citation-contracts-20260930.test.ts \
  packages/ui/test/ui-b2-markdown-contracts-20260930.test.ts \
  packages/ui/test/knorvia-file-citation-protocol.test.ts
```

测试支持 `KNORVIA_UI_B2_LIB_DIR` 与 `KNORVIA_UI_B2_LIB_EXT`。基线需由消费方从上述 commit materialize 至自己的本机，并让 citation alias 指向该旧文件；dist 需先由根 typecheck 生成，再把 alias 指向 dist 文件。不能依赖工作者 `/workspace/b2-*` 临时路径在另一 executor 存在。有限临时 harness、日志和构建输出没有提交为产品文件；持久 source/dist/map 摘要见 [JSON 证据](knorvia-ui-b2-citations-evidence-20260930.json)。

## 来源证据与主线剩余要求

作者在设计前读过旧仓库两文件、依赖与消费者，候选实现后又读取下列固定上游别名的实际字节并核对摘要。属于 source-exposed 工作，不是 clean-room。生产加入 Apache-2.0 SPDX 和修改/待审说明；仓库 LICENSE、NOTICE 与第三方声明保留。新增 spec/tests/report 为本批新表达的 MIT 标注，不替代生产或其依赖的许可判定。

上游固定点：`zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521`。

| 当前 path → 上游 alias                                                                                                                                                                                | 原 blob                                  | 核验 SHA-256 / bytes                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| fileCitation.ts → [zcodeFileCitation.ts](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/packages/ui/src/lib/zcodeFileCitation.ts)                                     | acde2228a1470392da08f967c7f4e740e79797dc | ce89a253a42c3377cfeca927b443ad0b943118cb0186558b1aaeebef0432f771 / 4651 |
| fileCitationRemarkPlugin.ts → [zcodeFileCitationRemarkPlugin.ts](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/packages/ui/src/lib/zcodeFileCitationRemarkPlugin.ts) | 8f725697541205376620dd20c0e9050f6293d83e | 127a63cbbdb70a4f50787ee98d57d82fbef3efd1e4ef61d09eeb3b925f9c5f70 / 2431 |

主线的具体待办：

1. 将以上 alias 关联及本批最终 normalized digest/evidence 录入统一来源审查；当前同名/同摘要自动匹配不足以追踪改名，不以 `upstream:null` 判原创。本工作者不写共享 inventory/reviews。
2. 独立复核策略表、cut/record adapter、remark edit buffer 的表达和保留部分，逐文件判断 authorship/derivation。导出形状、协议字面量、注释来源及上游 alias 必须一并记录；通过测试或本作者自述都不足以决定 MIT。
3. 分别审查未改的 assistantDirectiveParser、assistantFileReferences/path、Markdown/Streamdown safety 管线与消费者依赖。B2 只提供行为边界证据，不代表这些依赖已原创或本 UI 已完成迁移。
4. 按主线实际整合 SHA 复跑组合 CI、provenance 绑定和 notices；先完成必要独立审查，再决定发行许可。本批保留 Apache-2.0，authorship pending，不声明 MIT-ready 或法律保证。

交接前重新读取 PR #7 head `34fb23e5f5c610bd7379096d3f281f4bff79b71f`；两授权源文件及 assistantDirectiveParser/assistantFileReferences/path 与开工基线没有差异。本分支仍保持开工基线，主线 sole writer 接收顺序清晰的两提交；本批不写 integration/main，不创建重复 PR，不启用 B3/B4。

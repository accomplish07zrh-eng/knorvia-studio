# 需要辨认的 React 技能

这份指南的显示名称是 **Vercel React Best Practices**，注册名为 `vercel-react-best-practices`，完整目录是 `.agents/skills/react-best-practices/`。它供编码代理阅读，主题是 React / Next.js 性能优化：并行请求、减少瀑布请求、服务端缓存、组件重渲染、JavaScript 查找与渲染优化。入口声明 70 条规则、8 类主题。

可先辨认这些具体文件：

| 文件                                                                            | 内容                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `.agents/skills/react-best-practices/SKILL.md`                                  | 选择规则的入口，文件头标注 `author: vercel`、`license: MIT`、版本 `1.0.0` |
| `.agents/skills/react-best-practices/README.md`                                 | 本地使用说明，末尾保留 Shu Ding / Vercel 署名                             |
| `.agents/skills/react-best-practices/AGENTS.md`                                 | 合并后的规则与代码示例                                                    |
| `.agents/skills/react-best-practices/rules/async-parallel.md`                   | 使用 Promise.all 并行读取互不依赖的数据                                   |
| `.agents/skills/react-best-practices/rules/rerender-derived-state-no-effect.md` | 在渲染期间计算派生状态                                                    |
| `.agents/skills/react-best-practices/metadata.json`                             | 组织字段为 Vercel Engineering；日期字段为 January 2026                    |

本仓库保留的非浅克隆历史中，76 个文件最早一起出现于 [`7619e41b950bd52073ebf36754146cf25659d9fa`](https://github.com/accomplish07zrh-eng/knorvia-studio/commit/7619e41b950bd52073ebf36754146cf25659d9fa)，时间为 2026-09-24 22:50:46 +08:00，提交说明为发布预览快照。当前 76 文件与该快照逐字节相同。这个快照不证明实际创作时间或安装操作。

本轮完整读取 [Vercel 固定源码版本 `063bee94c3f4df8453406c830b0a7df0f2860278`](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278) 并比对全部同路径文件。4 个文件原字节完全相同；用仓库现有 oxfmt、默认选项在内存格式化上游文本后，74 个文件与本地逐字节相同。其余两处是：AGENTS.md 修正 3 个相对链接；README.md 改成本地指引并保留原署名。完整 [逐文件摘要](react-skill-identification.json) 和 [两文件适配差异](react-skill-adaptations.diff) 已保存。格式化比对支持文本来源关系，不证明独立创作，也不恢复未记录的实际 import revision。

用户说“skill好像也是自己的”，并表示不确定。该陈述作为待辨认线索记录，没有写成原创确认或授权。现有文件头、署名、规则对应及适配差异支持继续按上游指南适配保留来源。

原版本未见完整通知文件，上游另有尚未合入的 [补 LICENSE PR #294](https://github.com/vercel-labs/agent-skills/pull/294) 和 [问题 #249](https://github.com/vercel-labs/agent-skills/issues/249)。这是补充线索，不采用贡献者分支中的拟议版权持有人代替原通知；没有联系第三方。MIT 声明及原署名继续保留，缺少命名文件不等于侵权结论。

最少需要用户辨认的是：所说的自有 skill 是否就是这份 React / Next.js 性能指南，还是另一个名称/目录的技能。若确实指本目录，已有的生成或安装记录可以补实际导入线索；不要求用户替 Vercel 作授权决定。

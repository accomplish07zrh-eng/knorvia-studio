# 协议九文件来源审查 WIP 检查点

2026-09-30。用户明确关闭 Fast，立即暂停扩展。本文件为可恢复笔记，未验收，
不是独立来源决定、MIT 授权或已完成的逐片段审查。

分支 `parallel/protocol-source-review-20260930-nine`，基线为第三组已交接提交
`10a23cdf81cab37271025b59d83e78084ceb2dd6`。本轮未修改任何生产文件、旧交接材料、
licensing ledger、lockfile 或全局配置。唯一新增所有权是本笔记和
[WIP 机器证据](../licensing/evidence/protocol-nine-file-source-review-wip-20260930.json)。

## 已保存的事实

- 九个既有候选共950行，逐文件 SHA-256、字节数、旧基线摘要与 ledger 的上游记录均已保存。
  还保存旧/新至少三行的逐字节匹配位置及片段摘要；匹配率不用于认定独立性。
- wire-codec 上游 blob 本地缺失。已只读取得固定上游提交的原文件：SHA-256
  `ac2494a3acc795c809c94ee9393f50271a9c2a0fd33813459e5ab93842ceef75`，Git blob
  `0332e837eac7b8805a12cb8dd3210599632e373e`，均匹配原 ledger。仅保存定位和摘要，
  未把它写入本地 Git 对象库，也未批准该文件来源闭合。
- 固定上游提交的 LICENSE 与当前根 LICENSE 字节摘要一致：
  `606c36baf38b973227273df12a74930e4b4137280eea835c5cd623aa4553c13b`。
  这补足对应许可文本证据，不能单凭根许可消除片段级第三方范围问题。
- 在实际安装目录核对 TypeScript 6.0.2、playwright-core 1.59.1、ECharts 6.1.0、
  pdfjs-dist 5.4.296 的15份完整许可/NOTICE/子材料文件，全部匹配 inventory 摘要。
  ECharts README 许可段的提取摘要未重现；未验证发布产物的完整分发闭包。

已识别但尚未完成逐片段定性的保留内容：Base64 schema、WSL schema、远程身份构造
模板、SSH 认证分类/JSON 键、工作流公开注释及 reduceRunLaunched 的原函数体；
wire-codec 的二分探测顺序受冻结兼容契约约束。新增实现仍需贡献授权与独立来源复核。

## Standard 继任待办与接受条件

1. 完成九文件全部片段的新表达候选、接口/功能约束、保留实现表达和未知部分矩阵。
   每项绑定候选 SHA/hash、行范围/片段摘要、旧表达对应关系、设计依据及具体审查问题。
   本检查点中的机械匹配导航不代替该矩阵。
2. 对新增表达补贡献者可授权范围及设计生成记录。没有雇佣/委托/贡献等适用依据时，
   不以 Git 作者、AI 标记或任务授权推定完整权利链。
3. 由另一复核者审查来源与表达，分别作独立替换、保留 Apache/混合表达或继续未知的
   结论；实现者不批准自己的独立性。缺授权链或希望移除保留表达的许可义务时，再定位
   需要权利人确认的具体材料；未向任何权利人发送消息。
4. Base64/CRC 可借助 RFC 与平台公开规范复核；其中算法参数不等同于具体实现表达。
   远程身份与工作流的项目规则没有因此变成独立公开标准。只为真正有设计价值、可移除
   保留实现表达且满足已冻结合同的点提出后续方案；尚未完成此方案或改动代码。
5. 通用 Apache 第三方可在遵守对应许可、NOTICE 和子材料义务后保留；继承的 ZCode
   产品实现仍须按用户迁移目标替换或经审查证明其具体性质，不能以合法共存代替迁移。
   VS Code 的部分 MIT 记录只覆盖其原范围，原始 import revision 仍未确认。
6. 主线仅在接受绑定摘要的证据后更新 ledger/input binding。本轨新增来源接受数仍为0，
   27项既有材料义务未被冲销；上一轮 provenance:check 的 wire-codec binding 阻塞未修复。

一手依据：[固定上游 LICENSE](https://raw.githubusercontent.com/zai-org/ZCode/872ad960de7ec172591f7e1952f7849229f94521/LICENSE)、
[Apache §4](https://www.apache.org/licenses/LICENSE-2.0)、
[MIT 原文](https://opensource.org/license/mit)、
[固定 VS Code LICENSE](https://raw.githubusercontent.com/microsoft/vscode/44825207bf4389c3bd17c92d3ec28cf784c324cc/LICENSE.txt)、
[RFC4648](https://www.rfc-editor.org/rfc/rfc4648.html)、
[RFC1952](https://www.rfc-editor.org/rfc/rfc1952.html)、
[HTML Base64 API](https://html.spec.whatwg.org/multipage/webappapis.html#atob)。
完整既有路线仍见[来源策略](knorvia-protocol-source-review-strategy-20260930.md)。

## 本轮验证状态

只进行了只读 Git/摘要核对、上游固定文件检索及本机许可文件摘要核对。
未运行新 runtime tests、typecheck、lint、fmt 或 pre-push 验收，未完成全片段矩阵。
没有长测试正在运行；此前三组通过数保留于其原证据，不冒充本轮通过。
没有支持的任务级 Fast/Standard 切换接口，当前任务结束后由父任务用 Standard 接续。

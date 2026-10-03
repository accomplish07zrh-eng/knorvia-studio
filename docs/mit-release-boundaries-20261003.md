# MIT 自有源码与第三方发布范围

绑定唯一整合树 `7bfb867162cc11adbc237e1c39bf2d61b5c0f81e`。逐项摘要、原版本读取、源码绑定和处置要求见 [完整矩阵](mit-release-boundaries-20261003.json)，原 [26项登记](material-obligation-actions-20261003.json) 保留。本次没有改动 LICENSE、NOTICE、第三方登记或 reviewRequired，也没有关闭材料义务。

## 可落实的发布边界

用户目标是自有实现采用 MIT，第三方代码保留各自许可。MIT、ISC、BSD、Apache 依赖无需为了项目 MIT 改写为 MIT。Apache-2.0 §4 允许为自己的修改附加不同条款，同时仍须满足上游 Apache 许可、修改声明、归属及适用 NOTICE；这不证明候选整文件已独立创作或已获得贡献权利。[MIT 正文](https://opensource.org/license/mit)，[Apache-2.0 正文](https://www.apache.org/licenses/LICENSE-2.0)。

以下内容仍缺发布所需材料，变更为任意根许可证都不会补上缺项；“阻止”指包含对应内容的产物尚不能确认发布就绪，**不是**判定侵权或禁止所有可能的独立源码子集。现行公开 Git 历史也不因此改称未公开。

- **完整现行 Git 树有10项直接材料 HOLD**：8个 SVG路径、76文件的 React skill、包含缺 notice Rust revision 的两份 Windows ripgrep ZIP（此 revision 算1登记项）。Git 已跟踪18份原生搜索压缩包，因此“完整源码压缩包”仍包含二进制，不能默认豁免。
- **11个现行 npm 引用**：manifest/lock 本身不会复制依赖实现；实际捆绑这些版本的包须补原版权/许可声明。没有 Git 跟踪的 node_modules，实际产品包含范围仍需其产物清单。
- **@arms 三包是本次有界读取未见现行引用的历史项**：当前 manifest、两个 lock及本环境安装均无这三包；原归属材料继续保留，不把它们必然算入新产品。代码里的少量兼容注释不证明依赖捆绑。
- **Skia、QuickJS-NG 是实际包含其二进制/WASM的包的缺项**：现有18/16份组件 notices和各2份构建参考继续保留，还缺平台产物与真实链接闭包的对应。没有取得实际安装包/SBOM，不能说所有平台都已确认或所有源码子集都被它们阻止。

26项中已确认必须因许可而重写的**自有实现为0**，闭项为0。8个 SVG如原来源或授权拿不到，才进入独立素材替换路线；这不是8个自有源码模块，也不授权删改既有UI。依赖、引擎、stdlib首选完整补证并保留自己的许可。

## 本次确切原版本读取

14个 npm metadata和压缩包均成功读取，SHA-1与sha512 integrity均与出版者声明一致；14个包均未找到独立 LICENSE/COPYING/COPYRIGHT 成员，其中11份 archive SHA与旧记录一致。首次为 @arms 三包补到确切 archive/GitHead线索，但仍无可映射仓库和完整版权/许可；作者字段不是版权授权。semaphore 新 metadata没有 license字段，原README中的MIT声明继续按旧登记保留。这些观察没有审计每个代码头，也不抹去README或旧记录。

10次记录的 pinned root LICENSE读取实际返回404，保留原URL、响应和摘要；404不证明没有许可，也不允许取另一版本声明补名。未安装/执行包、未发送外部请求消息。原始response及archive成员/摘要观察在 [证据目录](evidence/mit-release-boundaries-20261003/)。没有将新版权名字或年份填进第三方声明。

原生压缩包只在内存读取，没有执行。两个 Windows `rg.exe`内的 `/rustc/<revision>\library\…`路径确认缺项线索为 `6a6eaca656978778f7c1c750ee0c3db87f8bffb2`；对应ZIP原字节与已有登记一致。其余所读ripgrep包出现另两个已保留notice的Rust revision，因此不把这个单项扩大到每个平台。路径字符串仍不足以证明全部链接或实际工具链来源。

## 26项逐项处置

| 材料                                                             | 原登记许可                     | 影响内容                                                | 可执行处置                                              |
| ---------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------- |
| `@arms/rum-browser@0.1.8`                                        | ISC                            | 未见当前 manifest/lock；保留历史义务                    | 保留包的原许可；取得确切版本完整版权/许可声明           |
| `@arms/rum-core@0.1.4`                                           | ISC                            | 未见当前 manifest/lock；保留历史义务                    | 保留包的原许可；取得确切版本完整版权/许可声明           |
| `@arms/rum-electron@0.0.3`                                       | MIT                            | 未见当前 manifest/lock；保留历史义务                    | 保留包的原许可；取得确切版本完整版权/许可声明           |
| `@hono/node-ws@1.3.0`                                            | MIT                            | 当前引用；含包的分发需补原 notice                       | 保留包的原许可；取得确切版本完整版权/许可声明           |
| `@open-draft/deferred-promise@2.2.0`                             | MIT                            | 当前引用；含包的分发需补原 notice                       | 保留包的原许可；取得确切版本完整版权/许可声明           |
| `ansi-to-react@6.2.6`                                            | BSD-3-Clause                   | 当前引用；含包的分发需补原 notice                       | 保留包的原许可；取得确切版本完整版权/许可声明           |
| `boolbase@1.0.0`                                                 | ISC                            | 当前引用；含包的分发需补原 notice                       | 保留包的原许可；取得确切版本完整版权/许可声明           |
| `is-node-process@1.2.0`                                          | MIT                            | 当前引用；含包的分发需补原 notice                       | 保留包的原许可；取得确切版本完整版权/许可声明           |
| `lazy-val@1.0.5`                                                 | MIT                            | 当前引用；含包的分发需补原 notice                       | 保留包的原许可；取得确切版本完整版权/许可声明           |
| `packages/desktop/src/renderer/public/material-icons/docx.svg`   | 未确认此文件许可               | 完整 Git 源码树及含此素材的产品                         | 原 SVG 来源/授权；无法补证时由原维护者独立替换并验收 UI |
| `packages/desktop/src/renderer/public/material-icons/folder.svg` | 未确认此文件许可               | 完整 Git 源码树及含此素材的产品                         | 原 SVG 来源/授权；无法补证时由原维护者独立替换并验收 UI |
| `packages/desktop/src/renderer/public/material-icons/pptx.svg`   | 未确认此文件许可               | 完整 Git 源码树及含此素材的产品                         | 原 SVG 来源/授权；无法补证时由原维护者独立替换并验收 UI |
| `packages/desktop/src/renderer/public/material-icons/xlsx.svg`   | 未确认此文件许可               | 完整 Git 源码树及含此素材的产品                         | 原 SVG 来源/授权；无法补证时由原维护者独立替换并验收 UI |
| `packages/web/public/material-icons/docx.svg`                    | 未确认此文件许可               | 完整 Git 源码树及含此素材的产品                         | 原 SVG 来源/授权；无法补证时由原维护者独立替换并验收 UI |
| `packages/web/public/material-icons/folder.svg`                  | 未确认此文件许可               | 完整 Git 源码树及含此素材的产品                         | 原 SVG 来源/授权；无法补证时由原维护者独立替换并验收 UI |
| `packages/web/public/material-icons/pptx.svg`                    | 未确认此文件许可               | 完整 Git 源码树及含此素材的产品                         | 原 SVG 来源/授权；无法补证时由原维护者独立替换并验收 UI |
| `packages/web/public/material-icons/xlsx.svg`                    | 未确认此文件许可               | 完整 Git 源码树及含此素材的产品                         | 原 SVG 来源/授权；无法补证时由原维护者独立替换并验收 UI |
| QuickJS-NG                                                       | 已保留各嵌入组件许可           | 实际包含 `quickjs-wasi@2.2.0` 原生对象/WASM的包         | 精确平台产物、构建/链接和 notice 闭包                   |
| `quickjs-wasi@2.2.0`                                             | MIT                            | 当前引用；含包的分发需补原 notice                       | 保留包的原许可；取得确切版本完整版权/许可声明           |
| React Best Practices skill                                       | 原登记 MIT，完整 notice 未取得 | 完整 Git 树中的76文件；产品仅在实际包含时               | 原版本版权/许可及 import/reference 绑定                 |
| `react-remove-scroll-bar@2.3.8`                                  | MIT                            | 当前引用；含包的分发需补原 notice                       | 保留包的原许可；取得确切版本完整版权/许可声明           |
| `rust-standard-library@6a6eaca656978778f7c1c750ee0c3db87f8bffb2` | 此 revision 原 notice 缺失     | 完整 Git 树中两 Windows ripgrep ZIP及实际含其产物的分发 | 原工具链来源/notice和构建链；另两 Rust revision 不代替  |
| `semaphore@1.1.0`                                                | MIT                            | 当前引用；含包的分发需补原 notice                       | 保留包的原许可；取得确切版本完整版权/许可声明           |
| Skia                                                             | 已保留各嵌入组件许可           | 实际包含 `@napi-rs/canvas@0.1.100` 原生对象/WASM的包    | 精确平台产物、构建/链接和 notice 闭包                   |
| `strict-event-emitter@0.5.1`                                     | MIT                            | 当前引用；含包的分发需补原 notice                       | 保留包的原许可；取得确切版本完整版权/许可声明           |
| `unsafe-pointer@0.2.0`                                           | MIT                            | 当前引用；含包的分发需补原 notice                       | 保留包的原许可；取得确切版本完整版权/许可声明           |

## 26项之外的自有源码接受边界

至少下列6个完整 owner 当前已安装新候选，但现行来源记录仍为 NOASSERTION、review null。它们阻止“这些自有源码整文件已经独立/MIT接受”的结论；来源暴露本身不是自动否定原创，也不是必须再重写的证据。旧 accepted-byte/source/receipt 与新的作者、保留表达、贡献权利需要分别闭合。

| 当前文件                                                 | 当前原字节 SHA-256                                                 | 仍保留的历史来源/请求 SHA-256                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `apps/cli/packages/core/src/runtime-task/registry.ts`    | `c7f4fc09641ddd04fe1692635ede2a5fde8b61c36dec82f35c21fa981fb97d84` | `12a18abdd47a1639a86726a92f7b9bf55227c8918109c3934b33925b066603e2` |
| `packages/services/src/session/tasksDatabase/startup.ts` | `3450dbcbc85804231c5a340b1ab91bc5f73519f5182c272c037fa48f9da0dbcc` | `a45bd7f55dfe610e78b9314ba5807403cd1397c372a8cd2da81c50d8c961c58a` |
| `packages/services/src/git/commitMessageFileScope.ts`    | `501c9e956cf92938c3d962fd8e86aca5c9e60d4bf48da5630adf6a3eb62796dd` | `ca5bf8cc6396ab43992806626efb6f5700524ec9b0c0b4a36f19090e6c8a6761` |
| `packages/services/src/creation/creationReference.ts`    | `2f44d3555dfbf73bde0d3c3b162c7c63ef4f5d4e581b5d550345ddca698c427f` | `5a6716c314f943b7fe90e91e67c4d1a888efa28558849360114848ccd44bfb43` |
| `packages/services/src/agent-session/sessionService.ts`  | `6967ff0493763c1e3b2e8cb73ac26eb51d81f50c52966e481cfd32e18dc7fec6` | `dbbd02c0aa1d5ceee811e36d32beb40c1a50b31ef75f7db8c1a1f0dfd3d16199` |
| `packages/services/src/agent/taskIndexSyncer.ts`         | `e2ddf71626306fccf802bc26e381dc94c434c75a5a6bf312827dad355bf44c15` | `529d114c34c331f54d4e744890526d34c83b54e7f48c00a916fab2583bdbec2c` |

Registry、DB startup、commit scope、creation reference的历史请求receipt在此确切树不存在，新候选摘要也与历史请求不同。运行时已接入新候选不恢复丢失的旧原件，不销毁旧HOLD；creation的历史containment修复从未等于整文件独立核验。sessionService/taskIndexSyncer已有当前services owner，**不是仍待分配/待安装**，旧origin/权利HOLD仍在。

四路及整合者的其他完整候选同样仍按各lane记录的source-exposed和保留材料边界，尚无全量自有源码表达/贡献权利结论。此6项列表是已知精确重点，**不是完整权利审计清单**。若实际表达核验发现仍保留违反独立目标的上游可版权实现，才针对该实现续作替换；或明确保留受上游许可约束的部分。标准API、类型、功能要求、固定数据、未知来源标签或缺旧receipt不能自动成为重写理由。`scripts/provenance/model.mjs`已有工具范围内接受的original/MIT记录，但不扩展授权应用代码；新root evidence guard即使header写MIT，当前仍为unreviewed，不能自行算接受。

可执行的闭合顺序是：原材料供应者/原模块维护者提供逐条指定原件与绑定，整合者保留许可证/NOTICE并核对实际发布内容，原作者为当前完整owner提供可复核表达与贡献权利记录，最后才作限定范围的MIT/混合第三方发布决定。本次没有替用户接受缺证风险，也没有改根许可。技术测试成功、来源清单新鲜或raw完整性通过均不替代这些步骤。

原8034测试/22失败、8skipped及历史失败/skip记录未改写。本材料任务不重复全量测试、lint、types、build或独立性审计；仅资料读取、原字节和精确发布范围核对。原四路独占已分配失败修复，native7096de3…和UId6274d6…冻结输入另行集中接收；main仍未合并。

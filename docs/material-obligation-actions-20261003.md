# 26 项第三方材料义务的可执行分类

绑定来源 checkpoint `19f6ccf74ba1064ca81d93194b4f25a36030e361`。逐项结构化来源、原声明、缺项、材料提供者及下一步见 [完整分类 JSON](material-obligation-actions-20261003.json)。本表分类不关闭任何义务，不改根 LICENSE/NOTICE、source registers、reviews 或权利 HOLD。

18 项依赖、引擎、工具链与 skill 有保留独立第三方许可的路径，仍须补齐以下材料。8 个 SVG 文件来源未确认，暂不能以 Material Icon Theme 的许可证覆盖。该 26 项清单中没有已确认的自有源码重写项；这不代表更广的 ZCode 表达、贡献者或新候选权利核验完成。

| 行动类别                            | 数量 | 必须取得的材料                                                                                      | 提供者/处理方式                                                                                                       |
| ----------------------------------- | ---- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 保留各自许可，补原版本版权声明      | 15   | 14 个 npm 包与 React skill 的完整原版权/许可，绑定现有版本或 source revision                        | 上游出版者/权利人，或持有其书面材料的原导入者。已有标准条款与 publisher identifier 继续保留；不抄另一个版本的版权名。 |
| 保留原生/嵌入组件各自许可，补构建链 | 3    | Skia、QuickJS-NG 与一条 Rust std 的实际 binary/WASM 摘要、编译/链接输入和完整 notice 闭包           | 原二进制出版者或 release/build owner。不能把 wrapper 的 MIT 当作全部链接组件的 MIT。                                  |
| 确认原图标来源或授权                | 8    | 两个客户端的 docx/folder/pptx/xlsx 原 SVG、来源版本、作者与完整许可；有修改时需原起始文件和变换记录 | 原素材提供者/导入者或实际权利人。四对文件逐路径保持现状；若材料拿不到，再单独授权独立素材替换和 UI 验收。             |

## 需要原版本声明的 npm 包

下表仅记录现有清单的 license 标识，不是出版核验通过。已有固定 archive/source 缺少完整原 notice 的记录仍保留；@arms 三包还缺少仓库/source revision 线索。

| 包/版本                              | 原登记许可     |
| ------------------------------------ | -------------- |
| `@arms/rum-browser@0.1.8`            | `ISC`          |
| `@arms/rum-core@0.1.4`               | `ISC`          |
| `@arms/rum-electron@0.0.3`           | `MIT`          |
| `@hono/node-ws@1.3.0`                | `MIT`          |
| `@open-draft/deferred-promise@2.2.0` | `MIT`          |
| `ansi-to-react@6.2.6`                | `BSD-3-Clause` |
| `boolbase@1.0.0`                     | `ISC`          |
| `is-node-process@1.2.0`              | `MIT`          |
| `lazy-val@1.0.5`                     | `MIT`          |
| `quickjs-wasi@2.2.0`                 | `MIT`          |
| `react-remove-scroll-bar@2.3.8`      | `MIT`          |
| `semaphore@1.1.0`                    | `MIT`          |
| `strict-event-emitter@0.5.1`         | `MIT`          |
| `unsafe-pointer@0.2.0`               | `MIT`          |

另有 React Best Practices skill：固定 `063bee94c3f4df8453406c830b0a7df0f2860278` README 声明 MIT，但本次原根 LICENSE 路径仍返回 404，不能用通用 MIT 文本替代原版权声明。原 Shu Ding/Vercel 归属与 importRevision 未知说明保留。

## 八个图标与三项构建材料

图标缺项逐路径为 `packages/desktop/src/renderer/public/material-icons/{docx,folder,pptx,xlsx}.svg` 和 `packages/web/public/material-icons/{docx,folder,pptx,xlsx}.svg`。本次在固定 upstream commit 尝试 Word、Folder、PowerPoint 的候选别名，字节及 CRLF 归一后均不匹配；Excel 候选路径为 404。这是失败的来源调查，不能改写为匹配，也不能据几何相似授予许可。完整 URL/摘要已写入 JSON。

Skia 原核心 notice 与 18 份关联 notices、2 份 build refs 继续保留；尚缺实际各平台链接闭包。QuickJS-NG 原引擎 notice 与 16 份关联 notices、2 份 build refs 继续保留；WASI libc/LLVM、crypto 与扩展的实际链接关系仍需原构建材料。

Rust std 记录 `6a6eaca656978778f7c1c750ee0c3db87f8bffb2` 没有 notice。本次 raw LICENSE 与官方 Git commit API 均返回 404；先向原 native artifact/build owner 取得实际 compiler/std source revision 与 artifact/target 映射，再取相应原条款。不能拿另外两条已登记 Rust revision 的 notice 抵消它。404 不等于无版权或无许可。

## 可直接发出的材料请求内容

尚未向任何人发送请求。原贡献者/发布者可提供：完整原 notice、对应版本/source SHA 与包/二进制摘要；平台 build/link 清单；或上述四类图标的原 SVG 与明确适用的书面授权。只需要能绑定现有记录的材料，不把所有缺项转成用户个人版权声明或要求授权不存在的权利。

MIT 要求保留原版权和许可声明；Apache-2.0 分发仍需保留适用许可、归属及 NOTICE，并说明修改。[MIT 正文](https://opensource.org/license/mit)，[Apache-2.0 正文](https://www.apache.org/licenses/LICENSE-2.0)。这些条件支持保留独立第三方许可范围，不能证明当前全部自有源码已经获得 MIT 权利。

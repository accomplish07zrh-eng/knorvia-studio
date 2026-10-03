# Apache-2.0 声明与实际分发材料

2026-10-03。用户取消全项目 MIT 迁移，继续沿用根 Apache-2.0，并明确继续替换原项目继承实现。常用第三方依赖照常使用并保留真实声明。根 LICENSE、根 package 的声明及官网已经一致；本轮修正中英文 README、当前规格和指令中的目标描述。现有单独声明的 MIT、ISC、BSD、Apache 及其他第三方许可、NOTICE、旧发布和来源记录保留。本轮保持全部依赖、资产、功能、UI 和用户数据。

本轮源代码检查点为 `59517d9699519b0a7a44980da27df29d45f0e91e`；[main CI 37116467184](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37116467184) 的 Linux、Windows 两个 job 均 completed/success。这是主干合并后的实际运行；本轮纯声明/证据修改未重复全套产品回归、类型、lint 或构建。

## 仍影响实际 Apache 分发的材料

项目继续使用 Apache-2.0，仍须保留实际包含的第三方许可与通知。下表按实际包含条件处理，完整逐项数据在 [Apache 分发矩阵](apache-distribution-matrix.json)。历史 26 项没有机械删除，也没有把它们全部判为每一种 Apache 源码或产品的发布阻碍。

| 内容                               | 本轮实质结果                                                                                                                                                                                                                                                        | 分发时的具体工作                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 当前 npm 引用                      | 完整读取 14 份确切版本 archive 的 338 个普通成员，全部与旧 archive SHA 一致；又读取 9 个固定源码 archive 的 1270 个普通成员。未恢复此前缺失的完整包级版权/许可通知；原声明及实际内嵌署名均记录。                                                                    | 对实际包含的包保留声明，补完整通知并绑定实际包版本；其他 Hono 包或其构建工具的版权不挪作 node-ws 的通知。                                                                    |
| `lazy-val`、`semaphore`            | 三个入口的生产与 optional 依赖闭包中未见这两包；它们的现行 lock 引用仍保留。                                                                                                                                                                                        | 不因 lock 中存在就断言必须随三产品分发；实际包含构建工具时再适用对应通知义务。                                                                                               |
| 三项历史 `@arms`                   | 当前 lock 和三产品生产闭包均无引用；历史 archive 内的 Microsoft、html2canvas、ieee754、regenerator 等署名已记录。                                                                                                                                                   | 历史通知保留；只有实际包含该历史实现的产物才适用其分发义务。                                                                                                                 |
| Skia / Canvas                      | 读到 Canvas 0.1.100 包级完整 MIT 通知，与已有原文相同；八个平台 `.node` 的实际字节、平台及 publisher GitHead 已绑定。Desktop/Web 声明闭包经 PDF.js optional 依赖到 Canvas；桌面打包规则明确裁剪 Canvas。                                                            | 尚无同检查点实际安装包清单；Canvas-containing 产物需要真实平台链接闭包。不得把桌面裁剪规则冒称为实际 app.asar 已验收。                                                       |
| QuickJS                            | 确切 npm archive 包含主 WASM 与 6 个扩展 WASM。七份 SHA、imports/exports、producer sections 已读取；其 LLVM 修订与 WASI SDK 32 树对应。5 次确切通知读取与已保留原文相同，没有假称新补到通知。                                                                       | CLI 的 proxy/PAC 生产链包含该包；桌面另携 CLI agent 资源，不能只凭 host 入口闭包断言桌面不含。需把真实资源清单、7 份 WASM 与组件/link 通知对应。                             |
| React 指南                         | 76 文件与最初仓库快照相同；固定上游 74 文件经现有格式化器后与本地同字节，另外 2 处为 3 个链接修正及 README 适配。                                                                                                                                                   | 继续保留 MIT 声明、Shu Ding/Vercel 署名；完整 publisher 通知及实际 import 操作仍未恢复。用户不确定说法未记为原创确认，详见 [具体技能辨认卡](react-skill-identification.md)。 |
| 四类、八路径 SVG                   | 用户看过原样预览 `libfile_077e3f20f0848191a63e8bb15bfd1048` 后明确说“这种不是我们的”；四份 Web 原件均与固定 ZCode 提交同字节、blob 对应旧基线，Desktop 配对文件同字节，见 [有界原件核对](bounded-svg-source-facts.json)。早先 Claude 自绘的泛泛声明不映射到这些图。 | 按实际来源与适用许可决定保留；ZCode 字节对应及本地旧登记摘要不替代具体资产的 creator/license 核验。本轮不改 SVG/界面。                                                       |
| Windows ripgrep std / build helper | 接收 native 原任务 `ede8382435ed91e9d62300599e925f6fb90532c0` 的确切事实：两份 ZIP、`rg.exe`、publisher release commit 已绑定；构建工具链是 `ms-1.88`，公开原始 std 材料仍未恢复。登记 `msvc_spectre_libs@0.1.3` 的原始 MIT 通知，并使既有通知合集包含其组件引用。  | 私有 feed 的 401、公开 commit 的 422 和 COPYRIGHT 的 404 原样保留；不以官方 Rust 1.88 或 helper 的 MIT 通知替代 Microsoft std / Spectre 库材料。本线程未重复原任务的读取。   |

上述依赖闭包是固定 root lock 的声明数据，分别遍历 Desktop、Web、CLI 的生产与 optional 边，未解析边为 0；它不是 tree-shaking 后的最终产物。原始摘要、读取范围、来源 URL、失败响应、二进制 sections、编译元数据和 [输入绑定](input-bindings.json) 已保存。包元数据中的 license/author 字段、二进制字符串和源码曝光均不单独证明完整版权、原创或侵权。

## 取消的 MIT 专项与保留的历史

为了把旧实现重新授权为全项目 MIT 而要求的专项审查停止，独立替换原项目实现的目标继续。历史证据保持原结论；缺旧 receipt 和 `NOASSERTION` 不自动构成 Apache 分发禁止，也不转成新的原创确认。已经对照确切完整原件的 [14 文件后续范围](inherited-implementation-next.md) 与普通第三方材料分开；已独立候选不因旧标签再次机械重写。根 LICENSE、reviews 和 frozen evidence 原字节保留；native register 接收确切出处/helper 通知的新增事实，NOTICE 追加当前 Apache 决定，均不删除原声明。

## 云端隔离验收准备

[准备清单](cloud-gui-preparation.json) 已绑定主干 SHA、现有命令、条件及 7 文件合成工作区；[合成 ZIP](../../docs/evidence/post-main-source-verification-20261003/synthetic-gui-workspace.zip) 包含 Unicode、空格路径、重复搜索词和空文件。没有用户真实数据、凭据或历史配置，也没有启动应用。

当前是 Linux x86_64，缺 Electron runtime、desktop Playwright、DISPLAY/Xvfb 和 Windows 环境；既有 desktop 输出未绑定到受检提交。GUI、安装器和打包现场验收均未执行。可用 Windows 云环境后，使用当前源码新输出、现有 `test:studio:ui` 及对完整仓库外包执行的 `test:studio:packaged`；隐藏窗口断言不当作目视/截图验收。本轮不要求用户提供本地机器或真实数据。

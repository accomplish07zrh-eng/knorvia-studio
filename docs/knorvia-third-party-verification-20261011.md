# Knorvia 第三方来源逐文件核实（M0-6）

2026-10-11 · 基线 main `6ea4cbe7`（执行基线 `beff12b5`）· 分支 `m0/6-third-party-verification` · issue #90

范围：shadcn 45、ai-elements 46、VS Code RPC 约 21、Fig 1、material-icons 8（共 122 个文件，含目录内与已登记范围重叠的文件）。做法见计划书「第三方核实的做法」。

**结论合计：一致 1、ZCode 改过 77、无上游 44，共 122。**

## 做法

### 上游版本定位

- **缓存留在仓库外。** 上游对象库用 `git clone --filter=blob:none --bare` 下到仓库外的缓存目录，只取比对所需的 blob；主仓不新增任何上游对象或目录树。
- **shadcn（没有逐组件版本号）。** 取 shadcn-ui/ui 中在 ZCode 快照（2026-09-21）之前、且改动过四个 registry `ui` 目录的 **99 个提交**（2025-06-01 起），逐个把每个本地组件与 `new-york-v4`、`bases/radix`、`bases/base`、`bases/aria` 四套注册表路径比对，按文件取规范化差异最小者再求和。
  - 只有 **6 个提交**能让全部 32 个有上游对应的文件都找到对照，且它们的合计差异并列最小（847 行）；其中最新的是 `c257f688`（2026-09-04）。
  - 仓库已记录的许可参考版本 `a87a63b2`（2026-09-17）对这 32 个路径与 `c257f688` **逐文件结果完全一致**（0 个文件有差异），也是 ZCode 快照前最后一个内容未再变化的版本。因此固定版本记为 `a87a63b2ca25143d26c8bd0903e4e9bc77b3f824`，与 `third-party/copied-components.json` 已记录的 `referenceRevision` 及已留存的许可正文一致，不更换现有 pin。
  - 说明：没有任何候选提交能让任一文件逐字节相同——ZCode 的副本带分号、导入顺序被重排、`cn` 导入路径被改写，部分组件还改了视觉取值。
- **ai-elements / VS Code / Material Icon Theme。** 直接使用仓库已记录的 `referenceRevision`，并重新按其上游路径逐文件验证。
- **Fig。** 仓库记录的 `aef52acff84c45edde61ae610cc2c964802b9a38` 与 npm `@withfig/autocomplete@2.692.3` 的 `gitHead` **完全相同**，npm 发布元数据可独立验证该版本；实际来源见下文。

### 比对与结论口径

规范化：去首尾空白、去空行、去纯括号或分隔符行、去 import 与 re-export 行（JS/TS 与 CSS），注释保留；比对在 CRLF 归一后的文本上进行，避免检出换行差异被当成改动。

表内列的含义：

- **规范化差异行数**：本地与上游规范化行序列的对称差异行数（added + removed）。只有两序列相等时才为 0。
- **本地独有行**：本地规范化行中未能按序在上游匹配到的行数。
- **最长相同段**：在上游连续出现的本地连续行最长长度。
- **实质差异行**：本地独有行中，既不是纯注释行、也不能用格式差异（行尾分号、逗号）解释的行数（启发式，仅作复核参考，**不是阈值**）。

结论口径：**一致** = CRLF 归一后逐字节相同；**ZCode 改过** = 该版本存在上游对应文件但内容有差异；**无上游** = 该版本不存在同名上游文件。按计划书默认裁决「不确定文件是否第三方原样 → 按 ZCode 改过处理」，**只要不是逐字节相同一律记 ZCode 改过，不在 M0 登记为 third-party**。

## 分组件结果

### shadcn 组件目录

上游仓库 shadcn-ui/ui（MIT），固定版本 `a87a63b2ca25143d26c8bd0903e4e9bc77b3f824`（2026-09-17）。范围：`packages/ui/src/components/ui`、`packages/ui/src/styles.css`。共 46 个文件：一致 0、ZCode 改过 32、无上游 14。

| 文件                                          | 上游仓库     | 固定提交   | 上游路径                                            | 规范化差异行数 | 本地独有行 | 最长相同段 | 实质差异行 | 结论       |
| --------------------------------------------- | ------------ | ---------- | --------------------------------------------------- | -------------- | ---------- | ---------- | ---------- | ---------- |
| `ui/AboutLogo.tsx`                            | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |
| `ui/accordion.tsx`                            | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/accordion.tsx`     | 40             | 13         | 12         | 10         | ZCode 改过 |
| `ui/alert-dialog.tsx`                         | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/alert-dialog.tsx`  | 91             | 26         | 9          | 19         | ZCode 改过 |
| `ui/alert.tsx`                                | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/alert.tsx`         | 27             | 14         | 19         | 11         | ZCode 改过 |
| `ui/avatar.tsx`                               | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/avatar.tsx`        | 41             | 14         | 10         | 8          | ZCode 改过 |
| `ui/badge.tsx`                                | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/badge.tsx`         | 22             | 10         | 7          | 8          | ZCode 改过 |
| `ui/button-group.tsx`                         | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/button-group.tsx`  | 24             | 10         | 20         | 6          | ZCode 改过 |
| `ui/button.tsx`                               | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/button.tsx`        | 42             | 24         | 11         | 18         | ZCode 改过 |
| `ui/card.tsx`                                 | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/card.tsx`          | 35             | 13         | 9          | 8          | ZCode 改过 |
| `ui/chart.tsx`                                | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/chart.tsx`         | 177            | 73         | 25         | 16         | ZCode 改过 |
| `ui/checkbox.tsx`                             | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/checkbox.tsx`      | 35             | 20         | 4          | 13         | ZCode 改过 |
| `ui/code-viewer.tsx`                          | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |
| `ui/collapsible.tsx`                          | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/collapsible.tsx`   | 40             | 28         | 5          | 23         | ZCode 改过 |
| `ui/command.tsx`                              | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/command.tsx`       | 86             | 39         | 12         | 21         | ZCode 改过 |
| `ui/context-menu.tsx`                         | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/context-menu.tsx`  | 189            | 30         | 9          | 10         | ZCode 改过 |
| `ui/dialog.tsx`                               | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/dialog.tsx`        | 81             | 39         | 13         | 24         | ZCode 改过 |
| `ui/diff-viewer.tsx`                          | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |
| `ui/dropdown-menu.tsx`                        | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/dropdown-menu.tsx` | 122            | 55         | 18         | 20         | ZCode 改过 |
| `ui/flip-metric-value.tsx`                    | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |
| `ui/GlmMonochromeIcon.tsx`                    | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |
| `ui/highlighted-lightweight-diff-preview.tsx` | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |
| `ui/hover-card.tsx`                           | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/hover-card.tsx`    | 20             | 7          | 13         | 4          | ZCode 改过 |
| `ui/input-group.tsx`                          | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/input-group.tsx`   | 65             | 23         | 22         | 16         | ZCode 改过 |
| `ui/input.tsx`                                | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/input.tsx`         | 29             | 22         | 2          | 22         | ZCode 改过 |
| `ui/kbd.tsx`                                  | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/kbd.tsx`           | 16             | 10         | 5          | 2          | ZCode 改过 |
| `ui/label.tsx`                                | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/base/ui/label.tsx`          | 9              | 4          | 4          | 2          | ZCode 改过 |
| `ui/lightweight-diff-preview.tsx`             | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |
| `ui/pdf-viewer.tsx`                           | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |
| `ui/popover.tsx`                              | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/popover.tsx`       | 36             | 14         | 13         | 8          | ZCode 改过 |
| `ui/pptx-preview-viewer.tsx`                  | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |
| `ui/pptx-selection-action-bar.tsx`            | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |
| `ui/progress.tsx`                             | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/progress.tsx`      | 44             | 33         | 4          | 28         | ZCode 改过 |
| `ui/README.md`                                | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |
| `ui/resizable.tsx`                            | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/resizable.tsx`     | 104            | 78         | 2          | 45         | ZCode 改过 |
| `ui/scroll-area.tsx`                          | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/scroll-area.tsx`   | 24             | 12         | 12         | 9          | ZCode 改过 |
| `ui/scroll-fade-viewport.tsx`                 | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |
| `ui/select.tsx`                               | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/select.tsx`        | 150            | 79         | 13         | 59         | ZCode 改过 |
| `ui/separator.tsx`                            | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/separator.tsx`     | 6              | 3          | 13         | 0          | ZCode 改过 |
| `ui/spinner.tsx`                              | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/spinner.tsx`       | 7              | 4          | 3          | 3          | ZCode 改过 |
| `ui/switch.tsx`                               | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/switch.tsx`        | 12             | 5          | 6          | 2          | ZCode 改过 |
| `ui/tabs.tsx`                                 | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/tabs.tsx`          | 32             | 11         | 9          | 9          | ZCode 改过 |
| `ui/textarea.tsx`                             | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/textarea.tsx`      | 11             | 7          | 2          | 5          | ZCode 改过 |
| `ui/toast.tsx`                                | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/base/ui/toast.tsx`          | 322            | 119        | 1          | 101        | ZCode 改过 |
| `ui/tooltip.tsx`                              | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/tooltip.tsx`       | 21             | 8          | 12         | 4          | ZCode 改过 |
| `ui/usePdfZoomOverlay.ts`                     | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |
| `packages/ui/src/styles.css`                  | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | —          | —          | 无上游     |

### ai-elements 组件目录

上游仓库 vercel/ai-elements（Apache-2.0），固定版本 `6a9d5b1822ffb10bba4bd97175f01edd7d8651cd`（2026-08-21）。范围：`packages/ui/src/components/ai-elements`。共 46 个文件：一致 1、ZCode 改过 31、无上游 14。

| 文件                                      | 上游仓库           | 固定提交   | 上游路径                                 | 规范化差异行数 | 本地独有行 | 最长相同段 | 实质差异行 | 结论       |
| ----------------------------------------- | ------------------ | ---------- | ---------------------------------------- | -------------- | ---------- | ---------- | ---------- | ---------- |
| `ai-elements/agent.tsx`                   | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/agent.tsx`        | 59             | 21         | 11         | 15         | ZCode 改过 |
| `ai-elements/artifact.tsx`                | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/artifact.tsx`     | 47             | 16         | 20         | 8          | ZCode 改过 |
| `ai-elements/attachments.tsx`             | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/attachments.tsx`  | 211            | 159        | 57         | 101        | ZCode 改过 |
| `ai-elements/canvas.tsx`                  | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/canvas.tsx`       | 0              | 0          | 16         | 0          | 一致       |
| `ai-elements/chat-loading.tsx`            | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/checkpoint.tsx`              | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/checkpoint.tsx`   | 25             | 10         | 24         | 4          | ZCode 改过 |
| `ai-elements/code-block.tsx`              | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/code-block.tsx`   | 559            | 289        | 22         | 204        | ZCode 改过 |
| `ai-elements/commit.tsx`                  | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/commit.tsx`       | 168            | 40         | 34         | 32         | ZCode 改过 |
| `ai-elements/confirmation.tsx`            | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/confirmation.tsx` | 53             | 20         | 16         | 9          | ZCode 改过 |
| `ai-elements/connection.tsx`              | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/connection.tsx`   | 22             | 8          | 8          | 2          | ZCode 改过 |
| `ai-elements/context.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/context.tsx`      | 210            | 102        | 24         | 76         | ZCode 改过 |
| `ai-elements/controls.tsx`                | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/controls.tsx`     | 8              | 7          | 7          | 0          | ZCode 改过 |
| `ai-elements/conversation.tsx`            | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/conversation.tsx` | 57             | 27         | 25         | 11         | ZCode 改过 |
| `ai-elements/diagram-preview-dialog.tsx`  | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/edge.tsx`                    | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/edge.tsx`         | 22             | 10         | 25         | 3          | ZCode 改过 |
| `ai-elements/image-preview-dialog.tsx`    | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/image-thumbnail-gallery.tsx` | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/image.tsx`                   | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/image.tsx`        | 17             | 8          | 3          | 2          | ZCode 改过 |
| `ai-elements/markdown-blockquote.tsx`     | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/markdown-image.tsx`          | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/markdown-list.tsx`           | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/markdown-table.tsx`          | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/mermaid-block.tsx`           | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/message.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/message.tsx`      | 1108           | 1026       | 21         | 750        | ZCode 改过 |
| `ai-elements/node.tsx`                    | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/node.tsx`         | 18             | 9          | 15         | 3          | ZCode 改过 |
| `ai-elements/panel.tsx`                   | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/panel.tsx`        | 10             | 7          | 3          | 1          | ZCode 改过 |
| `ai-elements/persona.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/persona.tsx`      | 65             | 23         | 36         | 16         | ZCode 改过 |
| `ai-elements/plan.tsx`                    | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/plan.tsx`         | 35             | 14         | 26         | 6          | ZCode 改过 |
| `ai-elements/prompt-input-actions.tsx`    | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/prompt-input-buttons.tsx`    | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/prompt-input-primitives.tsx` | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/prompt-input-textarea.tsx`   | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/prompt-input.tsx`            | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/prompt-input.tsx` | 585            | 51         | 66         | 23         | ZCode 改过 |
| `ai-elements/queue.tsx`                   | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/queue.tsx`        | 124            | 56         | 26         | 39         | ZCode 改过 |
| `ai-elements/reasoning.tsx`               | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/reasoning.tsx`    | 409            | 345        | 10         | 243        | ZCode 改过 |
| `ai-elements/sandbox.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/sandbox.tsx`      | 60             | 20         | 7          | 12         | ZCode 改过 |
| `ai-elements/shimmer.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/shimmer.tsx`      | 20             | 13         | 26         | 3          | ZCode 改过 |
| `ai-elements/snippet.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/snippet.tsx`      | 30             | 11         | 33         | 5          | ZCode 改过 |
| `ai-elements/sources.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/sources.tsx`      | 38             | 12         | 7          | 5          | ZCode 改过 |
| `ai-elements/streamdown-controls.ts`      | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | —          | —          | 无上游     |
| `ai-elements/suggestion.tsx`              | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/suggestion.tsx`   | 16             | 8          | 28         | 2          | ZCode 改过 |
| `ai-elements/task.tsx`                    | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/task.tsx`         | 53             | 22         | 6          | 13         | ZCode 改过 |
| `ai-elements/terminal.tsx`                | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/terminal.tsx`     | 69             | 28         | 38         | 13         | ZCode 改过 |
| `ai-elements/test-results.tsx`            | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/test-results.tsx` | 177            | 40         | 34         | 32         | ZCode 改过 |
| `ai-elements/tool.tsx`                    | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/tool.tsx`         | 52             | 27         | 34         | 16         | ZCode 改过 |
| `ai-elements/toolbar.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/toolbar.tsx`      | 10             | 7          | 3          | 1          | ZCode 改过 |

### VS Code IPC 派生代码

上游仓库 microsoft/vscode（MIT），固定版本 `44825207bf4389c3bd17c92d3ec28cf784c324cc`（2026-09-20）。范围：`packages/rpc/src`、`packages/rpc/examples`、`packages/shared/src/protocol-v4/wire-codec.ts`。共 21 个文件：一致 0、ZCode 改过 13、无上游 8。

| 文件                                            | 上游仓库         | 固定提交   | 上游路径                                                   | 规范化差异行数 | 本地独有行 | 最长相同段 | 实质差异行 | 结论       |
| ----------------------------------------------- | ---------------- | ---------- | ---------------------------------------------------------- | -------------- | ---------- | ---------- | ---------- | ---------- |
| `rpc/examples/01-basic-ipc.ts`                  | microsoft/vscode | `44825207` | —                                                          | —              | —          | —          | —          | 无上游     |
| `rpc/examples/02-proxy-channel.ts`              | microsoft/vscode | `44825207` | —                                                          | —              | —          | —          | —          | 无上游     |
| `rpc/examples/03-ipc-server-client.ts`          | microsoft/vscode | `44825207` | —                                                          | —              | —          | —          | —          | 无上游     |
| `rpc/examples/04-remote-connection.ts`          | microsoft/vscode | `44825207` | —                                                          | —              | —          | —          | —          | 无上游     |
| `rpc/src/buffer.ts`                             | microsoft/vscode | `44825207` | `src/vs/base/common/buffer.ts`                             | 362            | 33         | 4          | 27         | ZCode 改过 |
| `rpc/src/channelClient.ts`                      | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 993            | 132        | 3          | 105        | ZCode 改过 |
| `rpc/src/channels.shared.ts`                    | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 926            | 33         | 4          | 30         | ZCode 改过 |
| `rpc/src/channels.ts`                           | microsoft/vscode | `44825207` | —                                                          | —              | —          | —          | —          | 无上游     |
| `rpc/src/channelServer.ts`                      | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 1000           | 135        | 4          | 109        | ZCode 改过 |
| `rpc/src/delayedChannel.ts`                     | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 909            | 5          | 2          | 5          | ZCode 改过 |
| `rpc/src/foundation.ts`                         | microsoft/vscode | `44825207` | `src/vs/base/common/event.ts`                              | 1501           | 109        | 2          | 83         | ZCode 改过 |
| `rpc/src/index.ts`                              | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 938            | 33         | 1          | 0          | ZCode 改过 |
| `rpc/src/ipc.ts`                                | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 960            | 100        | 5          | 86         | ZCode 改过 |
| `rpc/src/logging-middleware.ts`                 | microsoft/vscode | `44825207` | —                                                          | —              | —          | —          | —          | 无上游     |
| `rpc/src/network-telemetry-middleware.ts`       | microsoft/vscode | `44825207` | —                                                          | —              | —          | —          | —          | 无上游     |
| `rpc/src/persistent-protocol.ts`                | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.net.ts`                  | 996            | 145        | 1          | 137        | ZCode 改过 |
| `rpc/src/protocol.ts`                           | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.net.ts`                  | 1002           | 169        | 8          | 152        | ZCode 改过 |
| `rpc/src/proxy-channel.ts`                      | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 979            | 76         | 2          | 69         | ZCode 改过 |
| `rpc/src/remote.ts`                             | microsoft/vscode | `44825207` | `src/vs/platform/remote/common/remoteAuthorityResolver.ts` | 207            | 108        | 4          | 99         | ZCode 改过 |
| `rpc/src/serialization.ts`                      | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 1023           | 137        | 6          | 110        | ZCode 改过 |
| `packages/shared/src/protocol-v4/wire-codec.ts` | microsoft/vscode | `44825207` | —                                                          | —              | —          | —          | —          | 无上游     |

### Fig 命令注册表

上游仓库 withfig/autocomplete（MIT（LICENSE 文件）/ ISC（package.json 声明）），固定版本 `aef52acff84c45edde61ae610cc2c964802b9a38`（2025-05-05）。范围：`apps/cli/packages/core/src/tool/handlers/generated/bash-command-registry.ts`。共 1 个文件：一致 0、ZCode 改过 1、无上游 0。

| 文件                                                                          | 上游仓库             | 固定提交   | 上游路径 | 规范化差异行数 | 本地独有行 | 最长相同段 | 实质差异行 | 结论       |
| ----------------------------------------------------------------------------- | -------------------- | ---------- | -------- | -------------- | ---------- | ---------- | ---------- | ---------- |
| `apps/cli/packages/core/src/tool/handlers/generated/bash-command-registry.ts` | withfig/autocomplete | `aef52acf` | —        | —              | —          | —          | —          | ZCode 改过 |

### Material 图标资产

上游仓库 material-extensions/vscode-material-icon-theme（MIT），固定版本 `cb1dfb6d9cb73b15681a93939983d75dbba7bf5b`（2026-09-19）。范围：`packages/desktop/src/renderer/public/material-icons`、`packages/web/public/material-icons`。共 8 个文件：一致 0、ZCode 改过 0、无上游 8。

| 文件                                  | 上游仓库                                       | 固定提交   | 上游路径 | 规范化差异行数 | 本地独有行 | 最长相同段 | 实质差异行 | 结论   |
| ------------------------------------- | ---------------------------------------------- | ---------- | -------- | -------------- | ---------- | ---------- | ---------- | ------ |
| `desktop/…/material-icons/docx.svg`   | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | —          | —          | 无上游 |
| `desktop/…/material-icons/folder.svg` | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | —          | —          | 无上游 |
| `desktop/…/material-icons/pptx.svg`   | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | —          | —          | 无上游 |
| `desktop/…/material-icons/xlsx.svg`   | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | —          | —          | 无上游 |
| `web/…/material-icons/docx.svg`       | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | —          | —          | 无上游 |
| `web/…/material-icons/folder.svg`     | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | —          | —          | 无上游 |
| `web/…/material-icons/pptx.svg`       | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | —          | —          | 无上游 |
| `web/…/material-icons/xlsx.svg`       | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | —          | —          | 无上游 |

## 逐组件说明与后续处理

### shadcn（一致 0 / ZCode 改过 32 / 无上游 14）

32 个组件在上游四套注册表里都能找到对应文件，但全部与上游有差异，且差异不是纯格式：ZCode 的分号与导入顺序、`cn` 导入路径改写之外，`button.tsx`、`badge.tsx`、`card.tsx` 等还改了 class 取值（`text-ui-base`、`bg-primary`、`transition-colors` 等，属 Knorvia 黑白视觉语言的取值），因此归为 ZCode 改过。

14 个文件在 shadcn-ui/ui 里没有对应文件：`AboutLogo.tsx`、`GlmMonochromeIcon.tsx`、`README.md`（中文说明）、`code-viewer.tsx`、`diff-viewer.tsx`、`flip-metric-value.tsx`、`highlighted-lightweight-diff-preview.tsx`、`lightweight-diff-preview.tsx`、`pdf-viewer.tsx`、`pptx-preview-viewer.tsx`、`pptx-selection-action-bar.tsx`、`scroll-fade-viewport.tsx`、`usePdfZoomOverlay.ts`、`styles.css`。这些是本项目自己的组件与样式表，**不属于 shadcn**。

**后续：** `packages/ui/src/components/ui` 整目录属 `ui-components-02`。该包先按原版恢复 32 个上游文件，把 Knorvia 需要保留的差异（黑白视觉取值、`cn` 路径、必要的中文注释）写进合同，在原版之上重新实现；14 个无上游文件按本项目代码重写。

### ai-elements（一致 1 / ZCode 改过 31 / 无上游 14）

**唯一逐字节一致的是 `canvas.tsx`**：618 字节，sha256 与上游 `packages/elements/src/canvas.tsx` 完全相同（`7bc92905…`）。已在本 PR 登记为 third-party。

31 个文件带 ZCode 自己加的来源注释头（例如 `panel.tsx` 的 `Derived from vercel/ai-elements …Modified by ZCode`），再叠加分号、导入顺序与 `../lib/utils.js` 路径改写；`message.tsx`、`reasoning.tsx`、`code-block.tsx` 另有大量产品改动（实质差异行分别为 750、243、204）。

14 个文件在 ai-elements 的**全部历史**中都不存在（不只该版本）：`chat-loading.tsx`、`diagram-preview-dialog.tsx`、`image-preview-dialog.tsx`、`image-thumbnail-gallery.tsx`、`markdown-blockquote.tsx`、`markdown-image.tsx`、`markdown-list.tsx`、`markdown-table.tsx`、`mermaid-block.tsx`、`prompt-input-actions.tsx`、`prompt-input-buttons.tsx`、`prompt-input-primitives.tsx`、`prompt-input-textarea.tsx`、`streamdown-controls.ts`。它们的导入全部指向本项目自己的模块（`@/components/...`、`@knorvia/shared`、`@/hooks/...`），其中 4 个 `prompt-input-*` 是从 `prompt-input.tsx` 拆出的本项目模块。

**后续：** `packages/ui/src/components/ai-elements` 整目录属 `ui-components-01`。该包先恢复 31 个上游文件，把需要保留的差异写进合同后重写；1 个已登记文件保持 third-party 并保留许可头；14 个无上游文件按本项目代码重写。

### VS Code IPC（一致 0 / ZCode 改过 13 / 无上游 8）

这些文件不是整文件复制，而是从 VS Code 源码里**抽取并重写**的子集：例如 `buffer.ts`（本地 71 行）取自 `src/vs/base/common/buffer.ts`（上游 421 行）；`ipc.ts`、`channelClient.ts`、`channelServer.ts`、`channels.shared.ts`、`delayedChannel.ts`、`proxy-channel.ts` 都取自 `src/vs/base/parts/ipc/common/ipc.ts`（1135 行）；`protocol.ts`、`persistent-protocol.ts` 取自 `ipc.net.ts`（1047 行）；`remote.ts` 取自 `remoteAgentConnection.ts`、`uriTransformer.ts`、`remoteSocketFactoryService.ts` 等。因此「规范化差异行数」在这些文件上必然包含上游未使用的整段代码，参考价值有限，判定依据是逐字节相同与否。

8 个文件在 VS Code 里没有对应：`rpc/src/channels.ts`（纯 re-export barrel）、`rpc/src/logging-middleware.ts`、`rpc/src/network-telemetry-middleware.ts`（`LoggingChannelServer`、`NetworkTelemetryChannelServer` 在 microsoft/vscode 全仓检索不到）、`rpc/examples/01–04`（示例代码）、`shared/src/protocol-v4/wire-codec.ts`（Knorvia 的 TopicWireFrame 协议，文件头已写明是 Knorvia 契约下的改动）。

**后续：** `packages/rpc/src`、`packages/rpc/examples` 属 `packages-02`，`packages/shared/src/protocol-v4/wire-codec.ts` 属 `shared-01`。按计划书「rpc 属 VS Code 派生，核实登记，ZCode 改动部分重写」处理：上游原样段落可登记为 third-party，本项目重写的部分删掉后重写；无上游的 8 个文件按本项目代码重写。接口、帧格式与协议字段不变。

### Fig 命令注册表（一致 0 / ZCode 改过 1 / 无上游 0）

`bash-command-registry.ts` 是**单个 9 行、约 190 万字符的生成物**，文件头自己写明：由 `apps/cli/scripts/generate-bash-command-registry.mjs` 确定性生成，来源 `@withfig/autocomplete@2.692.3`（文件头写 ISC），输入哈希 `1b0d34b4…`。生成器第一行即固定 `FIG_VERSION = "2.692.3"`，并在版本不符时抛错。npm 发布元数据独立验证通过：`@withfig/autocomplete@2.692.3` 的 `gitHead` 等于仓库记录的 `referenceRevision` `aef52acf…`，所以 GitHub 版本与 npm 版本是同一份源码。

**许可不一致（上游自身矛盾）：** 该提交的 `LICENSE` 文件是 MIT（`Copyright (c) 2021 Hercules Labs Inc. (Fig)`），`package.json` 却声明 `"license": "ISC"`。仓库现在按 `LICENSE` 文件记为 MIT。本 PR 未改许可标识，只把两个事实写进组件范围说明，供后续按发布方声明口径复核。

它不与任何上游文件一一对应（上游是 735 个 spec 文件、由本项目生成器聚合成紧凑结构），因此按「ZCode 改过」记录：数据来自上游、编码与生成器是本项目的。

**后续：** 数据部分属 `core-tool-handlers-01`，生成器 `apps/cli/scripts/generate-bash-command-registry.mjs` 属 `apps-cli-01`。做法是按固定上游版本用本项目的生成器重新生成，不手写这张表；命令行与参数判定结果不得改变。

### Material 图标资产（一致 0 / ZCode 改过 0 / 无上游 8）

`scripts/provenance/material-icons.mjs` 在固定提交下已按内容逐字节确认 **2284 个**图标与上游一致并登记为 third-party；余下 **8 个**（`docx.svg`、`pptx.svg`、`xlsx.svg`、`folder.svg` × 桌面与 Web 两份，两份内容各自相同）此前记为 unresolved。本次核实结论是它们**都没有上游对应**：

- `docx.svg`、`pptx.svg`、`xlsx.svg` 在 material-icon-theme 的**全部 ref 历史**里从未出现（`git log --all --diff-filter=A` 无结果）；它们是 40×40、带彩色底与白色字母的扁平文档图标，与上游 32×32 的图标风格不同。
- `folder.svg` 同名路径在 2017-11-07 的 `8a0e6b14` 中已被上游删除（提交信息即「removed generated folder icons from version control」），删除前的版本是 24×24 的 `#90a4ae` 纯色文件夹，与本地这个 32×32、带 Figma 线性渐变的文件完全不同，只是**同名而非同一文件**。

**后续：** 8 个文件视同本项目代码，随桌面包（`packages/desktop/src/renderer/public/material-icons`）与 Web 静态资源（`packages/web/public/material-icons`）重写或改用 Knorvia 自制资产。`licensing/evidence/material-icon-theme.json` 里这 8 条 unresolved 保留不动（工具重算时会重新生成该字段），`reviewRequired` 文案因此仍列出它们。

## 本次登记变更

1. `licensing/reviews.json` 只追加 1 条：`packages/ui/src/components/ai-elements/canvas.tsx` 登记 third-party（Apache-2.0），依据写明与固定上游版本逐字节相同。
2. `third-party/copied-components.json` 与 `third-party/inventory.json`：更新 5 个组件各自的**范围说明**，写清核实版本、逐文件结果与「目录只代表可能包含对应第三方内容、未逐字节相同的部分不属于该上游」；`inventory.json.inputs` 中 `third-party/copied-components.json` 的摘要同步重算。
3. 新增 `third-party/source-verification-20261011/third-party-file-comparison.json`：本次 122 个文件的机器可读比对结果（含口径、来源、逐文件指标），供后续包直接引用。

**没有登记为 third-party 的文件（77 个 ZCode 改过 + 44 个无上游）不在 M0 登记**：按计划书，改过的部分要等对应包「先换回原版、把差异写进合同、在原版之上重新实现」后再登记，依据写明 Knorvia 的修改；无上游的 44 个视同本项目代码，随替换包重写。

## 复现方式

```text
# 上游对象库下到仓库外（示例路径），只取比对所需 blob：
git clone --filter=blob:none --bare https://github.com/shadcn-ui/ui.git <cache>/shadcn-ui.git
git clone --filter=blob:none --bare https://github.com/vercel/ai-elements.git <cache>/ai-elements.git
git clone --filter=blob:none --bare https://github.com/withfig/autocomplete.git <cache>/fig-autocomplete.git
git clone --filter=blob:none --bare https://github.com/material-extensions/vscode-material-icon-theme.git <cache>/material-icon-theme.git
git init --bare <cache>/vscode.git && git -C <cache>/vscode.git remote add origin https://github.com/microsoft/vscode.git
git -C <cache>/vscode.git fetch --filter=blob:none --depth=1 origin 44825207bf4389c3bd17c92d3ec28cf784c324cc

# 逐文件指标与结论见：
third-party/source-verification-20261011/third-party-file-comparison.json
```

## 遗留问题

1. **shadcn 没有官方逐组件版本号**，固定版本是按「与 ZCode 快照前所有相关提交逐个比对、取规范化差异最小且覆盖最全」选出的 `a87a63b2`（与 `c257f688` 对该文件集内容一致）。这是可复现的推断，不是上游自证；若后续发现更贴近的版本，应更新本文件与该组件的范围说明。
2. **Fig 上游许可自相矛盾**（LICENSE=MIT、package.json=ISC），本 PR 只记录事实、未改许可标识，留给按发布方声明口径的复核。
3. **8 个 Material 图标与 44 个无上游文件**仍会在 `third-party/inventory.json` 的 `reviewRequired` 中体现（前者由图标证据的 unresolved 条目派生），这是有意保留：它们确实没有可登记的第三方来源。
4. **77 个 ZCode 改过文件的最终登记推迟到对应替换包**，届时必须写明 Knorvia 的修改并保留上游许可与署名；本文件的指标可作为该步骤的输入。
5. `third-party/copied-components.json` 与 `third-party/inventory.json` 同时是 M0-4 的改动对象（`.agents/` 条目剔除）。本 PR 只改 `scope` 文本与 `inputs` 摘要，未触碰 `roots`、`files` 与 `modifiedFiles`；若两者先后合并出现冲突，按「两者都要」解，不丢任一侧的改动。

## 四、选包输入清单（按目标替换包分组）

本节把上一节的结论落到**选包输入**：第三方的 121 个待处理文件（ZCode 改过 77 + 无上游 44）按计划书分包总表分组，写清每个包要处理哪些文件、上游对应版本、规范化差异行数，以及要做的事是**换回原版再按合同实现**还是**视同 ZCode 代码重写**。

数据全部来自 `third-party/source-verification-20261011/third-party-file-comparison.json`（同一份比对表生成的机器可读结果），不另作判断；**1 个逐字节一致的文件**（`packages/ui/src/components/ai-elements/canvas.tsx`）已在 `licensing/reviews.json` 登记为 third-party，不出现在本清单里。

每个包的做法（计划书《第三方核实的做法》）：

1. **换回原版再按合同实现**（对应「ZCode 改过」）：先从固定上游提交取回原版文件替换本仓副本，再按本包合同与两条相似度门槛在其上实现 Knorvia 需要的差异（黑白视觉取值、`cn` 导入路径、必要注释等），最终登记 third-party 并写明 Knorvia 的修改。
2. **视同 ZCode 代码重写**（对应「无上游」）：不按第三方来源登记；按本包合同重写，登记 original，basis 如实写明作者读过被替换实现。

**拿不准的一律按「ZCode 改过」处理**（计划书默认裁决表），所以本清单里没有把任何边界文件登记为 third-party。

### ui-components-01

计划书：`packages/ui/src/components` · ai-elements、icons、lib。

共 **45** 个文件：换回原版再按合同实现 **31**、视同 ZCode 代码重写 **14**。

| 文件                                                                 | 上游仓库           | 固定提交   | 上游路径                                 | 规范化差异行数 | 实质差异行 | 结论       | 本包要做的事                                       |
| -------------------------------------------------------------------- | ------------------ | ---------- | ---------------------------------------- | -------------- | ---------- | ---------- | -------------------------------------------------- |
| `packages/ui/src/components/ai-elements/agent.tsx`                   | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/agent.tsx`        | 59             | 15         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/artifact.tsx`                | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/artifact.tsx`     | 47             | 8          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/attachments.tsx`             | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/attachments.tsx`  | 211            | 101        | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/chat-loading.tsx`            | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/checkpoint.tsx`              | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/checkpoint.tsx`   | 25             | 4          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/code-block.tsx`              | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/code-block.tsx`   | 559            | 204        | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/commit.tsx`                  | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/commit.tsx`       | 168            | 32         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/confirmation.tsx`            | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/confirmation.tsx` | 53             | 9          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/connection.tsx`              | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/connection.tsx`   | 22             | 2          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/context.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/context.tsx`      | 210            | 76         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/controls.tsx`                | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/controls.tsx`     | 8              | 0          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/conversation.tsx`            | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/conversation.tsx` | 57             | 11         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/diagram-preview-dialog.tsx`  | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/edge.tsx`                    | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/edge.tsx`         | 22             | 3          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/image-preview-dialog.tsx`    | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/image-thumbnail-gallery.tsx` | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/image.tsx`                   | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/image.tsx`        | 17             | 2          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/markdown-blockquote.tsx`     | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/markdown-image.tsx`          | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/markdown-list.tsx`           | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/markdown-table.tsx`          | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/mermaid-block.tsx`           | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/message.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/message.tsx`      | 1108           | 750        | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/node.tsx`                    | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/node.tsx`         | 18             | 3          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/panel.tsx`                   | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/panel.tsx`        | 10             | 1          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/persona.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/persona.tsx`      | 65             | 16         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/plan.tsx`                    | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/plan.tsx`         | 35             | 6          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/prompt-input-actions.tsx`    | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/prompt-input-buttons.tsx`    | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/prompt-input-primitives.tsx` | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/prompt-input-textarea.tsx`   | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/prompt-input.tsx`            | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/prompt-input.tsx` | 585            | 23         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/queue.tsx`                   | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/queue.tsx`        | 124            | 39         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/reasoning.tsx`               | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/reasoning.tsx`    | 409            | 243        | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/sandbox.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/sandbox.tsx`      | 60             | 12         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/shimmer.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/shimmer.tsx`      | 20             | 3          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/snippet.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/snippet.tsx`      | 30             | 5          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/sources.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/sources.tsx`      | 38             | 5          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/streamdown-controls.ts`      | vercel/ai-elements | `6a9d5b18` | —                                        | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ai-elements/suggestion.tsx`              | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/suggestion.tsx`   | 16             | 2          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/task.tsx`                    | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/task.tsx`         | 53             | 13         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/terminal.tsx`                | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/terminal.tsx`     | 69             | 13         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/test-results.tsx`            | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/test-results.tsx` | 177            | 32         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/tool.tsx`                    | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/tool.tsx`         | 52             | 16         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ai-elements/toolbar.tsx`                 | vercel/ai-elements | `6a9d5b18` | `packages/elements/src/toolbar.tsx`      | 10             | 1          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |

### ui-components-02

计划书：`packages/ui/src/components` · ui、workflow-graph、workflow-run-line。

共 **46** 个文件：换回原版再按合同实现 **32**、视同 ZCode 代码重写 **14**。

| 文件                                                                     | 上游仓库     | 固定提交   | 上游路径                                            | 规范化差异行数 | 实质差异行 | 结论       | 本包要做的事                                       |
| ------------------------------------------------------------------------ | ------------ | ---------- | --------------------------------------------------- | -------------- | ---------- | ---------- | -------------------------------------------------- |
| `packages/ui/src/components/ui/AboutLogo.tsx`                            | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ui/accordion.tsx`                            | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/accordion.tsx`     | 40             | 10         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/alert-dialog.tsx`                         | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/alert-dialog.tsx`  | 91             | 19         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/alert.tsx`                                | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/alert.tsx`         | 27             | 11         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/avatar.tsx`                               | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/avatar.tsx`        | 41             | 8          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/badge.tsx`                                | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/badge.tsx`         | 22             | 8          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/button-group.tsx`                         | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/button-group.tsx`  | 24             | 6          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/button.tsx`                               | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/button.tsx`        | 42             | 18         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/card.tsx`                                 | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/card.tsx`          | 35             | 8          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/chart.tsx`                                | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/chart.tsx`         | 177            | 16         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/checkbox.tsx`                             | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/checkbox.tsx`      | 35             | 13         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/code-viewer.tsx`                          | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ui/collapsible.tsx`                          | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/collapsible.tsx`   | 40             | 23         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/command.tsx`                              | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/command.tsx`       | 86             | 21         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/context-menu.tsx`                         | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/context-menu.tsx`  | 189            | 10         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/dialog.tsx`                               | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/dialog.tsx`        | 81             | 24         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/diff-viewer.tsx`                          | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ui/dropdown-menu.tsx`                        | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/dropdown-menu.tsx` | 122            | 20         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/flip-metric-value.tsx`                    | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ui/GlmMonochromeIcon.tsx`                    | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ui/highlighted-lightweight-diff-preview.tsx` | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ui/hover-card.tsx`                           | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/hover-card.tsx`    | 20             | 4          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/input-group.tsx`                          | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/input-group.tsx`   | 65             | 16         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/input.tsx`                                | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/input.tsx`         | 29             | 22         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/kbd.tsx`                                  | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/kbd.tsx`           | 16             | 2          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/label.tsx`                                | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/base/ui/label.tsx`          | 9              | 2          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/lightweight-diff-preview.tsx`             | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ui/pdf-viewer.tsx`                           | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ui/popover.tsx`                              | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/popover.tsx`       | 36             | 8          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/pptx-preview-viewer.tsx`                  | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ui/pptx-selection-action-bar.tsx`            | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ui/progress.tsx`                             | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/progress.tsx`      | 44             | 28         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/README.md`                                | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ui/resizable.tsx`                            | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/resizable.tsx`     | 104            | 45         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/scroll-area.tsx`                          | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/scroll-area.tsx`   | 24             | 9          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/scroll-fade-viewport.tsx`                 | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/components/ui/select.tsx`                               | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/select.tsx`        | 150            | 59         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/separator.tsx`                            | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/separator.tsx`     | 6              | 0          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/spinner.tsx`                              | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/spinner.tsx`       | 7              | 3          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/switch.tsx`                               | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/switch.tsx`        | 12             | 2          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/tabs.tsx`                                 | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/radix/ui/tabs.tsx`          | 32             | 9          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/textarea.tsx`                             | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/textarea.tsx`      | 11             | 5          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/toast.tsx`                                | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/bases/base/ui/toast.tsx`          | 322            | 101        | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/tooltip.tsx`                              | shadcn-ui/ui | `a87a63b2` | `apps/v4/registry/new-york-v4/ui/tooltip.tsx`       | 21             | 4          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/ui/src/components/ui/usePdfZoomOverlay.ts`                     | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/ui/src/styles.css`                                             | shadcn-ui/ui | `a87a63b2` | —                                                   | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |

### packages-02

计划书：`packages` · provider-node/src、rpc/examples、rpc/src。

共 **20** 个文件：换回原版再按合同实现 **13**、视同 ZCode 代码重写 **7**。

| 文件                                               | 上游仓库         | 固定提交   | 上游路径                                                   | 规范化差异行数 | 实质差异行 | 结论       | 本包要做的事                                       |
| -------------------------------------------------- | ---------------- | ---------- | ---------------------------------------------------------- | -------------- | ---------- | ---------- | -------------------------------------------------- |
| `packages/rpc/examples/01-basic-ipc.ts`            | microsoft/vscode | `44825207` | —                                                          | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/rpc/examples/02-proxy-channel.ts`        | microsoft/vscode | `44825207` | —                                                          | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/rpc/examples/03-ipc-server-client.ts`    | microsoft/vscode | `44825207` | —                                                          | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/rpc/examples/04-remote-connection.ts`    | microsoft/vscode | `44825207` | —                                                          | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/rpc/src/buffer.ts`                       | microsoft/vscode | `44825207` | `src/vs/base/common/buffer.ts`                             | 362            | 27         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/rpc/src/channelClient.ts`                | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 993            | 105        | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/rpc/src/channels.shared.ts`              | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 926            | 30         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/rpc/src/channels.ts`                     | microsoft/vscode | `44825207` | —                                                          | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/rpc/src/channelServer.ts`                | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 1000           | 109        | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/rpc/src/delayedChannel.ts`               | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 909            | 5          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/rpc/src/foundation.ts`                   | microsoft/vscode | `44825207` | `src/vs/base/common/event.ts`                              | 1501           | 83         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/rpc/src/index.ts`                        | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 938            | 0          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/rpc/src/ipc.ts`                          | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 960            | 86         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/rpc/src/logging-middleware.ts`           | microsoft/vscode | `44825207` | —                                                          | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/rpc/src/network-telemetry-middleware.ts` | microsoft/vscode | `44825207` | —                                                          | —              | —          | 无上游     | 视同 ZCode 代码，随替换包重写                      |
| `packages/rpc/src/persistent-protocol.ts`          | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.net.ts`                  | 996            | 137        | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/rpc/src/protocol.ts`                     | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.net.ts`                  | 1002           | 152        | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/rpc/src/proxy-channel.ts`                | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 979            | 69         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/rpc/src/remote.ts`                       | microsoft/vscode | `44825207` | `src/vs/platform/remote/common/remoteAuthorityResolver.ts` | 207            | 99         | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |
| `packages/rpc/src/serialization.ts`                | microsoft/vscode | `44825207` | `src/vs/base/parts/ipc/common/ipc.ts`                      | 1023           | 110        | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |

### shared-01

计划书：`packages/shared/src` · node、protocol-v4。

共 **1** 个文件：换回原版再按合同实现 **0**、视同 ZCode 代码重写 **1**。

| 文件                                            | 上游仓库         | 固定提交   | 上游路径 | 规范化差异行数 | 实质差异行 | 结论   | 本包要做的事                  |
| ----------------------------------------------- | ---------------- | ---------- | -------- | -------------- | ---------- | ------ | ----------------------------- |
| `packages/shared/src/protocol-v4/wire-codec.ts` | microsoft/vscode | `44825207` | —        | —              | —          | 无上游 | 视同 ZCode 代码，随替换包重写 |

### core-tool-handlers-01

计划书：`apps/cli/packages/core/src/tool/handlers`（继承 148 文件，选包时必须重切）。

共 **1** 个文件：换回原版再按合同实现 **1**、视同 ZCode 代码重写 **0**。

| 文件                                                                          | 上游仓库             | 固定提交   | 上游路径 | 规范化差异行数 | 实质差异行 | 结论       | 本包要做的事                                       |
| ----------------------------------------------------------------------------- | -------------------- | ---------- | -------- | -------------- | ---------- | ---------- | -------------------------------------------------- |
| `apps/cli/packages/core/src/tool/handlers/generated/bash-command-registry.ts` | withfig/autocomplete | `aef52acf` | —        | —              | —          | ZCode 改过 | 换回原版再按合同实现（`specs/contracts/<包 ID>/`） |

### 未单列，选包时按依赖重切

桌面渲染层静态资产；分包总表没有 material-icons 行，随桌面包或 Web 包处理。

共 **8** 个文件：换回原版再按合同实现 **0**、视同 ZCode 代码重写 **8**。

| 文件                                                             | 上游仓库                                       | 固定提交   | 上游路径 | 规范化差异行数 | 实质差异行 | 结论   | 本包要做的事                  |
| ---------------------------------------------------------------- | ---------------------------------------------- | ---------- | -------- | -------------- | ---------- | ------ | ----------------------------- |
| `packages/desktop/src/renderer/public/material-icons/docx.svg`   | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | 无上游 | 视同 ZCode 代码，随替换包重写 |
| `packages/desktop/src/renderer/public/material-icons/folder.svg` | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | 无上游 | 视同 ZCode 代码，随替换包重写 |
| `packages/desktop/src/renderer/public/material-icons/pptx.svg`   | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | 无上游 | 视同 ZCode 代码，随替换包重写 |
| `packages/desktop/src/renderer/public/material-icons/xlsx.svg`   | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | 无上游 | 视同 ZCode 代码，随替换包重写 |
| `packages/web/public/material-icons/docx.svg`                    | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | 无上游 | 视同 ZCode 代码，随替换包重写 |
| `packages/web/public/material-icons/folder.svg`                  | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | 无上游 | 视同 ZCode 代码，随替换包重写 |
| `packages/web/public/material-icons/pptx.svg`                    | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | 无上游 | 视同 ZCode 代码，随替换包重写 |
| `packages/web/public/material-icons/xlsx.svg`                    | material-extensions/vscode-material-icon-theme | `cb1dfb6d` | —        | —              | —          | 无上游 | 视同 ZCode 代码，随替换包重写 |

### 清单核对

| 目标包                   | 换回原版再按合同实现 | 视同 ZCode 代码重写 | 合计    |
| ------------------------ | -------------------- | ------------------- | ------- |
| ui-components-01         | 31                   | 14                  | 45      |
| ui-components-02         | 32                   | 14                  | 46      |
| packages-02              | 13                   | 7                   | 20      |
| shared-01                | 0                    | 1                   | 1       |
| core-tool-handlers-01    | 1                    | 0                   | 1       |
| 未单列，选包时按依赖重切 | 0                    | 8                   | 8       |
| **合计**                 | **77**               | **44**              | **121** |

与比对表一致：ZCode 改过 77、无上游 44、合计 121 个文件全部落进上表，无遗漏。

### 相邻文件（不属本清单，但选包时会遇到）

- `apps/cli/scripts/generate-bash-command-registry.mjs`（生成器）属 `apps-cli-01`；它生成的 `apps/cli/packages/core/src/tool/handlers/generated/bash-command-registry.ts` 属 `core-tool-handlers-01`，两者要一起处理，做法是按固定的 `@withfig/autocomplete@2.692.3` 重新生成，不手写数据表。
- `packages/desktop/src/renderer/public/material-icons` 与 `packages/web/public/material-icons` 里已登记 third-party 的 2284 个图标不进本清单（它们逐字节一致）；只有上表那 8 个需要重写或换成 Knorvia 自制资产。
- `tool/handlers` 继承 148 个文件，**超过单包 60 文件上限**，选包时必须重切（`core-tool-handlers-01/02` 两行不够）。

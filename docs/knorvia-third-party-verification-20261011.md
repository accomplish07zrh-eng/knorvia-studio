<!-- SPDX-License-Identifier: Apache-2.0 -->

# 第三方来源逐文件比对表（M0-6）

2026-10-11。对应《Knorvia 独立替换任务计划书》M0-6 与「第三方核实的做法」。

## 1. 方法

- 比较对象取自 `third-party/inventory.json` 的 `copied` 组件；上游版本用清单已固定的 `referenceRevision`。
- 上游树按固定提交取回：`git/trees/<sha>?recursive=1` 列树，再按每个文件的规范化内容与同名上游文件比较。
- 规范化：去 BOM、CRLF 归一为 LF、去行尾空白、丢空行；差异行数用多重集合差（两侧各自未配对的规范化行数）。
- 候选限定在该组件的规范上游目录（shadcn registry、ai-elements 组件包、VS Code IPC/remote 目录）；同名但位于无关目录的匹配不计为上游对应。
- `.agents/skills/ai-elements` 下的条目属 M0-4 删除范围，不在本表。

## 2. 固定版本

| 组件                                        | 上游仓库             | 固定提交                                   | 许可       |
| ------------------------------------------- | -------------------- | ------------------------------------------ | ---------- |
| shadcn                                      | shadcn-ui/ui         | `a87a63b2ca25143d26c8bd0903e4e9bc77b3f824` | MIT        |
| ai-elements                                 | vercel/ai-elements   | `6a9d5b1822ffb10bba4bd97175f01edd7d8651cd` | Apache-2.0 |
| Visual Studio Code IPC and common utilities | microsoft/vscode     | `44825207bf4389c3bd17c92d3ec28cf784c324cc` | MIT        |
| Fig autocomplete registry                   | withfig/autocomplete | `aef52acff84c45edde61ae610cc2c964802b9a38` | MIT        |

## shadcn

上游：`shadcn-ui/ui@a87a63b2ca25143d26c8bd0903e4e9bc77b3f824`。每个文件的上游地址是 `https://raw.githubusercontent.com/shadcn-ui/ui/a87a63b2ca25143d26c8bd0903e4e9bc77b3f824/<上游路径>`。

| 文件                                                                     | 上游路径                                            | 规范化差异行数 | 结论       | 处理                                                                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------- | -------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/components/ui/AboutLogo.tsx`                            | —                                                   | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-02`                                                                       |
| `packages/ui/src/components/ui/accordion.tsx`                            | `apps/v4/registry/new-york-v4/ui/accordion.tsx`     | 55             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/alert-dialog.tsx`                         | `apps/v4/registry/bases/base/ui/alert-dialog.tsx`   | 118            | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/alert.tsx`                                | `apps/v4/registry/new-york-v4/ui/alert.tsx`         | 48             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/avatar.tsx`                               | `apps/v4/registry/new-york-v4/ui/avatar.tsx`        | 60             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/badge.tsx`                                | `apps/v4/registry/new-york-v4/ui/badge.tsx`         | 36             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/button-group.tsx`                         | `apps/v4/registry/new-york-v4/ui/button-group.tsx`  | 43             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/button.tsx`                               | `apps/v4/registry/new-york-v4/ui/button.tsx`        | 54             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/card.tsx`                                 | `apps/v4/registry/bases/radix/ui/card.tsx`          | 53             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/chart.tsx`                                | `apps/v4/registry/new-york-v4/ui/chart.tsx`         | 211            | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/checkbox.tsx`                             | `apps/v4/registry/new-york-v4/ui/checkbox.tsx`      | 44             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/code-viewer.tsx`                          | —                                                   | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-02`；同名文件位于无关目录，不视为上游对应                                 |
| `packages/ui/src/components/ui/collapsible.tsx`                          | `apps/v4/registry/new-york-v4/ui/collapsible.tsx`   | 48             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/command.tsx`                              | `apps/v4/registry/bases/radix/ui/command.tsx`       | 127            | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/context-menu.tsx`                         | `apps/v4/registry/new-york-v4/ui/context-menu.tsx`  | 176            | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/dialog.tsx`                               | `apps/v4/registry/bases/radix/ui/dialog.tsx`        | 107            | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/diff-viewer.tsx`                          | —                                                   | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-02`                                                                       |
| `packages/ui/src/components/ui/dropdown-menu.tsx`                        | `apps/v4/registry/new-york-v4/ui/dropdown-menu.tsx` | 145            | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/flip-metric-value.tsx`                    | —                                                   | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-02`                                                                       |
| `packages/ui/src/components/ui/GlmMonochromeIcon.tsx`                    | —                                                   | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-02`                                                                       |
| `packages/ui/src/components/ui/highlighted-lightweight-diff-preview.tsx` | —                                                   | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-02`                                                                       |
| `packages/ui/src/components/ui/hover-card.tsx`                           | `apps/v4/registry/new-york-v4/ui/hover-card.tsx`    | 29             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/input-group.tsx`                          | `apps/v4/registry/bases/radix/ui/input-group.tsx`   | 88             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/input.tsx`                                | `apps/v4/registry/bases/radix/ui/input.tsx`         | 42             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/kbd.tsx`                                  | `apps/v4/registry/new-york-v4/ui/kbd.tsx`           | 22             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/label.tsx`                                | `apps/v4/registry/bases/base/ui/label.tsx`          | 15             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/lightweight-diff-preview.tsx`             | —                                                   | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-02`                                                                       |
| `packages/ui/src/components/ui/pdf-viewer.tsx`                           | —                                                   | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-02`                                                                       |
| `packages/ui/src/components/ui/popover.tsx`                              | `apps/v4/registry/new-york-v4/ui/popover.tsx`       | 50             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/pptx-preview-viewer.tsx`                  | —                                                   | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-02`                                                                       |
| `packages/ui/src/components/ui/pptx-selection-action-bar.tsx`            | —                                                   | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-02`                                                                       |
| `packages/ui/src/components/ui/progress.tsx`                             | `apps/v4/registry/new-york-v4/ui/progress.tsx`      | 59             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/README.md`                                | `apps/v4/registry/README.md`                        | 155            | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/resizable.tsx`                            | `apps/v4/registry/bases/radix/ui/resizable.tsx`     | 120            | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/scroll-area.tsx`                          | `apps/v4/registry/bases/radix/ui/scroll-area.tsx`   | 33             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/scroll-fade-viewport.tsx`                 | —                                                   | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-02`                                                                       |
| `packages/ui/src/components/ui/select.tsx`                               | `apps/v4/registry/new-york-v4/ui/select.tsx`        | 193            | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/separator.tsx`                            | `apps/v4/registry/bases/radix/ui/separator.tsx`     | 14             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/spinner.tsx`                              | `apps/v4/registry/new-york-v4/ui/spinner.tsx`       | 14             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/switch.tsx`                               | `apps/v4/registry/bases/radix/ui/switch.tsx`        | 19             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/tabs.tsx`                                 | `apps/v4/registry/bases/base/ui/tabs.tsx`           | 51             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/textarea.tsx`                             | `apps/v4/registry/new-york-v4/ui/textarea.tsx`      | 34             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/toast.tsx`                                | `apps/v4/registry/bases/base/ui/toast.tsx`          | 375            | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/tooltip.tsx`                              | `apps/v4/registry/new-york-v4/ui/tooltip.tsx`       | 31             | ZCode 改过 | ZCode 改过，分到 `ui-components-02`                                                                                    |
| `packages/ui/src/components/ui/usePdfZoomOverlay.ts`                     | —                                                   | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-02`                                                                       |
| `packages/ui/src/styles.css`                                             | —                                                   | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-06`；固定版本无对应整体源文件（最接近的 apps/v4/app/globals.css 规范化差异 2831 行） |

## ai-elements

上游：`vercel/ai-elements@6a9d5b1822ffb10bba4bd97175f01edd7d8651cd`。每个文件的上游地址是 `https://raw.githubusercontent.com/vercel/ai-elements/6a9d5b1822ffb10bba4bd97175f01edd7d8651cd/<上游路径>`。

| 文件                                                                 | 上游路径                                 | 规范化差异行数 | 结论       | 处理                                             |
| -------------------------------------------------------------------- | ---------------------------------------- | -------------- | ---------- | ------------------------------------------------ |
| `packages/ui/src/components/ai-elements/agent.tsx`                   | `packages/elements/src/agent.tsx`        | 129            | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/artifact.tsx`                | `packages/elements/src/artifact.tsx`     | 61             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/attachments.tsx`             | `packages/elements/src/attachments.tsx`  | 252            | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/canvas.tsx`                  | `packages/elements/src/canvas.tsx`       | 0              | 一致       | 登记 third-party                                 |
| `packages/ui/src/components/ai-elements/chat-loading.tsx`            | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/checkpoint.tsx`              | `packages/elements/src/checkpoint.tsx`   | 39             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/code-block.tsx`              | `packages/elements/src/code-block.tsx`   | 660            | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/commit.tsx`                  | `packages/elements/src/commit.tsx`       | 196            | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/confirmation.tsx`            | `packages/elements/src/confirmation.tsx` | 61             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/connection.tsx`              | `packages/elements/src/connection.tsx`   | 22             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/context.tsx`                 | `packages/elements/src/context.tsx`      | 230            | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/controls.tsx`                | `packages/elements/src/controls.tsx`     | 10             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/conversation.tsx`            | `packages/elements/src/conversation.tsx` | 62             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/diagram-preview-dialog.tsx`  | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/edge.tsx`                    | `packages/elements/src/edge.tsx`         | 23             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/image-preview-dialog.tsx`    | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/image-thumbnail-gallery.tsx` | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/image.tsx`                   | `packages/elements/src/image.tsx`        | 20             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/markdown-blockquote.tsx`     | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/markdown-image.tsx`          | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/markdown-list.tsx`           | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/markdown-table.tsx`          | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/mermaid-block.tsx`           | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/message.tsx`                 | `packages/elements/src/message.tsx`      | 1389           | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/node.tsx`                    | `packages/elements/src/node.tsx`         | 24             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/panel.tsx`                   | `packages/elements/src/panel.tsx`        | 13             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/persona.tsx`                 | `packages/elements/src/persona.tsx`      | 105            | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/plan.tsx`                    | `packages/elements/src/plan.tsx`         | 49             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/prompt-input-actions.tsx`    | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/prompt-input-buttons.tsx`    | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/prompt-input-primitives.tsx` | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/prompt-input-textarea.tsx`   | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/prompt-input.tsx`            | `packages/elements/src/prompt-input.tsx` | 743            | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/queue.tsx`                   | `packages/elements/src/queue.tsx`        | 156            | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/reasoning.tsx`               | `packages/elements/src/reasoning.tsx`    | 496            | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/sandbox.tsx`                 | `packages/elements/src/sandbox.tsx`      | 80             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/shimmer.tsx`                 | `packages/elements/src/shimmer.tsx`      | 24             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/snippet.tsx`                 | `packages/elements/src/snippet.tsx`      | 38             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/sources.tsx`                 | `packages/elements/src/sources.tsx`      | 46             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/streamdown-controls.ts`      | —                                        | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `ui-components-01` |
| `packages/ui/src/components/ai-elements/suggestion.tsx`              | `packages/elements/src/suggestion.tsx`   | 25             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/task.tsx`                    | `packages/elements/src/task.tsx`         | 61             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/terminal.tsx`                | `packages/elements/src/terminal.tsx`     | 81             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/test-results.tsx`            | `packages/elements/src/test-results.tsx` | 193            | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/tool.tsx`                    | `packages/elements/src/tool.tsx`         | 73             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |
| `packages/ui/src/components/ai-elements/toolbar.tsx`                 | `packages/elements/src/toolbar.tsx`      | 13             | ZCode 改过 | ZCode 改过，分到 `ui-components-01`              |

## Visual Studio Code IPC and common utilities

上游：`microsoft/vscode@44825207bf4389c3bd17c92d3ec28cf784c324cc`。每个文件的上游地址是 `https://raw.githubusercontent.com/microsoft/vscode/44825207bf4389c3bd17c92d3ec28cf784c324cc/<上游路径>`。

| 文件                                               | 上游路径                                  | 规范化差异行数 | 结论       | 处理                                                                              |
| -------------------------------------------------- | ----------------------------------------- | -------------- | ---------- | --------------------------------------------------------------------------------- |
| `packages/rpc/examples/01-basic-ipc.ts`            | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/examples/02-proxy-channel.ts`        | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/examples/03-ipc-server-client.ts`    | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/examples/04-remote-connection.ts`    | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/src/buffer.ts`                       | `src/vs/base/common/buffer.ts`            | 475            | ZCode 改过 | ZCode 改过，分到 `packages-02`                                                    |
| `packages/rpc/src/channelClient.ts`                | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/src/channels.shared.ts`              | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/src/channels.ts`                     | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/src/channelServer.ts`                | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/src/delayedChannel.ts`               | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/src/foundation.ts`                   | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/src/index.ts`                        | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`；同名文件位于无关目录，不视为上游对应 |
| `packages/rpc/src/ipc.ts`                          | `src/vs/base/parts/ipc/common/ipc.ts`     | 1320           | ZCode 改过 | ZCode 改过，分到 `packages-02`                                                    |
| `packages/rpc/src/logging-middleware.ts`           | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/src/network-telemetry-middleware.ts` | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/src/persistent-protocol.ts`          | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/src/protocol.ts`                     | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`；同名文件位于无关目录，不视为上游对应 |
| `packages/rpc/src/proxy-channel.ts`                | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/rpc/src/remote.ts`                       | `src/vs/platform/remote/common/remote.ts` | 163            | ZCode 改过 | ZCode 改过，分到 `packages-02`                                                    |
| `packages/rpc/src/serialization.ts`                | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `packages-02`                                       |
| `packages/shared/src/protocol-v4/wire-codec.ts`    | —                                         | —              | 无上游     | 无上游，视同 ZCode 代码，并入 `shared-01`                                         |

## Fig autocomplete registry

上游：`withfig/autocomplete@aef52acff84c45edde61ae610cc2c964802b9a38`。每个文件的上游地址是 `https://raw.githubusercontent.com/withfig/autocomplete/aef52acff84c45edde61ae610cc2c964802b9a38/<上游路径>`。

| 文件                                                                          | 上游路径 | 规范化差异行数 | 结论   | 处理                                                  |
| ----------------------------------------------------------------------------- | -------- | -------------- | ------ | ----------------------------------------------------- |
| `apps/cli/packages/core/src/tool/handlers/generated/bash-command-registry.ts` | —        | —              | 无上游 | 无上游，视同 ZCode 代码，并入 `core-tool-handlers-01` |

## Material Icon Theme

`third-party/inventory.json` 的 Material Icon Theme 组件共 2292 个资产副本（桌面与 Web 各一套），条目多、体量大，按既有逐项证据汇总，不逐行重复列 2292 行。

- 1806 个副本与固定版本 `cb1dfb6d9cb73b15681a93939983d75dbba7bf5b` 的 `icons/<同名>` 内容按 SHA-256 完全一致，结论**一致**，维持 third-party 登记。
- 2 个 `agent.svg`（桌面、Web 各一）同名源存在但字节不同，结论 **ZCode 改过**：该名称不属于发布者固定版本的既有图标集，按项目自有资产随替换包处理，不再沿用发布者许可。
- 8 个副本（4 个名字，桌面与 Web 各一）在固定版本中没有同名源：`docx.svg`、`folder.svg`、`pptx.svg`、`xlsx.svg`，结论 **无上游**。这就是计划书 M0-6 记的 material-icons 8。
- 其余 476 个副本（238 个 `folder-*-open*` 变体名，桌面与 Web 各一）同样没有同名源：发布者固定版本的开放文件夹用 16x16 与特定 id 生成，当前变体是 32x32，结论 **无上游**。
- 逐项证据（每个副本的当前摘要、固定上游路径与关系）在 `licensing/evidence/third-party-reconciliation-20260930.json`。

## 3. 汇总

| 结论                                  | 文件数 |
| ------------------------------------- | ------ |
| 一致（third-party）                   | 1      |
| ZCode 改过（并入对应替换包）          | 67     |
| 无上游（视同 ZCode 代码，并入替换包） | 46     |
| 合计（不含 material-icons 逐项）      | 114    |

分组件：shadcn 46、ai-elements 46、VS Code IPC 与公共工具 21、Fig 命令注册表 1，共 114 个文件。计划书 M0-6 的 shadcn 45 与 material-icons 8 是约数；本表按 `third-party/inventory.json` 的登记范围取实际条目。

## 4. 与计划书处理的对应

- 结论「一致」：`third-party/inventory.json` 已按固定来源登记为 copied 组件，本表补充逐文件规范化比对结果，不新增登记。
- 结论「ZCode 改过」：进入对应替换包（shadcn → `ui-components-02`，ai-elements → `ui-components-01`，VS Code RPC → `packages-02`）。到包时先回到上游原版，产品需要的差异写进合同，在原版之上重新实现；最终登记 third-party 并写明 Knorvia 的修改。
- 结论「无上游」：视同 ZCode 代码，并入对应替换包按合同重写。
- `packages/ui/src/styles.css` 与 486 项 Material 图标（2 项改过、484 项无上游）同属替换或另行取证的队列：前者随 `ui-06`，后者随桌面与 Web 资产处理。处理路径沿用 `docs/knorvia-third-party-reconciliation-acceptance.md`：取得实际导入版本、生成输入/配置或修改授权，或独立绘制视觉等价资产并在桌面/Web 明暗主题下做几何验收后替换；材料门仍按该文档的保留结论列出，不因本表放宽。

## 5. 未覆盖的内容

- Material Icon Theme 的 2292 个副本未在本表逐行展开，按既有逐项证据汇总；其材料门（486 项）保持不变。
- shadcn 只与清单固定的 `a87a63b2` 比较；计划书要求的「ZCode 引入时间前后多提交择优」未重跑，固定版本沿用既有来源登记的结论。
- 本表是来源核实记录，不改产品代码、不改许可正文、不新增或删除第三方登记。

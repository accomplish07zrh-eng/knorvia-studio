// SPDX-License-Identifier: Apache-2.0
// 内容块 → 文本：把模型消息内容摊平成可读文本（含附件占位）。
// 组织方式：每种块类型在 BLOCK_TEXT_RENDERERS 里登记一个渲染器，主函数只查表调用；
// 附件占位统一走 attachmentPlaceholder。
// 本文件由 model/index.ts 的运行时声明拆出；模型面类型仍从 ./index.js 导出。

import type { ModelMessageContent, ModelMessageContentBlock } from "./index.js";

/** 附件占位的前缀：所有附件类块共用同一个词。 */
const ATTACHMENT_PREFIX = "Attached";

type BlockType = ModelMessageContentBlock["type"];

/** 附件类块的渲染：有名字就带上名字，否则只报媒体类型。 */
function renderAttachmentBlock(
  block: Extract<ModelMessageContentBlock, { mediaType: string }>,
  name?: string,
): string {
  return attachmentPlaceholder(ATTACHMENT_PREFIX, block.mediaType, name);
}

/** 每种内容块的文本化方式；reasoning 只用于模型侧推理，不进可读文本。 */
const BLOCK_TEXT_RENDERERS: {
  [Type in BlockType]: (block: Extract<ModelMessageContentBlock, { type: Type }>) => string;
} = {
  text: (block) => block.text,
  reasoning: () => "",
  image: (block) => renderAttachmentBlock(block, block.source?.placeholder),
  video: (block) => renderAttachmentBlock(block, block.source?.placeholder),
  file: (block) => {
    const extracted = block.text;
    if (extracted !== undefined && extracted.length > 0) return extracted;
    return renderAttachmentBlock(block, block.name ?? block.source?.placeholder);
  },
  resource_link: (block) => `[Resource: ${block.title ?? block.name ?? block.uri}]`,
};

/** 单块的文本化：查表后按块类型调用对应渲染器。 */
export function modelMessageContentBlockToText(block: ModelMessageContentBlock): string {
  const render = BLOCK_TEXT_RENDERERS[block.type] as (value: ModelMessageContentBlock) => string;
  return render(block);
}

/** 整条内容 → 文本：字符串原样返回，块数组逐块渲染后用空行拼接（空块不占位）。 */
export function modelMessageContentToText(content: ModelMessageContent): string {
  if (typeof content === "string") return content;
  const rendered = content.map((block) => modelMessageContentBlockToText(block));
  return rendered.filter((text) => text !== "").join("\n\n");
}

/** 附件占位文案：`[Attached <mediaType>]`，有名字时写成 `[Attached <mediaType>: <name>]`。 */
export function attachmentPlaceholder(prefix: string, mediaType: string, name?: string): string {
  const hasName = name !== undefined && name.length > 0;
  return hasName ? `[${prefix} ${mediaType}: ${name}]` : `[${prefix} ${mediaType}]`;
}

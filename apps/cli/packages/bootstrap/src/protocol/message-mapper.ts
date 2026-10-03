import type { MessagePart, MessageWithParts } from "@knorvia/contracts";
import type { KnorviaMessageWithParts } from "@knorvia/shared";
import { shouldHideInvalidToolCallFromProduct } from "../tool-call-product-visibility.js";
import { projectMessageInfo } from "./message-info-projection.js";
import { projectMessagePart } from "./message-part-projection.js";

export function mapMessageWithParts(message: MessageWithParts): KnorviaMessageWithParts {
  const info = projectMessageInfo(message.info);
  const visible: MessagePart[] = [];
  // 完整选择必须先于字段投影：隐藏工具不读 id/state，后续 visibility 错误先于投影错误。
  message.parts.forEach((part) => {
    if (part.type === "tool" && shouldHideInvalidToolCallFromProduct(part.tool, part.metadata)) return;
    visible.push(part);
  });
  return {
    info,
    // MessagePart 合同的十三种 tag 均已登记；未知非法 tag 保留旧 mapper 的 undefined 结果。
    parts: visible.map((part) => projectMessagePart(part)!),
  };
}

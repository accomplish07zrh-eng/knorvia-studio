// SPDX-License-Identifier: Apache-2.0
// 回合附件的事件摘要（B2）：给 TurnStarted 等会话事件提供轻量的「文件名 / mime / 体积 /
// 引用」列表。每个字段都有兜底推导，绝不抛异常；空输入（undefined 或 []）不产生摘要，
// 上层据此决定是否挂载 attachments 字段。本模块是纯计算，无日志、无端口。

import { basename } from "../../deps.js";
import type { TurnAttachment, TurnAttachmentMeta, TurnState } from "../../deps.js";
import { parseDataUrlHeader } from "./data-url-codec.js";
import { isDataOrArtifactUrl, inferAttachmentMimeFromPath } from "./fallback-blocks.js";
import { inferImageMimeFromPath } from "./image-preparation.js";

const URL_ATTACHMENT_MIME = "text/uri-list";
const FALLBACK_MIME = "application/octet-stream";

export function summarizeTurnAttachmentsForEvent(
  attachments: TurnState["attachments"],
): TurnAttachmentMeta[] | undefined {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }
  return attachments.map((attachment, position) => summarizeAttachment(attachment, position + 1));
}

/** 单条附件的摘要：展示信息（文件名/mime）优先用协议透传值，缺省时按路径与内容推断。 */
function summarizeAttachment(attachment: TurnAttachment, ordinal: number): TurnAttachmentMeta {
  const { content, path } = attachment;
  const fileName =
    attachment.filename ?? (path ? basename(path) : undefined) ?? `attachment-${ordinal}`;
  const inlineMime = content !== undefined ? parseDataUrlHeader(content)?.mediaType : undefined;
  const mime = attachment.mimeType ?? inlineMime ?? derivedMimeFor(attachment);
  const bytes =
    attachment.sizeBytes ?? (content !== undefined ? Buffer.byteLength(content, "utf8") : 0);
  const ref = eventRefFor(attachment);
  return ref === undefined ? { bytes, fileName, mime } : { bytes, fileName, mime, ref };
}

/** 无显式 mime 时的推导链：url 附件 → uri-list；有路径按扩展名；都没有 → 八位字节流兜底。 */
function derivedMimeFor(attachment: TurnAttachment): string {
  if (attachment.type === "url") {
    return URL_ATTACHMENT_MIME;
  }
  if (!attachment.path) {
    return FALLBACK_MIME;
  }
  return attachment.type === "image"
    ? inferImageMimeFromPath(attachment.path)
    : inferAttachmentMimeFromPath(attachment.path);
}

/** 事件里的引用字段：普通附件取路径（data/artifact URL 不外露）；url 附件取内容本身。 */
function eventRefFor(attachment: TurnAttachment): string | undefined {
  const { content, path } = attachment;
  if (path !== undefined && !isDataOrArtifactUrl(path)) {
    return path;
  }
  return attachment.type === "url" ? (content ?? path) : undefined;
}

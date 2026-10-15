// SPDX-License-Identifier: Apache-2.0
// 附件路径引用与扩展名判定的兼容面（B6）：实现见 ./attachments/fallback-blocks.js。
import * as blocks from "./attachments/fallback-blocks.js";

export const resolvedInlineTextAttachment = blocks.resolvedInlineTextAttachment;
export const resolvedPathReferenceAttachment = blocks.resolvedPathReferenceAttachment;
export const isDataOrArtifactUrl = blocks.isDataOrArtifactUrl;
export const isTextLikePath = blocks.isTextLikePath;
export const inferAttachmentMimeFromPath = blocks.inferAttachmentMimeFromPath;

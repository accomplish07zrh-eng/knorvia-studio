// SPDX-License-Identifier: Apache-2.0
// 附件产物读写的兼容面（B6）：实现见 ./attachments/artifact-content.js。
import * as content from "./attachments/artifact-content.js";

export const persistAttachmentDataUrl = content.persistAttachmentDataUrl;
export const readInlineAttachmentContent = content.readInlineAttachmentContent;
export const safeAttachmentOriginalRef = content.safeAttachmentOriginalRef;

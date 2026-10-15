// SPDX-License-Identifier: Apache-2.0
// 回合附件解析的兼容面（B1/B2）：实现已搬进 ./attachments/ 下的内部模块。
// 模块路径与导出名保持不变，调用方无需关心实现位置。
import * as resolver from "./attachments/turn-attachment-resolver.js";
import * as summary from "./attachments/turn-attachment-summary.js";

export const resolveTurnAttachments = resolver.resolveTurnAttachments;
export const summarizeTurnAttachmentsForEvent = summary.summarizeTurnAttachmentsForEvent;

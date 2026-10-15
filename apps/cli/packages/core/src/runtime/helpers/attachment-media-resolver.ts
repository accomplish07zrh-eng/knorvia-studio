// SPDX-License-Identifier: Apache-2.0
// 本地/内联媒体分派的兼容面（B7）：实现见 ./attachments/inline-media-readers.js 与
// ./attachments/local-media-readers.js。
import * as inline from "./attachments/inline-media-readers.js";
import * as local from "./attachments/local-media-readers.js";

export const resolveInlineMediaAttachment = inline.resolveInlineMediaAttachment;
export const resolveLocalMediaAttachment = local.resolveLocalMediaAttachment;

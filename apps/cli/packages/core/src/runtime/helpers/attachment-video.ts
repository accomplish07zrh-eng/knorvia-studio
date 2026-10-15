// SPDX-License-Identifier: Apache-2.0
// 视频内联解析的兼容面（B5）：实现见 ./attachments/document-codecs.js。
import * as documents from "./attachments/document-codecs.js";

export type VideoInputMimeType = documents.VideoInputMimeType;
export const inferVideoMimeFromPath = documents.inferVideoMimeFromPath;
export const parseInlineVideoDataUrl = documents.parseInlineVideoDataUrl;

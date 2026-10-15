// SPDX-License-Identifier: Apache-2.0
// PDF 内联解析的兼容面（B5）：实现见 ./attachments/document-codecs.js。
import * as documents from "./attachments/document-codecs.js";

export const PDF_INPUT_MAX_BYTES = documents.PDF_INPUT_MAX_BYTES;
export const parseInlinePdfDataUrl = documents.parseInlinePdfDataUrl;
export const isPdfBytes = documents.isPdfBytes;

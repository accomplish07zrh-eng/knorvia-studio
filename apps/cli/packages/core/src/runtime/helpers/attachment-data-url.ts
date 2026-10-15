// SPDX-License-Identifier: Apache-2.0
// data URL 编解码的兼容面（B3）：实现见 ./attachments/data-url-codec.js。
import * as codec from "./attachments/data-url-codec.js";

export const parseDataUrlHeader = codec.parseDataUrlHeader;
export const base64PayloadByteLength = codec.base64PayloadByteLength;
export const isStrictBase64Payload = codec.isStrictBase64Payload;

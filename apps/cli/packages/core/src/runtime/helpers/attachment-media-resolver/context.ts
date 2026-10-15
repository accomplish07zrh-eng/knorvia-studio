// SPDX-License-Identifier: Apache-2.0
// 媒体分派选项与上下文的类型兼容面（B7）。
import type * as inline from "../attachments/inline-media-readers.js";
import type * as local from "../attachments/local-media-readers.js";

export type InlineOptions = inline.InlineMediaOptions;
export type LocalOptions = local.LocalMediaOptions;
export type LocalMediaContext = local.LocalMediaContext;

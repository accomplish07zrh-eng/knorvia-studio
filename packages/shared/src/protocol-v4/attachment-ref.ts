// SPDX-License-Identifier: Apache-2.0
// 附件引用：只承载已提交内容的引用与展示元信息（B22），内容本体不进 command/topic frame。
// strict —— 未知键拒绝；bytes 是任意数值（含 0 与负数），仅作展示，不做非负校验。
import { z } from "zod";

export const attachmentRefSchema = z
  .object({
    ref: z.string(),
    fileName: z.string(),
    mime: z.string(),
    bytes: z.number(),
    previewRef: z.string().optional(),
  })
  .strict();

export type AttachmentRef = z.infer<typeof attachmentRefSchema>;

// SPDX-License-Identifier: Apache-2.0
// 共享上下文引用：命令里指向一份共享上下文导入的强类型指针（B21）。strict —— 未知键拒绝；
// context_id 先 trim 再要求非空，把「   abc   」解析成 "abc"。
import { z } from "zod";

export const sharedContextRefSchema = z
  .object({
    kind: z.literal("shared_context_import"),
    context_id: z.string().trim().min(1),
  })
  .strict();

export type SharedContextRef = z.infer<typeof sharedContextRefSchema>;

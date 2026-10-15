// SPDX-License-Identifier: Apache-2.0
// 稳定 fork 目标：V4 助手 fork 的固定 logical-turn 边界（B23）。boundaryMessageId 必须等于
// orderedMessageIds 的最后一项，否则拒绝（issue 落在 boundaryMessageId 上）。
import { z } from "zod";

export const stableForkTargetSchema = z
  .object({
    productTurnId: z.string().min(1),
    transcriptTurnId: z.string().min(1),
    orderedMessageIds: z.array(z.string().min(1)).min(1),
    boundaryMessageId: z.string().min(1),
  })
  .strict()
  .refine((target) => target.orderedMessageIds.at(-1) === target.boundaryMessageId, {
    message: "boundaryMessageId must be the final orderedMessageId",
    path: ["boundaryMessageId"],
  });

export type StableForkTarget = z.infer<typeof stableForkTargetSchema>;

/** fork 目标解析的成败两态；失败给出稳定 reasonCode（判定在调用方，本文件只定形状）。 */
export type StableForkTargetResolution =
  | { ok: true; target: StableForkTarget }
  | {
      ok: false;
      reasonCode:
        | "guard.forkAssistantOnly"
        | "guard.forkTargetNotStable"
        | "guard.forkTargetAmbiguous"
        | "guard.compactOperationLock";
    };

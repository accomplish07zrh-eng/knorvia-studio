// SPDX-License-Identifier: Apache-2.0
// 会话配置状态与模型切换事件的 schema（B25）。config 对象非 strict：未知键被剥离而不是报错；
// thoughtLevels / mode 带 default，用于兼容旧快照。
import { z } from "zod";
import { modelSelectionSchema } from "../model-selection.js";

export const sessionConfigStateSchema = z.object({
  /** Session 接受并持久化的稀疏选择意图；provider/model/thought 仅为 UI effective 投影。 */
  modelSelection: modelSelectionSchema.optional(),
  provider: z.string(),
  model: z.string(),
  thought: z.string(),
  /** 思考档位是当前模型的能力；default 仅兼容旧快照，新 agent 从 runtime 投影实际集合。 */
  thoughtLevels: z.array(z.string()).default([]),
  followupMode: z.enum(["queue", "guide"]),
  /** Agent 协作模式；带 default 才不破坏旧快照/旧发送端的解析，投影经事件更新。 */
  mode: z.string().default("build"),
  planEnabled: z.boolean().optional(),
  /** 明确审批结果；草稿按 interactionId 消费一次，普通 mode 更新不重置它。 */
  permissionGrant: z.object({ interactionId: z.string().min(1) }).optional(),
  /** 最近工具转换的关联，供草稿定向同步；不新增可见历史事件。 */
  planTransition: z
    .object({
      toolCallId: z.string(),
      planEnabled: z.boolean(),
    })
    .optional(),
});
export type SessionConfigState = z.infer<typeof sessionConfigStateSchema>;

/** 模型切换事件：origin 固定 registryFallback，from/to 各含 provider/model。 */
export const sessionModelTransitionSchema = z.object({
  eventId: z.string().min(1),
  origin: z.literal("registryFallback"),
  from: z.object({
    provider: z.string(),
    model: z.string(),
  }),
  to: z.object({
    provider: z.string(),
    model: z.string(),
  }),
});
export type SessionModelTransition = z.infer<typeof sessionModelTransitionSchema>;

// SPDX-License-Identifier: Apache-2.0
// 全量权限（yolo 模式）的授权回执：把一次已知结果的全量授权固化成持久化 receipt，
// 重试时以它为准复原事实。解析与一致性校验归本文件；写入、读取与重试判定归持久化侧实现。

// 组织方式：先给每个嵌套对象一张独立的字段表，再由 zod 统一组装；常量收尾。

// ── 章节：一 字段表与嵌套 schema · 二 对外校验器与常量

import { z } from "zod";

// ── 一、字段表与嵌套 schema ─────────────────────────────────────────

const permissionGrantFields = {
  interactionId: z.string().min(1),
  queueItemIds: z.array(z.string().min(1)),
};

const modeChangedFields = {
  mode: z.literal("yolo"),
  planEnabled: z.boolean(),
  previousMode: z.enum(["build", "edit", "yolo", "auto", "plan"]),
  previousPlanEnabled: z.boolean(),
  source: z.literal("command"),
};

const modeChangedEventFields = {
  id: z.string().min(1),
  sessionId: z.string().min(1),
  traceId: z.string().min(1),
  turnId: z.string().optional(),
  type: z.literal("session_mode_changed"),
  timestamp: z.coerce.date(),
  sequenceNumber: z.number().int().nonnegative(),
};

/** 授权范围：`interactionId` 指向这次授权，`queueItemIds` 列出被一并放行的排队条目。 */
const permissionGrantSchema = z.object(permissionGrantFields).strict();

/** 授权随附的模式变更 payload：记录新旧的模式与 plan 开关，以及授权范围本身。 */
const sessionModeChangedPayloadSchema = z
  .object({ ...modeChangedFields, permissionGrant: permissionGrantSchema })
  .strict();

/** 那次模式变更事件的外壳：身份、序号、时间戳与 payload 一个都不能少。 */
const sessionModeChangedEventSchema = z
  .object({
    ...modeChangedEventFields,
    payload: sessionModeChangedPayloadSchema,
  })
  .strict();

/** receipt 骨架：外层身份加事件本体，多余字段一律拒绝。 */
const receiptObjectSchema = z
  .object({ interactionId: z.string().min(1), event: sessionModeChangedEventSchema })
  .strict();

// ── 二、对外校验器与常量 ────────────────────────────────────────────

/** 持久化 receipt 的校验器，由持久化侧在重试时读取并解析。除了结构校验，还要求外层 `interactionId` 与事件里授权范围的 `interactionId` 一致：receipt 一旦损坏就必须拒绝重试，绝不能照当前队列重新放大授权范围。 */
export const permissionFullAccessReceiptSchema = receiptObjectSchema.refine(
  (receipt) => receipt.interactionId === receipt.event.payload.permissionGrant.interactionId,
  { message: "Permission grant identity mismatch" },
);

/** 全量权限授权在运行时登记的入口名，出现在事件来源与规则记录里，取值不可更改。 */
export const PERMISSION_FULL_ACCESS_ENTRY = "runtime/permission_full_access";

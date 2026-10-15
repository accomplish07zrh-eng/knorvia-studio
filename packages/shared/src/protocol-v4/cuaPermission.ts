// SPDX-License-Identifier: Apache-2.0
// CUA（Computer Use）macOS 权限状态与需求推导（B27）。状态 strict：schemaVersion 固定 1、
// platform 固定 darwin，枚举越界或未知键都拒绝。需求列表按固定顺序给出：accessibility 在前。
import { z } from "zod";
import type { CuaPermissionKind } from "../cuaAccessibilitySettings.js";
import { timestampSchema } from "./core.js";

export const cuaRequestAccessStatusSchema = z
  .object({
    schemaVersion: z.literal(1),
    platform: z.literal("darwin"),
    grantOwner: z.string().min(1),
    accessibility: z.enum(["granted", "stale", "denied"]),
    screenRecording: z.enum(["granted", "denied", "unknown"]),
  })
  .strict();
export type CuaRequestAccessStatus = z.infer<typeof cuaRequestAccessStatusSchema>;

// 由权限状态推导「还需要用户去授哪些权」。accessibility 只要不是 granted（stale 或 denied）
// 就要重授；screenRecording 只有 denied 才要重授（unknown 不要求）。顺序固定：accessibility 在前。
export const requiredCuaPermissionsForRequestAccessStatus = (
  status: CuaRequestAccessStatus,
): CuaPermissionKind[] => {
  const outstanding: CuaPermissionKind[] = [];
  if (status.accessibility !== "granted") outstanding.push("accessibility");
  if (status.screenRecording === "denied") outstanding.push("screen_recording");
  return outstanding;
};

/** 一次权限观察事件：把某个时刻的权限状态与会话/工具调用关联起来，strict。 */
export const cuaPermissionObservationSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().min(1),
    eventSeq: z.number().int().nonnegative(),
    occurredAt: timestampSchema,
    sessionId: z.string().min(1),
    turnId: z.string().min(1).optional(),
    toolCallId: z.string().min(1),
    permissionStatus: cuaRequestAccessStatusSchema,
  })
  .strict();
export type CuaPermissionObservation = z.infer<typeof cuaPermissionObservationSchema>;

// SPDX-License-Identifier: Apache-2.0
// 从原 permission-full-access.ts 保留的载荷投影，不计为本轮独立实现。
// 来源及边界见 specs/knorvia-full-access-storage.md；迁移未改变该部分许可。
const INTENT_FIELDS = ["intent", "conversationInputIntent"] as const;
const FULL_ACCESS_MODE = "yolo";

export function fullAccessPayload(encoded: string): Record<string, unknown> {
  const payload = JSON.parse(encoded) as Record<string, unknown>;
  for (const field of INTENT_FIELDS) {
    const value = payload[field];
    if (value && typeof value === "object" && !Array.isArray(value))
      payload[field] = { ...value, mode: FULL_ACCESS_MODE };
  }
  return payload;
}

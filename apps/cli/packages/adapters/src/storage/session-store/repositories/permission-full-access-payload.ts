// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { isJsonRecord, projectRecord } from "../record-projection.js";

const INTENT_FIELDS = ["intent", "conversationInputIntent"] as const;
const FULL_ACCESS_MODE = "yolo";

export function fullAccessPayload(encoded: string): Record<string, unknown> {
  const payload = JSON.parse(encoded) as Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  for (const key of INTENT_FIELDS) {
    // 直接访问保留根 null 的 TypeError；其他根值仍按原生 JSON 值返回。
    const intent = payload[key];
    if (isJsonRecord(intent)) {
      fields[key] = projectRecord(intent, [], { mode: FULL_ACCESS_MODE });
    }
  }
  return Object.keys(fields).length ? projectRecord(payload, [], fields) : payload;
}

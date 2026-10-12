// SPDX-License-Identifier: Apache-2.0
import { toLocalIsoDate } from "./local-date_core.js";

// 本地日历日：`YYYY-MM-DD`。月与日补零到两位，年按本地 getFullYear() 原样输出；
// 走本地时区字段而不是 UTC，调用方据此展示"今天"。
export function formatLocalIsoDate(date: Date): string {
  return toLocalIsoDate(date);
}

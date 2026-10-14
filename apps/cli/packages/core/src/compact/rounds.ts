// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 助手起轮分组的公开面：分组规则见 ./rounds-internal.js，本模块只适配位置参数。
import { groupAssistantStartedRounds } from "./rounds-internal.js";

export function groupByAssistantStartedRounds<T>(
  items: readonly T[],
  roleOf: (item: T) => string | undefined,
  assistantIdOf?: (item: T) => string | undefined,
): T[][] {
  return groupAssistantStartedRounds({ assistantIdOf, entries: items, roleOf });
}

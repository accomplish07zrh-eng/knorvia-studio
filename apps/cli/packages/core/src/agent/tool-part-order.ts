// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 工具 part 的历史选择：同一声明只取最后新建的那条记录。
import type { ToolPart } from "@knorvia/contracts";

// 提前失败或断流恢复会另建 part，所以同一个 callID 只保留最后一条；
// 声明序号齐全时按序号排序（只读工具可能先落盘），缺序号就整组保持原序。
// 入参数组不被改写，UI 与文件读取状态恢复仍用原始 parts。
export const selectToolPartsForHistory = (parts: ToolPart[]): ToolPart[] => {
  const lastSeen = new Map<string, ToolPart>();
  for (const candidate of parts) {
    lastSeen.set(candidate.callID, candidate);
  }
  const latest = parts.filter((part) => lastSeen.get(part.callID) === part);
  const orderUnknown = latest.some((part) => part.declarationIndex === undefined);
  if (orderUnknown) return latest;
  return latest.sort((left, right) => (left.declarationIndex ?? 0) - (right.declarationIndex ?? 0));
};

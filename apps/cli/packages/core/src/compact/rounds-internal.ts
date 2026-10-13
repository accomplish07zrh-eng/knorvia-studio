// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 助手起轮分组的实现模块：公开文件 ./rounds.js 只做参数适配，分组规则全部在这里。
/** 助手角色名：只有它可能开启新的一组。 */
const ASSISTANT_ROLE = "assistant";

/** 分组输入：条目列表、取角色与取助手 id 的两个读取器。 */
export interface AssistantRoundSource<T> {
  entries: readonly T[];
  roleOf: (entry: T) => string | undefined;
  assistantIdOf?: (entry: T) => string | undefined;
}

// 按「助手起轮」把条目切成若干组：换一个助手 id 就开新组，
// 同一助手 id 的连续条目留在同组；首个助手之前的内容自成一组。
export function groupAssistantStartedRounds<T>(source: AssistantRoundSource<T>): T[][] {
  const rounds: T[][] = [];
  let open: T[] = [];
  let previousAssistantId: string | undefined;

  const closeRound = (): void => {
    if (open.length > 0) rounds.push(open);
    open = [];
  };

  for (const entry of source.entries) {
    const role = source.roleOf(entry);
    if (role !== ASSISTANT_ROLE) {
      open.push(entry);
    } else {
      const assistantId = source.assistantIdOf?.(entry);
      const sameRound =
        open.length > 0 && assistantId !== undefined && assistantId === previousAssistantId;
      if (!sameRound) closeRound();
      open.push(entry);
      previousAssistantId = assistantId;
    }
  }

  closeRound();
  return rounds;
}

// SPDX-License-Identifier: Apache-2.0
// Knorvia 工作流引擎：ask 节点执行观察与进度追踪类型定义。
// 涵盖驱动层回传的 token / turn 消耗统计以及当前正在调用的工具快照。

// ask 节点执行用量统计
export interface AskStats {
  tokens: number;
  toolCalls: number;
  turns: number;
  worldToolCalls?: number;
}

// 节点入队事件中截取的提示词头部最大长度
export const INSTRUCTIONS_HEAD_MAX_CHARS = 240;

// 工具观察事件中工具名称的最大字符数
export const LAST_TOOL_NAME_MAX_CHARS = 64;

// 工具观察事件中目标摘要（如路径或命令片段）的最大字符数
export const LAST_TOOL_TARGET_MAX_CHARS = 120;

// 最近一次捕获到的工具调用概要
export interface AskLastTool {
  name: string;
  target?: string;
}

// ask 节点在单个 turn 结算时的实时进度
export interface AskProgress {
  turn: number;
  toolCalls: number;
  lastTool?: AskLastTool;
}

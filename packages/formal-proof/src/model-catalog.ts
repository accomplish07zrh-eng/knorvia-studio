import type { Candidate, ModelProfile } from "./model-types.js";

export const profiles: ModelProfile[] = [
  {
    id: "running",
    label: "running：消息发送中",
    context: {
      runPhase: "running",
      queue: "empty",
      compactMemory: "compactable",
      canCompactAgain: true,
      goal: "active",
      selectedTurn: "latest",
      forked: false,
    },
  },
  {
    id: "completed",
    label: "completed：消息已完成",
    context: {
      runPhase: "completed",
      queue: "empty",
      compactMemory: "compactable",
      canCompactAgain: true,
      goal: "active",
      selectedTurn: "latest",
      forked: false,
    },
  },
  {
    id: "goal-verifying",
    label: "goalVerifying：goal 验证中",
    context: {
      runPhase: "goalVerifying",
      queue: "empty",
      compactMemory: "compactable",
      canCompactAgain: true,
      goal: "verifying",
      selectedTurn: "latest",
      forked: false,
    },
  },
  {
    id: "compacting",
    label: "compacting：正在 compact",
    context: {
      runPhase: "compacting",
      queue: "empty",
      compactMemory: "compactable",
      canCompactAgain: true,
      goal: "active",
      selectedTurn: "latest",
      forked: false,
    },
  },
  {
    id: "just-compacted-noop",
    label: "justCompacted：刚压缩完，不需要继续压缩",
    context: {
      runPhase: "completed",
      queue: "empty",
      compactMemory: "justCompacted",
      canCompactAgain: false,
      goal: "active",
      selectedTurn: "latest",
      forked: false,
    },
  },
  {
    id: "just-compacted-more",
    label: "justCompacted：刚压缩完，但还能继续压缩",
    context: {
      runPhase: "completed",
      queue: "empty",
      compactMemory: "justCompacted",
      canCompactAgain: true,
      goal: "active",
      selectedTurn: "latest",
      forked: false,
    },
  },
];

export const userCandidates: Candidate[] = [
  { id: "sendText", kind: "user", label: "继续发送文字", target: "none", surface: "composer" },
  { id: "slashCompact", kind: "user", label: "输入 /compact", target: "none", surface: "composer" },
  { id: "setGoal", kind: "user", label: "设置 goal", target: "none", surface: "goal control" },
  { id: "compact", kind: "user", label: "点击 compact", target: "none", surface: "toolbar" },
  {
    id: "forkLatest",
    kind: "user",
    label: "fork 最新轮次",
    target: "latest",
    surface: "turn actions",
  },
  { id: "forkOld", kind: "user", label: "fork 老轮次", target: "old", surface: "turn actions" },
  {
    id: "editLatest",
    kind: "user",
    label: "编辑最新 query",
    target: "latest",
    surface: "message actions",
  },
  { id: "editOld", kind: "user", label: "编辑老 query", target: "old", surface: "message actions" },
];

export const systemCandidates: Candidate[] = [
  {
    id: "assistantComplete",
    kind: "system",
    label: "assistant 完成当前 run",
    target: "none",
    surface: "runtime event",
  },
  {
    id: "compactComplete",
    kind: "system",
    label: "compact 完成",
    target: "none",
    surface: "runtime event",
  },
  {
    id: "compactNoop",
    kind: "system",
    label: "compact 判断不需要继续",
    target: "none",
    surface: "runtime event",
  },
  {
    id: "goalVerifyStart",
    kind: "system",
    label: "开始 goal 验证",
    target: "none",
    surface: "goal runtime",
  },
  {
    id: "goalVerifyPass",
    kind: "system",
    label: "goal 验证通过",
    target: "none",
    surface: "goal runtime",
  },
  {
    id: "goalVerifyFail",
    kind: "system",
    label: "goal 验证失败",
    target: "none",
    surface: "goal runtime",
  },
];

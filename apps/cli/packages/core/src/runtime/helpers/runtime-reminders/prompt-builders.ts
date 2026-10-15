// SPDX-License-Identifier: Apache-2.0
// 运行时提醒正文族（B20）。
// 日期变化、计划模式（完整/精简轮换）、计划退出、todo、输出风格五族正文都是固定英文文案
// （逐字契约）；正文装配成「行数组 join」形态，值与继承实现逐字一致。距离口径：todo 提醒要
// 距上次 TodoWrite 与距上次提醒都 ≥10 个助手轮次；计划模式提醒要距上次模式提醒 ≥5 个人类轮次，
// 且按「第 5 次取整余 1 用完整版、否则用精简版」轮换。全部同步纯计算，只读历史、不抛异常。
import {
  legacySyntheticRuntimeMetadata,
  systemReminderRuntimeMetadata,
  todoReminderRuntimeMetadata,
  isRuntimeAttachmentEntry,
  type RuntimeMessageEntry,
  type RuntimeMessageMetadata,
} from "../../../agent/message-history.js";
import type { SystemReminderSource } from "../../../system-reminder/source.js";
import type {
  CollaborationMode,
  OutputStylePromptConfig,
  SyntheticUserMessageSource,
  TodoItem,
} from "../../deps.js";
import { ASK_USER_QUESTION_TOOL_NAME, EXIT_PLAN_MODE_TOOL_NAME } from "@knorvia/contracts";
import { EXPLORE_AGENT_TYPE } from "../../../subagent/explore.js";

// 计划调研的并行 agent 数（写进工作流正文）。 //上限 3，正文逐字契约
const PLAN_RESEARCH_AGENT_COUNT = 3;

// 正文行数组里的空行占位（保持行数组可读）。
const BLANK_LINE = "";

// 计划工作流正文（逐字契约）：四阶段工作流，按行装配后 join，行序与空行都冻结。
const PLAN_WORKFLOW_LINES = [
  "## Plan Workflow",
  BLANK_LINE,
  "### Phase 1: Initial Understanding",
  `Goal: Gain a comprehensive understanding of the user's request by reading through code and asking them questions. Critical: In this phase you should only use the ${EXPLORE_AGENT_TYPE} subagent type.`,
  BLANK_LINE,
  "1. Focus on understanding the user's request and the code associated with their request. Actively search for existing functions, utilities, and patterns that can be reused — avoid proposing new code when suitable implementations already exist.",
  BLANK_LINE,
  `2. **Launch up to ${PLAN_RESEARCH_AGENT_COUNT} ${EXPLORE_AGENT_TYPE} agents IN PARALLEL** (single message, multiple tool calls) to efficiently explore the codebase.`,
  "   - Use 1 agent when the task is isolated to known files, the user provided specific file paths, or you're making a small targeted change.",
  "   - Use multiple agents when: the scope is uncertain, multiple areas of the codebase are involved, or you need to understand existing patterns before planning.",
  `   - Quality over quantity - ${PLAN_RESEARCH_AGENT_COUNT} agents maximum, but you should try to use the minimum number of agents necessary (usually just 1)`,
  "   - If using multiple agents: Provide each agent with a specific search focus or area to explore. Example: One agent searches for existing implementations, another explores related components, a third investigating testing patterns",
  BLANK_LINE,
  "### Phase 2: Design",
  "Goal: Design an implementation approach.",
  BLANK_LINE,
  "**Guidelines:**",
  "- Use the context gathered in Phase 1, including relevant files and code paths.",
  "- Account for the user's requirements and constraints.",
  "- Produce a concrete implementation plan that is detailed enough to execute.",
  "- Consider useful perspectives for the task type:",
  "  - New feature: simplicity vs performance vs maintainability",
  "  - Bug fix: root cause vs workaround vs prevention",
  "  - Refactoring: minimal change vs clean architecture",
  BLANK_LINE,
  "### Phase 3: Review",
  "Goal: Review the plan(s) from Phase 2 and ensure alignment with the user's intentions.",
  "1. Read the critical files to deepen your understanding",
  "2. Ensure that the plans align with the user's original request",
  `3. Use ${ASK_USER_QUESTION_TOOL_NAME} to clarify any remaining questions with the user`,
  BLANK_LINE,
  `### Phase 4: Call ${EXIT_PLAN_MODE_TOOL_NAME}`,
  `At the very end of your turn, once you have asked the user questions and are happy with your final plan - you should always call ${EXIT_PLAN_MODE_TOOL_NAME} to indicate to the user that you are done planning.`,
  `This is critical - your turn should only end with either using the ${ASK_USER_QUESTION_TOOL_NAME} tool OR calling ${EXIT_PLAN_MODE_TOOL_NAME}. Do not stop unless it's for these 2 reasons`,
  BLANK_LINE,
  `**Important:** Use ${ASK_USER_QUESTION_TOOL_NAME} ONLY to clarify requirements or choose between approaches. Use ${EXIT_PLAN_MODE_TOOL_NAME} to request plan approval. Do NOT ask about plan approval in any other way - no text questions, no AskUserQuestion. Phrases like "Is this plan okay?", "Should I proceed?", "How does this plan look?", "Any changes before we start?", or similar MUST use ${EXIT_PLAN_MODE_TOOL_NAME}.`,
  BLANK_LINE,
  `NOTE: At any point in time through this workflow you should feel free to ask the user questions or clarifications using the ${ASK_USER_QUESTION_TOOL_NAME} tool. Don't make large assumptions about user intent. The goal is to present a well researched plan to the user, and tie any loose ends before implementation begins.`,
];
const WORKFLOW_BODY = PLAN_WORKFLOW_LINES.join("\n");

// 计划模式完整版的红线段（逐字契约）：只进不做。
const PLAN_MODE_ACTIVE_NOTICE =
  "Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits, run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supercedes any other instructions you have received.";
const FULL_PLAN_REMINDER = [PLAN_MODE_ACTIVE_NOTICE, WORKFLOW_BODY];

// 计划模式精简版（逐字契约）：一句话点回完整版的约定，三段用单空格相接。
const SPARSE_PLAN_BODY = [
  "Plan mode still active (see full instructions earlier in conversation). Read-only. Follow 4-phase workflow.",
  `End turns with ${ASK_USER_QUESTION_TOOL_NAME} (for clarifications) or ${EXIT_PLAN_MODE_TOOL_NAME} (for plan approval).`,
  "Never ask about plan approval via text or AskUserQuestion.",
].join(" ");
const SPARSE_PLAN_REMINDER = [SPARSE_PLAN_BODY];

// 计划退出正文（逐字契约）。
const PLAN_EXIT_TITLE = "## Exited Plan Mode"; // 固定标题，测试按首行断言
const PLAN_EXIT_BODY =
  "You have exited plan mode. You can now make edits, run tools, and take actions."; // 固定收尾
const EXIT_PLAN_REMINDER = [PLAN_EXIT_TITLE, BLANK_LINE, PLAN_EXIT_BODY];

// todo 提醒引子（逐字契约，384 字符）：无 todo 时只发这一段。
const TODO_LEAD = [
  "The TodoWrite tool hasn't been used recently. If you're working on tasks that would benefit from tracking progress, consider using the TodoWrite tool to track progress.",
  "Also consider cleaning up the todo list if has become stale and no longer matches what you are working on. Only use it if it's relevant to the current work.",
  "This is just a gentle reminder - ignore if not applicable.",
].join(" ");

// 合成来源 → 系统提醒命名的映射表：legacy 三类与 todo 不在此表，未知来源兜底 rewind_notice。
const SYNTHETIC_SOURCE_REMINDER_NAME: Record<string, SystemReminderSource> = {
  subagent: "queued_system_notification",
  "goal-continuation": "target_continuation",
  goal_state_change: "goal_state_change",
  plugin_reference: "plugin_reference",
  selection_side_chat: "selection_side_chat",
};

// 距离度量结果：两个距离都从尾部回溯助手轮次计数。
interface TodoDistances {
  sinceWrite: number; // 距上次 TodoWrite 的助手轮次
  sinceReminder: number; // 距上次 todo 提醒的助手轮次
}

// 距离度量：todo 提醒先于附件过滤判定（附件提醒本身也是提醒），两侧都见过即停。
function countTodoDistances(timeline: readonly RuntimeMessageEntry[]): TodoDistances {
  let turns = 0;
  let writeSeenAt: number | undefined;
  let reminderSeenAt: number | undefined;

  for (let cursor = timeline.length - 1; cursor >= 0; cursor -= 1) {
    const record = timeline[cursor]!;
    if (reminderSeenAt === undefined && record.metadata?.source === "todo_reminder") {
      reminderSeenAt = turns;
    }
    if (writeSeenAt !== undefined && reminderSeenAt !== undefined) break;
    if (isRuntimeAttachmentEntry(record)) continue;
    if (record.message.role !== "assistant") continue;
    const writesTodos = record.message.toolCalls?.some((call) => call.name === "TodoWrite");
    if (writeSeenAt === undefined && writesTodos) {
      writeSeenAt = turns;
    }
    turns += 1;
    if (writeSeenAt !== undefined && reminderSeenAt !== undefined) break;
  }

  return {
    sinceWrite: writeSeenAt ?? turns,
    sinceReminder: reminderSeenAt ?? turns,
  };
}

// 模式提醒定位：从尾部回溯到最近一次 runtime_mode 提醒，顺路数人类轮次（real_user）。
interface ModeReminderProbe {
  found: boolean;
  humanTurns: number; // 距上次模式提醒的人类轮次
}

function findModeReminder(timeline: readonly RuntimeMessageEntry[]): ModeReminderProbe {
  let humanCount = 0;
  for (let cursor = timeline.length - 1; cursor >= 0; cursor -= 1) {
    const record = timeline[cursor]!;
    if (record.metadata?.source === "runtime_mode") {
      return { found: true, humanTurns: humanCount };
    }
    if (isRuntimeAttachmentEntry(record)) continue;
    const realUser = record.message.role === "user" && record.metadata?.source === "real_user";
    if (realUser) humanCount += 1;
  }
  return { found: false, humanTurns: humanCount };
}

// 轮换计数：历史里出现过几次模式提醒，下一次的序号 = 次数 + 1。
const countModeReminders = (timeline: readonly RuntimeMessageEntry[]): number =>
  timeline.reduce(
    (count, record) => count + (record.metadata?.source === "runtime_mode" ? 1 : 0),
    0,
  );

// 日期变化正文（逐字契约）：只带新日期，明确要求不要向用户点破。
export const buildDateChangeReminderBody = (_previousDate: string, todayDate: string): string =>
  `The date has changed. Today's date is now ${todayDate}. ` +
  "DO NOT mention this to the user explicitly because they are already aware.";

// 合成消息来源 → 运行时元数据：legacy 三类走 legacy 元数据，todo 走 todo 元数据，
// 其余按来源命名，未知来源兜底 rewind_notice。
export const runtimeMetadataForSyntheticUserMessageSource = (
  source: SyntheticUserMessageSource,
): RuntimeMessageMetadata => {
  if (source === "todo_reminder") return todoReminderRuntimeMetadata();
  if (
    source === "background_task" ||
    source === "subagent_message" ||
    source === "shared_context"
  ) {
    return legacySyntheticRuntimeMetadata();
  }
  return systemReminderRuntimeMetadata(SYNTHETIC_SOURCE_REMINDER_NAME[source] ?? "rewind_notice");
};

// todo 提醒门槛：距上次写入与距上次提醒都 ≥10 个助手轮次才生成。
export const shouldBuildTodoReminder = (timeline: readonly RuntimeMessageEntry[]): boolean => {
  const distances = countTodoDistances(timeline);
  return distances.sinceWrite >= 10 && distances.sinceReminder >= 10;
};

// todo 提醒正文：引子 + 可选的列表快照（带序号与状态）。
export const buildTodoReminderBody = (items: readonly TodoItem[]): string => {
  const parts = [TODO_LEAD];
  if (items.length > 0) {
    const rows = items.map((task, index) => `${index + 1}. [${task.status}] ${task.content}`);
    const rendered = `[${rows.join("\n")}]`;
    parts.push("", "Here are the existing contents of your todo list:", "", rendered);
  }
  return parts.join("\n");
};

// 计划模式提醒：非计划模式不产出；距上次模式提醒不足 5 个人类轮次不产出；
// 「第 5 次取整余 1」用完整版，其余用精简版。
export const buildRuntimeModeReminderBody = (
  timeline: readonly RuntimeMessageEntry[],
  mode: CollaborationMode,
  planEnabled: boolean = mode === "plan",
): string | null => {
  if (!planEnabled) return null; // 非计划模式不产出提醒
  const previous = findModeReminder(timeline);
  if (previous.found && previous.humanTurns < 5) return null;
  const rotation = countModeReminders(timeline) + 1;
  return (rotation % 5 === 1 ? FULL_PLAN_REMINDER : SPARSE_PLAN_REMINDER).join("\n");
};

// 计划退出提醒正文（逐字契约）。
export const buildPlanModeExitReminderBody = (): string => EXIT_PLAN_REMINDER.join("\n");

// 输出风格提醒：没有风格或 prompt 全空白返回 null；否则一句固定句式带上风格名。
export const buildRuntimeOutputStyleReminderBody = (
  style: OutputStylePromptConfig | undefined,
): string | null => {
  const activePrompt = style?.prompt.trim();
  if (!style || !activePrompt) return null;
  return `${style.name} output style is active. Remember to follow the specific guidelines for this style.`;
};

import {
  legacySyntheticRuntimeMetadata,
  systemReminderRuntimeMetadata,
  todoReminderRuntimeMetadata,
  isRuntimeAttachmentEntry,
  type RuntimeMessageEntry,
  type RuntimeMessageMetadata,
} from "../../agent/message-history.js";
import type {
  CollaborationMode,
  OutputStylePromptConfig,
  SyntheticUserMessageSource,
  TodoItem,
} from "../deps.js";
import { ASK_USER_QUESTION_TOOL_NAME, EXIT_PLAN_MODE_TOOL_NAME } from "@knorvia/contracts";
import { EXPLORE_AGENT_TYPE } from "../../subagent/explore.js";

const PLAN_RESEARCH_AGENT_COUNT = 3;
const PLAN_WORKFLOW = `## Plan Workflow

### Phase 1: Initial Understanding
Goal: Gain a comprehensive understanding of the user's request by reading through code and asking them questions. Critical: In this phase you should only use the ${EXPLORE_AGENT_TYPE} subagent type.

1. Focus on understanding the user's request and the code associated with their request. Actively search for existing functions, utilities, and patterns that can be reused — avoid proposing new code when suitable implementations already exist.

2. **Launch up to ${PLAN_RESEARCH_AGENT_COUNT} ${EXPLORE_AGENT_TYPE} agents IN PARALLEL** (single message, multiple tool calls) to efficiently explore the codebase.
   - Use 1 agent when the task is isolated to known files, the user provided specific file paths, or you're making a small targeted change.
   - Use multiple agents when: the scope is uncertain, multiple areas of the codebase are involved, or you need to understand existing patterns before planning.
   - Quality over quantity - ${PLAN_RESEARCH_AGENT_COUNT} agents maximum, but you should try to use the minimum number of agents necessary (usually just 1)
   - If using multiple agents: Provide each agent with a specific search focus or area to explore. Example: One agent searches for existing implementations, another explores related components, a third investigating testing patterns

### Phase 2: Design
Goal: Design an implementation approach.

**Guidelines:**
- Use the context gathered in Phase 1, including relevant files and code paths.
- Account for the user's requirements and constraints.
- Produce a concrete implementation plan that is detailed enough to execute.
- Consider useful perspectives for the task type:
  - New feature: simplicity vs performance vs maintainability
  - Bug fix: root cause vs workaround vs prevention
  - Refactoring: minimal change vs clean architecture

### Phase 3: Review
Goal: Review the plan(s) from Phase 2 and ensure alignment with the user's intentions.
1. Read the critical files to deepen your understanding
2. Ensure that the plans align with the user's original request
3. Use ${ASK_USER_QUESTION_TOOL_NAME} to clarify any remaining questions with the user

### Phase 4: Call ${EXIT_PLAN_MODE_TOOL_NAME}
At the very end of your turn, once you have asked the user questions and are happy with your final plan - you should always call ${EXIT_PLAN_MODE_TOOL_NAME} to indicate to the user that you are done planning.
This is critical - your turn should only end with either using the ${ASK_USER_QUESTION_TOOL_NAME} tool OR calling ${EXIT_PLAN_MODE_TOOL_NAME}. Do not stop unless it's for these 2 reasons

**Important:** Use ${ASK_USER_QUESTION_TOOL_NAME} ONLY to clarify requirements or choose between approaches. Use ${EXIT_PLAN_MODE_TOOL_NAME} to request plan approval. Do NOT ask about plan approval in any other way - no text questions, no AskUserQuestion. Phrases like "Is this plan okay?", "Should I proceed?", "How does this plan look?", "Any changes before we start?", or similar MUST use ${EXIT_PLAN_MODE_TOOL_NAME}.

NOTE: At any point in time through this workflow you should feel free to ask the user questions or clarifications using the ${ASK_USER_QUESTION_TOOL_NAME} tool. Don't make large assumptions about user intent. The goal is to present a well researched plan to the user, and tie any loose ends before implementation begins.`;

const FULL_PLAN_REMINDER = [
  "Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits, run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supercedes any other instructions you have received.",
  PLAN_WORKFLOW,
];
const SPARSE_PLAN_REMINDER = [
  `Plan mode still active (see full instructions earlier in conversation). Read-only. Follow 4-phase workflow. End turns with ${ASK_USER_QUESTION_TOOL_NAME} (for clarifications) or ${EXIT_PLAN_MODE_TOOL_NAME} (for plan approval). Never ask about plan approval via text or AskUserQuestion.`,
];
const EXIT_PLAN_REMINDER = [
  "## Exited Plan Mode",
  "",
  "You have exited plan mode. You can now make edits, run tools, and take actions.",
];
const TODO_LEAD = "The TodoWrite tool hasn't been used recently. If you're working on tasks that would benefit from tracking progress, consider using the TodoWrite tool to track progress. Also consider cleaning up the todo list if has become stale and no longer matches what you are working on. Only use it if it's relevant to the current work. This is just a gentle reminder - ignore if not applicable.";

function countTodoDistances(entries: readonly RuntimeMessageEntry[]): {
  sinceWrite: number;
  sinceReminder: number;
} {
  let assistantTurns = 0;
  let writeDistance: number | undefined;
  let reminderDistance: number | undefined;

  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    if (reminderDistance === undefined && entry.metadata?.source === "todo_reminder") {
      reminderDistance = assistantTurns;
    }
    if (writeDistance !== undefined && reminderDistance !== undefined) break;
    if (isRuntimeAttachmentEntry(entry)) continue;
    if (entry.message.role !== "assistant") continue;
    if (
      writeDistance === undefined &&
      entry.message.toolCalls?.some((call) => call.name === "TodoWrite")
    ) {
      writeDistance = assistantTurns;
    }
    assistantTurns++;
    if (writeDistance !== undefined && reminderDistance !== undefined) break;
  }

  return {
    sinceWrite: writeDistance ?? assistantTurns,
    sinceReminder: reminderDistance ?? assistantTurns,
  };
}

function findModeReminder(entries: readonly RuntimeMessageEntry[]): {
  found: boolean;
  humanTurns: number;
} {
  let humanTurns = 0;
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    if (entry.metadata?.source === "runtime_mode") {
      return { found: true, humanTurns };
    }
    if (isRuntimeAttachmentEntry(entry)) continue;
    if (entry.message.role === "user" && entry.metadata?.source === "real_user") {
      humanTurns++;
    }
  }
  return { found: false, humanTurns };
}

export function buildDateChangeReminderBody(_previousDate: string, currentDate: string): string {
  return `The date has changed. Today's date is now ${currentDate}. DO NOT mention this to the user explicitly because they are already aware.`;
}

export function runtimeMetadataForSyntheticUserMessageSource(
  source: SyntheticUserMessageSource,
): RuntimeMessageMetadata {
  switch (source) {
    case "background_task":
    case "subagent_message":
    case "shared_context":
      return legacySyntheticRuntimeMetadata();
    case "subagent":
      return systemReminderRuntimeMetadata("queued_system_notification");
    case "todo_reminder":
      return todoReminderRuntimeMetadata();
    case "goal_state_change":
      return systemReminderRuntimeMetadata("goal_state_change");
    case "plugin_reference":
      return systemReminderRuntimeMetadata("plugin_reference");
    case "selection_side_chat":
      return systemReminderRuntimeMetadata("selection_side_chat");
    case "goal-continuation":
      return systemReminderRuntimeMetadata("target_continuation");
    default:
      return systemReminderRuntimeMetadata("rewind_notice");
  }
}

export function shouldBuildTodoReminder(entries: readonly RuntimeMessageEntry[]): boolean {
  const distances = countTodoDistances(entries);
  return distances.sinceWrite >= 10 && distances.sinceReminder >= 10;
}

export function buildTodoReminderBody(todos: readonly TodoItem[]): string {
  const lines = [TODO_LEAD];
  if (todos.length > 0) {
    const formatted = `[${todos
      .map((todo, index) => `${index + 1}. [${todo.status}] ${todo.content}`)
      .join("\n")}]`;
    lines.push("", "Here are the existing contents of your todo list:", "", formatted);
  }
  return lines.join("\n");
}

export function buildRuntimeModeReminderBody(
  entries: readonly RuntimeMessageEntry[],
  mode: CollaborationMode,
  planEnabled: boolean = mode === "plan",
): string | null {
  if (!planEnabled) return null;
  const previous = findModeReminder(entries);
  if (previous.found && previous.humanTurns < 5) return null;
  const nextReminder = entries.reduce(
    (count, entry) => count + (entry.metadata?.source === "runtime_mode" ? 1 : 0),
    0,
  ) + 1;
  return (nextReminder % 5 === 1 ? FULL_PLAN_REMINDER : SPARSE_PLAN_REMINDER).join("\n");
}

export function buildPlanModeExitReminderBody(): string {
  return EXIT_PLAN_REMINDER.join("\n");
}

export function buildRuntimeOutputStyleReminderBody(
  outputStyle: OutputStylePromptConfig | undefined,
): string | null {
  const activePrompt = outputStyle?.prompt.trim();
  if (!outputStyle || !activePrompt) return null;
  return `${outputStyle.name} output style is active. Remember to follow the specific guidelines for this style.`;
}

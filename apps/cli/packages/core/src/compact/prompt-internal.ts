// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// compact 提示词的实现模块：无工具前言、总结任务说明、尾部提醒与承接消息都在这里。
// 公开面（三个导出函数）见 ./prompt.js，本模块不含对外可见的常量。
const NO_TOOLS_PREAMBLE =
  `Important: answer with text only, and do not invoke any tool.

- Read, Bash, Grep, Glob, Edit, Write and every other tool stay unused.
- The conversation above already carries everything you need.
- A tool call is rejected and burns your only turn, so the task would fail.
- Your whole reply is plain text: an <analysis> block, then a <summary> block.
` + "\n";

const NO_TOOLS_REMINDER =
  "\n\nOne more time: no tool calls at all. Send text only — first the <analysis> block, then " +
  "the <summary> block. Tool calls are rejected here and one would make the task fail.";

const SUMMARY_TASK_PROMPT = `Write a detailed summary of the conversation so far. It has to capture the user's explicit requests and everything you did, with enough technical depth that development can continue without the original context.

Begin by thinking the conversation through inside <analysis> tags, so that nothing important is missed. While analysing:

1. Walk the conversation message by message. For every part work out:
   - what the user explicitly asked for and wanted
   - how you went about it
   - the decisions, technical ideas and code patterns that matter
   - concrete artefacts: paths of the files you touched, the snippets and signatures worth keeping, and the edits you made
   - the errors you hit and how you resolved them
   - user feedback that changed your approach, especially corrections
   - every security-relevant instruction or constraint the user gave (files or data to stay away from, actions that must not happen, rules about credentials or secrets). Repeat those word for word in the summary so they still apply after compaction.
2. Check the result for technical accuracy and completeness, covering each required element.

The summary itself is organised into these sections:

1. Primary Request and Intent: everything the user explicitly asked for, in detail
2. Key Technical Concepts: the technologies, frameworks and technical ideas that came up
3. Files and Code Sections: the specific files and code sections you read, changed or created. Give the most recent messages extra weight, include full snippets where they matter, and say why each file or edit matters.
4. Errors and fixes: the errors you ran into and how you resolved them, plus any user feedback that changed your approach
5. Problem Solving: what you solved and what troubleshooting is still open
6. All user messages: every user message that is not a tool result. They are the key to the user's intent; repeat security-relevant instructions or constraints word for word so they survive compaction.
7. Pending Tasks: work you were explicitly asked to do and have not finished
8. Current Work: exactly what was in progress right before this summary, naming the files and snippets involved
9. Optional Next Step: the next step tied to the most recent work. It must follow directly from the user's latest explicit requests and from the task at hand. If the last task is finished, list a next step only when it clearly continues the user's request; do not drift into older, unrelated work without asking first.

Shape the answer like this:

<sample>
<analysis>
[Reasoning that walks the points above and double-checks each of them]
</analysis>

<summary>
Section 1 — Primary Request and Intent:
   [What the user asked for, in detail]

Section 2 — Key Technical Concepts:
   * [Concept]
   * [...]

Section 3 — Files and Code Sections:
   * path/to/the/file.ts
      - why this file matters
      - what changed in it
      - the snippet worth keeping
   * [...]

Section 4 — Errors and fixes:
   * [error] -> [how it was fixed] -> [user feedback, if any]

Section 5 — Problem Solving:
   [what got solved and what is still open]

Section 6 — All user messages:
   * [every non tool-result user message]

Section 7 — Pending Tasks:
   * [open task]

Section 8 — Current Work:
   [what was in progress]

Section 9 — Optional Next Step:
   [the next step]
</summary>
</sample>

Now produce that summary of the conversation so far, in exactly that shape.

Extra summarisation instructions may be attached to the included context. Follow them when they are there. Two shapes are possible:
<sample>
## Compaction notes
Concentrate on the TypeScript edits, and on the mistakes already made and how they were fixed.
</sample>

<sample>
# Writing the summary
Lead with the test output and with what changed in the code; quote the file reads in full.
</sample>`;

/** 自定义指令块的前缀与分隔：原文插入，不 trim。 */
const CUSTOM_INSTRUCTIONS_HEADER = "\n\nAdditional Instructions:\n";

/** 承接消息的开场白。 */
const CONTINUATION_HEADER =
  "This session continues an earlier conversation that ran out of context. The summary below covers the earlier part of the conversation.";

/** 摘要块改写后的标题。 */
const SUMMARY_HEADING = "Summary:\n";

const TRANSCRIPT_NOTE_HEADER =
  "\n\nIf you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: ";

const RECENT_MESSAGES_NOTE = "\n\nRecent messages are preserved verbatim.";

const REPL_STATE_NOTE =
  "\n\nThis compaction also wiped your REPL VM state: variables that were defined in earlier REPL calls are gone, so define the ones you still need again.";

const RESUME_NOTE =
  '\nCarry on exactly where the conversation stopped and do not ask the user anything else. Just resume — skip any acknowledgement of this summary, do not recap the previous state, and do not open with phrases like "I\'ll continue". Continue the last task as though there had been no interruption.';

/** 摘要里要剔除的分析块与要改写的摘要块。 */
const ANALYSIS_BLOCK = /<analysis>[\s\S]*?<\/analysis>/;
const SUMMARY_BLOCK = /<summary>([\s\S]*?)<\/summary>/;
const REPEATED_BLANK_LINES = /\n\n+/g;

export interface CompactSummaryMessageOptions {
  recentMessagesPreserved?: boolean;
  replStateCleared?: boolean;
  suppressFollowup?: boolean;
  transcriptPath?: string;
}

/** 提示词正文：无工具前言 + 总结说明 + 可选自定义块 + 尾部提醒。 */
export function buildCompactPrompt(customInstructions: string | undefined): string {
  const custom = customInstructions?.trim() ? CUSTOM_INSTRUCTIONS_HEADER + customInstructions : "";
  return NO_TOOLS_PREAMBLE + SUMMARY_TASK_PROMPT + custom + NO_TOOLS_REMINDER;
}

/**
 * 摘要格式化：去掉分析块，把摘要块换成 `Summary:` 标题加 trim 后的正文，
 * 连续空行压成一个空行，最后整体 trim；空白输入得到空串。
 */
export function formatCompactSummary(text: string | undefined): string {
  const trimmed = text?.trim() ?? "";
  if (trimmed === "") return "";
  const withoutAnalysis = trimmed.replace(ANALYSIS_BLOCK, "");
  const summaryMatch = SUMMARY_BLOCK.exec(withoutAnalysis);
  const rewritten =
    summaryMatch === null
      ? withoutAnalysis
      : withoutAnalysis.replace(SUMMARY_BLOCK, SUMMARY_HEADING + (summaryMatch[1] ?? "").trim());
  return rewritten.replace(REPEATED_BLANK_LINES, "\n\n").trim();
}

/** 承接消息：摘要正文 + 按选项追加的说明；suppressFollowup 用单换行相接，其余用空行。 */
export function buildCompactSummaryMessage(
  summary: string,
  options: CompactSummaryMessageOptions = {},
): string {
  const { recentMessagesPreserved, replStateCleared, suppressFollowup, transcriptPath } = options;
  let message = `${CONTINUATION_HEADER}\n\n${formatCompactSummary(summary)}`;

  if (transcriptPath) {
    message += TRANSCRIPT_NOTE_HEADER + transcriptPath;
  }
  if (recentMessagesPreserved) {
    message += RECENT_MESSAGES_NOTE;
  }
  if (replStateCleared) {
    message += REPL_STATE_NOTE;
  }
  if (suppressFollowup) {
    message += RESUME_NOTE;
  }

  return message;
}

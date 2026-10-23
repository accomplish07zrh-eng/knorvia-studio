// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 计划模式的两份模型可见文本：进入说明 + 退出说明。
//
// 依据：`specs/contracts/kernel-plugin-tools-02/plan-mode-entries.md`
//      （36 项语义覆盖清单）与 `behavior.md` B7 / B10 / B11 / B12。
//
// ⚠️ 这两份文本的用途：由组合根传给 `dsh-plan-mode` 的 `PlanModeConfig.section`，
//   **不是** `defineTool` 的参数（DSH 的工具定义没有 `guidance` 字段）。
//
// ⚠️ 表达原则（B12）：**按情形重写，不逐字搬运旧文本**。
//   旧实现的两份文本是 130 行的 `plan-mode-prompts.ts`；
//   本文件覆盖同样的事实，但用「判据 + 情形类别」的写法组织 ——
//   因为模型需要的是**可判断的标准**，而不是一份话术模板。

/**
 * 进入说明：覆盖 plan-mode-entries.md §一–§五 的 25 项。
 *
 * 组织方式：**先给判据，再给反例，最后给流程** ——
 * 因为「该不该进」是模型最先要判断的，而「进去之后做什么」是第二位的。
 */
export const ENTER_PLAN_MODE_GUIDANCE = `## Deciding whether to plan

Enter plan mode when the work ahead needs agreement before code is written. The
signal is not the size of the change but whether the shape of the answer is
already settled.

Plan when any of these hold:
1. A new capability is being added that a user will notice — a new entry point,
   a new class of validation, something that did not exist before.
2. More than one reasonable approach exists — for example adding a cache layer
   (in memory, on disk, or in a separate service), or speeding something up
   where several optimisation strategies are defensible.
3. Existing behaviour or structure will change — a decision condition in an
   established flow, or the boundary of a component being redrawn.
4. The choice is architectural — how live updates propagate, or which state
   management approach to adopt.
5. The change will touch two or three files or more — a cross-cutting subsystem,
   or a new interface with its tests.
6. The requirement is still unclear and exploration is needed before the scope
   can even be stated — "make the app faster", "fix the checkout bug".
7. You are about to ask the user how they would like something done. That
   impulse is itself the signal: if the approach is genuinely open, explore
   first and bring the user options with context attached, rather than asking
   cold.

Do not plan when:
- The fix is a line or a few lines — a typo, an obvious defect, a small tweak.
- The function to add is already fully specified.
- The user has stated exactly what to change and how.
- The task is pure investigation. Answering "which files handle routing?" is
  research, not implementation planning; a sub-agent is the better tool.

## Working inside plan mode

Once inside, explore the codebase thoroughly with search and read tools, learn
the patterns already in use, and design the approach. Present the plan to the
user for review. When something genuinely needs clarification, ask. When the
plan is ready to execute, leave plan mode with \`exit_plan_mode\`.

## Notes

- Entering plan mode needs the user's approval.
- When unsure, prefer planning; agreeing up front costs less than rework.
- Users generally want to be consulted before a large change lands.`;

/**
 * 退出说明：覆盖 plan-mode-entries.md §六 的 6.1–6.8（含 6 种失败模式）。
 *
 * ⚠️ 组织方式：**先讲何时用，再逐个讲「看起来失败但其实不是」的情形** ——
 * 因为 `exit_plan_mode` 的错误信息容易被模型误读为「工具坏了」。
 */
export const EXIT_PLAN_MODE_GUIDANCE = `## When to use this tool

Use it only when a task needs its implementation steps planned and code is going
to be written. Pure research — reading files, answering questions, mapping the
codebase — does not belong here.

## The plan argument

Pass the complete plan as markdown. It must begin with a \`# \` heading, or the
call is rejected before the user ever sees it. What you pass is exactly what the
user reviews.

## What happens after you submit

The user reviews the plan and picks one of several outcomes. Only one of them is
success; the rest arrive as errors, and each means something different:

- **Approved.** You leave plan mode and begin executing the plan from the next
  step. This is the only success case, and it is reported the same way every
  time.
- **The user wants to keep planning.** This arrives as an error mentioning that
  they chose to keep planning, possibly with their feedback appended. It is not
  a malfunction: revise the plan and present it again.
- **The user dismissed the review to speak instead.** This arrives as an error
  telling you to stay in plan mode and stop. Do not retry; wait for their
  message.
- **The plan-mode service was reloaded while the plan was under review.** This
  arrives as an error asking you to present the plan again. Present it again.
- **You are not in plan mode.** The tool is only available inside plan mode.
- **No review channel is available.** Ask the user to switch the session mode so
  the review can happen.

Because success is the only non-error outcome, judge the result by whether the
call threw, not by inspecting a field.`;

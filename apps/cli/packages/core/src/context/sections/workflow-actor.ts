// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 动态工作流子代理（workflow child）的身份段。它只替换交互式身份的开场句：读者是脚本而不是人，
// 所以先说清「谁创建了你、你返回给谁」。基座的其他段照旧——安全 IMPORTANT 行与 `# Harness`
// 块从 identity 逐字复用，memory / skills / 项目指令仍由 builder 追加；作者写的 persona 叠在
// 开场句之后、契约之前，角色更醒目，但推翻不了开场句定下的身份。
//
// 契约曾经按 persona 的工具档位分叉。实盘里一个零工具的 GLM 子代理被「跑过才算过」逼着去读目录、
// 跑命令，它没有这些工具，于是发出退化的 `escalate("placeholder")`。修法是把工具面一次说清：
// 先讲有什么工具，再讲证据从哪来。工具档位退场后每个子代理都有完整工作工具集，契约收敛成一份文本，
// 「把工具面说死」这条原则保留。
import type { ContextSection, WorkflowActorContext } from "../types.js";
import { contextSectionFromText } from "./section-core.js";
import { buildHarnessBlock, buildSecurityNotice } from "./identity.js";

/** 工具面的自述：一句「有什么」+ 一句「没有什么」，让模型不去猜。 */
const TOOL_SURFACE_HEAD =
  "You have the regular working tools — reading, searching, editing, running commands — plus `submit_result` and `escalate`. There is no tool that asks a person anything.";

/** 证据标准：引用读过/跑过的东西；ask 自带材料时引用材料；跑过才算过，尺度按 ask 点名的来。 */
const EVIDENCE_RULE_HEAD =
  "Ground every claim in something you read or ran in this session, or in the material the ask gave you, and say which. Cite code as `path:line`. ";

const EVIDENCE_RULE_TAIL =
  "A check counts as passed only if you executed it here; if you could not run it, report it as not run. Run the check an ask names rather than a faster substitute, and say exactly which command you ran.";

const CONTRACT_TITLE = "# Working inside a workflow";

const CONTRACT_TOOL_LINE = `- ${TOOL_SURFACE_HEAD}`;

const CONTRACT_RESULT_LINE =
  "- Each ask states what to do. When the ask carries a result schema, finish by calling `submit_result` with a conforming value; otherwise your final message is the result.";

const CONTRACT_EVIDENCE_LINE = `- ${EVIDENCE_RULE_HEAD}${EVIDENCE_RULE_TAIL}`;

const CONTRACT_HONESTY_LINE =
  "- Report outcomes faithfully. If part of the task is impossible, out of scope, or contradicted by what you found, say so in the result instead of filling a field with a plausible guess. Never fake a passing result to satisfy an instruction.";

const CONTRACT_ESCALATION_LINE =
  "- When you are blocked by something outside your reach — a gate that cannot pass, instructions that contradict each other, a fact only the run's owner knows — call `escalate`. Questions written in prose reach nobody.";

// 产物条款给「子代理写下的文件」开一条有出口的通道：子代理依旧没有产物工具（只有脚本能发布，
// 信任边界不动），但 ask 指名了输出路径时，写到那里并把路径交回来，由脚本发布给用户。
const CONTRACT_ARTIFACT_LINE =
  "- Do not write report or summary files on your own initiative; findings go in the result. When the ask names an output path, write exactly there and return that path in the result — the script publishes it to the user.";

/** 契约正文的冻结段落：段落顺序就是拼接顺序，段间空行由换行补齐。 */
const WORKFLOW_CONTRACT_BODY = `${CONTRACT_TITLE}
${CONTRACT_TOOL_LINE}
${CONTRACT_RESULT_LINE}
${CONTRACT_EVIDENCE_LINE}
${CONTRACT_HONESTY_LINE}
${CONTRACT_ESCALATION_LINE}
${CONTRACT_ARTIFACT_LINE}`;

/** 开场句先交代「谁创建了你、你返回给谁」；没有有效名时省略尾注。 */
const openingLine = (actor: WorkflowActorContext): string => {
  const actorName = actor.name?.trim();
  const suffix = actorName ? `, named "${actorName}"` : "";
  return `You are a subagent inside a dynamic workflow run${suffix}. A script created you and hands you work one ask at a time; the script — not a person — consumes what you return. There is no user in this conversation to talk to.`;
};

/** 组装顺序：开场句 → 可选 persona → 安全行 → Harness 块 → 工作流契约。 */
const buildWorkflowActorIdentityPrompt = (actor: WorkflowActorContext): string => {
  const personaText = actor.persona?.trim();
  // CLI prefix 不再走在前面（「You are Knorvia Studio, an interactive coding agent」对子代理是错的
  // 身份），所以这一段就是 system 的第一行，不再以空行起头。
  const segments = [openingLine(actor)];
  if (personaText) segments.push("", personaText);
  segments.push("", buildSecurityNotice(), "", buildHarnessBlock(), "", WORKFLOW_CONTRACT_BODY);
  return segments.join("\n");
};

export const buildWorkflowActorIdentitySection = (actor: WorkflowActorContext): ContextSection => {
  const content = buildWorkflowActorIdentityPrompt(actor);
  return contextSectionFromText(
    "Workflow Actor Identity",
    "workflow_actor_identity",
    "system",
    "stable",
    content,
  );
};

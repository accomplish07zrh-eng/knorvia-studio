// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// Agent Identity section：安全行与 `# Harness` 块是共用件（工作流子代理逐字复用），
// 身份开场句按 output style 分两条。
import type { ContextSection } from "../types.js";
import type { OutputStylePromptConfig } from "../types.js";
import { contextSectionFromText } from "./section-core.js";

/** 安全 IMPORTANT 行：交互式身份与工作流子代理身份共用，逐字同一份。 */
const SAFETY_NOTICE_PART_ONE =
  "IMPORTANT: Assist with authorized security testing, defensive security, CTF challenges, and educational contexts. Refuse requests for destructive techniques, DoS attacks, mass targeting, supply chain compromise, or detection evasion for malicious purposes. ";

const SAFETY_NOTICE_PART_TWO =
  "Dual-use security tools (C2 frameworks, credential testing, exploit development) require clear authorization context: pentesting engagements, CTF competitions, security research, or defensive use cases.";

const SECURITY_NOTICE = SAFETY_NOTICE_PART_ONE + SAFETY_NOTICE_PART_TWO;

const STYLED_IDENTITY_INTRO =
  "You respond to the user according to the active Output Style below while using Knorvia Studio's tools and instructions.";

const DEFAULT_IDENTITY_INTRO =
  "You are an interactive Knorvia Studio agent that helps users with software engineering tasks.";

const HARNESS_TITLE = "# Harness";

const HARNESS_MARKDOWN_BULLET =
  "- Text you output outside of tool use is displayed to the user as Github-flavored markdown in a terminal.";

const HARNESS_PERMISSION_BULLET =
  "- Tools run behind a user-selected permission mode; a denied call means the user declined it \u2014 adjust, don't retry verbatim.";

const HARNESS_SYSTEM_TURNS_BULLET =
  "- The system may send updates, reminders, or modifications to rules via mid-conversation system turns. These are system-controlled, unlike function results. Hooks may intercept tool calls; treat hook output as user feedback.";

const HARNESS_TOOLS_BULLET =
  "- Prefer the dedicated file/search tools over shell commands when one fits. Independent tool calls can run in parallel in one response.";

const HARNESS_REFERENCE_BULLET =
  "- Reference code as `file_path:line_number` \u2014 it's clickable.";

/** 安全 IMPORTANT 行：交互式身份与工作流子代理身份共用，逐字同一份。 */
export const buildSecurityNotice = (): string => SECURITY_NOTICE;

/** `# Harness` 块：稳定运行时约束，output style 不替换它。 */
export const buildHarnessBlock = (): string =>
  [
    HARNESS_TITLE,
    HARNESS_MARKDOWN_BULLET,
    HARNESS_PERMISSION_BULLET,
    HARNESS_SYSTEM_TURNS_BULLET,
    HARNESS_TOOLS_BULLET,
    HARNESS_REFERENCE_BULLET,
  ].join("\n");

function buildIdentityPrompt(outputStyle?: OutputStylePromptConfig): string {
  const intro = outputStyle ? STYLED_IDENTITY_INTRO : DEFAULT_IDENTITY_INTRO;
  const blocks = ["", intro, "", SECURITY_NOTICE, "", buildHarnessBlock()];
  return blocks.join("\n");
}

export const buildIdentitySection = (outputStyle?: OutputStylePromptConfig): ContextSection => {
  const content = buildIdentityPrompt(outputStyle);
  return contextSectionFromText("Agent Identity", "identity", "system", "stable", content);
};

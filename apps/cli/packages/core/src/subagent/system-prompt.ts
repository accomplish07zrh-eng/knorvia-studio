import type { EnvInfo, Model } from "@knorvia/contracts";
import { isEnvInfoGitRepository } from "../context/sections/env-info.js";

export interface SubagentEnvironmentContextOptions {
  agentPrompt: string;
  envInfo: EnvInfo;
  model?: Model;
}

export function buildSubagentCommonNotes(): /* 返回提示词 */ string {
  return /* 提示词正文 */ [
    "Notes:", // 固定文案
    "- Agent threads always have their cwd reset between bash calls, as a result please only use absolute file paths.",
    "- In your final response, share file paths (always absolute, never relative) that are relevant to the task. Include code snippets only when the exact text is load-bearing (e.g., a bug you found, a function signature the caller asked for) — do not recap code you merely read.",
    "- For clear communication with the user the assistant MUST avoid using emojis.",
    '- Do not use a colon before tool calls. Text like "Let me read the file:" followed by a read tool call should just be "Let me read the file." with a period.',
    "- Do NOT Write report/summary/findings/analysis .md files. Return findings directly as your final assistant message — the parent agent reads your text output, not files you create.",
  ] /* 逐行拼接 */
    .join("\n");
}

export function buildSubagentEnvironmentContext(
  options: SubagentEnvironmentContextOptions,
): /* 返回提示词 */ string {
  const { envInfo, model } = options;
  const modelLine = model
    ? [`You are powered by the model named ${model.providerId}/${model.modelId}.`]
    : /* 无模型行 */ [];

  return /* 提示词正文 */ [
    "Here is useful information about the environment you are running in:",
    "<env>", // 固定文案
    `Working directory: ${envInfo.cwd}`,
    `Is directory a git repo: ${isEnvInfoGitRepository(envInfo) ? "Yes" : "No"}`,
    `Platform: ${envInfo.platform}`, // 环境固定文案
    `Shell: ${envInfo.shell}`, // 环境固定文案
    `OS Version: ${envInfo.osVersion}`, // 环境固定文案
    "</env>", // 固定文案
    /* 模型行 */ ...modelLine,
  ] /* 逐行拼接 */
    .join("\n");
}

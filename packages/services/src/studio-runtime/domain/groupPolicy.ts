import type { StudioKernelId } from "../kernelTypes.js";
import type { StudioGroupDefinition } from "../workflowTypes.js";
import { isStudioKernelId } from "./kernelIdentity.js";

export const STUDIO_GROUP_LIMITS = {
  tasksPerRound: 8,
  hostResponses: 2,
  contextChars: 48_000,
  outputChars: 24_000,
} as const;
const MAX_GROUP_MEMBERS = 32;
const MENTION_ALIASES: Record<string, StudioKernelId> = {
  knorvia: "knorvia",
  "knorvia studio": "knorvia",
  codex: "codex",
  claude: "claude-code",
  "claude-code": "claude-code",
  "claude code": "claude-code",
  grok: "grok-build",
  "grok-build": "grok-build",
  "grok build": "grok-build",
  opencode: "opencode",
  "open code": "opencode",
  qoder: "qoder",
  "qoder cli": "qoder",
  qodercn: "qoder-cn",
  "qoder-cn": "qoder-cn",
  "qoder cn": "qoder-cn",
  "qoder cli cn": "qoder-cn",
  gemini: "gemini-cli",
  "gemini-cli": "gemini-cli",
  "gemini cli": "gemini-cli",
  agy: "antigravity",
  antigravity: "antigravity",
  "google antigravity": "antigravity",
  goose: "goose",
  kimi: "kimi-cli",
  "kimi-cli": "kimi-cli",
  "kimi cli": "kimi-cli",
  copilot: "copilot",
  "github copilot": "copilot",
  hermes: "hermes",
  "hermes agent": "hermes",
  qwen: "qwen-code",
  "qwen-code": "qwen-code",
  "qwen code": "qwen-code",
  vibe: "mistral-vibe",
  "mistral-vibe": "mistral-vibe",
  "mistral vibe": "mistral-vibe",
  dsh: "deepseek-harness",
  "deepseek-harness": "deepseek-harness",
  "deepseek harness": "deepseek-harness",
};
export interface StudioGroupTask {
  id: string;
  member: StudioKernelId;
  instruction: string;
  dependsOn: string[];
}
export interface StudioGroupPlan {
  tasks: StudioGroupTask[];
}
export type StudioGroupReview =
  | { status: "complete"; summary: string }
  | { status: "revise"; summary: string; tasks: StudioGroupTask[] };

export function validateStudioGroup(group: StudioGroupDefinition): string[] {
  if (
    !group ||
    !Array.isArray(group.members) ||
    !group.members.length ||
    group.members.length > MAX_GROUP_MEMBERS ||
    new Set(group.members).size !== group.members.length ||
    group.members.some((member) => !isStudioKernelId(member))
  )
    return ["Group members must be unique valid kernel identities."];
  const issues: string[] = [];
  if (!group.members.includes(group.host)) issues.push("The host must be a group member.");
  if (
    typeof group.goal !== "string" ||
    group.goal.length > 20_000 ||
    typeof group.sharedSummary !== "string" ||
    group.sharedSummary.length > 48_000
  )
    issues.push("Invalid shared group context.");
  if (
    !["manual", "task"].includes(group.mode) ||
    !["isolated", "shared"].includes(group.workspaceMode)
  )
    issues.push("Invalid group collaboration mode.");
  return issues;
}

function routingText(input: string): string {
  let fence: { char: string; length: number } | undefined;
  return input
    .split(/\r?\n/)
    .map((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker && (!fence || (marker[0] === fence.char && marker.length >= fence.length))) {
        fence = fence ? undefined : { char: marker[0]!, length: marker.length };
        return "";
      }
      return fence || /^\s*>/.test(line) ? "" : line;
    })
    .join("\n")
    .replace(/(`+)[\s\S]*?\1/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|“[^”]*”|‘[^’]*’/g, " ")
    .replace(/\b(?:https?:\/\/|mailto:)\S+/gi, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ");
}

export function routeStudioGroupMembers(
  group: StudioGroupDefinition,
  input: string,
): StudioKernelId[] {
  const issues = validateStudioGroup(group);
  if (issues.length) throw new Error(issues.join(" "));
  const found = new Set<StudioKernelId>();
  // 群成员可来自自定义 ACP 清单，不能用一份写死的 @ 匹配表丢失路由。
  const names = [...Object.keys(MENTION_ALIASES), ...group.members, "all", "所有人"]
    .filter((value, index, entries) => entries.indexOf(value) === index)
    .sort((left, right) => right.length - left.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `(^|[\\s([{])@(${names.join("|")})(?=$|[\\s,，.。!！?？:：;；)\\]}])`,
    "gi",
  );
  for (const match of routingText(input).matchAll(pattern)) {
    const name = match[2]!.toLowerCase();
    if (name === "all" || name === "所有人") {
      for (const member of group.members) found.add(member);
      continue;
    }
    const member = MENTION_ALIASES[name] ?? (isStudioKernelId(name) ? name : undefined);
    if (!member || !group.members.includes(member))
      throw new Error(`Mentioned member is not in this group: ${name}.`);
    found.add(member);
  }
  return found.size ? group.members.filter((member) => found.has(member)) : [group.host];
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function json(text: string): Record<string, unknown> {
  if (text.length > 48_000) throw new Error("Host response exceeds the structured plan limit.");
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text);
  let value: unknown;
  try {
    value = JSON.parse(fenced?.[1] ?? text);
  } catch {
    throw new Error("Host must return one valid JSON object.");
  }
  if (!object(value)) throw new Error("Host response must be a JSON object.");
  return value;
}
function tasks(value: unknown, group: StudioGroupDefinition): StudioGroupTask[] {
  if (!Array.isArray(value) || !value.length || value.length > STUDIO_GROUP_LIMITS.tasksPerRound)
    throw new Error("Host plan requires 1–8 tasks.");
  const ids = new Set<string>();
  const result = value.map((raw) => {
    if (
      !object(raw) ||
      typeof raw.id !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(raw.id) ||
      ids.has(raw.id)
    )
      throw new Error("Task IDs must be unique simple identifiers.");
    ids.add(raw.id);
    if (!group.members.includes(raw.member as StudioKernelId))
      throw new Error(`Unknown planned member: ${String(raw.member)}.`);
    if (
      typeof raw.instruction !== "string" ||
      !raw.instruction.trim() ||
      raw.instruction.length > 12_000
    )
      throw new Error("Every task requires bounded instructions.");
    const depends = raw.dependsOn ?? [];
    if (
      !Array.isArray(depends) ||
      depends.length > STUDIO_GROUP_LIMITS.tasksPerRound ||
      depends.some((id) => typeof id !== "string") ||
      new Set(depends).size !== depends.length
    )
      throw new Error("Task dependencies must be unique task IDs.");
    return {
      id: raw.id,
      member: raw.member as StudioKernelId,
      instruction: raw.instruction,
      dependsOn: depends as string[],
    };
  });
  const settled = new Set<string>();
  for (let i = 0; i < result.length; i++)
    for (const task of result)
      if (task.dependsOn.every((id) => settled.has(id))) settled.add(task.id);
  if (settled.size !== result.length)
    throw new Error("Task dependencies contain missing IDs or a cycle.");
  return result;
}
export function parseStudioGroupPlan(text: string, group: StudioGroupDefinition): StudioGroupPlan {
  return { tasks: tasks(json(text).tasks, group) };
}
export function parseStudioGroupReview(
  text: string,
  group: StudioGroupDefinition,
): StudioGroupReview {
  const value = json(text);
  if (typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 12_000)
    throw new Error("Host review requires a meaningful summary.");
  if (value.status === "complete") return { status: "complete", summary: value.summary };
  if (value.status === "revise")
    return { status: "revise", summary: value.summary, tasks: tasks(value.tasks, group) };
  throw new Error("Host review status must be complete or revise.");
}

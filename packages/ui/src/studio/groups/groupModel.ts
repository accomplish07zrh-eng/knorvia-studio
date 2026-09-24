import { isStudioKernelId, type StudioKernelId } from "../types.js";
export { isStudioKernelId } from "../types.js";

export type StudioGroupMode = "manual" | "task";
export type StudioGroupWorkspaceMode = "isolated" | "shared";

export interface StudioGroupConfig {
  name: string;
  goal: string;
  members: StudioKernelId[];
  host: StudioKernelId;
  sharedSummary: string;
  mode: StudioGroupMode;
  workspaceMode: StudioGroupWorkspaceMode;
  workspacePath?: string;
}

export interface StudioGroup extends StudioGroupConfig {
  id: string;
  draft: string;
  createdAt: number;
  updatedAt: number;
}

export const GROUP_LIMITS = { name: 80, goal: 4000, summary: 8000, draft: 32000 } as const;

/** Membership order is stable; the first remaining member becomes host after removal. */
export function normalizeGroupConfig(config: StudioGroupConfig): StudioGroupConfig | null {
  const name = config.name.trim();
  const members = [...new Set(config.members.filter(isStudioKernelId))];
  if (!name || name.length > GROUP_LIMITS.name || members.length === 0) return null;
  if (
    config.goal.length > GROUP_LIMITS.goal ||
    config.sharedSummary.length > GROUP_LIMITS.summary
  ) {
    return null;
  }
  if (config.mode !== "manual" && config.mode !== "task") return null;
  if (config.workspaceMode !== "isolated" && config.workspaceMode !== "shared") return null;
  return {
    name,
    goal: config.goal,
    members,
    host: members.includes(config.host) ? config.host : members[0]!,
    sharedSummary: config.sharedSummary,
    mode: config.mode,
    workspaceMode: config.workspaceMode,
    workspacePath: config.workspacePath?.trim() || undefined,
  };
}

export function newGroupConfig(): StudioGroupConfig {
  return {
    name: "",
    goal: "",
    members: ["knorvia"],
    host: "knorvia",
    sharedSummary: "",
    mode: "manual",
    workspaceMode: "isolated",
  };
}

export function insertGroupMention(text: string, start: number, end: number, name: string) {
  const before = text.slice(0, start);
  const mentionStart = before.match(/(?:^|\s)@[^\s@]*$/);
  const prefix = mentionStart ? before.slice(0, before.lastIndexOf("@")) : before;
  const spacer = prefix && !/\s$/.test(prefix) ? " " : "";
  const inserted = `${prefix}${spacer}@${name} `;
  return { text: inserted + text.slice(end), cursor: inserted.length };
}

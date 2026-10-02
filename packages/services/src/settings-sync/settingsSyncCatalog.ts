import * as os from "node:os";
import type {
  SettingsSyncAgent,
  SettingsSyncCategory,
  SettingsSyncSourceScope,
} from "@knorvia/shared";

export type SyncCategory = Exclude<SettingsSyncCategory, "providers">;
export type JsonRecord = Record<string, unknown>;
export interface SourceCandidate {
  category: SyncCategory;
  agent: SettingsSyncAgent;
  scope: SettingsSyncSourceScope;
  root: string;
  sourcePath: string;
  name: string;
  relativePath: string;
  defaultTargetRoot?: string;
  version?: string;
  description?: string;
  argumentHint?: string;
  pluginId?: string;
  config?: JsonRecord;
}
interface SourceLocation {
  agent: SettingsSyncAgent;
  project: string;
  global: string;
}

export const locations: SourceLocation[] = [
  { agent: "claudeCode", project: ".claude", global: ".claude" },
  { agent: "codexCli", project: ".codex", global: ".codex" },
  { agent: "openCode", project: ".opencode", global: ".config/opencode" },
  { agent: "openClaw", project: "", global: ".openclaw" },
  { agent: "augment", project: ".augment", global: ".augment" },
  { agent: "continue", project: ".continue", global: ".continue" },
  { agent: "goose", project: ".goose", global: ".config/goose" },
  { agent: "qwenCode", project: ".qwen", global: ".qwen" },
  { agent: "qode", project: ".qoder", global: ".qoder" },
  { agent: "qodeCn", project: ".qoder", global: ".qoder-cn" },
  { agent: "windsurf", project: ".windsurf", global: ".codeium/windsurf" },
  { agent: "trae", project: ".trae", global: ".trae" },
  { agent: "traeCn", project: ".trae", global: ".trae-cn" },
  { agent: "kiroCli", project: ".kiro", global: ".kiro" },
  { agent: "roo", project: ".roo", global: ".roo" },
  { agent: "codeBuddy", project: ".codebuddy", global: ".codebuddy" },
];

export type McpFormat = "json" | "toml" | "opencode";
interface McpLocation {
  agent: SettingsSyncAgent;
  project: string[];
  global: string;
  format: McpFormat;
}
export const mcpLocations: McpLocation[] = [
  {
    agent: "claudeCode",
    project: [".claude/settings.json", ".mcp.json"],
    global: ".claude/settings.json",
    format: "json",
  },
  {
    agent: "codexCli",
    project: [".codex/config.toml"],
    global: ".codex/config.toml",
    format: "toml",
  },
  {
    agent: "openCode",
    project: [".opencode/opencode.json"],
    global: ".config/opencode/opencode.json",
    format: "opencode",
  },
  {
    agent: "openClaw",
    project: ["settings.json"],
    global: ".openclaw/settings.json",
    format: "json",
  },
  {
    agent: "qwenCode",
    project: [".qwen/settings.json"],
    global: ".qwen/settings.json",
    format: "json",
  },
  {
    agent: "qode",
    project: [".qoder/settings.json"],
    global: ".qoder/settings.json",
    format: "json",
  },
  {
    agent: "qodeCn",
    project: [".qoder/settings.json"],
    global: ".qoder-cn/settings.json",
    format: "json",
  },
  {
    agent: "trae",
    project: [".trae/settings.json"],
    global: ".trae/settings.json",
    format: "json",
  },
  {
    agent: "kiroCli",
    project: [".kiro/settings.json"],
    global: ".kiro/settings.json",
    format: "json",
  },
  { agent: "roo", project: [".roo/settings.json"], global: ".roo/settings.json", format: "json" },
  {
    agent: "codeBuddy",
    project: [".codebuddy/settings.json"],
    global: ".codebuddy/settings.json",
    format: "json",
  },
  { agent: "agents", project: [".agents/mcp.json"], global: ".agents/mcp.json", format: "json" },
];

export const supportedCategories: SyncCategory[] = ["skills", "commands", "plugins", "mcpServers"];
export function isSyncCategory(value: SettingsSyncCategory): value is SyncCategory {
  return supportedCategories.includes(value as SyncCategory);
}
export function sourceHome(): string {
  return process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || os.homedir();
}
export function agentOrder(category: SyncCategory): SettingsSyncAgent[] {
  return category === "mcpServers"
    ? mcpLocations.map((location) => location.agent)
    : locations
        .filter((location) => category === "skills" || location.agent !== "traeCn")
        .map((location) => location.agent);
}

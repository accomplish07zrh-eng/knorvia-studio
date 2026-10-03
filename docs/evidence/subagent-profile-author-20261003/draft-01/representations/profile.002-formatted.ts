import { basename } from "node:path";
import type { ModelSelection } from "@knorvia/shared";
import { EXPLORE_AGENT_TYPE } from "./explore.js";
import { formatExploreAllowedToolsForAgentDescription } from "./explore-tools.js";
import { buildGeneralPurposeSystemPrompt, GENERAL_PURPOSE_AGENT_TYPE } from "./general-purpose.js";
import { parseAgentFrontmatter, splitMarkdownFrontmatter } from "./profile-frontmatter.js";
import { resolveProfileModelSelection } from "./profile-model-selection.js";
import { filterSubagentChildToolNames } from "./tool-policy.js";

export const DEFAULT_SUBAGENT_TYPE: "general-purpose" = GENERAL_PURPOSE_AGENT_TYPE;
export type BuiltInSubagentModelSelectionOverrides = Partial<
  Record<typeof DEFAULT_SUBAGENT_TYPE | typeof EXPLORE_AGENT_TYPE, ModelSelection>
>;
export type AgentPermissionMode = "auto" | "plan";
export type AgentProfileSource = "built-in" | "project" | "user";
export type AgentMemoryScope = "user" | "project" | "local";
export interface AgentProfile {
  background?: boolean;
  color?: "red" | "blue" | "green" | "yellow" | "purple" | "orange" | "pink" | "cyan";
  description: string;
  disallowedTools?: readonly string[];
  injectAgentsMd?: boolean;
  maxTurns?: number;
  mcpServers?: readonly string[];
  memory?: AgentMemoryScope;
  modelSelection?: ModelSelection;
  name: string;
  path?: string;
  permissionMode?: AgentPermissionMode;
  skills?: readonly string[];
  source: AgentProfileSource;
  systemPrompt: string;
  tools?: readonly string[];
}
export interface AgentProfileParseDiagnostic {
  code: string;
  message: string;
  path?: string;
}
export interface AgentProfileLoadResult {
  diagnostics: AgentProfileParseDiagnostic[];
  profiles: AgentProfile[];
}

export function createBuiltInExploreAgentProfile(options?: {
  modelSelection?: ModelSelection;
}): AgentProfile {
  return {
    name: EXPLORE_AGENT_TYPE,
    description: EXPLORE_DESCRIPTION,
    color: "cyan",
    injectAgentsMd: false,
    ...(options?.modelSelection ? { modelSelection: options.modelSelection } : {}),
    source: "built-in",
    systemPrompt: "",
    tools: ["Bash", "Glob", "Grep", "Read", "WebFetch", "WebSearch", "TodoWrite"],
  };
}

export function isBuiltInExploreAgentProfile(
  profile: Pick<AgentProfile, "name" | "source">,
): boolean {
  return profile.name === EXPLORE_AGENT_TYPE && profile.source === "built-in";
}

export function normalizeAgentProfiles(
  profiles: readonly AgentProfile[],
  options?: { builtInModelSelectionOverrides?: BuiltInSubagentModelSelectionOverrides },
): AgentProfile[] {
  const general = createBuiltInGeneralPurposeAgentProfile({
    modelSelection: options?.builtInModelSelectionOverrides?.[DEFAULT_SUBAGENT_TYPE],
  });
  const explore = createBuiltInExploreAgentProfile({
    modelSelection: options?.builtInModelSelectionOverrides?.[EXPLORE_AGENT_TYPE],
  });
  const byName = new Map<string, AgentProfile>([
    [general.name, general],
    [explore.name, explore],
  ]);
  for (const profile of profiles) byName.set(profile.name, profile);
  return [...byName.values()];
}

export function createBuiltInGeneralPurposeAgentProfile(options?: {
  modelSelection?: ModelSelection;
}): AgentProfile {
  return {
    name: DEFAULT_SUBAGENT_TYPE,
    description: GENERAL_DESCRIPTION,
    color: "blue",
    injectAgentsMd: true,
    ...(options?.modelSelection ? { modelSelection: options.modelSelection } : {}),
    source: "built-in",
    systemPrompt: buildGeneralPurposeSystemPrompt(),
    tools: ["*"],
  };
}

export function formatAgentProfilesForPrompt(
  profiles: readonly AgentProfile[],
  options?: { embeddedSearchEnabled?: boolean },
): string | null {
  const rows = normalizeAgentProfiles(profiles).map((profile) => {
    let tools: string | readonly string[] | undefined;
    if (isBuiltInExploreAgentProfile(profile)) {
      tools = formatExploreAllowedToolsForAgentDescription(options);
    } else if (profile.tools) {
      tools = filterSubagentChildToolNames(profile.tools, profile.disallowedTools);
    }
    const toolText = typeof tools === "string" ? tools : (tools?.join(", ") ?? "");
    return `- ${profile.name}: ${profile.description}${toolText ? ` (Tools: ${toolText})` : ""}`;
  });
  return ["Available agent types and the tools they have access to:", ...rows].join("\n");
}

export function parseAgentProfileFromMarkdown(input: {
  content: string;
  path?: string;
  source: AgentProfileSource;
}): { diagnostic?: AgentProfileParseDiagnostic; profile?: AgentProfile } {
  const { body, frontmatter } = splitMarkdownFrontmatter(input.content);
  const location = input.path ?? "<inline>";
  if (!frontmatter) {
    return {
      diagnostic: {
        code: "agent_missing_frontmatter",
        message: `Agent Markdown must include frontmatter: ${location}`,
        path: input.path,
      },
    };
  }
  const { values, mcpServers } = parseAgentFrontmatter(frontmatter);
  const name = trimmedScalar(values.name);
  const description = trimmedScalar(values.description);
  if (!name || !description) {
    return {
      diagnostic: {
        code: "agent_missing_required_frontmatter",
        message: `Agent frontmatter must include ${!name ? "name" : "description"}: ${location}`,
        path: input.path,
      },
    };
  }
  const modelSelection = resolveProfileModelSelection(values);
  const color = profileColor(values.color);
  const permissionMode =
    input.source === "project" ? undefined : profilePermission(values.permissionMode);
  const maxTurns = positiveTurnLimit(values.maxTurns);
  const memory = profileMemory(values.memory);
  let diagnostic: AgentProfileParseDiagnostic | undefined;
  if (values.memory !== undefined && memory === undefined) {
    diagnostic = {
      code: "agent_invalid_memory_scope",
      message: `Agent frontmatter memory must be user, project, or local: ${location}`,
      path: input.path,
    };
  }
  if (mcpServers === null) {
    return {
      diagnostic: {
        code: "agent_invalid_mcp_servers",
        message: `Agent frontmatter mcpServers must be a list of parent server names: ${location}`,
        path: input.path,
      },
    };
  }
  const tools = toolList(values.tools);
  const disallowedTools = toolList(values.disallowedTools);
  const skills = stringList(values.skills);
  const background = profileBoolean(values.background);
  const injectAgentsMd = profileBoolean(values.injectAgentsMd);
  const profile: AgentProfile = {
    name,
    description: description.replace(/\\n/g, "\n"),
    source: input.source,
    systemPrompt: body.trim(),
    ...(input.path ? { path: input.path } : {}),
    ...(modelSelection ? { modelSelection } : {}),
    ...(color ? { color } : {}),
    ...(permissionMode ? { permissionMode } : {}),
    ...(maxTurns !== undefined ? { maxTurns } : {}),
    ...(memory ? { memory } : {}),
    ...(tools !== undefined ? { tools } : {}),
    ...(disallowedTools?.length ? { disallowedTools } : {}),
    ...(skills?.length ? { skills } : {}),
    ...(background !== undefined ? { background } : {}),
    ...(injectAgentsMd !== undefined ? { injectAgentsMd } : {}),
    ...(mcpServers !== undefined ? { mcpServers } : {}),
  };
  return { ...(diagnostic ? { diagnostic } : {}), profile };
}

export function agentProfileDisplayName(profile: AgentProfile): string {
  return profile.path ? `${profile.name} (${basename(profile.path)})` : profile.name;
}

const GENERAL_DESCRIPTION =
  "General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.";
const EXPLORE_DESCRIPTION =
  'Read-only search agent for broad fan-out searches - when answering means sweeping many files, directories, or naming conventions and you only need the conclusion, not the file dumps. It reads excerpts rather than whole files, so it locates code; it doesn\'t review or audit it. Specify search breadth: "medium" for moderate exploration, "very thorough" for multiple locations and naming conventions.';

function trimmedScalar(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function profileColor(value: unknown): AgentProfile["color"] {
  const color = trimmedScalar(value);
  switch (color) {
    case "red":
    case "blue":
    case "green":
    case "yellow":
    case "purple":
    case "orange":
    case "pink":
    case "cyan":
      return color;
    default:
      return undefined;
  }
}

function profilePermission(value: unknown): AgentPermissionMode | undefined {
  const mode = trimmedScalar(value);
  return mode === "auto" || mode === "plan" ? mode : undefined;
}

function positiveTurnLimit(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : undefined;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const turns = Number(value);
    return turns > 0 ? turns : undefined;
  }
  return undefined;
}

function profileMemory(value: unknown): AgentMemoryScope | undefined {
  return value === "user" || value === "project" || value === "local" ? value : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (typeof value === "string")
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  return undefined;
}

function toolList(value: unknown): string[] | undefined {
  let specs: string[];
  if (Array.isArray(value)) {
    specs = stringList(value)!;
  } else if (typeof value === "string") {
    specs = toolTokens(value);
  } else {
    return undefined;
  }
  const names = specs.map((spec) => spec.trim().split("(", 1)[0]!.trim()).filter(Boolean);
  return names.length || Array.isArray(value) ? names : undefined;
}

function toolTokens(text: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of text) {
    if (depth === 0 && (character === "," || /\s/.test(character))) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += character;
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
  }
  if (current) tokens.push(current);
  return tokens;
}

function profileBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  return lower === "true" ? true : lower === "false" ? false : undefined;
}

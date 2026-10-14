// SPDX-License-Identifier: Apache-2.0
// 子代理档案：内置档案的构造、档案合并、Markdown 档案的解析与展示名。
// 内置档案的字段顺序是契约的一部分（下游按 JSON 键序比对），构造时一律按序显式赋值。
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

const GENERAL_PURPOSE_DESCRIPTION =
  "General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you."; // 内置描述文案
const EXPLORE_AGENT_DESCRIPTION =
  'Read-only search agent for broad fan-out searches - when answering means sweeping many files, directories, or naming conventions and you only need the conclusion, not the file dumps. It reads excerpts rather than whole files, so it locates code; it doesn\'t review or audit it. Specify search breadth: "medium" for moderate exploration, "very thorough" for multiple locations and naming conventions.'; // 内置描述文案
const EXPLORE_AGENT_TOOLS = ["Bash", "Glob", "Grep", "Read", "WebFetch", "WebSearch", "TodoWrite"];
const ALL_TOOLS = ["*"];
const BUILT_IN_SOURCE: AgentProfileSource = "built-in";
const EXPLORE_INJECTS_AGENTS_MD = false;
const GENERAL_PURPOSE_INJECTS_AGENTS_MD = true;
const NO_VALUE = undefined;
const ALLOWED_COLORS = new Set("red blue green yellow purple orange pink cyan".split(" "));
const ALLOWED_PERMISSION_MODES = new Set(["auto", "plan"]);
const ALLOWED_MEMORY_SCOPES = new Set(["user", "project", "local"]);
const DIGITS_ONLY = /^[0-9]+$/u;
const TOOL_TOKEN_SEPARATORS = /[,\s]/u;

interface BuiltInProfileOptions {
  modelSelection?: ModelSelection;
}

// 内置 explore 档案：只读搜索，不注入 AGENTS.md，工具集固定。
export function createBuiltInExploreAgentProfile(
  options: BuiltInProfileOptions = {},
): AgentProfile {
  const selection = options.modelSelection ? { modelSelection: options.modelSelection } : {};
  return Object.assign(
    {
      name: EXPLORE_AGENT_TYPE,
      description: EXPLORE_AGENT_DESCRIPTION,
      color: "cyan" as const,
      injectAgentsMd: EXPLORE_INJECTS_AGENTS_MD,
    },
    selection,
    { source: BUILT_IN_SOURCE, systemPrompt: "", tools: EXPLORE_AGENT_TOOLS },
  );
}

type ProfileIdentity = Pick<AgentProfile, "name" | "source">;

export function isBuiltInExploreAgentProfile(profile: ProfileIdentity): boolean {
  const isExplore = profile.name === EXPLORE_AGENT_TYPE;
  return isExplore && profile.source === BUILT_IN_SOURCE;
}

// 合并档案：两个内置档案先入表，调用方给的同名档案覆盖它们；返回顺序 = 入表顺序。
export function normalizeAgentProfiles(
  profiles: readonly AgentProfile[],
  options: { builtInModelSelectionOverrides?: BuiltInSubagentModelSelectionOverrides } = {},
): AgentProfile[] {
  const overrides = options.builtInModelSelectionOverrides ?? {};
  const general = createBuiltInGeneralPurposeAgentProfile({
    modelSelection: overrides[DEFAULT_SUBAGENT_TYPE],
  });
  const explore = createBuiltInExploreAgentProfile({
    modelSelection: overrides[EXPLORE_AGENT_TYPE],
  });
  const byName = new Map<string, AgentProfile>();
  byName.set(general.name, general);
  byName.set(explore.name, explore);
  for (const profile of profiles) byName.set(profile.name, profile);
  return [...byName.values()];
}

// 内置 general-purpose 档案：默认子代理类型，注入 AGENTS.md，工具集为全量。
export function createBuiltInGeneralPurposeAgentProfile(
  options: BuiltInProfileOptions = {},
): AgentProfile {
  const selection = options.modelSelection ? { modelSelection: options.modelSelection } : {};
  return Object.assign(
    {
      name: DEFAULT_SUBAGENT_TYPE,
      description: GENERAL_PURPOSE_DESCRIPTION,
      color: "blue" as const,
      injectAgentsMd: GENERAL_PURPOSE_INJECTS_AGENTS_MD,
    },
    selection,
    {
      source: BUILT_IN_SOURCE,
      systemPrompt: buildGeneralPurposeSystemPrompt(),
      tools: ALL_TOOLS,
    },
  );
}

// 提示词里的一行：`- 名字: 描述 (Tools: ...)`；explore 用只读工具清单，其余用过滤后的工具名。
function agentProfilePromptRow(profile: AgentProfile, options: PromptFormatOptions): string {
  let tools: string | readonly string[] | undefined;
  if (isBuiltInExploreAgentProfile(profile)) {
    tools = formatExploreAllowedToolsForAgentDescription(options);
  } else if (profile.tools) {
    tools = filterSubagentChildToolNames(profile.tools, profile.disallowedTools);
  }
  const toolText = typeof tools === "string" ? tools : (tools?.join(", ") ?? "");
  const toolsSuffix = toolText ? ` (Tools: ${toolText})` : "";
  return `- ${profile.name}: ${profile.description}${toolsSuffix}`;
}

interface PromptFormatOptions {
  embeddedSearchEnabled?: boolean;
}

type AgentTypesPrompt = string | null;

export function formatAgentProfilesForPrompt(
  profiles: readonly AgentProfile[],
  options: PromptFormatOptions = {},
): AgentTypesPrompt {
  const rows = normalizeAgentProfiles(profiles).map((profile) =>
    agentProfilePromptRow(profile, options),
  );
  return ["Available agent types and the tools they have access to:", ...rows].join("\n");
}

// 早期失败一律返回只带 diagnostic 的结果（键序 code/message/path）。
function diagnosticOnly(
  code: string,
  message: string,
  path: string | undefined,
): { diagnostic: AgentProfileParseDiagnostic } {
  const diagnostic: AgentProfileParseDiagnostic = { code: code, message: message, path: path };
  return { diagnostic: diagnostic };
}

export function parseAgentProfileFromMarkdown(input: {
  content: string;
  path?: string;
  source: AgentProfileSource;
}): { diagnostic?: AgentProfileParseDiagnostic; profile?: AgentProfile } {
  const { body, frontmatter } = splitMarkdownFrontmatter(input.content);
  const location = input.path ?? "<inline>";
  if (!frontmatter) {
    const message = `Agent Markdown must include frontmatter: ${location}`;
    return diagnosticOnly("agent_missing_frontmatter", message, input.path);
  }
  const { values, mcpServers } = parseAgentFrontmatter(frontmatter);
  const name = scalarOrUndefined(values.name);
  const description = scalarOrUndefined(values.description);
  if (!name || !description) {
    const missingField = !name ? "name" : "description";
    const message = `Agent frontmatter must include ${missingField}: ${location}`;
    return diagnosticOnly("agent_missing_required_frontmatter", message, input.path);
  }
  const modelSelection = resolveProfileModelSelection(values);
  const color = allowedColor(values.color);
  const parsedPermission = allowedPermission(values.permissionMode);
  const permissionMode = input.source === "project" ? undefined : parsedPermission;
  const maxTurns = turnLimitOf(values.maxTurns);
  const memory = memoryScopeOf(values.memory);
  let diagnostic: AgentProfileParseDiagnostic | undefined;
  if (values.memory !== undefined && memory === undefined) {
    const message = `Agent frontmatter memory must be user, project, or local: ${location}`;
    diagnostic = { code: "agent_invalid_memory_scope", message: message, path: input.path };
  }
  const hasInvalidMcpServers = mcpServers === null;
  if (hasInvalidMcpServers) {
    const message = `Agent frontmatter mcpServers must be a list of parent server names: ${location}`;
    return diagnosticOnly("agent_invalid_mcp_servers", message, input.path);
  }
  const tools = toolNamesOf(values.tools);
  const disallowedTools = toolNamesOf(values.disallowedTools);
  const skills = stringArrayOf(values.skills);
  const background = booleanFlagOf(values.background);
  const injectAgentsMd = booleanFlagOf(values.injectAgentsMd);
  const profile: AgentProfile = {
    name: name,
    description: description.replace(/\\n/g, "\n"),
    source: input.source,
    systemPrompt: body.trim(),
  };
  if (input.path) profile.path = input.path;
  if (modelSelection) profile.modelSelection = modelSelection;
  if (color) profile.color = color;
  if (permissionMode) profile.permissionMode = permissionMode;
  if (maxTurns !== undefined) profile.maxTurns = maxTurns;
  if (memory) profile.memory = memory;
  if (tools !== undefined) profile.tools = tools;
  if (disallowedTools?.length) profile.disallowedTools = disallowedTools;
  if (skills?.length) profile.skills = skills;
  if (background !== undefined) profile.background = background;
  if (injectAgentsMd !== undefined) profile.injectAgentsMd = injectAgentsMd;
  if (mcpServers !== undefined) profile.mcpServers = mcpServers;
  const result: { diagnostic?: AgentProfileParseDiagnostic; profile?: AgentProfile } = {};
  if (diagnostic) result.diagnostic = diagnostic;
  result.profile = profile;
  return result;
}

export function agentProfileDisplayName(profile: AgentProfile): string {
  if (!profile.path) return profile.name;
  return `${profile.name} (${basename(profile.path)})`;
}

// 去空白后的标量：非字符串与全空白都算没有。
function scalarOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function allowedColor(value: unknown): AgentProfile["color"] {
  const color = scalarOrUndefined(value);
  if (!color) return undefined;
  return ALLOWED_COLORS.has(color) ? (color as AgentProfile["color"]) : undefined;
}

function allowedPermission(value: unknown): AgentPermissionMode | undefined {
  const mode = scalarOrUndefined(value);
  if (!mode) return undefined;
  return ALLOWED_PERMISSION_MODES.has(mode) ? (mode as AgentPermissionMode) : undefined;
}

// 回合上限：数字要求正整数；字符串只认纯数字；其余算没有。
function turnLimitOf(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : undefined;
  if (typeof value !== "string" || !DIGITS_ONLY.test(value)) return undefined;
  const turns = Number(value);
  return turns > 0 ? turns : undefined;
}

function memoryScopeOf(value: unknown): AgentMemoryScope | undefined {
  if (typeof value !== "string") return undefined;
  return ALLOWED_MEMORY_SCOPES.has(value) ? (value as AgentMemoryScope) : undefined;
}

function stringArrayOf(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }
  if (typeof value === "string") {
    const parts = value.split(/[,\s]+/u).map((item) => item.trim());
    return parts.filter(Boolean);
  }
  return NO_VALUE;
}

// 工具清单：数组直接取字符串项，字符串按顶层逗号/空白切分；两种来源都要去掉 `(…)` 参数后缀。
function toolNamesOf(value: unknown): string[] | undefined {
  let specs: string[];
  if (Array.isArray(value)) {
    specs = stringArrayOf(value)!;
  } else if (typeof value === "string") {
    specs = splitToolTokens(value);
  } else {
    return NO_VALUE;
  }
  const names = specs.map((spec) => spec.trim().split("(", 1)[0]!.trim()).filter(Boolean);
  return names.length || Array.isArray(value) ? names : undefined;
}

// 顶层切分：括号内的逗号与空白不算分隔符（`Read(path, x)` 是一个 token）。
function splitToolTokens(text: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let token = "";
  for (const character of text) {
    const atTopLevel = depth === 0;
    if (atTopLevel && TOOL_TOKEN_SEPARATORS.test(character)) {
      if (token) tokens.push(token);
      token = "";
    } else {
      token += character;
      if (character === "(") depth += 1;
      if (character === ")") depth = Math.max(0, depth - 1);
    }
  }
  if (token) tokens.push(token);
  return tokens;
}

function booleanFlagOf(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  if (lower === "true") return true;
  return lower === "false" ? false : undefined;
}

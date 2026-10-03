import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  createAgentStateId,
  formatSubagentMarkdownModel,
  parseSubagentMarkdownSelection,
} from "@knorvia/shared";
import type {
  AgentColor,
  AgentDiagnostic,
  AgentPermissionMode,
  AgentScope,
  AgentSummary,
  SubAgentConfig,
} from "@knorvia/shared";

interface ParseSubagentMarkdownInput {
  content: string;
  path: string;
  scope: AgentScope;
}

interface ParseSubagentMarkdownResult {
  agent?: AgentSummary;
  diagnostic?: AgentDiagnostic;
}

function sections(content: string): { frontmatter?: string; body: string } {
  const normalized = content.replace(/^\uFEFF/u, "").replace(/\r\n/gu, "\n");
  if (!normalized.startsWith("---")) return { body: normalized };
  const rows = normalized.split("\n");
  if (rows[0]?.trim() !== "---") return { body: normalized };
  const end = rows.findIndex((row, index) => index > 0 && row.trim() === "---");
  if (end < 0) return { body: normalized };
  return { frontmatter: rows.slice(1, end).join("\n"), body: rows.slice(end + 1).join("\n") };
}

function stripComment(value: string): string {
  let quote: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if ((character === "'" || character === '"') && value[index - 1] !== "\\") {
      if (quote === character) quote = undefined;
      else if (!quote) quote = character;
    } else if (character === "#" && !quote && /\s/u.test(value[index - 1] ?? "")) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}

function unquote(value: string): string {
  const first = value[0];
  return (first === "'" || first === '"') && value.endsWith(first) ? value.slice(1, -1) : value;
}

function listItems(value: string): string[] {
  const result: string[] = [];
  let quote: string | undefined;
  let depth = 0;
  let item = "";
  for (const character of value) {
    if ((character === "'" || character === '"') && !quote) {
      quote = character;
      item += character;
      continue;
    }
    if (character === quote) {
      quote = undefined;
      item += character;
      continue;
    }
    if (!quote) {
      if (character === "(") depth += 1;
      else if (character === ")") depth = Math.max(0, depth - 1);
      if (character === "," && depth === 0) {
        if (item.trim()) result.push(item.trim());
        item = "";
        continue;
      }
    }
    item += character;
  }
  if (item.trim()) result.push(item.trim());
  return result;
}

function looseScalar(raw: string): unknown {
  const value = stripComment(raw.trim());
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/u.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    return listItems(value.slice(1, -1)).map((item) => unquote(stripComment(item.trim())));
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return unquote(value);
}

function looseFields(text: string): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  let pending: string | undefined;
  for (const row of text.split(/\r?\n/u)) {
    const line = row.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const entry = /^\s*-\s+(.*)$/u.exec(line);
    if (entry && pending) {
      const previous = values[pending];
      values[pending] = [...(Array.isArray(previous) ? previous : []), looseScalar(entry[1] ?? "")];
      continue;
    }
    pending = undefined;
    const field = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/u.exec(line);
    if (!field) continue;
    const key = field[1]!;
    const raw = field[2] ?? "";
    if (!raw.trim()) {
      values[key] = [];
      pending = key;
    } else {
      values[key] = looseScalar(raw);
    }
  }
  return values;
}

function frontmatterFields(text: string): Record<string, unknown> {
  const loose = looseFields(text);
  let yamlValues: Record<string, unknown> = {};
  try {
    const parsed: unknown = parseYaml(text);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      yamlValues = parsed as Record<string, unknown>;
    }
  } catch {
    yamlValues = {};
  }
  return {
    ...yamlValues,
    ...loose,
    ...(Array.isArray(yamlValues.mcpServers) ? { mcpServers: yamlValues.mcpServers } : {}),
  };
}

function scalarString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function colorValue(value: unknown): AgentColor | undefined {
  const color = scalarString(value);
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

function permissionValue(value: unknown): AgentPermissionMode | undefined {
  const mode = scalarString(value);
  return mode === "auto" || mode === "plan" ? mode : undefined;
}

function turnLimit(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : undefined;
  if (typeof value === "string" && /^\d+$/u.test(value) && Number(value) > 0) return Number(value);
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  return lower === "true" ? true : lower === "false" ? false : undefined;
}

function cleanStrings(values: unknown[]): string[] | undefined {
  const strings = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return strings.length ? strings : undefined;
}

function toolNames(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return cleanStrings(value);
  if (typeof value !== "string") return undefined;
  const items: string[] = [];
  let depth = 0;
  let item = "";
  for (const character of value) {
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (character === "," || /\s/u.test(character))) {
      if (item.trim()) items.push(item.trim());
      item = "";
    } else {
      item += character;
    }
  }
  if (item.trim()) items.push(item.trim());
  return items.length ? items : undefined;
}

function skillNames(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return cleanStrings(value);
  return typeof value === "string" ? cleanStrings(value.split(/[,\s]+/u)) : undefined;
}

function missing(path: string, field?: string): ParseSubagentMarkdownResult {
  return {
    diagnostic: {
      code: field ? "agent_missing_required_frontmatter" : "agent_missing_frontmatter",
      message: field
        ? `Agent frontmatter must include ${field}: ${path}`
        : `Agent Markdown must include frontmatter: ${path}`,
      path,
    },
  };
}

export function parseSubagentMarkdown(
  input: ParseSubagentMarkdownInput,
): ParseSubagentMarkdownResult {
  const { frontmatter, body } = sections(input.content);
  if (!frontmatter) return missing(input.path);
  const fields = frontmatterFields(frontmatter);
  const name = scalarString(fields.name);
  const description = scalarString(fields.description)?.replace(/\\n/gu, "\n");
  if (!name) return missing(input.path, "name");
  if (!description) return missing(input.path, "description");
  const source = input.scope === "built-in" ? "built-in" : "user";
  const modelSelection = parseSubagentMarkdownSelection(fields);
  const color = colorValue(fields.color);
  const permissionMode = permissionValue(fields.permissionMode);
  const maxTurns = turnLimit(fields.maxTurns);
  const background = booleanValue(fields.background);
  const injectAgentsMd = booleanValue(fields.injectAgentsMd);
  const tools = toolNames(fields.tools);
  const disallowedTools = toolNames(fields.disallowedTools);
  const skills = skillNames(fields.skills);
  const mcpServers = Array.isArray(fields.mcpServers) ? fields.mcpServers : undefined;
  return {
    agent: {
      id: createAgentStateId({ name, scope: input.scope, source }),
      name,
      description,
      systemPrompt: body.trim(),
      ...(color ? { color } : {}),
      ...(modelSelection ? { modelSelection } : {}),
      ...(tools ? { tools } : {}),
      ...(disallowedTools ? { disallowedTools } : {}),
      ...(skills ? { skills } : {}),
      ...(permissionMode ? { permissionMode } : {}),
      ...(maxTurns ? { maxTurns } : {}),
      ...(background !== undefined ? { background } : {}),
      ...(injectAgentsMd !== undefined ? { injectAgentsMd } : {}),
      ...(mcpServers ? { mcpServers } : {}),
      path: input.path,
      scope: input.scope,
      source,
      enabled: true,
      readOnly: input.scope === "built-in",
    },
  };
}

function escapeQuoted(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, '\\"')
    .replace(/\n/gu, "\\n")
    .replace(/\r/gu, "\\r");
}

function formatScalar(value: string): string {
  const plain =
    value.length > 0 &&
    value.trim() === value &&
    !/^(?:false|null|true|~)$/iu.test(value) &&
    !/^[-+]?(?:\d+|\d*\.\d+)(?:e[-+]?\d+)?$/iu.test(value) &&
    !/^[*?:,[\]{}&!|>'"%@`-]/u.test(value) &&
    !value.includes("#") &&
    !/:\s/u.test(value) &&
    /^[A-Za-z0-9_./@*][A-Za-z0-9_./@*\s()-]*$/u.test(value);
  return plain ? value : `"${escapeQuoted(value)}"`;
}

function appendScalar(lines: string[], key: string, value: string | undefined): void {
  if (value !== undefined && value.length > 0) lines.push(`${key}: ${formatScalar(value)}`);
}

function appendList(lines: string[], key: string, values: string[] | undefined): void {
  if (!values?.length) return;
  lines.push(`${key}:`);
  for (const value of values) lines.push(`  - ${formatScalar(value)}`);
}

function appendUnknownList(lines: string[], key: string, values: unknown[] | undefined): void {
  if (!values?.length) return;
  if (values.every((value): value is string => typeof value === "string")) {
    appendList(lines, key, values);
  } else {
    lines.push(
      ...stringifyYaml({ [key]: values }, { lineWidth: 0 })
        .trimEnd()
        .split("\n"),
    );
  }
}

function formatBody(value: string): string {
  const body = value.trim();
  return body ? `\n${body}\n` : "\n";
}

export function serializeSubagentMarkdown(config: SubAgentConfig): string {
  const lines = [
    `name: "${escapeQuoted(config.name)}"`,
    `description: "${escapeQuoted(config.description)}"`,
  ];
  appendScalar(lines, "color", config.color);
  if (config.modelSelection) {
    appendScalar(lines, "model", formatSubagentMarkdownModel(config.modelSelection));
    appendScalar(lines, "thoughtLevel", config.modelSelection.options?.reasoningLevel);
  }
  appendList(lines, "tools", config.tools);
  appendList(lines, "disallowedTools", config.disallowedTools);
  appendList(lines, "skills", config.skills);
  appendScalar(lines, "permissionMode", config.permissionMode);
  if (config.maxTurns !== undefined) lines.push(`maxTurns: ${config.maxTurns}`);
  if (config.background !== undefined)
    lines.push(`background: ${config.background ? "true" : "false"}`);
  if (config.injectAgentsMd !== undefined)
    lines.push(`injectAgentsMd: ${config.injectAgentsMd ? "true" : "false"}`);
  appendUnknownList(lines, "mcpServers", config.mcpServers);
  return `---\n${lines.join("\n")}\n---\n${formatBody(config.systemPrompt)}`;
}

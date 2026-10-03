import { access, lstat, readFile, readdir } from "node:fs/promises";
import type { AgentDiagnostic, AgentScope, AgentSummary, SubAgentConfig } from "@knorvia/shared";
import { join } from "node:path";
import { parseSubagentMarkdown, serializeSubagentMarkdown } from "./subagentMarkdown.js";
import { normalizeSubagentModelSelection } from "./subagentModelSelection.js";

export const builtInNames = ["general-purpose", "Explore"] as const;

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function collectMarkdown(root: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  const stat = await lstat(root).catch(() => undefined);
  if (!stat?.isDirectory()) return [];
  const paths: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...(await collectMarkdown(path)));
    else if (entry.isFile() && /\.(md|markdown)$/iu.test(entry.name)) paths.push(path);
  }
  return paths.sort((left, right) => left.localeCompare(right));
}

export async function readProfiles(
  root: string,
  scope: "user" | "workspace",
  workspacePath: string,
  diagnostics: AgentDiagnostic[],
): Promise<AgentSummary[]> {
  const profiles: AgentSummary[] = [];
  for (const path of await collectMarkdown(root)) {
    try {
      const parsed = parseSubagentMarkdown({
        content: await readFile(path, "utf-8"),
        path,
        scope,
      });
      if (parsed.diagnostic) {
        diagnostics.push(parsed.diagnostic);
        continue;
      }
      if (parsed.agent) {
        profiles.push({
          ...parsed.agent,
          projectPath: scope === "workspace" ? workspacePath : undefined,
        });
      }
    } catch {
      diagnostics.push({
        code: "agent_read_failed",
        message: "Failed to read agent Markdown: " + path,
        path,
      });
    }
  }
  return profiles;
}

export function validateConfig(config: SubAgentConfig): void {
  const name = config.name.trim();
  if (name.length < 3 || name.length > 50) {
    throw new Error("Name must be between 3 and 50 characters");
  }
  if (!/^[a-zA-Z0-9-]+$/u.test(name)) {
    throw new Error("Name can only contain letters, numbers, and hyphens");
  }
  if (!config.description.trim()) throw new Error("Description is required");
  if (!config.systemPrompt.trim()) throw new Error("System prompt is required");
  if (builtInNames.some((builtIn) => builtIn === name)) {
    throw new Error('Agent name "' + name + '" is reserved by a built-in agent');
  }
}

export function savedProfile(
  config: SubAgentConfig,
  path: string,
  scope: AgentScope,
  workspacePath?: string,
): { content: string; agent: AgentSummary } {
  const content = serializeSubagentMarkdown({
    ...config,
    name: config.name.trim(),
    description: config.description.trim(),
    systemPrompt: config.systemPrompt.trim(),
    modelSelection: normalizeSubagentModelSelection(config.modelSelection),
  });
  const parsed = parseSubagentMarkdown({ content, path, scope });
  if (parsed.diagnostic || !parsed.agent) {
    throw new Error(parsed.diagnostic?.message ?? "Failed to parse saved agent: " + path);
  }
  return {
    content,
    agent: {
      ...parsed.agent,
      projectPath: scope === "workspace" ? workspacePath : undefined,
    },
  };
}

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getKnorviaDataRootDir } from "#src/paths.js";
import { isRecord } from "./skillDefinitions.js";

export function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function getSkillHome(): string {
  return process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || homedir();
}

export function getUserCommonRoot(): string {
  return join(getKnorviaDataRootDir(), "skills");
}

export function getUserAgentsRoot(): string {
  return join(getSkillHome(), ".agents", "skills");
}

export function getWorkspaceCommonRoot(workspacePath: string): string {
  return join(workspacePath, ".knorvia-studio", "skills");
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function getWorkspaceSkillRoots(workspacePath: string): Promise<string[]> {
  let current = workspacePath;
  let worktreeRoot: string | undefined;
  while (true) {
    if (await exists(join(current, ".git"))) {
      worktreeRoot = current;
      break;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const bases = [workspacePath];
  if (worktreeRoot !== undefined) {
    current = workspacePath;
    while (current !== worktreeRoot) {
      const parent = dirname(current);
      if (parent === current) break;
      bases.push(parent);
      current = parent;
    }
  }
  return [
    ...new Set(
      bases.flatMap((base) => [getWorkspaceCommonRoot(base), join(base, ".agents", "skills")]),
    ),
  ];
}

function getCliConfigPath(): string {
  return join(getKnorviaDataRootDir(), "cli", "config.json");
}

export async function readCliConfig(): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(getCliConfigPath(), "utf-8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function readEnabledMap(): Promise<Record<string, boolean>> {
  const config = await readCliConfig();
  const skills = isRecord(config.skills) ? config.skills : {};
  const enabled: Record<string, boolean> = {};
  for (const [path, value] of Object.entries(skills)) {
    if (isRecord(value) && typeof value.enable === "boolean") {
      enabled[normalizedPath(path)] = value.enable;
    }
  }
  return enabled;
}

export async function writeEnabledMap(next: Record<string, boolean>): Promise<void> {
  const config = await readCliConfig();
  const skills = isRecord(config.skills) ? config.skills : {};
  for (const [path, enable] of Object.entries(next).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const key = normalizedPath(path);
    if (enable) delete skills[key];
    else skills[key] = { enable };
  }
  if (Object.keys(skills).length) config.skills = skills;
  else delete config.skills;
  await mkdir(join(getKnorviaDataRootDir(), "cli"), { recursive: true });
  await writeFile(getCliConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

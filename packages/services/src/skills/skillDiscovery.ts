import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { SKILL_FILE_NAME } from "@knorvia/shared";
import type { SkillDiagnostic, SkillSummary } from "@knorvia/shared";
import { parseSkillDefinition, readSkillMetadata } from "./skillDefinitions.js";
import {
  exists,
  getUserAgentsRoot,
  getUserCommonRoot,
  getWorkspaceSkillRoots,
  normalizedPath,
} from "./skillLocations.js";
import { getPluginSkillRoots } from "./skillPluginRoots.js";
import type { SkillRoot } from "./skillPluginRoots.js";
import { walkSkillMarkdownPaths } from "./skillDiscoveryWalk.js";

function scanRootKey(path: string): string {
  return normalizedPath(path).replace(/\/+$/, "");
}

async function collectPaths(root: string, diagnostics: SkillDiagnostic[]): Promise<string[]> {
  const paths = new Set<string>();
  for await (const path of walkSkillMarkdownPaths(root, {
    onError: (failedPath, error) => {
      diagnostics.push({
        code: "skill_scan_failed",
        severity: "warning",
        message:
          error instanceof Error ? error.message : `Failed to scan skill directory: ${failedPath}`,
        path: failedPath,
      });
    },
  })) {
    paths.add(path);
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
}

async function selectedRoots(roots: SkillRoot[]): Promise<SkillRoot[]> {
  const existing = new Set<string>();
  for (const root of roots) {
    if (await exists(root.rootPath)) existing.add(scanRootKey(root.rootPath));
  }
  const normalizedRoots = roots.map((root) => scanRootKey(root.rootPath));
  const descriptors = new Map(roots.map((root) => [root.rootPath, root]));
  const seen = new Set<string>();
  const selected: SkillRoot[] = [];
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    if (!root) continue;
    const normalized = scanRootKey(root.rootPath);
    if (
      existing.has(normalized) &&
      normalizedRoots.some(
        (other, otherIndex) =>
          otherIndex !== index && existing.has(other) && other.startsWith(`${normalized}/`),
      )
    ) {
      continue;
    }
    let canonical = scanRootKey(root.rootPath);
    if (await exists(root.rootPath)) {
      canonical = scanRootKey(await realpath(root.rootPath).catch(() => root.rootPath));
    }
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    selected.push(descriptors.get(root.rootPath) ?? root);
  }
  return selected;
}

function normalizedName(name: string): string {
  return name.trim().toLowerCase();
}

async function commonNames(): Promise<Set<string>> {
  const root = getUserCommonRoot();
  const names = new Set<string>();
  if (!(await exists(root))) return names;
  for (const path of await collectPaths(root, [])) {
    const folder = basename(dirname(path));
    let name = folder;
    try {
      const parsed = parseSkillDefinition(await readFile(path, "utf-8"));
      name = (parsed.hasFrontmatter ? parsed.name.trim() : folder) || folder;
    } catch {
      name = folder;
    }
    names.add(normalizedName(name));
  }
  return names;
}

async function userAgentIsCovered(path: string, names: Set<string>): Promise<boolean> {
  const folder = basename(dirname(path));
  if (await exists(join(getUserCommonRoot(), folder, SKILL_FILE_NAME))) return true;
  let name = folder;
  try {
    const parsed = parseSkillDefinition(await readFile(path, "utf-8"));
    name = (parsed.hasFrontmatter ? parsed.name.trim() : folder) || folder;
  } catch {
    name = folder;
  }
  return names.has(normalizedName(name));
}

async function readSummary(
  sourcePath: string,
  canonical: string,
  root: SkillRoot,
  diagnostics: SkillDiagnostic[],
): Promise<SkillSummary | undefined> {
  let text: string;
  try {
    text = await readFile(sourcePath, "utf-8");
  } catch (error) {
    diagnostics.push({
      code: "skill_read_failed",
      severity: "warning",
      message: error instanceof Error ? error.message : `Failed to read skill: ${sourcePath}`,
      path: sourcePath,
    });
    return undefined;
  }
  const parsed = parseSkillDefinition(text);
  const folder = basename(dirname(sourcePath));
  const name = (parsed.hasFrontmatter ? parsed.name.trim() : folder) || folder;
  if (!name) {
    diagnostics.push({
      code: "skill_missing_name",
      severity: "error",
      message: `Skill frontmatter must include a name: ${sourcePath}`,
      path: sourcePath,
    });
    return undefined;
  }
  const description = parsed.hasFrontmatter ? parsed.description.trim() : "";
  if (description.length > 1024) {
    diagnostics.push({
      code: "skill_description_too_long",
      severity: "error",
      message: `Skill description is too long (>1024): ${name}`,
      path: sourcePath,
      skillName: name,
    });
    return undefined;
  }
  const metadata = await readSkillMetadata(sourcePath);
  return {
    id: `knorvia:${root.scope}:${name}:${createHash("sha256").update(canonical).digest("hex").slice(0, 12)}`,
    name,
    description,
    body: parsed.body.trim(),
    path: canonical,
    sourcePath,
    scope: root.scope,
    enabled: true,
    ...(root.pluginName ? { pluginName: root.pluginName } : {}),
    ...(root.pluginId ? { pluginId: root.pluginId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export async function discoverSkills(
  workspacePath: string,
  includeUser: boolean,
): Promise<{ skills: SkillSummary[]; diagnostics: SkillDiagnostic[] }> {
  const roots: SkillRoot[] = (await getWorkspaceSkillRoots(workspacePath)).map((rootPath) => ({
    rootPath,
    scope: "workspace",
  }));
  if (includeUser) {
    roots.push({ rootPath: getUserCommonRoot(), scope: "user" });
    roots.push({ rootPath: getUserAgentsRoot(), scope: "user" });
  }
  roots.push(...(await getPluginSkillRoots()));
  const common = includeUser ? await commonNames() : new Set<string>();
  const diagnostics: SkillDiagnostic[] = [];
  const skills: SkillSummary[] = [];
  const seen = new Set<string>();
  for (const root of await selectedRoots(roots)) {
    if (!(await exists(root.rootPath))) continue;
    for (const path of await collectPaths(root.rootPath, diagnostics)) {
      if (root.rootPath === getUserAgentsRoot() && (await userAgentIsCovered(path, common)))
        continue;
      const canonical = await realpath(path).catch(() => path);
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      if (!(await exists(path))) continue;
      const skill = await readSummary(path, canonical, root, diagnostics);
      if (skill) skills.push(skill);
    }
  }
  skills.sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.scope.localeCompare(right.scope) ||
      left.path.localeCompare(right.path),
  );
  return { skills, diagnostics };
}

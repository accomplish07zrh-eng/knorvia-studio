import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import type { SkillSyncCandidate } from "@knorvia/shared";
import { parse } from "yaml";
import { getKnorviaDataRootDir } from "#src/paths.js";
import {
  MAX_SKILL_SCAN_DEPTH,
  shouldWalkSkillDirectoryEntry,
  walkSkillMarkdownPaths,
} from "../skills/skillDiscoveryWalk.js";

export function commonUserSkillRoot(): string {
  return join(getKnorviaDataRootDir(), "skills");
}

function compatibilityUserSkillRoot(): string {
  const home = process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || homedir();
  return join(home, ".agents", "skills");
}

export function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase();
}

export async function readSkillFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function parseSkillMetadata(definition: string, fallbackName: string) {
  const fallback = { name: fallbackName, description: "" };
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(definition);
  const metadata = match?.[1];
  if (metadata === undefined) return fallback;
  let parsed: unknown;
  try {
    parsed = parse(metadata);
  } catch {
    return fallback;
  }
  const fields = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  const description = typeof fields.description === "string" ? fields.description.trim() : "";
  return { name: name || fallbackName, description };
}

async function directorySize(path: string, visited: Set<string>): Promise<number> {
  const canonicalPath = await realpath(path).catch(() => path);
  if (visited.has(canonicalPath)) return 0;
  visited.add(canonicalPath);
  const children = await readdir(path, { withFileTypes: true });
  const sizes = await Promise.all(
    children.map((child) => pathSize(join(path, child.name), visited)),
  );
  return sizes.reduce((total, size) => total + size, 0);
}

async function pathSize(path: string, visited: Set<string>): Promise<number> {
  const source = await lstat(path);
  const info = source.isSymbolicLink() ? await stat(path).catch(() => null) : source;
  if (!info) return 0;
  if (info.isDirectory()) return directorySize(path, visited);
  return info.isFile() ? info.size : 0;
}

async function scanCandidates(root: string): Promise<SkillSyncCandidate[]> {
  if (!existsSync(root)) return [];
  const candidates: SkillSyncCandidate[] = [];
  for await (const skillPath of walkSkillMarkdownPaths(root)) {
    const directoryPath = dirname(skillPath);
    const directoryName = relative(root, directoryPath).replaceAll("\\", "/");
    if (!directoryName) continue;
    const definition = await readSkillFileOrNull(skillPath);
    if (definition === null) continue;
    const metadata = parseSkillMetadata(definition, basename(directoryName));
    candidates.push({
      id: createHash("sha256").update(directoryPath).digest("hex"),
      ...metadata,
      directoryName,
      path: skillPath,
      sizeBytes: await pathSize(directoryPath, new Set()),
    });
  }
  return candidates.sort((left, right) => left.directoryName.localeCompare(right.directoryName));
}

async function coveredDirectories(root: string): Promise<Set<string>> {
  const covered = new Set<string>();
  if (!existsSync(root)) return covered;
  const pending = [{ path: root, relativePath: "", depth: 0 }];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.relativePath && (await readSkillFileOrNull(join(current.path, "SKILL.md")))) {
      covered.add(current.relativePath);
    }
    if (current.depth >= MAX_SKILL_SCAN_DEPTH) continue;
    let children;
    try {
      children = await readdir(current.path, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const child of children) {
      if (!shouldWalkSkillDirectoryEntry(child.name)) continue;
      const childPath = join(current.path, child.name);
      const directory =
        child.isDirectory() ||
        (child.isSymbolicLink() && (await stat(childPath).catch(() => undefined))?.isDirectory());
      if (!directory) continue;
      pending.push({
        path: childPath,
        relativePath: current.relativePath ? `${current.relativePath}/${child.name}` : child.name,
        depth: current.depth + 1,
      });
    }
  }
  return covered;
}

async function uniqueCandidates(candidates: SkillSyncCandidate[], seen: Set<string>) {
  const unique: SkillSyncCandidate[] = [];
  for (const candidate of candidates) {
    const canonicalPath = await realpath(candidate.path).catch(() => candidate.path);
    if (seen.has(canonicalPath)) continue;
    seen.add(canonicalPath);
    unique.push(candidate);
  }
  return unique;
}

export async function discoverUserSkillCandidates(): Promise<SkillSyncCandidate[]> {
  const commonRoot = commonUserSkillRoot();
  const common = await scanCandidates(commonRoot);
  const covered = await coveredDirectories(commonRoot);
  const commonNames = new Set(common.map((candidate) => normalizeSkillName(candidate.name)));
  const seen = new Set<string>();
  const combined = await uniqueCandidates(common, seen);
  const compatibility = await scanCandidates(compatibilityUserSkillRoot());
  combined.push(
    ...(await uniqueCandidates(
      compatibility.filter(
        (candidate) =>
          !covered.has(candidate.directoryName) &&
          !commonNames.has(normalizeSkillName(candidate.name)),
      ),
      seen,
    )),
  );
  return combined.sort((left, right) => left.directoryName.localeCompare(right.directoryName));
}

async function readRootSkillNames(root: string): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!existsSync(root)) return names;
  for await (const skillPath of walkSkillMarkdownPaths(root)) {
    const definition = await readSkillFileOrNull(skillPath);
    if (definition === null) continue;
    const directoryPath = dirname(skillPath);
    const { name } = parseSkillMetadata(definition, basename(directoryPath));
    const key = normalizeSkillName(name);
    if (!names.has(key)) names.set(key, directoryPath);
  }
  return names;
}

export async function readUserSkillNames(): Promise<Map<string, string>> {
  const names = await readRootSkillNames(commonUserSkillRoot());
  const compatibility = await readRootSkillNames(compatibilityUserSkillRoot());
  for (const [name, path] of compatibility) {
    if (!names.has(name)) names.set(name, path);
  }
  return names;
}

export async function collectExtractedSkillDirectories(root: string): Promise<string[]> {
  const directories: string[] = [];
  const pending = [{ path: root, relativePath: "" }];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.relativePath && existsSync(join(current.path, "SKILL.md"))) {
      directories.push(current.relativePath);
    }
    for (const child of await readdir(current.path, { withFileTypes: true })) {
      if (!child.isDirectory() || !shouldWalkSkillDirectoryEntry(child.name)) continue;
      pending.push({
        path: join(current.path, child.name),
        relativePath: current.relativePath ? `${current.relativePath}/${child.name}` : child.name,
      });
    }
  }
  return directories.sort((left, right) => left.localeCompare(right));
}

// SPDX-License-Identifier: Apache-2.0
// 项目记忆根：把一个工作区映射到 `memories/projects/<slug>-<hash>/memory`。
// 键优先取显式工作区身份，否则取规范化后的工作目录路径；Windows 上路径大小写不敏感，
// 先折成小写再哈希，避免同一个目录被算成两个根。
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";

interface ProjectMemoryRootInput {
  cliStorageRoot: string;
  workspaceIdentity?: string;
  workspacePath: string;
}

function memoryKeySource(workspaceIdentity: string, normalizedWorkspacePath: string): string {
  if (workspaceIdentity) return workspaceIdentity;
  return process.platform === "win32"
    ? normalizedWorkspacePath.toLowerCase()
    : normalizedWorkspacePath;
}

function memorySlug(workspaceIdentity: string, normalizedWorkspacePath: string): string {
  if (workspaceIdentity) return "project";
  return sanitizeProjectSlug(basename(normalizedWorkspacePath) || "project");
}

export function resolveProjectMemoryRoot(input: ProjectMemoryRootInput): string {
  const workspaceIdentity = input.workspaceIdentity?.trim() ?? "";
  const normalizedWorkspacePath = resolve(input.workspacePath);
  const digest = createHash("sha256")
    .update(memoryKeySource(workspaceIdentity, normalizedWorkspacePath))
    .digest("hex")
    .slice(0, 16);
  const slug = memorySlug(workspaceIdentity, normalizedWorkspacePath);
  return join(input.cliStorageRoot, "memories", "projects", `${slug}-${digest}`, "memory");
}

// 目录名只留小写字母、数字与 . _ -；首尾的连字符去掉，最长 PROJECT_SLUG_MAX_CHARS；全空时退回 project。
const PROJECT_SLUG_MAX_CHARS = 48;
const FALLBACK_PROJECT_SLUG = "project";
const DISALLOWED_SLUG_CHARS = /[^a-z0-9._-]+/gu;
const EDGE_HYPHENS = /^-+|-+$/gu;

function sanitizeProjectSlug(value: string): string {
  const lowered = value.toLowerCase();
  const dashed = lowered.replace(DISALLOWED_SLUG_CHARS, "-");
  const trimmedEdges = dashed.replace(EDGE_HYPHENS, "");
  const capped = trimmedEdges.slice(0, PROJECT_SLUG_MAX_CHARS);
  return capped.length > 0 ? capped : FALLBACK_PROJECT_SLUG;
}

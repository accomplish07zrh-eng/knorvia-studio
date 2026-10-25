// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 项目记忆根：把一个工作区映射到 `memories/projects/<slug>-<hash>/memory`。
//
// 为什么这个函数住在共享包：它只做路径与哈希计算（`node:crypto` + `node:path`），
// 不依赖任何内部模块，而调用方横跨 CLI 运行时与存储层。放在共享包后，
// 内核切换时无需把它从旧核心里搬出来。
//
// 键的取法：优先用显式工作区身份；没有身份时用规范化后的工作目录路径。
// Windows 上路径大小写不敏感，所以先把路径折成小写再哈希 ——
// 否则同一个目录会因为大小写不同被算成两个记忆根。

import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";

/** 解析项目记忆根的输入。 */
export interface ProjectMemoryRootInput {
  /** CLI 的存储根目录；记忆根会落在这个目录下的 `memories/projects/` 里。 */
  cliStorageRoot: string;
  /** 显式的工作区身份；给出时优先用它做哈希键与目录名。 */
  workspaceIdentity?: string;
  /** 工作区路径；没有身份时用它做哈希键。 */
  workspacePath: string;
}

/**
 * 哈希键的来源。
 *
 * 有身份时直接用身份（它是稳定的，不受路径写法影响）；
 * 没有身份时用规范化路径，并在 Windows 上折小写（见文件头注释）。
 */
function memoryKeySource(workspaceIdentity: string, normalizedWorkspacePath: string): string {
  if (workspaceIdentity) return workspaceIdentity;
  return process.platform === "win32"
    ? normalizedWorkspacePath.toLowerCase()
    : normalizedWorkspacePath;
}

/** 目录名的来源：有身份时统一叫 `project`，否则取路径末段净化后的结果。 */
function memorySlug(workspaceIdentity: string, normalizedWorkspacePath: string): string {
  if (workspaceIdentity) return "project";
  return sanitizeProjectSlug(basename(normalizedWorkspacePath) || "project");
}

/** 解析项目记忆根：`<cliStorageRoot>/memories/projects/<slug>-<hash>/memory`。 */
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

/** 把任意字符串净化成可做目录名的片段。 */
function sanitizeProjectSlug(value: string): string {
  const lowered = value.toLowerCase();
  const dashed = lowered.replace(DISALLOWED_SLUG_CHARS, "-");
  const trimmedEdges = dashed.replace(EDGE_HYPHENS, "");
  const capped = trimmedEdges.slice(0, PROJECT_SLUG_MAX_CHARS);
  return capped.length > 0 ? capped : FALLBACK_PROJECT_SLUG;
}

// SPDX-License-Identifier: Apache-2.0

// 合同冻结的 facade 注册表数据；运行时查询逻辑在 registry.ts。

export const WORLD_READ_REGISTRY = [
  { container: "files", member: "glob", op: "glob" },
  { container: "files", member: "read", op: "read" },
  { container: "files", member: "grep", op: "grep" },
  { container: "git", member: "changedFiles", op: "git-changed-files" },
  { container: "git", member: "diff", op: "git-diff" },
  { container: "git", member: "status", op: "git-status" },
  { container: "git", member: "log", op: "git-log" },
  { container: "world", member: "run", op: "run" },
] as const;

export type WorldReadOp = (typeof WORLD_READ_REGISTRY)[number]["op"];

export interface ArtifactRow {
  readonly container: "artifact";
  readonly member: string;
  readonly op: string;
  readonly family: "content" | "preset";
}

export const ARTIFACT_REGISTRY = [
  { container: "artifact", member: "file", op: "file", family: "content" },
  { container: "artifact", member: "markdown", op: "markdown", family: "content" },
  { container: "artifact", member: "chart", op: "chart", family: "preset" },
  { container: "artifact", member: "table", op: "table", family: "preset" },
  { container: "artifact", member: "metrics", op: "metrics", family: "preset" },
  { container: "artifact", member: "board", op: "board", family: "preset" },
] as const satisfies readonly ArtifactRow[];

export type ArtifactOp = (typeof ARTIFACT_REGISTRY)[number]["op"];

export type ArtifactContentOp = Extract<
  (typeof ARTIFACT_REGISTRY)[number],
  { family: "content" }
>["op"];

export type ArtifactPresetOp = Extract<
  (typeof ARTIFACT_REGISTRY)[number],
  { family: "preset" }
>["op"];

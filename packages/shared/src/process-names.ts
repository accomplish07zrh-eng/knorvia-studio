// SPDX-License-Identifier: Apache-2.0
// Process titles are scrubbed per segment so the OS name stays a single token.

const PRODUCT_STEM = "knorvia";
const SEGMENT_LIMIT = 24;
const STUDIO_TITLE = "Knorvia Studio";
const REMOTE_TITLE_PREFIX = "Knorvia Studio - ";
const RESOURCE_MANAGER_TITLE = "Resource Manager";
const PATH_SEPARATOR = /[\\/]+/;

function scrubSegment(raw: string | null | undefined): string | null {
  if (raw == null || raw.length === 0) return null;
  const slugGap = /[^a-z0-9]+/g;
  const edgeDash = /^-+|-+$/g;
  const folded = raw.trim().toLowerCase().replace(slugGap, "-").replace(edgeDash, "");
  if (folded.length === 0) return null;
  return folded.slice(0, SEGMENT_LIMIT);
}

function composeProcessName(parts: readonly (string | null | undefined)[]): string {
  const kept = [PRODUCT_STEM];
  for (const part of parts) {
    const scrubbed = scrubSegment(part);
    if (scrubbed) kept.push(scrubbed);
  }
  return kept.join("-");
}

function workspaceLeaf(workspacePath: string | null | undefined): string | undefined {
  const trimmed = workspacePath?.trim() ?? "";
  if (trimmed.length === 0) return undefined;
  const pieces = trimmed.split(PATH_SEPARATOR).filter((piece) => piece.length > 0);
  return pieces[pieces.length - 1] ?? trimmed;
}

type TitleRule = {
  test: (title: string) => boolean;
  parts: (title: string) => readonly string[];
};

// Empty and the product window share the main renderer slot; remote titles keep the suffix.
const RENDERER_TITLE_RULES: readonly TitleRule[] = [
  {
    test: (title) => title.length === 0 || title === STUDIO_TITLE,
    parts: () => ["renderer", "main"],
  },
  {
    test: (title) => title === RESOURCE_MANAGER_TITLE,
    parts: () => ["renderer", "resource-manager"],
  },
  {
    test: (title) => title.startsWith(REMOTE_TITLE_PREFIX),
    parts: (title) => ["renderer", "remote", title.slice(REMOTE_TITLE_PREFIX.length)],
  },
];

export function formatKnorviaMainProcessName(): string {
  return composeProcessName(["main"]);
}

export function formatKnorviaGpuProcessName(): string {
  return composeProcessName(["gpu"]);
}

export function formatKnorviaHostProcessName(label?: string): string {
  return composeProcessName(["host", label]);
}

export function formatKnorviaRendererProcessName(windowTitle?: string): string {
  const title = windowTitle?.trim() ?? "";
  for (const rule of RENDERER_TITLE_RULES) {
    if (!rule.test(title)) continue;
    return composeProcessName(rule.parts(title));
  }
  return composeProcessName(["renderer", title]);
}

export function formatKnorviaAgentProcessName(provider: string, workspacePath?: string): string {
  return composeProcessName(["agent", provider, workspaceLeaf(workspacePath)]);
}

export function formatKnorviaUtilityProcessName(name?: string, type = "utility"): string {
  return composeProcessName([type, name]);
}

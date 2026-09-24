const KNORVIA_PROCESS_PREFIX = "knorvia";
const MAX_PROCESS_NAME_SEGMENT_LENGTH = 24;

function sanitizeProcessNameSegment(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, MAX_PROCESS_NAME_SEGMENT_LENGTH);
}

function joinKnorviaProcessName(...segments: Array<string | null | undefined>): string {
  const sanitizedSegments = segments
    .map((segment) => sanitizeProcessNameSegment(segment))
    .filter((segment): segment is string => Boolean(segment));
  return [KNORVIA_PROCESS_PREFIX, ...sanitizedSegments].join("-");
}

function pickWorkspaceTag(workspacePath: string | null | undefined): string | undefined {
  const trimmedPath = workspacePath?.trim();
  if (!trimmedPath) {
    return undefined;
  }

  const parts = trimmedPath.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? trimmedPath;
}

export function formatKnorviaMainProcessName(): string {
  return joinKnorviaProcessName("main");
}

export function formatKnorviaGpuProcessName(): string {
  return joinKnorviaProcessName("gpu");
}

export function formatKnorviaHostProcessName(label?: string): string {
  return joinKnorviaProcessName("host", label);
}

export function formatKnorviaRendererProcessName(windowTitle?: string): string {
  const normalizedTitle = windowTitle?.trim();
  if (!normalizedTitle || normalizedTitle === "Knorvia Studio") {
    return joinKnorviaProcessName("renderer", "main");
  }

  if (normalizedTitle === "Resource Manager") {
    return joinKnorviaProcessName("renderer", "resource-manager");
  }

  const remoteWindowPrefix = "Knorvia Studio - ";
  if (normalizedTitle.startsWith(remoteWindowPrefix)) {
    return joinKnorviaProcessName(
      "renderer",
      "remote",
      normalizedTitle.slice(remoteWindowPrefix.length),
    );
  }

  return joinKnorviaProcessName("renderer", normalizedTitle);
}

export function formatKnorviaAgentProcessName(provider: string, workspacePath?: string): string {
  return joinKnorviaProcessName("agent", provider, pickWorkspaceTag(workspacePath));
}

export function formatKnorviaUtilityProcessName(name?: string, type = "utility"): string {
  return joinKnorviaProcessName(type, name);
}

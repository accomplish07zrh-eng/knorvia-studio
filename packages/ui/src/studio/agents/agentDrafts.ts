import { isStudioKernelId, type StudioKernelId } from "../types.js";
import type { StudioChatSelection } from "@knorvia/services";
import { copyStudioChatSelection, isStudioChatSelection } from "./chatSelections.js";

export type StudioExternalKernelId = Exclude<StudioKernelId, "knorvia">;
export type StudioPermissionPreference = "read-only" | "ask" | "full-access";

export interface StudioAgentConfig {
  executablePath: string;
  permission: StudioPermissionPreference;
}

export interface StudioExternalDraft {
  sessionId: string;
  kernelId: StudioExternalKernelId;
  text: string;
  workspacePath?: string;
  selection?: StudioChatSelection;
  updatedAt: number;
}

export interface StudioAgentData {
  configs: Partial<Record<StudioExternalKernelId, StudioAgentConfig>>;
  drafts: Record<string, StudioExternalDraft>;
}

export const STUDIO_DRAFT_TEXT_LIMIT = 20_000;
export const STUDIO_DRAFT_COUNT_LIMIT = 100;

export function isExternalKernel(value: unknown): value is StudioExternalKernelId {
  return isStudioKernelId(value) && value !== "knorvia";
}

export function isStudioDraftSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[\w-]{1,128}$/.test(value) &&
    !["__proto__", "constructor", "prototype"].includes(value)
  );
}

export function isStudioDraftWorkspacePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 4096 &&
    !/[\r\n]/.test(value) &&
    !value.includes("\0")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStudioAgentConfig(value: unknown): value is StudioAgentConfig {
  return (
    isRecord(value) &&
    typeof value.executablePath === "string" &&
    value.executablePath.length <= 4096 &&
    !/[\r\n]/.test(value.executablePath) &&
    !value.executablePath.includes("\0") &&
    typeof value.permission === "string" &&
    ["read-only", "ask", "full-access"].includes(value.permission)
  );
}

export function emptyStudioAgentData(): StudioAgentData {
  return {
    configs: {
      codex: { executablePath: "", permission: "ask" },
      "claude-code": { executablePath: "", permission: "ask" },
      "grok-build": { executablePath: "", permission: "ask" },
    },
    drafts: {},
  };
}

/** Persisted drafts are UI preferences, never CLI installation or execution facts. */
export function parseStudioAgentData(raw: string): StudioAgentData | null {
  try {
    const envelope: unknown = JSON.parse(raw);
    if (!isRecord(envelope) || envelope.version !== 1 || !isRecord(envelope.data)) return null;
    const { configs, drafts } = envelope.data;
    if (!isRecord(configs) || !isRecord(drafts)) return null;
    const result = emptyStudioAgentData();
    if (Object.keys(configs).length > 128) return null;
    for (const kernelId of ["codex", "claude-code", "grok-build"] as const)
      if (!isStudioAgentConfig(configs[kernelId])) return null;
    for (const [kernelId, config] of Object.entries(configs)) {
      if (!isExternalKernel(kernelId) || !isStudioAgentConfig(config)) return null;
      result.configs[kernelId] = {
        executablePath: config.executablePath,
        permission: config.permission,
      };
    }
    if (Object.keys(drafts).length > STUDIO_DRAFT_COUNT_LIMIT) return null;
    for (const [id, draft] of Object.entries(drafts)) {
      if (
        !isStudioDraftSessionId(id) ||
        !isRecord(draft) ||
        draft.sessionId !== id ||
        !isExternalKernel(draft.kernelId) ||
        typeof draft.text !== "string" ||
        draft.text.length > STUDIO_DRAFT_TEXT_LIMIT ||
        (draft.workspacePath !== undefined && !isStudioDraftWorkspacePath(draft.workspacePath)) ||
        (draft.selection !== undefined && !isStudioChatSelection(draft.selection)) ||
        typeof draft.updatedAt !== "number" ||
        !Number.isSafeInteger(draft.updatedAt) ||
        draft.updatedAt < 0 ||
        draft.updatedAt > 8_640_000_000_000_000
      )
        return null;
      result.drafts[id] = {
        sessionId: id,
        kernelId: draft.kernelId,
        text: draft.text,
        ...(draft.workspacePath ? { workspacePath: draft.workspacePath as string } : {}),
        ...(draft.selection !== undefined
          ? { selection: copyStudioChatSelection(draft.selection as StudioChatSelection) }
          : {}),
        updatedAt: draft.updatedAt,
      };
    }
    return result;
  } catch {
    return null;
  }
}

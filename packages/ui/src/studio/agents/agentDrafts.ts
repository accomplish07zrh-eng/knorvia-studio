import { isStudioKernelId, type StudioKernelId } from "../types.js";
import {
  validateStudioImageRefs,
  type StudioImageRef,
  type StudioChatSelection,
  type IStudioRuntimeService,
} from "@knorvia/services";
import { copyStudioChatSelection, isStudioChatSelection } from "./chatSelections.js";
import { parseHandoffRecords, type SessionHandoffRecord } from "@knorvia/shared";

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
  images?: Array<StudioImageRef & { dataBase64?: string }>;
  /** 当前窗口内的执行连接证明；持久化前剥离，重载不能凭同名目标或 CID 重建。 */
  imageOwnerService?: IStudioRuntimeService;
  imageSubmission?: { commandId: string; text: string; imageIds: string[] };
  updatedAt: number;
}

export interface StudioAgentData {
  configs: Partial<Record<StudioExternalKernelId, StudioAgentConfig>>;
  drafts: Record<string, StudioExternalDraft>;
  handoffs: Record<string, SessionHandoffRecord>;
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
    handoffs: {},
  };
}

/** Persisted drafts are UI preferences, never CLI installation or execution facts. */
export function parseStudioAgentData(raw: string): StudioAgentData | null {
  try {
    const envelope: unknown = JSON.parse(raw);
    if (
      !isRecord(envelope) ||
      ![1, 2, 3].includes(envelope.version as number) ||
      !isRecord(envelope.data)
    )
      return null;
    const { configs, drafts } = envelope.data;
    if (!isRecord(configs) || !isRecord(drafts)) return null;
    const result = emptyStudioAgentData();
    result.handoffs = parseHandoffRecords(envelope.data.handoffs);
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
      if (draft.images !== undefined) validateStudioImageRefs(draft.images as StudioImageRef[]);
      const pending = draft.imageSubmission;
      if (
        pending !== undefined &&
        (!isRecord(pending) ||
          !isStudioDraftSessionId(pending.commandId) ||
          typeof pending.text !== "string" ||
          pending.text.length > STUDIO_DRAFT_TEXT_LIMIT ||
          !Array.isArray(pending.imageIds) ||
          pending.imageIds.length > 4 ||
          !pending.imageIds.every(isStudioDraftSessionId))
      )
        return null;
      result.drafts[id] = {
        ...(draft.images
          ? {
              images: (draft.images as StudioImageRef[]).map((image) => {
                const { id, filename, mimeType, sizeBytes, width, height, sha256 } = image;
                return { id, filename, mimeType, sizeBytes, width, height, sha256 };
              }),
            }
          : {}),
        ...(pending
          ? {
              imageSubmission: pending as unknown as NonNullable<
                StudioExternalDraft["imageSubmission"]
              >,
            }
          : {}),
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

/**
 * 切换到外部内核时恢复上次未发送的输入（specs/knorvia-ui-polish-20261008.md）：
 * 取该内核最近更新、仍有正文或图片的草稿；没有时返回 undefined，由调用方新建会话。
 * 未发送草稿不再列在侧栏，只靠这里回到输入框。
 */
export function latestStudioKernelDraftId(
  drafts: Record<string, StudioExternalDraft>,
  kernelId: StudioExternalKernelId,
): string | undefined {
  let latest: StudioExternalDraft | undefined;
  for (const draft of Object.values(drafts)) {
    if (draft.kernelId !== kernelId) continue;
    if (!draft.text.trim() && !draft.images?.length && !draft.imageSubmission) continue;
    if (!latest || draft.updatedAt > latest.updatedAt) latest = draft;
  }
  return latest?.sessionId;
}

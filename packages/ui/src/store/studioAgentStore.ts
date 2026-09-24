import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type {
  IStudioRuntimeService,
  StudioChatSelection,
  StudioConversation,
} from "@knorvia/services";
import type { StudioKernelId } from "../studio/types.js";
import { copyStudioChatSelection, isStudioChatSelection } from "../studio/agents/chatSelections.js";
import { watchStudioDraftUnload } from "../studio/agents/draftUnloadWarning.js";
import {
  emptyStudioAgentData,
  isExternalKernel,
  isStudioAgentConfig,
  isStudioDraftSessionId,
  isStudioDraftWorkspacePath,
  parseStudioAgentData,
  STUDIO_DRAFT_COUNT_LIMIT,
  STUDIO_DRAFT_TEXT_LIMIT,
  type StudioAgentConfig,
  type StudioAgentData,
} from "../studio/agents/agentDrafts.js";

export const STUDIO_AGENT_STORAGE_KEY = "knorvia-studio:agent-drafts:v1";
export interface StudioAgentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type StudioAgentStorageIssue = "corrupt" | "unavailable" | "write-failed" | null;
export type StudioAgentActionError =
  | "invalid-config"
  | "invalid-session"
  | "invalid-project"
  | "invalid-selection"
  | "draft-too-long"
  | "draft-limit"
  | null;

type ManagementParams = Parameters<IStudioRuntimeService["manageKernel"]>[0];
interface KernelManagementState extends ManagementParams {
  service: IStudioRuntimeService;
  pending: boolean;
  error: string;
}

export interface StudioAgentStoreState extends StudioAgentData {
  storageIssue: StudioAgentStorageIssue;
  actionError: StudioAgentActionError;
  dirty: boolean;
  management: KernelManagementState | null;
  manageKernel: (service: IStudioRuntimeService, params: ManagementParams) => Promise<boolean>;
  saveConfig: (kernelId: StudioKernelId, config: StudioAgentConfig) => boolean;
  resetConfig: (kernelId: StudioKernelId) => boolean;
  saveDraft: (sessionId: string, kernelId: StudioKernelId, text: string) => boolean;
  acknowledgeDraft: (sessionId: string, kernelId: StudioKernelId, submittedText: string) => boolean;
  reconcileConversations: (conversations: readonly StudioConversation[]) => boolean;
  setDraftWorkspace: (
    sessionId: string,
    kernelId: StudioKernelId,
    workspacePath: string,
  ) => boolean;
  setDraftSelection: (
    sessionId: string,
    kernelId: StudioKernelId,
    selection: StudioChatSelection,
  ) => boolean;
  deleteDraft: (sessionId: string) => boolean;
  retrySave: () => boolean;
  resetLocalData: () => boolean;
}

/** Single owner of local, unsubmitted external-CLI preferences and chat drafts. */
export function createStudioAgentStore(storage: StudioAgentStorage) {
  let initial = emptyStudioAgentData();
  let issue: StudioAgentStorageIssue = null;
  try {
    const raw = storage.getItem(STUDIO_AGENT_STORAGE_KEY);
    if (raw !== null) {
      const restored = parseStudioAgentData(raw);
      if (restored) initial = restored;
      else issue = "corrupt";
    }
  } catch {
    issue = "unavailable";
  }
  // 读取失败或旧数据损坏时不能用空白草稿覆盖磁盘；只有用户显式重置可解锁。
  let writesBlocked = issue !== null;

  return createStore<StudioAgentStoreState>((set, get) => {
    const persist = (data: StudioAgentData): boolean => {
      set({ ...data, dirty: true, actionError: null });
      // 完整草稿先留在唯一内存所有者；超限时不覆盖磁盘旧快照，也不能静默截断。
      if (Object.values(data.drafts).some((draft) => draft.text.length > STUDIO_DRAFT_TEXT_LIMIT)) {
        set({ actionError: "draft-too-long" });
        return false;
      }
      if (writesBlocked) return false;
      try {
        storage.setItem(STUDIO_AGENT_STORAGE_KEY, JSON.stringify({ version: 1, data }));
        set({ dirty: false, storageIssue: null });
        return true;
      } catch {
        set({ storageIssue: "write-failed" });
        return false;
      }
    };
    const fail = (actionError: StudioAgentActionError): false => {
      set({ actionError });
      return false;
    };
    return {
      ...initial,
      storageIssue: issue,
      actionError: null,
      dirty: false,
      management: null,
      async manageKernel(service, params) {
        if (get().management?.pending) return false;
        set({ management: { ...params, service, pending: true, error: "" } });
        try {
          // Host 已原子维护受管路径；禁止 UI 用请求前配置覆盖后来保存的模型、权限或外部路径。
          await service.manageKernel(params);
          set({ management: { ...params, service, pending: false, error: "" } });
          return true;
        } catch (cause) {
          set({
            management: {
              ...params,
              service,
              pending: false,
              error: cause instanceof Error ? cause.message : String(cause),
            },
          });
          return false;
        }
      },
      saveConfig(kernelId, config) {
        if (!isExternalKernel(kernelId) || !isStudioAgentConfig(config))
          return fail("invalid-config");
        const { configs, drafts } = get();
        return persist({
          configs: {
            ...configs,
            [kernelId]: {
              executablePath: config.executablePath.trim(),
              permission: config.permission,
            },
          },
          drafts,
        });
      },
      resetConfig(kernelId) {
        if (!isExternalKernel(kernelId)) return fail("invalid-config");
        return get().saveConfig(kernelId, { executablePath: "", permission: "ask" });
      },
      saveDraft(sessionId, kernelId, text) {
        if (!isStudioDraftSessionId(sessionId) || !isExternalKernel(kernelId))
          return fail("invalid-session");
        if (typeof text !== "string") return fail("draft-too-long");
        const { drafts, configs } = get();
        const previous = drafts[sessionId];
        if (previous && previous.kernelId !== kernelId) return fail("invalid-session");
        if (!previous && !text) return true;
        if (!previous && Object.keys(drafts).length >= STUDIO_DRAFT_COUNT_LIMIT)
          return fail("draft-limit");
        if (!text && !previous?.workspacePath && previous?.selection === undefined)
          return get().deleteDraft(sessionId);
        return persist({
          configs,
          drafts: {
            ...drafts,
            [sessionId]: { ...previous, sessionId, kernelId, text, updatedAt: Date.now() },
          },
        });
      },
      acknowledgeDraft(sessionId, kernelId, submittedText) {
        const current = get().drafts[sessionId];
        // 发送组件可能已经卸载；ACK 必须比较当前 store，不能用旧组件的文本 ref 清空新草稿。
        if (!current || current.kernelId !== kernelId || current.text !== submittedText)
          return false;
        return get().saveDraft(sessionId, kernelId, "");
      },
      reconcileConversations(conversations) {
        const { configs, drafts } = get();
        const next = { ...drafts };
        let changed = false;
        for (const conversation of conversations) {
          const draft = next[conversation.id];
          if (!draft || draft.kernelId !== conversation.kernel || draft.text) continue;
          // 已有正式快照确认同一模型选择才回收空缓存，不能删除用户为下一轮改选的模型。
          if (
            draft.selection !== undefined &&
            (conversation.selection === undefined ||
              draft.selection.model !== conversation.selection.model ||
              draft.selection.reasoningEffort !== conversation.selection.reasoningEffort)
          )
            continue;
          delete next[conversation.id];
          changed = true;
        }
        return changed ? persist({ configs, drafts: next }) : true;
      },
      setDraftWorkspace(sessionId, kernelId, workspacePath) {
        if (!isStudioDraftSessionId(sessionId) || !isExternalKernel(kernelId))
          return fail("invalid-session");
        if (!isStudioDraftWorkspacePath(workspacePath)) return fail("invalid-project");
        const { drafts, configs } = get();
        const previous = drafts[sessionId];
        if (previous && previous.kernelId !== kernelId) return fail("invalid-session");
        if (!previous && !workspacePath) return true;
        if (!previous && Object.keys(drafts).length >= STUDIO_DRAFT_COUNT_LIMIT)
          return fail("draft-limit");
        if (!workspacePath && !previous?.text && previous?.selection === undefined)
          return get().deleteDraft(sessionId);
        return persist({
          configs,
          drafts: {
            ...drafts,
            [sessionId]: {
              ...previous,
              sessionId,
              kernelId,
              text: previous?.text ?? "",
              workspacePath,
              updatedAt: Date.now(),
            },
          },
        });
      },
      setDraftSelection(sessionId, kernelId, selection) {
        if (!isStudioDraftSessionId(sessionId) || !isExternalKernel(kernelId))
          return fail("invalid-session");
        if (!isStudioChatSelection(selection)) return fail("invalid-selection");
        const { drafts, configs } = get();
        const previous = drafts[sessionId];
        if (previous && previous.kernelId !== kernelId) return fail("invalid-session");
        if (!previous && Object.keys(drafts).length >= STUDIO_DRAFT_COUNT_LIMIT)
          return fail("draft-limit");
        return persist({
          configs,
          drafts: {
            ...drafts,
            [sessionId]: {
              ...previous,
              sessionId,
              kernelId,
              text: previous?.text ?? "",
              selection: copyStudioChatSelection(selection),
              updatedAt: Date.now(),
            },
          },
        });
      },
      deleteDraft(sessionId) {
        if (!isStudioDraftSessionId(sessionId)) return fail("invalid-session");
        const { configs, drafts } = get();
        const next = { ...drafts };
        delete next[sessionId];
        return persist({ configs, drafts: next });
      },
      retrySave() {
        const { configs, drafts } = get();
        return persist({ configs, drafts });
      },
      resetLocalData() {
        const empty = emptyStudioAgentData();
        try {
          storage.setItem(STUDIO_AGENT_STORAGE_KEY, JSON.stringify({ version: 1, data: empty }));
          writesBlocked = false;
          set({ ...empty, dirty: false, storageIssue: null, actionError: null });
          return true;
        } catch {
          set({ storageIssue: writesBlocked ? get().storageIssue : "write-failed" });
          return false;
        }
      },
    };
  });
}

export const studioAgentStore = createStudioAgentStore({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
});

if (typeof window !== "undefined") watchStudioDraftUnload(studioAgentStore, window);

export function useStudioAgentStore<T>(selector: (state: StudioAgentStoreState) => T): T {
  return useStore(studioAgentStore, selector);
}

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import {
  GROUP_LIMITS,
  isStudioKernelId,
  normalizeGroupConfig,
  type StudioGroup,
} from "../studio/groups/groupModel.js";

/** 仅保存未发送的输入草稿；群聊定义由 Host 唯一持有（见 specs/knorvia-definition-ownership.md）。 */
export const STUDIO_GROUP_STORAGE_KEY = "knorvia-studio:group-drafts:v2";
/** 旧版把完整定义存在本地；只在迁移时读取，全部被 Host 确认后立即删除。 */
export const LEGACY_STUDIO_GROUP_STORAGE_KEY = "knorvia-studio:groups:v1";
type GroupStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type StorageIssue = "unavailable" | "corrupt" | "write-failed" | null;

export interface StudioGroupState {
  /** 服务定义与草稿的内存投影，以及保存成功后、快照追上前的乐观覆盖；不落盘。 */
  groups: StudioGroup[];
  /** 等待导入 Host 的旧版 v1 群聊；迁移完成后为空。 */
  legacyGroups: StudioGroup[];
  importedIds: string[];
  backendRevisions: Record<string, number>;
  storageIssue: StorageIssue;
  deleteGroup: (id: string, revision?: number) => void;
  saveDraft: (id: string, draft: string) => void;
  clearDraftIfUnchanged: (id: string, submitted: string) => void;
  retrySave: () => void;
  ensureDraft: (group: Omit<StudioGroup, "draft">, revision?: number) => void;
  acknowledgeDefinition: (group: Omit<StudioGroup, "draft">, revision: number) => void;
  markImported: (id: string) => void;
}

function browserStorage(): GroupStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeGroup(value: unknown): StudioGroup | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.name !== "string" ||
    typeof value.goal !== "string" ||
    typeof value.sharedSummary !== "string" ||
    typeof value.draft !== "string" ||
    value.draft.length > GROUP_LIMITS.draft ||
    !Array.isArray(value.members) ||
    !value.members.every(isStudioKernelId) ||
    !isStudioKernelId(value.host) ||
    (value.mode !== "manual" && value.mode !== "task") ||
    (value.workspaceMode !== "isolated" && value.workspaceMode !== "shared") ||
    typeof value.createdAt !== "number" ||
    !Number.isFinite(value.createdAt) ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt)
  )
    return null;
  const config = normalizeGroupConfig({
    name: value.name,
    goal: value.goal,
    members: value.members,
    host: value.host,
    sharedSummary: value.sharedSummary,
    mode: value.mode,
    workspaceMode: value.workspaceMode,
    workspacePath: typeof value.workspacePath === "string" ? value.workspacePath : undefined,
  });
  return config
    ? {
        ...config,
        id: value.id,
        draft: value.draft,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      }
    : null;
}

type Loaded = {
  legacyGroups: StudioGroup[];
  drafts: Record<string, string>;
  storageIssue: StorageIssue;
};

function readItem(storage: GroupStorage, key: string): string | null | undefined {
  try {
    return storage.getItem(key);
  } catch {
    return undefined;
  }
}

function decodeDrafts(raw: string): Record<string, string> | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 2 || !isRecord(value.drafts)) return null;
    const entries = Object.entries(value.drafts);
    if (entries.some(([, draft]) => typeof draft !== "string" || draft.length > GROUP_LIMITS.draft))
      return null;
    return Object.fromEntries(entries) as Record<string, string>;
  } catch {
    return null;
  }
}

function decodeLegacy(raw: string): StudioGroup[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.groups)) return null;
    const groups = value.groups.map(decodeGroup);
    if (groups.some((group) => group === null)) return null;
    const valid = groups as StudioGroup[];
    return new Set(valid.map((group) => group.id)).size === valid.length ? valid : null;
  } catch {
    return null;
  }
}

function loadGroups(storage: GroupStorage | undefined): Loaded {
  const empty: Loaded = { legacyGroups: [], drafts: {}, storageIssue: null };
  if (!storage) return { ...empty, storageIssue: "unavailable" };
  const rawDrafts = readItem(storage, STUDIO_GROUP_STORAGE_KEY);
  const rawLegacy = readItem(storage, LEGACY_STUDIO_GROUP_STORAGE_KEY);
  if (rawDrafts === undefined || rawLegacy === undefined)
    return { ...empty, storageIssue: "unavailable" };
  const drafts = rawDrafts === null ? {} : decodeDrafts(rawDrafts);
  const legacyGroups = rawLegacy === null ? [] : decodeLegacy(rawLegacy);
  // 无法解析的存储可能含有用户原数据；报告问题并禁止后续写入覆盖它。
  if (!drafts || !legacyGroups) return { ...empty, storageIssue: "corrupt" };
  for (const group of legacyGroups)
    if (group.draft && drafts[group.id] === undefined) drafts[group.id] = group.draft;
  return { legacyGroups, drafts, storageIssue: null };
}

/** Owns only unsent frontend drafts. It has no service, runtime or message-queue dependency. */
export function createStudioGroupStore(storage: GroupStorage | undefined = browserStorage()) {
  const initial = loadGroups(storage);
  const writesBlocked =
    initial.storageIssue === "corrupt" || initial.storageIssue === "unavailable";
  // 尚未出现在服务快照中的草稿（例如刚启动时），按群聊 ID 暂存，定义到达时再挂上。
  const unattachedDrafts = { ...initial.drafts };
  return createStore<StudioGroupState>((set, get) => {
    const draftsToPersist = () => {
      const drafts: Record<string, string> = {};
      for (const [id, draft] of Object.entries(unattachedDrafts)) if (draft) drafts[id] = draft;
      for (const group of get().groups) {
        if (group.draft) drafts[group.id] = group.draft;
        else delete drafts[group.id];
      }
      return drafts;
    };
    const persist = () => {
      if (writesBlocked || !storage) return;
      try {
        storage.setItem(
          STUDIO_GROUP_STORAGE_KEY,
          JSON.stringify({ version: 2, drafts: draftsToPersist() }),
        );
        if (get().storageIssue) set({ storageIssue: null });
      } catch {
        set({ storageIssue: "write-failed" });
      }
    };
    const commit = (groups: StudioGroup[]) => {
      set({ groups });
      persist();
    };
    const withDraft = (group: Omit<StudioGroup, "draft">): StudioGroup => {
      const old = get().groups.find((item) => item.id === group.id);
      const draft = old?.draft ?? unattachedDrafts[group.id] ?? "";
      delete unattachedDrafts[group.id];
      return { ...group, draft };
    };
    return {
      groups: initial.legacyGroups,
      legacyGroups: initial.legacyGroups,
      importedIds: [],
      backendRevisions: {},
      storageIssue: initial.storageIssue,
      ensureDraft(group, revision = Number.POSITIVE_INFINITY) {
        if ((get().backendRevisions[group.id] ?? 0) > revision) return;
        const old = get().groups.find((item) => item.id === group.id);
        const next = withDraft(group);
        if (old && JSON.stringify(old) === JSON.stringify(next)) return;
        set({
          groups: old
            ? get().groups.map((item) => (item.id === group.id ? next : item))
            : [...get().groups, next],
        });
      },
      acknowledgeDefinition(group, revision) {
        if (revision < (get().backendRevisions[group.id] ?? 0)) return;
        const old = get().groups.find((item) => item.id === group.id);
        const accepted = withDraft(group);
        set({
          groups: old
            ? get().groups.map((item) => (item.id === group.id ? accepted : item))
            : [...get().groups, accepted],
          backendRevisions: { ...get().backendRevisions, [group.id]: revision },
          importedIds: [...new Set([...get().importedIds, group.id])],
        });
      },
      markImported(id) {
        if (get().importedIds.includes(id)) return;
        const importedIds = [...get().importedIds, id];
        set({ importedIds });
        const legacy = get().legacyGroups;
        if (!legacy.length || !legacy.every((group) => importedIds.includes(group.id))) return;
        // 所有旧群聊都已被 Host 确认：先写入仅含草稿的新格式，成功后立即删除旧版完整副本。
        if (writesBlocked || !storage) return;
        persist();
        if (get().storageIssue) return;
        try {
          storage.removeItem(LEGACY_STUDIO_GROUP_STORAGE_KEY);
          set({ legacyGroups: [] });
        } catch {
          set({ storageIssue: "write-failed" });
        }
      },
      deleteGroup(id, revision = 0) {
        if (revision > 0 && revision < (get().backendRevisions[id] ?? 0)) return;
        delete unattachedDrafts[id];
        set({ backendRevisions: { ...get().backendRevisions, [id]: revision } });
        commit(get().groups.filter((group) => group.id !== id));
      },
      saveDraft(id, draft) {
        if (draft.length > GROUP_LIMITS.draft) return;
        const group = get().groups.find((item) => item.id === id);
        if (!group || group.draft === draft) return;
        // 草稿不是群聊定义的一部分，不改 updatedAt，否则会被误判为定义版本冲突。
        commit(get().groups.map((item) => (item.id === id ? { ...item, draft } : item)));
      },
      clearDraftIfUnchanged(id, submitted) {
        // 发送期间可能切群再回来输入，卸载组件的旧 ref 不足以判断最新草稿。
        if (get().groups.find((item) => item.id === id)?.draft === submitted)
          get().saveDraft(id, "");
      },
      retrySave() {
        persist();
      },
    };
  });
}

const studioGroupStore = createStudioGroupStore();

export function useStudioGroupStore<T>(selector: (state: StudioGroupState) => T): T {
  return useStore(studioGroupStore, selector);
}

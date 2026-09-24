import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import {
  GROUP_LIMITS,
  isStudioKernelId,
  normalizeGroupConfig,
  type StudioGroup,
  type StudioGroupConfig,
} from "../studio/groups/groupModel.js";

export const STUDIO_GROUP_STORAGE_KEY = "knorvia-studio:groups:v1";
type GroupStorage = Pick<Storage, "getItem" | "setItem">;
type StorageIssue = "unavailable" | "corrupt" | "write-failed" | null;

export interface StudioGroupState {
  groups: StudioGroup[];
  importedIds: string[];
  backendRevisions: Record<string, number>;
  storageIssue: StorageIssue;
  createGroup: (config: StudioGroupConfig) => string | null;
  updateGroup: (id: string, config: StudioGroupConfig) => boolean;
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

function loadGroups(storage: GroupStorage | undefined): {
  groups: StudioGroup[];
  importedIds: string[];
  backendRevisions: Record<string, number>;
  storageIssue: StorageIssue;
} {
  if (!storage)
    return { groups: [], importedIds: [], backendRevisions: {}, storageIssue: "unavailable" };
  let raw: string | null;
  try {
    raw = storage.getItem(STUDIO_GROUP_STORAGE_KEY);
  } catch {
    return { groups: [], importedIds: [], backendRevisions: {}, storageIssue: "unavailable" };
  }
  if (raw === null)
    return { groups: [], importedIds: [], backendRevisions: {}, storageIssue: null };
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.groups)) {
      return { groups: [], importedIds: [], backendRevisions: {}, storageIssue: "corrupt" };
    }
    const groups = value.groups.map(decodeGroup);
    if (groups.some((group) => group === null))
      return { groups: [], importedIds: [], backendRevisions: {}, storageIssue: "corrupt" };
    const valid = groups as StudioGroup[];
    if (new Set(valid.map((group) => group.id)).size !== valid.length) {
      return { groups: [], importedIds: [], backendRevisions: {}, storageIssue: "corrupt" };
    }
    const importedIds = Array.isArray(value.importedIds)
      ? value.importedIds.filter((id): id is string => typeof id === "string")
      : [];
    const backendRevisions = isRecord(value.backendRevisions)
      ? Object.fromEntries(
          Object.entries(value.backendRevisions).filter(
            (entry): entry is [string, number] =>
              typeof entry[1] === "number" && Number.isSafeInteger(entry[1]) && entry[1] >= 0,
          ),
        )
      : {};
    return { groups: valid, importedIds, backendRevisions, storageIssue: null };
  } catch {
    return { groups: [], importedIds: [], backendRevisions: {}, storageIssue: "corrupt" };
  }
}

/** Owns only unsent frontend drafts. It has no service, runtime or message-queue dependency. */
export function createStudioGroupStore(storage: GroupStorage | undefined = browserStorage()) {
  const initial = loadGroups(storage);
  // 无法读取的存储可能含有用户原数据；禁止后续编辑以空快照覆盖它。
  const writesBlocked =
    initial.storageIssue === "corrupt" || initial.storageIssue === "unavailable";
  return createStore<StudioGroupState>((set, get) => {
    const persist = (groups: StudioGroup[]) => {
      if (writesBlocked || !storage) return;
      try {
        storage.setItem(
          STUDIO_GROUP_STORAGE_KEY,
          JSON.stringify({
            version: 1,
            groups,
            importedIds: get().importedIds,
            backendRevisions: get().backendRevisions,
          }),
        );
        if (get().storageIssue) set({ storageIssue: null });
      } catch {
        set({ storageIssue: "write-failed" });
      }
    };
    const commit = (groups: StudioGroup[]) => {
      set({ groups });
      persist(groups);
    };
    return {
      ...initial,
      ensureDraft(group, revision = Number.POSITIVE_INFINITY) {
        if ((get().backendRevisions[group.id] ?? 0) > revision) return;
        const old = get().groups.find((item) => item.id === group.id);
        const next = { ...group, draft: old?.draft ?? "" };
        if (old && JSON.stringify(old) === JSON.stringify(next)) return;
        commit(
          old
            ? get().groups.map((item) => (item.id === group.id ? next : item))
            : [...get().groups, next],
        );
      },
      acknowledgeDefinition(group, revision) {
        if (revision < (get().backendRevisions[group.id] ?? 0)) return;
        const old = get().groups.find((item) => item.id === group.id);
        const accepted = { ...group, draft: old?.draft ?? "" };
        const groups = old
          ? get().groups.map((item) => (item.id === group.id ? accepted : item))
          : [...get().groups, accepted];
        set({
          groups,
          backendRevisions: { ...get().backendRevisions, [group.id]: revision },
          importedIds: [...new Set([...get().importedIds, group.id])],
        });
        persist(groups);
      },
      markImported(id) {
        if (get().importedIds.includes(id)) return;
        set({ importedIds: [...get().importedIds, id] });
        persist(get().groups);
      },
      createGroup(config) {
        const normalized = normalizeGroupConfig(config);
        if (!normalized) return null;
        const id = crypto.randomUUID();
        const now = Date.now();
        commit([...get().groups, { ...normalized, id, draft: "", createdAt: now, updatedAt: now }]);
        return id;
      },
      updateGroup(id, config) {
        const normalized = normalizeGroupConfig(config);
        if (!normalized || !get().groups.some((group) => group.id === id)) return false;
        commit(
          get().groups.map((group) =>
            group.id === id ? { ...group, ...normalized, updatedAt: Date.now() } : group,
          ),
        );
        return true;
      },
      deleteGroup(id, revision = 0) {
        if (revision > 0 && revision < (get().backendRevisions[id] ?? 0)) return;
        set({ backendRevisions: { ...get().backendRevisions, [id]: revision } });
        commit(get().groups.filter((group) => group.id !== id));
      },
      saveDraft(id, draft) {
        if (draft.length > GROUP_LIMITS.draft) return;
        const group = get().groups.find((item) => item.id === id);
        if (!group || group.draft === draft) return;
        commit(
          get().groups.map((item) =>
            item.id === id ? { ...item, draft, updatedAt: Date.now() } : item,
          ),
        );
      },
      clearDraftIfUnchanged(id, submitted) {
        // 发送期间可能切群再回来输入，卸载组件的旧 ref 不足以判断最新草稿。
        if (get().groups.find((item) => item.id === id)?.draft === submitted)
          get().saveDraft(id, "");
      },
      retrySave() {
        persist(get().groups);
      },
    };
  });
}

const studioGroupStore = createStudioGroupStore();

export function useStudioGroupStore<T>(selector: (state: StudioGroupState) => T): T {
  return useStore(studioGroupStore, selector);
}

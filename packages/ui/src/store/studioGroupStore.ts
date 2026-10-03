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
  drafts: Map<string, string>;
  storageIssue: StorageIssue;
};

function readItem(storage: GroupStorage, key: string): string | null | undefined {
  try {
    return storage.getItem(key);
  } catch {
    return undefined;
  }
}

function decodeDrafts(raw: string): Map<string, string> | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 2 || !isRecord(value.drafts)) return null;
    const drafts = new Map<string, string>();
    for (const [id, text] of Object.entries(value.drafts)) {
      if (typeof text !== "string" || text.length > GROUP_LIMITS.draft) return null;
      drafts.set(id, text);
    }
    return drafts;
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
  const empty: Loaded = { legacyGroups: [], drafts: new Map(), storageIssue: null };
  if (!storage) return { ...empty, storageIssue: "unavailable" };
  const rawDrafts = readItem(storage, STUDIO_GROUP_STORAGE_KEY);
  const rawLegacy = readItem(storage, LEGACY_STUDIO_GROUP_STORAGE_KEY);
  if (rawDrafts === undefined || rawLegacy === undefined)
    return { ...empty, storageIssue: "unavailable" };
  const drafts = rawDrafts === null ? new Map<string, string>() : decodeDrafts(rawDrafts);
  const legacyGroups = rawLegacy === null ? [] : decodeLegacy(rawLegacy);
  // 原数据损坏或不可读时永久保护该次加载，重试不能覆盖未知内容。
  if (!drafts || !legacyGroups) return { ...empty, storageIssue: "corrupt" };
  for (const group of legacyGroups) {
    if (group.draft && !drafts.has(group.id)) drafts.set(group.id, group.draft);
  }
  return { legacyGroups, drafts, storageIssue: null };
}

class GroupDraftLedger {
  private readonly text: Map<string, string>;

  constructor(initial: Loaded) {
    this.text = new Map(initial.drafts);
    // 保留既有 v1 首屏草稿优先级；其它 v2 草稿等 Host 定义到达后再投影。
    for (const group of initial.legacyGroups) this.text.set(group.id, group.draft);
  }

  project(group: Omit<StudioGroup, "draft">): StudioGroup {
    return { ...group, draft: this.text.get(group.id) ?? "" };
  }

  write(id: string, draft: string): void {
    this.text.set(id, draft);
  }

  remove(id: string): void {
    this.text.delete(id);
  }

  serialize(): string {
    const entries = [...this.text].filter(([, draft]) => draft.length > 0);
    return JSON.stringify({ version: 2, drafts: Object.fromEntries(entries) });
  }
}

/** One draft ledger; Host definitions and ACK receipts remain memory-only projections. */
export function createStudioGroupStore(storage: GroupStorage | undefined = browserStorage()) {
  const initial = loadGroups(storage);
  const ledger = new GroupDraftLedger(initial);
  const writesBlocked =
    initial.storageIssue === "corrupt" || initial.storageIssue === "unavailable";
  return createStore<StudioGroupState>((set, get) => {
    const receiptRevision = (id: string): number => {
      const revisions = get().backendRevisions;
      return Object.prototype.hasOwnProperty.call(revisions, id) ? (revisions[id] ?? 0) : 0;
    };
    const migrationReady = () => {
      const { legacyGroups, importedIds } = get();
      const confirmed = new Set(importedIds);
      return legacyGroups.length > 0 && legacyGroups.every((group) => confirmed.has(group.id));
    };
    const persist = () => {
      if (writesBlocked || !storage) return;
      try {
        storage.setItem(STUDIO_GROUP_STORAGE_KEY, ledger.serialize());
      } catch {
        set({ storageIssue: "write-failed" });
        return;
      }
      if (get().storageIssue) set({ storageIssue: null });
      if (!migrationReady()) return;
      try {
        // 迁移重试必须继续此阶段：只有最新 v2 已落盘且所有 Host 回执已确认才删 v1。
        storage.removeItem(LEGACY_STUDIO_GROUP_STORAGE_KEY);
        set({ legacyGroups: [] });
      } catch {
        set({ storageIssue: "write-failed" });
      }
    };
    const replaceDefinition = (group: Omit<StudioGroup, "draft">): StudioGroup[] => {
      const groups = get().groups;
      const next = ledger.project(group);
      return groups.some((item) => item.id === group.id)
        ? groups.map((item) => (item.id === group.id ? next : item))
        : [...groups, next];
    };
    const commitDrafts = (groups: StudioGroup[]) => {
      set({ groups });
      persist();
    };

    return {
      groups: initial.legacyGroups,
      legacyGroups: initial.legacyGroups,
      importedIds: [],
      backendRevisions: {},
      storageIssue: initial.storageIssue,
      ensureDraft(group, revision = Number.POSITIVE_INFINITY) {
        if (receiptRevision(group.id) > revision) return;
        const old = get().groups.find((item) => item.id === group.id);
        if (old && JSON.stringify(old) === JSON.stringify(ledger.project(group))) return;
        set({ groups: replaceDefinition(group) });
      },
      acknowledgeDefinition(group, revision) {
        if (revision < receiptRevision(group.id)) return;
        const state = get();
        set({
          groups: replaceDefinition(group),
          backendRevisions: { ...state.backendRevisions, [group.id]: revision },
          importedIds: [...new Set([...state.importedIds, group.id])],
        });
        if (migrationReady()) persist();
      },
      markImported(id) {
        if (get().importedIds.includes(id)) return;
        set({ importedIds: [...get().importedIds, id] });
        if (migrationReady()) persist();
      },
      deleteGroup(id, revision = 0) {
        if (revision > 0 && revision < receiptRevision(id)) return;
        ledger.remove(id);
        set({ backendRevisions: { ...get().backendRevisions, [id]: revision } });
        commitDrafts(get().groups.filter((group) => group.id !== id));
      },
      saveDraft(id, draft) {
        if (draft.length > GROUP_LIMITS.draft) return;
        const group = get().groups.find((item) => item.id === id);
        if (!group || group.draft === draft) return;
        ledger.write(id, draft);
        commitDrafts(get().groups.map((item) => (item.id === id ? { ...item, draft } : item)));
      },
      clearDraftIfUnchanged(id, submitted) {
        if (get().groups.find((item) => item.id === id)?.draft === submitted) {
          get().saveDraft(id, "");
        }
      },
      retrySave: persist,
    };
  });
}

const studioGroupStore = createStudioGroupStore();

export function useStudioGroupStore<T>(selector: (state: StudioGroupState) => T): T {
  return useStore(studioGroupStore, selector);
}

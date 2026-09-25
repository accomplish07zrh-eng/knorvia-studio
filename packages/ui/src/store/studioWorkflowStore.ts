import { graphCopy, workflowStorageMetadata } from "../studio/workflow/workflowStorage.js";
import { create } from "zustand";
import {
  createWorkflowGraph,
  WORKFLOW_LIMITS,
  type StudioWorkflow,
  type WorkflowGraph,
  type WorkflowTemplate,
} from "../studio/workflow/types.js";
import { isStudioWorkflow } from "../studio/workflow/graph.js";
import {
  duplicateWorkflow,
  mergeWorkflowDefinitions,
  workflowFingerprint,
} from "../studio/workflow/workflowDrafts.js";

export const STUDIO_WORKFLOW_STORAGE_KEY = "knorvia-studio:workflow-drafts:v1";
type StoragePort = Pick<Storage, "getItem" | "setItem">;
type StorageProblem = "unavailable" | "corrupt" | null;
interface History {
  past: WorkflowGraph[];
  future: WorkflowGraph[];
}
interface WorkflowState {
  workflows: StudioWorkflow[];
  selectedId: string | null;
  hydrated: boolean;
  storageProblem: StorageProblem;
  savedAt: number | null;
  history: Record<string, History>;
  importedIds: string[];
  backendVersions: Record<string, string>;
  backendRevisions: Record<string, number>;
  /** 每个工作流草稿所依据的服务端 `updatedAt`，保存时交给 Host 做冲突检测。 */
  baseUpdatedAt: Record<string, number>;
  /** 因其他窗口修改而保存被拒的工作流，仅内存保留。 */
  conflictIds: string[];
  observedIds: string[];
  inputDrafts: Record<string, string>;
  saveInput: (id: string, input: string) => void;
  syncDefinitions: (definitions: StudioWorkflow[], revision?: number) => void;
  acceptDefinition: (definition: StudioWorkflow, revision?: number) => void;
  markConflict: (id: string) => void;
  /** 放弃本地修改，采用服务端最新定义。 */
  adoptDefinition: (definition: StudioWorkflow) => void;
  markImported: (id: string) => void;
  setWorkspace: (id: string, path: string) => void;
  hydrate: () => void;
  createWorkflow: (
    name: string,
    template: WorkflowTemplate,
    workspacePath?: string,
  ) => string | null;
  select: (id: string | null) => void;
  rename: (id: string, name: string) => void;
  duplicate: (id: string, name: string) => string | null;
  remove: (id: string, revision?: number) => void;
  removeNodes: (id: string, nodeIds: string[]) => void;
  removeEdges: (id: string, edgeIds: string[]) => void;
  updateGraph: (
    id: string,
    graph: WorkflowGraph,
    options?: { checkpoint?: boolean; persist?: boolean },
  ) => void;
  checkpoint: (id: string) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  save: () => void;
}

/** Sole owner of local workflow drafts; these are never accepted runtime tasks. */
export function createStudioWorkflowStore(storage?: StoragePort) {
  return create<WorkflowState>((set, get) => {
    const getStorage = () => storage ?? globalThis.localStorage;
    const persist = () => {
      if (get().storageProblem === "corrupt" || !get().hydrated) return;
      try {
        getStorage().setItem(
          STUDIO_WORKFLOW_STORAGE_KEY,
          JSON.stringify({
            version: 1,
            workflows: get().workflows.map((workflow) => ({ ...workflow, ...graphCopy(workflow) })),
            selectedId: get().selectedId,
            importedIds: get().importedIds,
            backendVersions: get().backendVersions,
            backendRevisions: get().backendRevisions,
            baseUpdatedAt: get().baseUpdatedAt,
            observedIds: get().observedIds,
            inputDrafts: get().inputDrafts,
          }),
        );
        set({ storageProblem: null, savedAt: Date.now() });
      } catch {
        set({ storageProblem: "unavailable", savedAt: null });
      }
    };
    const checkpoint = (id: string) => {
      const workflow = get().workflows.find((item) => item.id === id);
      if (!workflow) return;
      const history = get().history[id] ?? { past: [], future: [] };
      set({
        history: {
          ...get().history,
          [id]: { past: [...history.past.slice(-39), graphCopy(workflow)], future: [] },
        },
      });
    };
    const travel = (id: string, direction: "undo" | "redo") => {
      const history = get().history[id];
      const workflow = get().workflows.find((item) => item.id === id);
      const source = direction === "undo" ? history?.past : history?.future;
      if (!workflow || !history || !source?.length) return;
      const graph = source[source.length - 1]!;
      set({
        workflows: get().workflows.map((item) =>
          item.id === id ? { ...item, ...graphCopy(graph), updatedAt: Date.now() } : item,
        ),
        history: {
          ...get().history,
          [id]:
            direction === "undo"
              ? {
                  past: history.past.slice(0, -1),
                  future: [...history.future, graphCopy(workflow)],
                }
              : {
                  past: [...history.past, graphCopy(workflow)],
                  future: history.future.slice(0, -1),
                },
        },
      });
      persist();
    };
    return {
      workflows: [],
      selectedId: null,
      hydrated: false,
      storageProblem: null,
      savedAt: null,
      history: {},
      importedIds: [],
      backendVersions: {},
      backendRevisions: {},
      baseUpdatedAt: {},
      conflictIds: [],
      observedIds: [],
      inputDrafts: {},
      saveInput(id, input) {
        if (input.length > 32000 || !get().workflows.some((item) => item.id === id)) return;
        set({ inputDrafts: { ...get().inputDrafts, [id]: input } });
        persist();
      },
      syncDefinitions(definitions, revision) {
        const next = mergeWorkflowDefinitions(
          get().workflows,
          get().backendVersions,
          definitions,
          get().backendRevisions,
          get().observedIds,
          revision,
          get().baseUpdatedAt,
        );
        const observedIds = [
          ...new Set([...get().observedIds, ...definitions.map((item) => item.id)]),
        ];
        if (
          JSON.stringify(next.workflows) === JSON.stringify(get().workflows) &&
          JSON.stringify(next.backendVersions) === JSON.stringify(get().backendVersions) &&
          observedIds.length === get().observedIds.length
        )
          return;
        const history = { ...get().history };
        for (const old of get().workflows) {
          const replacement = next.workflows.find((item) => item.id === old.id);
          if (!replacement || workflowFingerprint(old) !== workflowFingerprint(replacement))
            delete history[old.id];
        }
        set({
          ...next,
          observedIds,
          history,
          selectedId: next.workflows.some((item) => item.id === get().selectedId)
            ? get().selectedId
            : null,
        });
        persist();
      },
      acceptDefinition(definition, revision = 0) {
        set({
          workflows: get().workflows.some((item) => item.id === definition.id)
            ? get().workflows
            : [...get().workflows, definition],
          backendVersions: {
            ...get().backendVersions,
            [definition.id]: workflowFingerprint(definition),
          },
          importedIds: [...new Set([...get().importedIds, definition.id])],
          backendRevisions: { ...get().backendRevisions, [definition.id]: revision },
          baseUpdatedAt: { ...get().baseUpdatedAt, [definition.id]: definition.updatedAt },
          conflictIds: get().conflictIds.filter((id) => id !== definition.id),
        });
        persist();
      },
      markConflict(id) {
        if (!get().conflictIds.includes(id)) set({ conflictIds: [...get().conflictIds, id] });
      },
      adoptDefinition(definition) {
        const history = { ...get().history };
        delete history[definition.id];
        set({
          workflows: get().workflows.some((item) => item.id === definition.id)
            ? get().workflows.map((item) => (item.id === definition.id ? definition : item))
            : [...get().workflows, definition],
          backendVersions: {
            ...get().backendVersions,
            [definition.id]: workflowFingerprint(definition),
          },
          baseUpdatedAt: { ...get().baseUpdatedAt, [definition.id]: definition.updatedAt },
          conflictIds: get().conflictIds.filter((id) => id !== definition.id),
          history,
        });
        persist();
      },
      markImported(id) {
        if (get().importedIds.includes(id)) return;
        set({ importedIds: [...get().importedIds, id] });
        persist();
      },
      setWorkspace(id, path) {
        set({
          workflows: get().workflows.map((item) =>
            item.id === id ? { ...item, workspacePath: path, updatedAt: Date.now() } : item,
          ),
        });
        persist();
      },
      hydrate() {
        if (get().hydrated) return;
        let raw: string | null;
        try {
          raw = getStorage().getItem(STUDIO_WORKFLOW_STORAGE_KEY);
        } catch {
          // 读取失败时不能把未知原记录当作空白，再由新建操作覆盖；保存按钮只重试读取。
          set({ storageProblem: "unavailable" });
          return;
        }
        if (raw === null) {
          set({ hydrated: true, storageProblem: null });
          return;
        }
        try {
          const data: unknown = JSON.parse(raw);
          if (typeof data !== "object" || data === null) throw new Error("Invalid draft record");
          const value = data as {
            version?: unknown;
            workflows?: unknown;
            selectedId?: unknown;
            importedIds?: unknown;
            backendVersions?: unknown;
            backendRevisions?: unknown;
            observedIds?: unknown;
            inputDrafts?: unknown;
          };
          if (
            value.version !== 1 ||
            !Array.isArray(value.workflows) ||
            value.workflows.length > 200 ||
            !value.workflows.every((item) => isStudioWorkflow(item, true)) ||
            new Set(value.workflows.map((item) => item.id)).size !== value.workflows.length ||
            (value.selectedId !== null && typeof value.selectedId !== "string")
          )
            throw new Error("Unsupported draft record");
          set({
            workflows: value.workflows.map((item) => ({ ...item, ...graphCopy(item) })),
            selectedId: value.workflows.some((item) => item.id === value.selectedId)
              ? (value.selectedId as string)
              : null,
            hydrated: true,
            storageProblem: null,
            savedAt: Date.now(),
            ...workflowStorageMetadata(value),
          });
        } catch {
          // 损坏或新版数据不能被空列表静默覆盖；所有保存保持关闭，原记录留在原位。
          set({ hydrated: true, storageProblem: "corrupt" });
        }
      },
      createWorkflow(name, template, workspacePath = "") {
        if (
          !get().hydrated ||
          get().storageProblem === "corrupt" ||
          get().workflows.length >= 200 ||
          !name.trim()
        )
          return null;
        const id = crypto.randomUUID();
        const workflow = {
          id,
          name: name.trim().slice(0, WORKFLOW_LIMITS.name),
          workspacePath,
          ...createWorkflowGraph(template),
          updatedAt: Date.now(),
        };
        set({ workflows: [...get().workflows, workflow], selectedId: id });
        persist();
        return id;
      },
      select(id) {
        set({ selectedId: get().workflows.some((item) => item.id === id) ? id : null });
        persist();
      },
      rename(id, name) {
        if (!name.trim()) return;
        set({
          workflows: get().workflows.map((item) =>
            item.id === id
              ? { ...item, name: name.trim().slice(0, WORKFLOW_LIMITS.name), updatedAt: Date.now() }
              : item,
          ),
        });
        persist();
      },
      duplicate(id, name) {
        const item = get().workflows.find((workflow) => workflow.id === id);
        if (
          !item ||
          !name.trim() ||
          get().workflows.length >= 200 ||
          get().storageProblem === "corrupt"
        )
          return null;
        const copy = duplicateWorkflow(item, name.trim());
        set({ workflows: [...get().workflows, copy], selectedId: copy.id });
        persist();
        return copy.id;
      },
      remove(id, revision = 0) {
        const history = { ...get().history };
        delete history[id];
        const inputDrafts = { ...get().inputDrafts };
        delete inputDrafts[id];
        set({
          workflows: get().workflows.filter((item) => item.id !== id),
          selectedId: get().selectedId === id ? null : get().selectedId,
          history,
          inputDrafts,
          backendRevisions: { ...get().backendRevisions, [id]: revision },
        });
        persist();
      },
      updateGraph(id, graph, options = {}) {
        const current = get().workflows.find((item) => item.id === id);
        if (
          !current ||
          ((graph.nodes.length > WORKFLOW_LIMITS.nodes ||
            graph.edges.length > WORKFLOW_LIMITS.edges) &&
            !(
              graph.nodes.length <= current.nodes.length &&
              graph.edges.length <= current.edges.length &&
              (graph.nodes.length < current.nodes.length ||
                graph.edges.length < current.edges.length)
            ))
        )
          return;
        if (options.checkpoint !== false) checkpoint(id);
        set({
          workflows: get().workflows.map((item) =>
            item.id === id ? { ...item, ...graphCopy(graph), updatedAt: Date.now() } : item,
          ),
          savedAt: options.persist === false ? null : get().savedAt,
        });
        if (options.persist !== false) persist();
      },
      removeNodes(id, nodeIds) {
        const current = get().workflows.find((item) => item.id === id);
        if (!current) return;
        const removed = new Set(nodeIds);
        const nodes = current.nodes.filter((node) => !removed.has(node.id));
        if (nodes.length === current.nodes.length) return;
        get().updateGraph(id, {
          nodes,
          edges: current.edges.filter(
            (edge) => !removed.has(edge.source) && !removed.has(edge.target),
          ),
        });
      },
      removeEdges(id, edgeIds) {
        // 同一次画布删除会先删节点再删连接；只读 owner 的当前图，不从旧渲染快照恢复节点。
        const current = get().workflows.find((item) => item.id === id);
        if (!current) return;
        const removed = new Set(edgeIds);
        const edges = current.edges.filter((edge) => !removed.has(edge.id));
        if (edges.length !== current.edges.length)
          get().updateGraph(id, { nodes: current.nodes, edges });
      },
      checkpoint,
      undo: (id) => travel(id, "undo"),
      redo: (id) => travel(id, "redo"),
      save() {
        if (!get().hydrated) get().hydrate();
        else persist();
      },
    };
  });
}

export const useStudioWorkflowStore = createStudioWorkflowStore();

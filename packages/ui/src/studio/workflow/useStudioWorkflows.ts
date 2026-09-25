import { useCallback, useEffect, useRef, useState } from "react";
import { useStudioWorkflowStore } from "../../store/studioWorkflowStore.js";
import { useStudioRuntime } from "../runtime/useStudioRuntime.js";
import { workflowDefinition, workflowDraft, workflowFitsRuntime } from "./workflowDrafts.js";
import type { StudioWorkflow } from "./types.js";
import type { StudioCommandResult } from "@knorvia/services";

export function useStudioWorkflows(targetId?: string) {
  const runtime = useStudioRuntime(targetId);
  const store = useStudioWorkflowStore();
  const [importError, setImportError] = useState("");
  const importing = useRef(new Set<string>());
  const definitions = runtime.overview?.workflows;
  useEffect(() => {
    store.hydrate();
  }, [store.hydrate]);
  useEffect(() => {
    if (definitions && store.hydrated)
      store.syncDefinitions(definitions.map(workflowDraft), runtime.overview?.revision);
  }, [definitions, runtime.overview?.revision, store.hydrated, store.syncDefinitions]);
  useEffect(() => {
    if (!definitions || !store.hydrated || importError) return;
    for (const workflow of store.workflows) {
      if (store.importedIds.includes(workflow.id) || importing.current.has(workflow.id)) continue;
      if (definitions.some((item) => item.id === workflow.id)) {
        store.markImported(workflow.id);
        continue;
      }
      if (!workflowFitsRuntime(workflow)) continue; // Retain oversized legacy drafts for explicit repair.
      importing.current.add(workflow.id);
      void runtime
        .command({
          type: "save-workflow",
          workflow: workflowDefinition(workflow),
          onlyIfAbsent: true,
        })
        .then(() => store.markImported(workflow.id))
        .catch((cause) => setImportError(cause instanceof Error ? cause.message : String(cause)))
        .finally(() => importing.current.delete(workflow.id));
    }
  }, [
    definitions,
    store.hydrated,
    store.workflows,
    store.importedIds,
    store.markImported,
    runtime.command,
    importError,
  ]);
  const save = useCallback(
    async (workflow: StudioWorkflow) => {
      if (!workflowFitsRuntime(workflow))
        throw new Error("工作流最多 200 个节点、800 条连接，名称最多 100 字符");
      // 只对服务端已有的工作流带版本；新建与旧草稿导入不做冲突检测。
      const baseUpdatedAt = definitions?.some((item) => item.id === workflow.id)
        ? store.baseUpdatedAt[workflow.id]
        : undefined;
      let result: StudioCommandResult;
      try {
        result = (await runtime.command({
          type: "save-workflow",
          workflow: workflowDefinition(workflow),
          ...(baseUpdatedAt === undefined ? {} : { baseUpdatedAt }),
        })) as StudioCommandResult;
      } catch (cause) {
        const latest = definitions?.find((item) => item.id === workflow.id);
        if (baseUpdatedAt !== undefined && latest?.updatedAt !== baseUpdatedAt)
          store.markConflict(workflow.id);
        throw cause;
      }
      store.acceptDefinition(workflow, result.revision);
    },
    [runtime.command, store.acceptDefinition, store.markConflict, store.baseUpdatedAt, definitions],
  );
  const reloadLatest = useCallback(
    (id: string) => {
      const latest = definitions?.find((item) => item.id === id);
      if (latest) store.adoptDefinition(workflowDraft(latest));
    },
    [definitions, store.adoptDefinition],
  );
  const remove = useCallback(
    async (id: string) => {
      const result = (await runtime.command({
        type: "delete",
        kind: "workflow",
        id,
      })) as StudioCommandResult;
      store.markImported(id);
      store.remove(id, result.revision);
    },
    [runtime.command, store.markImported, store.remove],
  );
  return {
    ...runtime,
    save,
    remove,
    reloadLatest,
    conflictIds: store.conflictIds,
    importError,
    retryImport: () => setImportError(""),
  };
}

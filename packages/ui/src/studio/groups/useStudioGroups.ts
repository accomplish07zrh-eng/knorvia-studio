import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioCommandResult, StudioGroupDefinition } from "@knorvia/services";
import { useStudioGroupStore } from "../../store/studioGroupStore.js";
import { useStudioRuntime } from "../runtime/useStudioRuntime.js";
import { normalizeGroupConfig, type StudioGroup, type StudioGroupConfig } from "./groupModel.js";
import { projectGroupDefinitions } from "./groupDefinitions.js";

export function groupDefinition(group: StudioGroup): StudioGroupDefinition {
  const { draft: _draft, ...definition } = group;
  return definition;
}

/** The service owns definitions; the existing store only retains unsent input and import receipts. */
export function useStudioGroups(targetId?: string) {
  const runtime = useStudioRuntime(targetId);
  const legacy = useStudioGroupStore((state) => state.groups);
  const importedIds = useStudioGroupStore((state) => state.importedIds);
  const backendRevisions = useStudioGroupStore((state) => state.backendRevisions);
  const acknowledgeDefinition = useStudioGroupStore((state) => state.acknowledgeDefinition);
  const ensureDraft = useStudioGroupStore((state) => state.ensureDraft);
  const markImported = useStudioGroupStore((state) => state.markImported);
  const deleteDraft = useStudioGroupStore((state) => state.deleteGroup);
  const importing = useRef(new Set<string>());
  const [error, setError] = useState("");
  const definitions = runtime.overview?.groups;
  useEffect(() => {
    if (!definitions) return;
    for (const definition of definitions) ensureDraft(definition, runtime.overview?.revision);
    if (error) return;
    for (const group of legacy) {
      if (importedIds.includes(group.id) || importing.current.has(group.id)) continue;
      if (definitions.some((item) => item.id === group.id)) {
        markImported(group.id);
        continue;
      }
      importing.current.add(group.id);
      void runtime
        .command({ type: "save-group", group: groupDefinition(group), onlyIfAbsent: true })
        .then(() => markImported(group.id))
        .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
        .finally(() => importing.current.delete(group.id));
    }
  }, [
    definitions,
    runtime.overview?.revision,
    legacy,
    importedIds,
    ensureDraft,
    markImported,
    runtime.command,
    error,
  ]);
  const save = useCallback(
    async (config: StudioGroupConfig, existing?: Pick<StudioGroup, "id" | "createdAt">) => {
      const value = normalizeGroupConfig(config);
      if (!value) throw new Error("群聊名称或成员配置无效");
      const now = Date.now();
      const definition: StudioGroupDefinition = {
        ...value,
        id: existing?.id ?? crypto.randomUUID(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const result = (await runtime.command({
        type: "save-group",
        group: definition,
      })) as StudioCommandResult;
      acknowledgeDefinition(definition, result.revision);
      return definition.id;
    },
    [runtime.command, acknowledgeDefinition],
  );
  const remove = useCallback(
    async (id: string) => {
      const result = (await runtime.command({
        type: "delete",
        kind: "group",
        id,
      })) as StudioCommandResult;
      markImported(id);
      deleteDraft(id, result.revision);
    },
    [runtime.command, markImported, deleteDraft],
  );
  return {
    ...runtime,
    save,
    remove,
    groups: definitions
      ? projectGroupDefinitions(definitions, legacy, backendRevisions, runtime.overview!.revision)
      : legacy,
    importError: error,
    retryImport: () => setError(""),
  };
}

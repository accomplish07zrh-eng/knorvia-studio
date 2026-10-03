import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudioCommandResult, StudioGroupDefinition } from "@knorvia/services";
import { useStudioGroupStore } from "../../store/studioGroupStore.js";
import { useStudioRuntime } from "../runtime/useStudioRuntime.js";
import { normalizeGroupConfig, type StudioGroup, type StudioGroupConfig } from "./groupModel.js";
import { projectGroupDefinitions } from "./groupDefinitions.js";

type ImportFlight = { id: string; lease: object };

/** 只拥有当前视图的回执接受权；Host 命令和去重仍由原 runtime client 持有。 */
class GroupViewScope {
  private lease: object | undefined;
  private readonly imports = new Map<string, ImportFlight>();

  constructor(private readonly connectionKey: number) {
    this.lease = { connectionKey };
  }

  open(): () => void {
    const lease = (this.lease ??= { connectionKey: this.connectionKey });
    return () => {
      if (!this.owns(lease)) return;
      this.lease = undefined;
      this.imports.clear();
    };
  }

  capture(): object | undefined {
    return this.lease;
  }

  owns(lease: object | undefined): boolean {
    return lease !== undefined && this.lease === lease;
  }

  hasImport(id: string): boolean {
    return this.imports.has(id);
  }

  admitImport(id: string, lease: object | undefined): ImportFlight | undefined {
    if (!lease || !this.owns(lease) || this.imports.has(id)) return undefined;
    const flight = { id, lease };
    this.imports.set(id, flight);
    return flight;
  }

  releaseImport(flight: ImportFlight): void {
    // 旧 finally 只能释放自己的对象票据，不能误清 effect replay 的同 ID 新请求。
    if (this.imports.get(flight.id) === flight) this.imports.delete(flight.id);
  }
}

type ImportFailure = { scope: GroupViewScope; lease: object; message: string };

export function groupDefinition(group: StudioGroup): StudioGroupDefinition {
  const { draft: _draft, ...definition } = group;
  return definition;
}

/** Definitions are Host facts; this hook only reconciles draft views and current-view receipts. */
export function useStudioGroups(targetId?: string) {
  const runtime = useStudioRuntime(targetId);
  const local = useStudioGroupStore((state) => state.groups);
  const legacy = useStudioGroupStore((state) => state.legacyGroups);
  const importedIds = useStudioGroupStore((state) => state.importedIds);
  const backendRevisions = useStudioGroupStore((state) => state.backendRevisions);
  const acknowledgeDefinition = useStudioGroupStore((state) => state.acknowledgeDefinition);
  const ensureDraft = useStudioGroupStore((state) => state.ensureDraft);
  const markImported = useStudioGroupStore((state) => state.markImported);
  const deleteDraft = useStudioGroupStore((state) => state.deleteGroup);
  const scope = useMemo(
    () => new GroupViewScope(runtime.connectionKey),
    [runtime.connectionKey],
  );
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [failure, setFailure] = useState<ImportFailure>();
  const accepts = useCallback(
    (lease: object | undefined) => currentScope.current === scope && scope.owns(lease),
    [scope],
  );
  const importError =
    failure?.scope === scope && scope.owns(failure.lease) ? failure.message : "";
  const definitions = runtime.overview?.groups;
  const revision = runtime.overview?.revision;

  useEffect(() => scope.open(), [scope]);
  useEffect(() => {
    const lease = scope.capture();
    if (!definitions || !accepts(lease)) return;
    for (const definition of definitions) {
      if (!accepts(lease)) return;
      ensureDraft(definition, revision);
    }
    if (importError) return;
    for (const group of legacy) {
      if (!accepts(lease)) return;
      if (importedIds.includes(group.id) || scope.hasImport(group.id)) continue;
      if (definitions.some((item) => item.id === group.id)) {
        markImported(group.id);
        continue;
      }
      const flight = scope.admitImport(group.id, lease);
      if (!flight) continue;
      void runtime
        .command({ type: "save-group", group: groupDefinition(group), onlyIfAbsent: true })
        .then(() => {
          if (accepts(flight.lease)) markImported(group.id);
        })
        .catch((cause) => {
          if (!accepts(flight.lease)) return;
          setFailure({
            scope,
            lease: flight.lease,
            message: cause instanceof Error ? cause.message : String(cause),
          });
        })
        .finally(() => scope.releaseImport(flight));
    }
  }, [
    scope,
    accepts,
    definitions,
    revision,
    legacy,
    importedIds,
    ensureDraft,
    markImported,
    runtime.command,
    importError,
  ]);

  const save = useCallback(
    async (
      config: StudioGroupConfig,
      existing?: Pick<StudioGroup, "id" | "createdAt"> & { updatedAt?: number },
    ) => {
      const value = normalizeGroupConfig(config);
      if (!value) throw new Error("群聊名称或成员配置无效");
      const now = Date.now();
      const definition: StudioGroupDefinition = {
        ...value,
        id: existing?.id ?? crypto.randomUUID(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const baseUpdatedAt = definitions?.some((item) => item.id === existing?.id)
        ? existing?.updatedAt
        : undefined;
      const lease = scope.capture();
      const result = (await runtime.command({
        type: "save-group",
        group: definition,
        ...(baseUpdatedAt === undefined ? {} : { baseUpdatedAt }),
      })) as StudioCommandResult;
      // 连接替换/卸载只撤销本地 ACK 发布，不取消已经交给原 Host 的显式命令。
      if (accepts(lease)) acknowledgeDefinition(definition, result.revision);
      return definition.id;
    },
    [runtime.command, acknowledgeDefinition, definitions, scope, accepts],
  );
  const remove = useCallback(
    async (id: string) => {
      const lease = scope.capture();
      const result = (await runtime.command({
        type: "delete",
        kind: "group",
        id,
      })) as StudioCommandResult;
      if (!accepts(lease)) return;
      markImported(id);
      if (accepts(lease)) deleteDraft(id, result.revision);
    },
    [runtime.command, markImported, deleteDraft, scope, accepts],
  );
  const retryImport = useCallback(() => {
    setFailure((current) => (current?.scope === scope ? undefined : current));
  }, [scope]);

  return {
    ...runtime,
    save,
    remove,
    groups: definitions
      ? projectGroupDefinitions(definitions, local, backendRevisions, runtime.overview!.revision)
      : local,
    importError,
    retryImport,
  };
}

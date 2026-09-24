import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { IStudioRuntimeService } from "@knorvia/services";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { StudioClient, type CommandInput } from "./studioClient.js";

const clients = new WeakMap<IStudioRuntimeService, StudioClient>();
const unavailable = new StudioClient();
export function useStudioRuntime(targetId?: string) {
  const service = useBaseWorkspaceServices().studioRuntimeService;
  const client = useMemo(() => {
    if (!service) return unavailable;
    let value = clients.get(service);
    if (!value) {
      value = new StudioClient(service);
      clients.set(service, value);
    }
    return value;
  }, [service]);
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useEffect(() => client.watch(targetId), [client, targetId]);
  return {
    service,
    connectionKey: client.connectionKey,
    overview: snapshot.overview,
    timeline: targetId ? snapshot.timelines.get(targetId) : undefined,
    error: (targetId ? snapshot.timelineErrors.get(targetId) : undefined) ?? snapshot.error,
    command: useCallback((input: CommandInput) => client.execute(input), [client]),
    refresh: client.schedule,
    loadOlder: useCallback(
      () => (targetId ? client.loadOlder(targetId) : Promise.resolve()),
      [client, targetId],
    ),
    ready: client.isReady(targetId),
  };
}

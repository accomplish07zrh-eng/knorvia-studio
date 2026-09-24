import { useMemo, useSyncExternalStore } from "react";
import type { IStudioRuntimeService } from "@knorvia/services";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useRemoteWorkspaceSessionStore } from "@/store/remoteWorkspaceSessionStore.js";
import { StudioKernelCatalog } from "./studioKernelCatalog.js";

const catalogs = new WeakMap<IStudioRuntimeService, StudioKernelCatalog>();
const liveCatalogs = new Set<StudioKernelCatalog>();
const empty = new StudioKernelCatalog();

// SSH binding changes independently of the local Studio service. Reinspect the
// same Host catalog when a server/project comes online or is removed.
useRemoteWorkspaceSessionStore.subscribe((state, previous) => {
  if (
    state.sessionsById === previous.sessionsById &&
    state.sessionIdByWorkspaceIdentity === previous.sessionIdByWorkspaceIdentity
  )
    return;
  for (const catalog of liveCatalogs) void catalog.refresh();
});

export function useStudioKernelCatalog() {
  const service = useBaseWorkspaceServices().studioRuntimeService;
  const catalog = useMemo(() => {
    if (!service) return empty;
    let value = catalogs.get(service);
    if (!value) {
      value = new StudioKernelCatalog(service);
      catalogs.set(service, value);
      liveCatalogs.add(value);
    }
    return value;
  }, [service]);
  return {
    ...useSyncExternalStore(catalog.subscribe, catalog.getSnapshot, catalog.getSnapshot),
    refresh: catalog.refresh,
  };
}

// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState } from "react";
import type {
  IStudioRuntimeService,
  StudioWorkspaceRuntimeControl,
  StudioWorkspaceRuntimeState,
} from "@knorvia/services";
import { useBaseWorkspaceServices } from "./useWorkspaceServices.js";

/** A disposable projection of Host facts; no optimistic lifecycle state. */
export function useStudioWorkspaceRuntime(runId: string, stepId: string, enabled: boolean) {
  const service = useBaseWorkspaceServices().studioRuntimeService;
  const key = JSON.stringify([runId, stepId]);
  const [row, setRow] = useState<{
    key: string;
    service?: IStudioRuntimeService;
    state?: StudioWorkspaceRuntimeState;
    error?: string;
  }>({ key });
  const [pending, setPending] = useState<{ key: string; service: IStudioRuntimeService }>();
  useEffect(() => {
    if (!enabled || !service) return;
    let current = true;
    let loading = false;
    let again = false;
    const read = async () => {
      if (!current) return;
      if (loading) {
        again = true;
        return;
      }
      loading = true;
      try {
        const state = await service.workspaceRuntime({ runId, stepId });
        if (current) setRow({ key, service, state });
      } catch (error) {
        if (current)
          setRow({
            key,
            service,
            error: error instanceof Error ? error.message : "Workspace runtime unavailable",
          });
      } finally {
        loading = false;
        if (again) {
          again = false;
          void read();
        }
      }
    };
    const subscription = service.onDidChange(() => void read());
    const timer = setInterval(() => void read(), 1000);
    void read();
    return () => {
      current = false;
      clearInterval(timer);
      subscription.dispose();
    };
  }, [enabled, key, runId, stepId, service]);
  const control = useCallback(
    async (input: StudioWorkspaceRuntimeControl) => {
      if (!service) return;
      setPending({ key, service });
      try {
        await service.workspaceRuntime({ runId, stepId, control: input });
      } finally {
        setPending((value) =>
          value?.key === key && value.service === service ? undefined : value,
        );
      }
    },
    [service, key, runId, stepId],
  );
  return {
    state: row.key === key && row.service === service ? row.state : undefined,
    error: row.key === key && row.service === service ? row.error : undefined,
    busy: pending?.key === key && pending.service === service,
    control,
    available: Boolean(service),
  };
}

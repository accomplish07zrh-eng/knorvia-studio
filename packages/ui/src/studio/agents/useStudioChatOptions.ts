import { useEffect, useState } from "react";
import type {
  IStudioRuntimeService,
  StudioKernelConfig,
  StudioKernelOptions,
} from "@knorvia/services";
import type { StudioKernelId } from "../types.js";

export interface StudioChatOptionsState {
  options?: StudioKernelOptions;
  error?: string;
  loading: boolean;
}

export function useStudioChatOptions(
  service: IStudioRuntimeService | undefined,
  kernel: StudioKernelId,
  workspacePath: string,
  config: StudioKernelConfig | undefined,
  selectedModel?: string,
) {
  const sourceKey = JSON.stringify([
    kernel,
    workspacePath,
    config?.executablePath,
    config?.permission,
    config?.model,
    config?.reasoningEffort,
  ]);
  const key = JSON.stringify([sourceKey, selectedModel]);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<
    StudioChatOptionsState & {
      key: string;
      sourceKey: string;
      service?: IStudioRuntimeService;
    }
  >({
    key,
    sourceKey,
    service,
    loading: Boolean(service),
  });
  useEffect(() => {
    let current = true;
    if (!service) {
      setState({ key, sourceKey, service, loading: false });
      return;
    }
    setState((previous) => ({
      ...(previous.sourceKey === sourceKey && previous.service === service ? previous : {}),
      key,
      sourceKey,
      service,
      loading: true,
      error: undefined,
    }));
    void Promise.resolve()
      .then(() =>
        service.kernelOptions({
          kernel,
          ...(workspacePath ? { workspacePath } : {}),
          ...(selectedModel ? { model: selectedModel } : {}),
        }),
      )
      .then(
        (options) => {
          if (!current) return;
          setState((previous) => ({
            key,
            sourceKey,
            service,
            loading: false,
            // A transient failed refresh should not remove the last successfully reported menu.
            options:
              options.error &&
              !options.models.length &&
              previous.sourceKey === sourceKey &&
              previous.service === service &&
              previous.options
                ? previous.options
                : options,
            error: options.error,
          }));
        },
        (error: unknown) => {
          if (current)
            setState((previous) => ({
              ...(previous.sourceKey === sourceKey && previous.service === service ? previous : {}),
              key,
              sourceKey,
              service,
              loading: false,
              error: error instanceof Error ? error.message : String(error),
            }));
        },
      );
    return () => {
      current = false;
    };
  }, [service, key, sourceKey, kernel, workspacePath, selectedModel, revision]);
  // 同配置切换到另一 Host 时，effect 执行前的首帧也不能显示上一连接的模型能力。
  const visible: StudioChatOptionsState =
    state.key === key && state.service === service
      ? state
      : {
          loading: Boolean(service),
          options:
            state.service === service && state.sourceKey === sourceKey ? state.options : undefined,
        };
  return {
    options: visible.options,
    error: visible.error,
    loading: visible.loading,
    retry: () => setRevision((value) => value + 1),
  };
}

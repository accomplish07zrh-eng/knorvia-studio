import type { IDisposable } from "@knorvia/rpc";
import type { IKnorviaAgentService } from "@knorvia/services";
import { HostResponseTypes, type ProcessResourceRuntimeSurface } from "@knorvia/shared";

export function registerHostToolExecResourceTelemetry(options: {
  agentService: Pick<IKnorviaAgentService, "onDynamicToolExecResource">;
  postMessage(message: unknown): void;
  runtimeSurface: ProcessResourceRuntimeSurface;
}): IDisposable {
  return options.agentService.onDynamicToolExecResource()((sample) => {
    try {
      options.postMessage({
        type: HostResponseTypes.ToolExecResource,
        runtimeSurface: options.runtimeSurface,
        sample,
      });
    } catch {
      // main 退出或通道关闭只丢当前完成事实，不影响 Bash 生命周期。
    }
  });
}

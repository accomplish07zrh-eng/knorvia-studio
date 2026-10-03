import { randomUUID } from "node:crypto";
import {
  IKnorviaAgentService,
  IKnorviaTaskService,
  IWindowControllerService,
  type ServiceCollection,
} from "@knorvia/services";
import { createWindowHostControllerRuntime } from "@knorvia/services/window-controller";

export function createHttpWindowController(services: ServiceCollection) {
  if (
    services.getOptional(IWindowControllerService) ||
    !services.getOptional(IKnorviaTaskService)
  ) {
    return undefined;
  }

  // Web 的本地服务集合缺少 Desktop Host 的 controller 装配；复用同一 owner，
  // 而不是在 UI 另建列表 fallback。task/agent services 继续拥有业务数据和运行事实。
  return createWindowHostControllerRuntime({
    createId: randomUUID,
    resolveSource(scope) {
      const taskService = services.getOptional(IKnorviaTaskService);
      if (!taskService || !scope.workspacePath) return null;
      return {
        scope: {
          kind: "local",
          workspacePath: scope.workspacePath,
          ...(scope.workspaceIdentity ? { workspaceIdentity: scope.workspaceIdentity } : {}),
        },
        taskService,
        agentService: services.getOptional(IKnorviaAgentService),
        sourceAvailability: "online",
      };
    },
  });
}

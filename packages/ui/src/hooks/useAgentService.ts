import type { IKnorviaAgentService } from "@knorvia/services";
import { useWorkspaceOrContextServices } from "@/hooks/useWorkspaceServices.js";

export function useAgentService(
  workspacePath?: string,
  preferredRemoteSessionId?: string | null,
  workspaceIdentity?: string | null,
): IKnorviaAgentService {
  const services = useWorkspaceOrContextServices(
    workspacePath,
    preferredRemoteSessionId,
    workspaceIdentity,
  );
  return services.agentService;
}

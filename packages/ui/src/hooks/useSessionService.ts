import type { IKnorviaSessionService } from "@knorvia/services";
import { useWorkspaceOrContextServices } from "@/hooks/useWorkspaceServices.js";

export function useSessionService(
  workspacePath?: string,
  preferredRemoteSessionId?: string | null,
  workspaceIdentity?: string | null,
): IKnorviaSessionService {
  const services = useWorkspaceOrContextServices(
    workspacePath,
    preferredRemoteSessionId,
    workspaceIdentity,
  );
  return services.sessionService;
}

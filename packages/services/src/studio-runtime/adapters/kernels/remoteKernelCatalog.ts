import type { LocalStudioKernelId, StudioKernelStatus } from "../../kernelTypes.js";
import { parseRemoteStudioKernelId } from "../../domain/remoteAgentIdentity.js";
import { remoteStudioKernelId } from "./remoteAgentIdentity.js";
import type { RemoteStudioEnvironment } from "./remoteKernelBridge.js";

/** Only authenticated, inspected CLI installations become remote members. */
export async function inspectRemoteStudioKernels(
  environments: RemoteStudioEnvironment[],
): Promise<StudioKernelStatus[]> {
  const distinct = [
    ...new Map(environments.map((item) => [item.workspaceIdentity, item])).values(),
  ];
  const results = await Promise.allSettled(
    distinct.map(async (environment) => {
      const statuses = await environment.service.inspectKernels();
      return statuses
        .filter(
          (status) =>
            status.installed && status.id !== "knorvia" && !parseRemoteStudioKernelId(status.id),
        )
        .map(
          (status): StudioKernelStatus => ({
            ...status,
            id: remoteStudioKernelId(
              environment.workspaceIdentity,
              status.id as LocalStudioKernelId,
            ),
            displayName: `${status.displayName || status.id} · ${environment.label}`,
            remoteWorkspacePath: environment.workspacePath,
            remoteEnvironmentLabel: environment.label,
            management: "external",
            origin: "external",
            executablePath: undefined,
          }),
        );
    }),
  );
  return results.flatMap((item) => (item.status === "fulfilled" ? item.value : []));
}

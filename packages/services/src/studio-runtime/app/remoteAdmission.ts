import type { StudioCommand } from "../contract.js";
import type { StudioConversation } from "../types.js";
import type { StudioGroupDefinition, StudioWorkflowDefinition } from "../workflowTypes.js";
import type { StudioKernelRegistry } from "./ports.js";
import type { StudioRepository } from "./storePort.js";
import { parseRemoteStudioKernelId } from "../domain/remoteAgentIdentity.js";
import { routeStudioGroupMembers } from "../domain/groupPolicy.js";

/** Reject offline SSH members before a new run enters the queue. */
export function assertRemoteStudioMembersOnline(
  command: StudioCommand,
  db: StudioRepository,
  kernels: StudioKernelRegistry,
): void {
  if (command.type !== "send") return;
  const members =
    command.kind === "chat"
      ? [db.read<StudioConversation>("conversation", command.targetId)?.kernel]
      : command.kind === "group"
        ? (() => {
            const group = db.read<StudioGroupDefinition>("group", command.targetId);
            return !group
              ? []
              : command.taskMode
                ? group.members
                : routeStudioGroupMembers(group, command.text);
          })()
        : (db
            .read<StudioWorkflowDefinition>("workflow", command.targetId)
            ?.nodes.filter((node) => node.data.kind === "agent")
            .map((node) => node.data.kernel) ?? []);
  for (const member of members) {
    if (parseRemoteStudioKernelId(member) && !kernels.remoteWorkspace?.(member!))
      throw new Error(`SSH Agent ${member} 已离线，请重新连接对应服务器后发送`);
  }
}

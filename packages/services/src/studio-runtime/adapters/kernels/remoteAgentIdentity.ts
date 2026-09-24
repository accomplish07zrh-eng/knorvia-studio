import { createHash } from "node:crypto";
import type { LocalStudioKernelId, StudioKernelId } from "../../kernelTypes.js";
import { parseRemoteStudioKernelId } from "../../domain/remoteAgentIdentity.js";

/** Path-sensitive stable route key; credentials and raw host names stay outside Studio IDs. */
export function remoteStudioKernelId(
  workspaceIdentity: string,
  kernel: LocalStudioKernelId,
): StudioKernelId {
  if (!workspaceIdentity.trim()) throw new Error("远程 Agent 缺少有效工作区身份");
  const workspaceKey = createHash("sha256")
    .update(workspaceIdentity.trim())
    .digest("hex")
    .slice(0, 24);
  const id = `ssh:${workspaceKey}:${kernel}`;
  if (!parseRemoteStudioKernelId(id)) throw new Error("远程 Agent 内核无效");
  return id as StudioKernelId;
}

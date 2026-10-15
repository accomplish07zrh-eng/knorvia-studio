// SPDX-License-Identifier: Apache-2.0
// Environment 级远程身份键（B36）。
import type { RemoteTarget } from "./remoteTarget.js";
import { buildSshRemoteHostKey } from "./remoteSshHostKey.js";

const DEFAULT_SLOT_LABEL = "<default>";
const ENVIRONMENT_KEY_PARTS = {
  ssh: "ssh:",
  wsl: "wsl:",
  docker: "docker:",
  slotSeparator: "\0",
} as const;

// Provider Provisioning 等 Environment 级状态的稳定身份；不得混用 workspace/session 身份。
export function buildRemoteEnvironmentKey(target: RemoteTarget): string {
  if (target.kind === "ssh") {
    return `${ENVIRONMENT_KEY_PARTS.ssh}${buildSshRemoteHostKey(target)}`;
  }
  if (target.kind === "wsl") {
    const distroSlot = target.distro?.trim() || DEFAULT_SLOT_LABEL;
    const userSlot = target.user?.trim() || DEFAULT_SLOT_LABEL;
    return `${ENVIRONMENT_KEY_PARTS.wsl}${distroSlot}${ENVIRONMENT_KEY_PARTS.slotSeparator}${userSlot}`;
  }
  return `${ENVIRONMENT_KEY_PARTS.docker}${target.container.trim()}`;
}

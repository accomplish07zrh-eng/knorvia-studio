// SPDX-License-Identifier: Apache-2.0
// 自动转后台资格：显式后台、空命令与 sleep 类等待命令不参与「超时自动转后台」。
import type { BashInput } from "@knorvia/contracts";

const IDLE_WAIT_HEAD_WORD = "sleep";

export function isBashAutoBackgroundEligible(spec: BashInput): boolean {
  const explicitlyBackgrounded = spec.run_in_background === true;
  if (explicitlyBackgrounded) return false;
  const words = spec.command.trim().split(/\s+/u).filter(Boolean);
  const headWord = words[0];
  if (headWord === undefined) return false;
  return headWord !== IDLE_WAIT_HEAD_WORD;
}

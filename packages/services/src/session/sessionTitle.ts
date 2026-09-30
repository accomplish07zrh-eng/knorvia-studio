// SPDX-License-Identifier: Apache-2.0
// Source-exposed reimplementation; see specs/knorvia-session-leaf-contract-8389.md.
import type { KnorviaPromptAttachment } from "@knorvia/shared";

export function deriveSessionTitle(
  content: string,
  attachments: readonly KnorviaPromptAttachment[],
): string {
  if (content.length === 0) {
    const first = attachments[0];
    if (!first) return "";
    const filename = first.filename;
    return attachments.length > 1 ? `${filename} +${attachments.length - 1}` : filename;
  }
  return content.length <= 50 ? content : `${content.substring(0, 50)}...`;
}

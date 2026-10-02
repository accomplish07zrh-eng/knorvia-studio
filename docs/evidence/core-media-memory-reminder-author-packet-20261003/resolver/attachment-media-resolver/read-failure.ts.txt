import type { FilePartSource, TurnAttachment } from "../../deps.js";
import type { ResolvedTurnAttachment } from "../../types.js";
import { resolvedPlaceholderAttachment } from "../attachment-placeholder.js";

export function localReadFailed(
  attachment: TurnAttachment,
  filename: string,
  mime: string,
  source: FilePartSource,
): ResolvedTurnAttachment {
  return resolvedPlaceholderAttachment(attachment, attachment.path!, "attachment_read_failed", {
    filename,
    mime,
    source,
  });
}

// A handle is owned only during one candidate's bounded snapshot attempt.
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { redactFeedbackText } from "@knorvia/shared";
import type { FeedbackArchiveCandidate } from "./feedbackArchiveCandidates.js";
import {
  decodeFeedbackArchiveText,
  fitsFeedbackArchive,
  isFeedbackArchiveMetadata,
  type FeedbackArchiveWindow,
} from "./feedbackArchivePolicy.js";

export interface FeedbackArchiveEntry {
  name: string;
  data: Buffer;
}
type SnapshotResult =
  | { kind: "included"; entry: FeedbackArchiveEntry; cost: number }
  | { kind: "skipped"; reason: string };

export async function feedbackArchiveSnapshot(
  candidate: FeedbackArchiveCandidate,
  charged: number,
  window: FeedbackArchiveWindow,
): Promise<SnapshotResult> {
  const skipped = (reason: string): SnapshotResult => ({ kind: "skipped", reason });
  const canonical = await realpath(candidate.path).catch(() => null);
  if (canonical !== candidate.path) return skipped("unsafe-path");
  const before = await lstat(candidate.path).catch(() => null);
  if (!isFeedbackArchiveMetadata(before, charged, window)) return skipped("metadata-policy");
  const handle = await open(candidate.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(
    () => null,
  );
  if (!handle) return skipped("open-failed");
  try {
    const opened = await handle.stat();
    if (
      !isFeedbackArchiveMetadata(opened, charged, window) ||
      opened.ino !== before.ino ||
      opened.dev !== before.dev
    )
      return skipped("opened-file-policy");
    const bytes = Buffer.alloc(opened.size);
    let position = 0;
    while (position < bytes.length) {
      const { bytesRead } = await handle.read(bytes, position, bytes.length - position, position);
      if (bytesRead === 0) return skipped("short-read");
      position += bytesRead;
    }
    const text = decodeFeedbackArchiveText(bytes);
    if (text === null) return skipped("unsupported-text");
    const data = Buffer.from(redactFeedbackText(text, { diagnostic: true }));
    if (!fitsFeedbackArchive(data.length, charged, window)) return skipped("redacted-size-limit");
    return {
      kind: "included",
      entry: { name: candidate.name, data },
      cost: Math.max(bytes.length, data.length),
    };
  } finally {
    await handle.close();
  }
}

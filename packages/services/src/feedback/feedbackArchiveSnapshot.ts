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
  const canonicalPath = await realpath(candidate.path).catch(() => null);
  if (canonicalPath !== candidate.path) {
    return { kind: "skipped", reason: "unsafe-path" };
  }

  const beforeOpen = await lstat(candidate.path).catch(() => null);
  if (!isFeedbackArchiveMetadata(beforeOpen, charged, window)) {
    return { kind: "skipped", reason: "metadata-policy" };
  }

  const handle = await open(candidate.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(
    () => null,
  );
  if (handle === null) {
    return { kind: "skipped", reason: "open-failed" };
  }

  try {
    const opened = await handle.stat();
    if (
      !isFeedbackArchiveMetadata(opened, charged, window) ||
      opened.ino !== beforeOpen.ino ||
      opened.dev !== beforeOpen.dev
    ) {
      return { kind: "skipped", reason: "opened-file-policy" };
    }

    const original = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < original.length) {
      const { bytesRead } = await handle.read(original, offset, original.length - offset, offset);
      if (bytesRead === 0) {
        return { kind: "skipped", reason: "short-read" };
      }
      offset += bytesRead;
    }

    const text = decodeFeedbackArchiveText(original);
    if (text === null) {
      return { kind: "skipped", reason: "unsupported-text" };
    }

    const redacted = Buffer.from(redactFeedbackText(text, { diagnostic: true }), "utf8");
    if (!fitsFeedbackArchive(redacted.length, charged, window)) {
      return { kind: "skipped", reason: "redacted-size-limit" };
    }

    return {
      kind: "included",
      entry: { name: candidate.name, data: redacted },
      cost: Math.max(original.length, redacted.length),
    };
  } finally {
    await handle.close();
  }
}

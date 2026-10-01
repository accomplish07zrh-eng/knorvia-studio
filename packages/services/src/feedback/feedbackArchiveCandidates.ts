// Candidate order and scan ownership only; opened-file admission belongs to the snapshot reader.
import type { Dirent } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  feedbackArchiveLimits,
  isFeedbackArchiveFilename,
  type FeedbackLogSource,
} from "./feedbackArchivePolicy.js";

export interface FeedbackArchiveCandidate {
  path: string;
  name: string;
}

interface DirectoryFrame {
  path: string;
  prefix: string;
  depth: number;
  entries: Dirent[];
  cursor: number;
}

async function directoryFrame(
  path: string,
  prefix: string,
  depth: number,
): Promise<DirectoryFrame> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  entries.sort((left, right) => left.name.localeCompare(right.name));
  return { path, prefix, depth, entries, cursor: 0 };
}

export async function* feedbackArchiveCandidates(
  sources: readonly FeedbackLogSource[],
): AsyncGenerator<FeedbackArchiveCandidate> {
  let visited = 0;
  for (const source of sources) {
    const canonical = await realpath(source.directory).catch(() => null);
    if (!canonical) continue;
    const root = await lstat(source.directory).catch(() => null);
    if (!root?.isDirectory() || visited >= feedbackArchiveLimits.visits) continue;
    const stack = [await directoryFrame(canonical, source.archivePrefix, 0)];
    while (stack.length && visited < feedbackArchiveLimits.visits) {
      const frame = stack[stack.length - 1]!;
      if (frame.cursor === frame.entries.length) {
        stack.pop();
        continue;
      }
      const entry = frame.entries[frame.cursor++]!;
      visited++;
      if (entry.isSymbolicLink()) continue;
      const path = join(frame.path, entry.name);
      const name = posix.join(frame.prefix, entry.name);
      if (entry.isDirectory() && !source.exitLogsOnly) {
        if (frame.depth < feedbackArchiveLimits.depth)
          stack.push(await directoryFrame(path, name, frame.depth + 1));
      } else if (entry.isFile() && isFeedbackArchiveFilename(entry.name, source.exitLogsOnly)) {
        yield { path, name };
      }
    }
  }
}

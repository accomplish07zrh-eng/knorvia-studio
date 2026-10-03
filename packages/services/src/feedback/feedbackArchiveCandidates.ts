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

async function directoryEntries(path: string): Promise<Dirent[]> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

export async function* feedbackArchiveCandidates(
  sources: readonly FeedbackLogSource[],
): AsyncGenerator<FeedbackArchiveCandidate> {
  let visits = 0;

  for (const source of sources) {
    const root = await realpath(source.directory).catch(() => null);
    if (!root) {
      continue;
    }
    const info = await lstat(source.directory).catch(() => null);
    if (!info?.isDirectory() || visits >= feedbackArchiveLimits.visits) {
      continue;
    }

    const stack: DirectoryFrame[] = [
      {
        path: root,
        prefix: source.archivePrefix,
        depth: 0,
        entries: await directoryEntries(root),
        cursor: 0,
      },
    ];

    while (stack.length > 0 && visits < feedbackArchiveLimits.visits) {
      const frame = stack[stack.length - 1]!;
      if (frame.cursor >= frame.entries.length) {
        stack.pop();
        continue;
      }

      const entry = frame.entries[frame.cursor++]!;
      visits++;
      if (entry.isSymbolicLink()) {
        continue;
      }

      const path = join(frame.path, entry.name);
      const name = posix.join(frame.prefix, entry.name);
      if (entry.isDirectory() && !source.exitLogsOnly) {
        if (frame.depth < feedbackArchiveLimits.depth) {
          stack.push({
            path,
            prefix: name,
            depth: frame.depth + 1,
            entries: await directoryEntries(path),
            cursor: 0,
          });
        }
        continue;
      }

      if (entry.isFile() && isFeedbackArchiveFilename(entry.name, source.exitLogsOnly)) {
        yield { path, name };
      }
    }
  }
}

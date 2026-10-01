// Source-exposed compatibility policy; technical provenance is in the scoped spec/handoff.
import type { Stats } from "node:fs";

export const feedbackArchiveLimits = {
  fileBytes: 8 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024,
  visits: 2000,
  depth: 4,
} as const;

export interface FeedbackLogSource {
  directory: string;
  archivePrefix: string;
  exitLogsOnly?: boolean;
}

export interface FeedbackArchiveWindow {
  start: number;
  end: number;
  budget: number;
}

export function feedbackArchiveWindow(now: Date, budget?: number): FeedbackArchiveWindow {
  const [year, month, day] = [now.getFullYear(), now.getMonth(), now.getDate()];
  return {
    start: new Date(year, month, day).getTime(),
    end: new Date(year, month, day + 1).getTime(),
    budget: Math.min(budget ?? feedbackArchiveLimits.totalBytes, feedbackArchiveLimits.totalBytes),
  };
}

export function isFeedbackArchiveFilename(name: string, exitOnly?: boolean): boolean {
  if (exitOnly) return name.endsWith(".exit.log");
  return /(?:\.log(?:\.\d+)?|\.jsonl|\.ndjson)$/i.test(name);
}

export function fitsFeedbackArchive(
  size: number,
  charged: number,
  window: FeedbackArchiveWindow,
): boolean {
  // NaN 预算的既有比较语义也属于合同；不能用 <= 改写而改变 admission。
  return !(size > feedbackArchiveLimits.fileBytes || charged + size > window.budget);
}

export function isFeedbackArchiveMetadata(
  info: Stats | null,
  charged: number,
  window: FeedbackArchiveWindow,
): info is Stats {
  if (!info?.isFile() || info.nlink !== 1) return false;
  return (
    fitsFeedbackArchive(info.size, charged, window) &&
    info.mtimeMs >= window.start &&
    info.mtimeMs < window.end
  );
}

export function decodeFeedbackArchiveText(bytes: Buffer): string | null {
  const encodings: Record<string, string> = { fffe: "utf-16le", feff: "utf-16be" };
  try {
    const encoding = encodings[bytes.subarray(0, 2).toString("hex")] ?? "utf-8";
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    for (const character of text) {
      const code = character.charCodeAt(0);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) return null;
    }
    return text;
  } catch {
    return null;
  }
}

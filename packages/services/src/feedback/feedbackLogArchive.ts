// Source-exposed reconstruction from frozen contracts; no clean-room or license claim.
// See specs/knorvia-feedback-archive-fast-20261001.md and the fixed service-lane handoff.
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { ZipFile } from "yazl";
import { KNORVIA_VERSION, KNORVIA_COMMIT } from "@knorvia/shared";
import { feedbackArchiveCandidates } from "./feedbackArchiveCandidates.js";
import { feedbackArchiveWindow, type FeedbackLogSource } from "./feedbackArchivePolicy.js";
import { feedbackArchiveSnapshot, type FeedbackArchiveEntry } from "./feedbackArchiveSnapshot.js";

async function writeArchive(path: string, entries: readonly FeedbackArchiveEntry[]): Promise<void> {
  const zip = new ZipFile();
  const output = createWriteStream(path, { mode: 0o600 });
  const writing = pipeline(zip.outputStream, output);
  try {
    for (const entry of entries) zip.addBuffer(entry.data, entry.name);
    zip.end();
    await writing;
  } catch (error) {
    // addBuffer/end 可同步失败；先结束已启动的写入，再删除目录，避免遗留 writer。
    zip.outputStream.destroy();
    output.destroy();
    await writing.catch(() => {});
    throw error;
  }
}

export async function createFeedbackDiagnosticArchive(options: {
  sources: readonly FeedbackLogSource[];
  outputRootDir: string;
  now?: () => Date;
  maxTotalBytes?: number;
  onProgress?: (event: { processedBytes: number; totalBytes: number }) => void;
}): Promise<{ path: string; size: number }> {
  const now = options.now?.() ?? new Date();
  const window = feedbackArchiveWindow(now, options.maxTotalBytes);
  await mkdir(options.outputRootDir, { recursive: true });
  const outputDir = await mkdtemp(join(options.outputRootDir, "archive-"));
  const path = join(outputDir, "knorvia-diagnostic-logs.zip");
  const entries: FeedbackArchiveEntry[] = [];
  const skippedLogFilesByReason: Record<string, number> = {};
  let charged = 0;
  try {
    options.onProgress?.({ processedBytes: 0, totalBytes: 0 });
    for await (const candidate of feedbackArchiveCandidates(options.sources)) {
      const snapshot = await feedbackArchiveSnapshot(candidate, charged, window);
      if (snapshot.kind === "included") {
        entries.push(snapshot.entry);
        charged += snapshot.cost;
      } else {
        const reason = snapshot.reason;
        skippedLogFilesByReason[reason] = (skippedLogFilesByReason[reason] ?? 0) + 1;
      }
    }
    const about = Buffer.from(
      [
        "Knorvia Studio diagnostic logs",
        `timestamp: ${now.toISOString()}`,
        `appVersion: ${KNORVIA_VERSION}`,
        `commit: ${KNORVIA_COMMIT}`,
        `node: ${process.version}`,
        `os: ${platform()} ${release()} (${arch()})`,
        `includedLogFiles: ${entries.length}`,
        `skippedLogFiles: ${Object.values(skippedLogFilesByReason).reduce((sum, count) => sum + count, 0)}`,
        `skippedLogFilesByReason: ${JSON.stringify(skippedLogFilesByReason)}`,
        "Scope: diagnostic text log files modified today (local time); credentials and structured payloads redacted.",
      ].join("\n"),
    );
    await writeArchive(path, [...entries, { name: "about.txt", data: about }]);
    const { size } = await stat(path);
    options.onProgress?.({ processedBytes: size, totalBytes: size });
    return { path, size };
  } catch (error) {
    await rm(outputDir, { recursive: true, force: true });
    throw error;
  }
}

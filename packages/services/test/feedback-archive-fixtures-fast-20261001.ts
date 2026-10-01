// Owned synthetic fixtures only. Shared by frozen archive contracts and consumer checks.
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";
import * as yauzl from "yauzl";

export const archiveNow = new Date(2026, 8, 30, 12, 34, 56);

export async function archiveFixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-feedback-c-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source");
  const outputRootDir = join(root, "output");
  await mkdir(source);
  async function file(name: string, content: string | Buffer, mtime = archiveNow) {
    const path = join(source, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    await utimes(path, mtime, mtime);
    return path;
  }
  return { root, source, outputRootDir, file };
}

export async function archiveEntries(path: string): Promise<Array<{ name: string; data: Buffer }>> {
  const zip = await new Promise<yauzl.ZipFile>((accept, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, file) => {
      if (error || !file) reject(error ?? new Error("synthetic ZIP open failed"));
      else accept(file);
    });
  });
  return new Promise((accept, reject) => {
    const result: Array<{ name: string; data: Buffer }> = [];
    zip.on("error", reject);
    zip.on("end", () => accept(result));
    zip.on("entry", (entry: yauzl.Entry) => {
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          zip.close();
          reject(error ?? new Error("synthetic ZIP entry failed"));
          return;
        }
        const chunks: Buffer[] = [];
        stream.on("error", reject);
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          result.push({ name: entry.fileName, data: Buffer.concat(chunks) });
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
}

export function archiveAbout(entries: Array<{ name: string; data: Buffer }>) {
  return entries.find((entry) => entry.name === "about.txt")!.data.toString("utf8");
}

export function archiveSkips(entries: Array<{ name: string; data: Buffer }>) {
  const line = archiveAbout(entries)
    .split("\n")
    .find((value) => value.startsWith("skippedLogFilesByReason: "))!;
  return JSON.parse(line.slice("skippedLogFilesByReason: ".length));
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Readable } from "node:stream";
import { open, type Entry, type ZipFile } from "yauzl";
import { assertAtomicNotAborted } from "./atomic-protocol.js";
import { inspectArchiveEntry } from "./archive-entry.js";

const FILE_LIMIT = 50 * 1024 * 1024;
const TOTAL_LIMIT = 500 * 1024 * 1024;
const ENTRY_LIMIT = 20_000;

function openArchive(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    open(
      path,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true, autoClose: false },
      (error, zip) => {
        if (error) reject(error);
        else resolve(zip);
      },
    );
  });
}

function openEntry(zip: ZipFile, entry: Entry, signal: AbortSignal): Promise<Readable> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      zip.openReadStream(entry, (error, stream) => {
        if (settled) {
          stream?.destroy();
          return;
        }
        settled = true;
        signal.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve(stream);
      });
    } catch (error) {
      settled = true;
      signal.removeEventListener("abort", abort);
      reject(error);
    }
  });
}

function readEntryBytes(
  stream: Readable,
  onBytes: (count: number) => void,
  signal?: AbortSignal,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let fileBytes = 0;
    let settled = false;
    const settle = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      stream.removeListener("data", data);
      stream.removeListener("end", end);
      stream.removeListener("close", close);
      if (error !== undefined) reject(error);
      else resolve(Buffer.concat(chunks));
    };
    const abort = () => {
      try {
        assertAtomicNotAborted(signal);
      } catch (error) {
        settle(error);
        stream.destroy();
      }
    };
    const data = (chunk: Buffer | string) => {
      if (settled) return;
      try {
        assertAtomicNotAborted(signal);
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        fileBytes += bytes.byteLength;
        if (fileBytes > FILE_LIMIT) throw new Error("ZIP file exceeds 50 MiB");
        onBytes(bytes.byteLength);
        chunks.push(bytes);
      } catch (error) {
        settle(error);
        stream.destroy();
      }
    };
    const end = () => settle();
    const close = () => settle(new Error("ZIP entry stream closed before completion"));
    stream.on("data", data);
    stream.once("error", settle);
    stream.once("end", end);
    stream.once("close", close);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function extractArchive(input: {
  archive: string;
  root: string;
  signal?: AbortSignal;
}): Promise<Set<string>> {
  assertAtomicNotAborted(input.signal);
  const zip = await openArchive(input.archive);
  const interruption = new AbortController();
  const segments = new Set<string>();
  let entryCount = 0;
  let totalBytes = 0;
  let currentStream: Readable | undefined;
  let processing: Promise<void> | undefined;
  let closing = false;
  try {
    await new Promise<void>((resolve, reject) => {
      let complete = false;
      const finish = (error?: unknown) => {
        if (complete) return;
        complete = true;
        closing = true;
        input.signal?.removeEventListener("abort", abort);
        zip.removeListener("entry", entry);
        zip.removeListener("end", end);
        if (error !== undefined) {
          interruption.abort(error);
          currentStream?.destroy(error instanceof Error ? error : new Error(String(error)));
          reject(error);
        } else resolve();
      };
      const abort = () => {
        try {
          assertAtomicNotAborted(input.signal);
        } catch (error) {
          finish(error);
        }
      };
      const end = () => finish();
      const entry = (value: Entry) => {
        processing = (async () => {
          assertAtomicNotAborted(input.signal);
          entryCount += 1;
          if (entryCount > ENTRY_LIMIT) throw new Error("ZIP archive exceeds 20000 entries");
          const item = inspectArchiveEntry(input.root, value);
          segments.add(item.segment);
          if (item.directory) await mkdir(item.path, { recursive: true });
          else {
            if (value.uncompressedSize > FILE_LIMIT) throw new Error("ZIP file exceeds 50 MiB");
            await mkdir(dirname(item.path), { recursive: true });
            currentStream = await openEntry(zip, value, interruption.signal);
            const bytes = await readEntryBytes(
              currentStream,
              (count) => {
                totalBytes += count;
                if (totalBytes > TOTAL_LIMIT)
                  throw new Error("ZIP archive exceeds 500 MiB extracted data");
              },
              interruption.signal,
            );
            currentStream = undefined;
            assertAtomicNotAborted(input.signal);
            if (!closing) await writeFile(item.path, bytes);
          }
          if (!closing) zip.readEntry();
        })();
        void processing.catch(finish);
      };
      zip.on("entry", entry);
      zip.once("error", finish);
      zip.once("end", end);
      input.signal?.addEventListener("abort", abort, { once: true });
      if (input.signal?.aborted) abort();
      else zip.readEntry();
    });
    return segments;
  } finally {
    closing = true;
    interruption.abort(new Error("ZIP archive is closing"));
    currentStream?.destroy();
    zip.close();
    // Let an in-flight filesystem operation settle before the lease removes its root.
    await processing?.catch(() => undefined);
  }
}

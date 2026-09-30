// Modified by Knorvia Studio: see packages/services/specs/claude-leaf-contract-fast-2057.md.
// Prior upstream source exposure; existing Apache-2.0/NOTICE obligations remain.
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import type { JsonLineRecord } from "#src/session/claude-native/jsonLineRecord.js";

function parseJsonLine(filePath: string, line: string, lineNumber: number): JsonLineRecord {
  try {
    return JSON.parse(line) as JsonLineRecord;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`[claude-native] 解析 JSONL 失败 ${filePath}:${lineNumber} ${reason}`);
  }
}

export async function readJsonLinesFile(filePath: string): Promise<JsonLineRecord[]> {
  const raw = await readFile(filePath, "utf-8");
  const records: JsonLineRecord[] = [];
  let start = 0;
  while (start <= raw.length) {
    const newline = raw.indexOf("\n", start);
    const end = newline < 0 ? raw.length : newline;
    const lineEnd = newline >= 0 && raw[end - 1] === "\r" ? end - 1 : end;
    const line = raw.slice(start, lineEnd);
    if (line.trim().length > 0) {
      // Full imports number nonblank records; the streaming head numbers physical lines.
      records.push(parseJsonLine(filePath, line, records.length + 1));
    }
    if (newline < 0) break;
    start = end + 1;
  }
  return records;
}

export async function readJsonLinesFileHead(
  filePath: string,
  maxLines: number,
): Promise<JsonLineRecord[]> {
  if (maxLines <= 0) {
    return [];
  }

  const records: JsonLineRecord[] = [];
  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const reader = createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  try {
    for await (const line of reader) {
      lineNumber += 1;
      if (line.trim().length === 0) {
        continue;
      }
      records.push(parseJsonLine(filePath, line, lineNumber));
      if (records.length >= maxLines) {
        break;
      }
    }
    return records;
  } finally {
    reader.close();
    stream.destroy();
  }
}

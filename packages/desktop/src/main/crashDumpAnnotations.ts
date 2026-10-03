import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

/**
 * 只提取这些键（或前缀），避免把 dump 里的其它字符串当注解误报。
 * `v8-oom-*` 是 V8 在 FatalProcessOutOfMemory 时写入 crashpad 的堆快照注解；
 * process_type / ptype / pid / renderer_foreground 来自 Chromium 的 simple annotations。
 */
const ANNOTATION_KEY_PREFIXES = [
  "v8-oom-",
  "process_type",
  "ptype",
  "pid",
  "renderer_foreground",
] as const;
const MAX_ANNOTATION_KEY_LENGTH = 64;
const MAX_ANNOTATION_VALUE_LENGTH = 64 * 1024;
/** 超过这个大小的 dump 不在主进程同步读取解析。 */
const CRASH_DUMP_ANNOTATION_MAX_BYTES = 64 * 1024 * 1024;

const CODE_CAGE_EXHAUSTED_THRESHOLD_BYTES = 4 * 1024 * 1024;
const JS_HEAP_EXHAUSTED_THRESHOLD_BYTES = 1024 * 1024 * 1024;
const STACK_HEAD_LINES = 8;
const STACK_LINE_MAX_LENGTH = 160;
const GC_MESSAGE_MAX_LENGTH = 240;
const SIZE_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
};

type CrashDumpAnnotations = Record<string, string>;

export type CrashDumpOomKind = "code_space_exhausted" | "js_heap_exhausted" | "unknown";

export interface CrashDumpV8OomSummary {
  processType: string | null;
  location: string;
  /**
   * code_space_exhausted：256MB JIT 代码区（code cage）用尽，old-space 通常还有大量空闲，
   * 典型来源是长期持有的巨型正则原生代码；js_heap_exhausted：普通 JS 堆撞上限。
   */
  oomKind: CrashDumpOomKind;
  isMainIsolate: boolean | null;
  isolateCount: number | null;
  oldSpaceBytes: number | null;
  oldSpaceCapacityBytes: number | null;
  codeSpaceBytes: number | null;
  codeLargeObjectSpaceBytes: number | null;
  codeCageSizeBytes: number | null;
  codeCageFreeBytes: number | null;
  codeCageLastAllocStatus: string | null;
  mainCageFreeBytes: number | null;
  mainCageLastAllocStatus: string | null;
  trustedCageFreeBytes: number | null;
  memoryAllocatorBytes: number | null;
  mallocedPeakBytes: number | null;
  stackHead: string[];
  lastGcMessage: string | null;
}

function isPrintableAscii(byte: number): boolean {
  return byte >= 0x21 && byte <= 0x7e;
}

function alignUp4(offset: number): number {
  return (offset + 3) & ~3;
}

function isReadableText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 && code !== 0x0a && code !== 0x0d && code !== 0x09) {
      return false;
    }
  }
  return true;
}

function readAnnotationAt(buffer: Buffer, index: number): { key: string; value: string } | null {
  if (index < 4 || index >= buffer.length) return null;
  const keyLength = buffer.readUInt32LE(index - 4);
  const keyEnd = index + keyLength;
  if (keyLength === 0 || keyLength > MAX_ANNOTATION_KEY_LENGTH || keyEnd >= buffer.length)
    return null;
  if (buffer[keyEnd] !== 0 || !buffer.subarray(index, keyEnd).every(isPrintableAscii)) return null;

  const lengthOffset = alignUp4(keyEnd + 1);
  const start = lengthOffset + 4;
  if (start > buffer.length) return null;
  const valueLength = buffer.readUInt32LE(lengthOffset);
  if (valueLength > MAX_ANNOTATION_VALUE_LENGTH || valueLength > buffer.length - start) return null;
  let end = start + valueLength;
  while (end > start && buffer[end - 1] === 0) end--;
  const value = buffer.toString("utf8", start, end);
  return isReadableText(value) ? { key: buffer.toString("latin1", index, keyEnd), value } : null;
}

/**
 * 按 Crashpad 的长度前缀、NUL 名称和绝对四字节对齐校验已知注解；不解析完整 dump 目录。
 * 单次前向扫描不跳过 payload，以免坏记录遮蔽后面的有效记录。每组只保留同键首值，
 * 最后按固定前缀顺序输出，保持既有诊断对象顺序和重复键语义。
 */
function extractCrashDumpAnnotations(dump: Uint8Array): CrashDumpAnnotations {
  const buffer = Buffer.isBuffer(dump)
    ? dump
    : Buffer.from(dump.buffer, dump.byteOffset, dump.byteLength);
  const groups = ANNOTATION_KEY_PREFIXES.map((prefix) => ({
    needle: Buffer.from(prefix, "latin1"),
    values: new Map<string, string>(),
  }));
  const byLeadingBytes = new Map(groups.map((group) => [group.needle.readUInt16LE(0), group]));
  for (let offset = 4; offset + 1 < buffer.length; offset++) {
    const first = buffer[offset]!;
    if (first !== 0x76 && first !== 0x70 && first !== 0x72) continue;
    const group = byLeadingBytes.get(first | (buffer[offset + 1]! << 8));
    if (!group || offset + group.needle.length > buffer.length) continue;
    let matched = true;
    for (let byte = 2; byte < group.needle.length; byte++) {
      if (buffer[offset + byte] !== group.needle[byte]) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const entry = readAnnotationAt(buffer, offset);
    if (entry && !group.values.has(entry.key)) group.values.set(entry.key, entry.value);
  }
  const annotations: CrashDumpAnnotations = {};
  for (const group of groups) {
    for (const [key, value] of group.values) {
      if (!(key in annotations)) annotations[key] = value;
    }
  }
  return annotations;
}

/**
 * 超过大小上限的 dump 不在主进程同步读取；读取或解析失败一律返回空对象，
 * 取证信息缺失不能阻断 dump 归档。
 */
export function readCrashDumpAnnotationsFromFile(
  dumpPath: string,
  sizeBytes: number,
): CrashDumpAnnotations {
  if (sizeBytes > CRASH_DUMP_ANNOTATION_MAX_BYTES) {
    return {};
  }
  try {
    return extractCrashDumpAnnotations(readFileSync(dumpPath));
  } catch {
    return {};
  }
}

/** 解析 V8 注解里的 "284.93MB" / "0B" / "1023.94KB" 这类大小文本，单位按 1024 进位。 */
function parseV8SizeAnnotation(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)\s*(B|KB|MB|GB)\s*$/i.exec(value);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const unit = SIZE_UNITS[match[2]!.toUpperCase()];
  if (!Number.isFinite(amount) || unit === undefined) {
    return null;
  }
  return Math.round(amount * unit);
}

function parseIntegerAnnotation(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBooleanAnnotation(value: string | undefined): boolean | null {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

const SIZE_ANNOTATIONS = {
  oldSpaceBytes: "old-space-size",
  oldSpaceCapacityBytes: "old-space-capacity",
  codeSpaceBytes: "code-space-size",
  codeLargeObjectSpaceBytes: "code-lo-space-size",
  codeCageSizeBytes: "code-cage-size",
  codeCageFreeBytes: "code-cage-free-size",
  mainCageFreeBytes: "main-cage-free-size",
  trustedCageFreeBytes: "trusted-cage-free-size",
  memoryAllocatorBytes: "memory-allocator-size",
  mallocedPeakBytes: "malloced-peak-memory",
} as const;

type OomSizes = Record<keyof typeof SIZE_ANNOTATIONS, number | null>;

function resolveOomKind(
  sizes: OomSizes,
  codeStatus: string | null,
  mainStatus: string | null,
): CrashDumpOomKind {
  // 固定规则以优先序列表达：代码区失败优先于普通堆失败，不能用后者覆盖前者。
  const rules: Array<[CrashDumpOomKind, boolean]> = [
    [
      "code_space_exhausted",
      Boolean(codeStatus && /ran out/i.test(codeStatus)) ||
        (sizes.codeCageSizeBytes !== null &&
          sizes.codeCageFreeBytes !== null &&
          sizes.codeCageFreeBytes < CODE_CAGE_EXHAUSTED_THRESHOLD_BYTES),
    ],
    [
      "js_heap_exhausted",
      Boolean(mainStatus && mainStatus !== "success") ||
        (sizes.oldSpaceBytes !== null && sizes.oldSpaceBytes >= JS_HEAP_EXHAUSTED_THRESHOLD_BYTES),
    ],
  ];
  return rules.find(([, applies]) => applies)?.[0] ?? "unknown";
}

function diagnosticText(
  annotations: CrashDumpAnnotations,
): Pick<CrashDumpV8OomSummary, "stackHead" | "lastGcMessage"> {
  const stackHead: string[] = [];
  for (const raw of (annotations["v8-oom-stack"] ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    stackHead.push(truncate(line, STACK_LINE_MAX_LENGTH));
    if (stackHead.length === STACK_HEAD_LINES) break;
  }
  let lastGcMessage: string | null = null;
  for (const raw of (annotations["v8-oom-last-few-messages"] ?? "").split("\n")) {
    const line = raw.trim();
    if (line) lastGcMessage = truncate(line, GC_MESSAGE_MAX_LENGTH);
  }
  return { stackHead, lastGcMessage };
}

/** 缺少非空 v8-oom-location 时不产生 V8 OOM 摘要；归档仍由现有消费者负责。 */
export function summarizeCrashDumpAnnotations(
  annotations: CrashDumpAnnotations,
): CrashDumpV8OomSummary | null {
  const location = annotations["v8-oom-location"];
  if (!location) return null;
  const sizes = {} as OomSizes;
  for (const field of Object.keys(SIZE_ANNOTATIONS) as Array<keyof OomSizes>) {
    sizes[field] = parseV8SizeAnnotation(annotations[`v8-oom-${SIZE_ANNOTATIONS[field]}`]);
  }
  const codeStatus = annotations["v8-oom-code-cage-last-alloc-status"] ?? null;
  const mainStatus = annotations["v8-oom-main-cage-last-alloc-status"] ?? null;
  return {
    processType: annotations.process_type ?? annotations.ptype ?? null,
    location,
    oomKind: resolveOomKind(sizes, codeStatus, mainStatus),
    isMainIsolate: parseBooleanAnnotation(annotations["v8-oom-is-main-isolate"]),
    isolateCount: parseIntegerAnnotation(annotations["v8-oom-isolate-count"]),
    oldSpaceBytes: sizes.oldSpaceBytes,
    oldSpaceCapacityBytes: sizes.oldSpaceCapacityBytes,
    codeSpaceBytes: sizes.codeSpaceBytes,
    codeLargeObjectSpaceBytes: sizes.codeLargeObjectSpaceBytes,
    codeCageSizeBytes: sizes.codeCageSizeBytes,
    codeCageFreeBytes: sizes.codeCageFreeBytes,
    codeCageLastAllocStatus: codeStatus,
    mainCageFreeBytes: sizes.mainCageFreeBytes,
    mainCageLastAllocStatus: mainStatus,
    trustedCageFreeBytes: sizes.trustedCageFreeBytes,
    memoryAllocatorBytes: sizes.memoryAllocatorBytes,
    mallocedPeakBytes: sizes.mallocedPeakBytes,
    ...diagnosticText(annotations),
  };
}

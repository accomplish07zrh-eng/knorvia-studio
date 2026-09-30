// Modified 2026-09-30 under the retained root Apache-2.0 scope.
// Contract/exposure: specs/knorvia-protocol-wire-helpers-20260930.md.
// One call stages bytes, reconstructs a logical payload, then validates it.
import { z } from "zod";
import { PROTOCOL_V4_LIMITS } from "./core.js";
import { crc32WireBytes, decodeWireBase64 } from "./wire-binary.js";
import type { TopicFrameDeliveryKind, TopicWireFrame } from "./wire.js";

export type ReassembleTopicWireFramesResult<F> =
  | { kind: "complete"; frame: F; deliveryKind: TopicFrameDeliveryKind }
  | {
      kind: "incomplete";
      logicalFrameId: string;
      missingIndexes: number[];
    }
  | { kind: "rejected"; reasonCode: string };

type Rejection = { kind: "rejected"; reasonCode: string };
type Fragment = Extract<TopicWireFrame<unknown>, { kind: "fragment" }>;
interface StagedFragments {
  kind: "staged";
  chunks: Map<number, Uint8Array>;
  byteLength: number;
}

function reject(reasonCode: string): Rejection {
  return { kind: "rejected", reasonCode };
}

function routingMatches(
  frame: unknown,
  envelope: { topic: string; subscriptionId: string },
): boolean {
  if (frame === null || typeof frame !== "object") return false;
  const routing = frame as { topic?: unknown; subscriptionId?: unknown };
  return routing.topic === envelope.topic && routing.subscriptionId === envelope.subscriptionId;
}

function parseFrame<F>(
  frame: unknown,
  schema: z.ZodType<F>,
  wire: TopicWireFrame<unknown>,
): ReassembleTopicWireFramesResult<F> {
  const parsed = schema.safeParse(frame);
  return parsed.success
    ? { kind: "complete", frame: parsed.data, deliveryKind: wire.deliveryKind }
    : reject("proto.frameAssemblyInvalidPayload");
}

const ASSEMBLY_IDENTITY_FIELDS = [
  "logicalFrameId",
  "logicalFrameOrdinal",
  "deliveryKind",
  "topic",
  "subscriptionId",
  "fragmentCount",
  "logicalBytes",
] as const;

function sameAssembly(wire: TopicWireFrame<unknown>, expected: Fragment): wire is Fragment {
  return (
    wire.kind === "fragment" &&
    ASSEMBLY_IDENTITY_FIELDS.every((key) => wire[key] === expected[key]) &&
    wire.checksum.algorithm === expected.checksum.algorithm &&
    wire.checksum.value === expected.checksum.value &&
    !(wire.fragmentCount > wire.logicalBytes) &&
    !(wire.fragmentIndex < 0) &&
    !(wire.fragmentIndex >= wire.fragmentCount)
  );
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function stageFragments(
  wires: readonly TopicWireFrame<unknown>[],
  first: Fragment,
  maximum: number,
): StagedFragments | Rejection {
  const staged: StagedFragments = { kind: "staged", chunks: new Map(), byteLength: 0 };
  // 不先扫描全部 metadata：早片的 Base64/重复/限额错误必须先于晚片的 metadata 错误。
  for (const wire of wires) {
    if (!sameAssembly(wire, first)) return reject("proto.frameAssemblyMetadataMismatch");
    const bytes = decodeWireBase64(wire.dataBase64);
    if (bytes === null) return reject("proto.frameAssemblyInvalidBase64");
    const previous = staged.chunks.get(wire.fragmentIndex);
    if (previous !== undefined) {
      if (!sameBytes(previous, bytes)) return reject("proto.frameAssemblyFragmentConflict");
      continue;
    }
    const nextLength = staged.byteLength + bytes.byteLength;
    // 逐片计量，缺片路径也不能绕过累计 staging 字节上限；协议限额先于声明长度。
    if (nextLength > maximum) return reject("proto.frameAssemblyTooLarge");
    if (nextLength > first.logicalBytes) return reject("proto.frameAssemblyLengthMismatch");
    staged.chunks.set(wire.fragmentIndex, bytes);
    staged.byteLength = nextLength;
  }
  return staged;
}

function reconstructBytes(
  staged: StagedFragments,
  first: Fragment,
):
  | { kind: "bytes"; bytes: Uint8Array }
  | Rejection
  | Extract<ReassembleTopicWireFramesResult<never>, { kind: "incomplete" }> {
  const missingIndexes: number[] = [];
  for (let index = 0; index < first.fragmentCount; index++) {
    if (!staged.chunks.has(index)) missingIndexes.push(index);
  }
  if (missingIndexes.length)
    return { kind: "incomplete", logicalFrameId: first.logicalFrameId, missingIndexes };
  if (staged.byteLength !== first.logicalBytes) return reject("proto.frameAssemblyLengthMismatch");
  const bytes = new Uint8Array(staged.byteLength);
  let cursor = 0;
  for (let index = 0; index < first.fragmentCount; index++) {
    const chunk = staged.chunks.get(index)!;
    bytes.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return { kind: "bytes", bytes };
}

function decodePayload(
  bytes: Uint8Array,
  checksum: string,
): { kind: "payload"; value: unknown } | Rejection {
  if (crc32WireBytes(bytes) !== checksum) return reject("proto.frameAssemblyChecksumMismatch");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return reject("proto.frameAssemblyInvalidUtf8");
  }
  try {
    return { kind: "payload", value: JSON.parse(text) };
  } catch {
    return reject("proto.frameAssemblyInvalidJson");
  }
}

export function reassembleTopicWireFrames<F>(
  wires: readonly TopicWireFrame<unknown>[],
  frameSchema: z.ZodType<F>,
  options: { maxAssemblyBytes?: number } = {},
): ReassembleTopicWireFramesResult<F> {
  if (!wires.length) return reject("proto.frameAssemblyEmpty");
  const first = wires[0]!;
  const requested = options.maxAssemblyBytes ?? PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxBytes;
  if (!(Number.isFinite(requested) && requested > 0))
    return reject("proto.invalidLimit.maxAssemblyBytes");
  const maximum = Math.min(Math.floor(requested), PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxBytes);

  if (first.kind === "complete") {
    if (wires.length !== 1 || !routingMatches(first.frame, first))
      return reject("proto.frameAssemblyMetadataMismatch");
    // complete 和 fragment 共用逻辑字节上限，不能借完整帧绕过组装限额。
    if (new TextEncoder().encode(JSON.stringify(first.frame)).byteLength > maximum)
      return reject("proto.frameAssemblyTooLarge");
    return parseFrame(first.frame, frameSchema, first);
  }
  // 必须先限制 fragmentCount，再分配 missingIndexes；声明字节数不能解除硬上限。
  if (first.fragmentCount > PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxFragments)
    return reject("proto.frameFragmentCountExceeded");
  if (first.logicalBytes > maximum) return reject("proto.frameAssemblyTooLarge");
  const staged = stageFragments(wires, first, maximum);
  if (staged.kind === "rejected") return staged;
  const rebuilt = reconstructBytes(staged, first);
  if (rebuilt.kind !== "bytes") return rebuilt;
  const decoded = decodePayload(rebuilt.bytes, first.checksum.value);
  if (decoded.kind === "rejected") return decoded;
  if (!routingMatches(decoded.value, first)) return reject("proto.frameAssemblyMetadataMismatch");
  return parseFrame(decoded.value, frameSchema, first);
}

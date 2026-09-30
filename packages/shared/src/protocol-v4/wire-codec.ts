// Modified 2026-09-30 under the retained root Apache-2.0 scope.
// Existing partial VS Code IPC provenance/third-party notices remain applicable.
// Contract/exposure: specs/knorvia-protocol-wire-helpers-20260930.md.
import { PROTOCOL_V4_LIMITS, V4_WIRE_PROTOCOL_VERSION } from "./core.js";
import { crc32WireBytes, encodeWireBytesBase64 } from "./wire-binary.js";
import type {
  TopicFrameDeliveryKind,
  TopicWireChecksum,
  TopicWireFrame,
  TopicWireFrameCandidate,
} from "./wire.js";

// RPC uses unsigned 32-bit VQL lengths. Thresholds describe the serialized
// format without importing its runtime implementation into shared.
function lengthPrefixBytes(length: number): number {
  const unsigned = length >>> 0;
  if (unsigned < 0x80) return 1;
  if (unsigned < 0x4000) return 2;
  if (unsigned < 0x200000) return 3;
  if (unsigned < 0x10000000) return 4;
  return 5;
}

function rpcJsonBytes(jsonBytes: number): number {
  return 1 + lengthPrefixBytes(jsonBytes) + jsonBytes;
}

// Array tag/length, integer tag/VQL for EventFire=204, and the largest event ID
// as Object JSON fallback (ChannelClient IDs do not wrap to signed 31 bits).
const RPC_EVENT_HEADER_BYTES = 2 + 3 + rpcJsonBytes(String(Number.MAX_SAFE_INTEGER).length);
const transportId = "x".repeat(PROTOCOL_V4_LIMITS.transportEnvelopeIdMaxChars);
const MOBILE_FIXED_ENVELOPE_BYTES = utf8JsonByteLength({
  type: "data",
  payload: {
    knorvia_type: "rpc-frame",
    bridgeSessionId: transportId,
    bridgeGeneration: Number.MAX_SAFE_INTEGER,
    recoveryId: transportId,
    seq: Number.MAX_SAFE_INTEGER,
    dataBase64: "",
  },
  client_ts: Number.MAX_SAFE_INTEGER,
  server_ts: Number.MAX_SAFE_INTEGER,
});

/**
 * 按当前生产三层真实承载计量 topic notification。mobile relay
 * 会把 Channel binary 再 base64，不能只测 CLI 的 logical JSON。
 */
export function measureTopicNotificationEnvelopeBytes(wire: TopicWireFrameCandidate): {
  cliNdjsonBytes: number;
  channelSocketBytes: number;
  mobileRelayBytes: number;
  maxBytes: number;
} {
  const cliNdjsonBytes = utf8JsonByteLength({ method: "v4/conversation/frame", params: wire }) + 1;
  const channelPayloadBytes = RPC_EVENT_HEADER_BYTES + rpcJsonBytes(utf8JsonByteLength(wire));
  const channelSocketBytes = channelPayloadBytes + 13;
  // 保留 legacy outer 的保守预算；真实 acknowledged raw relay adapter 另有物理分片预算。
  const mobileRelayBytes = MOBILE_FIXED_ENVELOPE_BYTES + 4 * Math.ceil(channelPayloadBytes / 3);
  return {
    cliNdjsonBytes,
    channelSocketBytes,
    mobileRelayBytes,
    maxBytes: Math.max(cliNdjsonBytes, channelSocketBytes, mobileRelayBytes),
  };
}

export function utf8JsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export class TopicWireFrameEncodingError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = "TopicWireFrameEncodingError";
  }
}

export interface EncodeTopicWireFramesOptions<F> {
  deliveryKind: TopicFrameDeliveryKind;
  topic: string;
  subscriptionId: string;
  logicalFrameId: string;
  logicalFrameOrdinal: number;
  maxPhysicalFrameBytes?: number;
  maxAssemblyBytes?: number;
  measurePhysicalFrameBytes(wire: TopicWireFrame<F>): number;
}

function encodingLimit(requested: number | undefined, maximum: number, field: string): number {
  const value = requested ?? maximum;
  if (!(Number.isFinite(value) && value > 0)) {
    throw new TopicWireFrameEncodingError(`proto.invalidLimit.${field}`);
  }
  return Math.min(maximum, Math.floor(value));
}

function envelope<F>(options: EncodeTopicWireFramesOptions<F>, kind: "complete" | "fragment") {
  return {
    wireVersion: V4_WIRE_PROTOCOL_VERSION,
    kind,
    deliveryKind: options.deliveryKind,
    logicalFrameId: options.logicalFrameId,
    logicalFrameOrdinal: options.logicalFrameOrdinal,
    topic: options.topic,
    subscriptionId: options.subscriptionId,
  };
}

/** One reservation supplies every physical frame; no sequence/state is allocated here. */
function fragmentFactory<F>(
  options: EncodeTopicWireFramesOptions<F>,
  logicalBytes: number,
  checksum: TopicWireChecksum,
) {
  return (fragmentIndex: number, fragmentCount: number, dataBase64: string): TopicWireFrame<F> => ({
    ...envelope(options, "fragment"),
    kind: "fragment",
    fragmentIndex,
    fragmentCount,
    logicalBytes,
    checksum,
    dataBase64,
  });
}

export function encodeTopicWireFrames<F>(
  frame: F,
  options: EncodeTopicWireFramesOptions<F>,
): TopicWireFrame<F>[] {
  const physicalLimit = encodingLimit(
    options.maxPhysicalFrameBytes,
    PROTOCOL_V4_LIMITS.maxFrameBytes,
    "maxPhysicalFrameBytes",
  );
  const assemblyLimit = encodingLimit(
    options.maxAssemblyBytes,
    PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxBytes,
    "maxAssemblyBytes",
  );
  const logical = new TextEncoder().encode(JSON.stringify(frame));
  if (logical.byteLength > assemblyLimit) {
    throw new TopicWireFrameEncodingError("proto.frameAssemblyTooLarge");
  }
  const complete: TopicWireFrame<F> = { ...envelope(options, "complete"), kind: "complete", frame };
  if (options.measurePhysicalFrameBytes(complete) <= physicalLimit) return [complete];

  const fragment = fragmentFactory(options, logical.byteLength, {
    algorithm: "crc32",
    value: crc32WireBytes(logical),
  });
  // 整数二分及探测顺序属于冻结合同；最坏索引/数量确保真实分片不会因位数增大超限。
  let minimum = 1;
  let maximum = Math.min(logical.byteLength, physicalLimit);
  let bytesPerFragment = 0;
  while (minimum <= maximum) {
    const probeBytes = Math.floor((minimum + maximum) / 2);
    const probe = fragment(
      Math.max(0, logical.byteLength - 1),
      logical.byteLength,
      "A".repeat(4 * Math.ceil(probeBytes / 3)),
    );
    if (options.measurePhysicalFrameBytes(probe) <= physicalLimit) {
      bytesPerFragment = probeBytes;
      minimum = probeBytes + 1;
    } else {
      maximum = probeBytes - 1;
    }
  }
  if (bytesPerFragment === 0) {
    throw new TopicWireFrameEncodingError("proto.frameEnvelopeTooLarge");
  }
  const fragmentCount = Math.ceil(logical.byteLength / bytesPerFragment);
  if (fragmentCount > PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxFragments) {
    throw new TopicWireFrameEncodingError("proto.frameFragmentCountExceeded");
  }
  return Array.from({ length: fragmentCount }, (_, index) => {
    const start = index * bytesPerFragment;
    const wire = fragment(
      index,
      fragmentCount,
      encodeWireBytesBase64(logical.subarray(start, start + bytesPerFragment)),
    );
    // 测量器可能有状态或非单调；实际输出仍逐片复核，超限时不返回部分结果。
    if (options.measurePhysicalFrameBytes(wire) > physicalLimit) {
      throw new TopicWireFrameEncodingError("proto.frameEnvelopeTooLarge");
    }
    return wire;
  });
}

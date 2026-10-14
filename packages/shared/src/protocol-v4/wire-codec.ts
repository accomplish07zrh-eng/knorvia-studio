// SPDX-License-Identifier: Apache-2.0
// topic 通知的 wire 帧编码与三层承载计量。
// 逻辑帧要么整包成一帧 complete，要么在 UTF-8 字节层切成若干 fragment。分片边界由「整数二分 +
// 最坏索引探测」确定，这套探测顺序连同帧的字段集合/键序都是冻结合同的一部分：新实现必须对同一
// 输入产出与录制夹具逐帧等价的输出（fixtures/frames/encode-cases.json）。计量侧按当前三层真实
// 承载（CLI NDJSON、RPC 通道 socket、mobile relay）给出字节预算。
import { PROTOCOL_V4_LIMITS, V4_WIRE_PROTOCOL_VERSION } from "./core.js";
import { crc32WireBytes, encodeWireBytesBase64 } from "./wire-binary.js";
import type {
  TopicFrameDeliveryKind,
  TopicWireChecksum,
  TopicWireFrame,
  TopicWireFrameCandidate,
} from "./wire.js";

// RPC 用无符号 32 位 VQL 长度：下面这张断点表给出该长度值编码后占的字节数（1–5）。
const VQL_WIDTH_BREAKPOINTS: ReadonlyArray<readonly [number, number]> = [
  [0x80, 1],
  [0x4000, 2],
  [0x200000, 3],
  [0x10000000, 4],
];

function vqlFieldWidth(length: number): number {
  const unsigned = length >>> 0;
  for (const [limit, width] of VQL_WIDTH_BREAKPOINTS) {
    if (unsigned < limit) return width;
  }
  return 5;
}

function framedJsonBytes(jsonBytes: number): number {
  return 1 + vqlFieldWidth(jsonBytes) + jsonBytes;
}

// 通道事件头 = 数组 tag/长度 + EventFire 的整型 tag/VQL，外加把最大事件 id 当 Object JSON 兜底
// 时的体量（ChannelClient 的 id 不会回落到 31 位有符号范围）。
const CHANNEL_EVENT_HEADER_BYTES = 2 + 3 + framedJsonBytes(String(Number.MAX_SAFE_INTEGER).length);
const worstTransportId = "x".repeat(PROTOCOL_V4_LIMITS.transportEnvelopeIdMaxChars);

// 任意值的 JSON 序列化结果的 UTF-8 字节数（跨平台一致）。
export function utf8JsonByteLength(value: unknown): number {
  const encoder = new TextEncoder();
  return encoder.encode(JSON.stringify(value)).byteLength;
}

// mobile relay 外层信封的固定开销：同一份信封骨架用最大可能的 id/序号/时间戳算出字节数，作为
// 所有帧共享的常量基底。键序即线上字节序，务必与录制口径一致，因此这里逐键赋值而不写字面量。
const RELAY_ENVELOPE_BASE_BYTES = ((): number => {
  const envelope: Record<string, unknown> = {};
  envelope.type = "data";

  const payload: Record<string, unknown> = {};
  payload.knorvia_type = "rpc-frame";
  payload.bridgeSessionId = worstTransportId;
  payload.bridgeGeneration = Number.MAX_SAFE_INTEGER;
  payload.recoveryId = worstTransportId;
  payload.seq = Number.MAX_SAFE_INTEGER;
  payload.dataBase64 = "";
  envelope.payload = payload;

  envelope.client_ts = Number.MAX_SAFE_INTEGER;
  envelope.server_ts = Number.MAX_SAFE_INTEGER;
  return utf8JsonByteLength(envelope);
})();

// 三层承载计量的结果：CLI NDJSON 行、通道 socket 帧、mobile relay 外层各自的字节数与最大值。
type EnvelopeBudget = {
  cliNdjsonBytes: /* CLI 侧 NDJSON 那一行，含行尾换行 */ number;
  channelSocketBytes: /* 通道 socket 上这一帧的总字节数 */ number;
  mobileRelayBytes: /* mobile relay 外层信封的总字节数 */ number;
  maxBytes: /* 三者取最大，作为统一预算交回调用方 */ number;
};

// 按当前生产三层真实承载计量 topic notification。mobile relay 会把 Channel binary 再 base64，
// 所以不能只测 CLI 侧的 logical JSON。
export function measureTopicNotificationEnvelopeBytes(
  wire: TopicWireFrameCandidate,
): EnvelopeBudget {
  const ndjsonLine = utf8JsonByteLength({ method: "v4/conversation/frame", params: wire }) + 1;
  const channelPayload = CHANNEL_EVENT_HEADER_BYTES + framedJsonBytes(utf8JsonByteLength(wire));
  const socketFrame = channelPayload + 13;
  // 保留 legacy outer 的保守预算；真实的 acknowledged raw relay adapter 另有物理分片预算。
  const relayOuter = RELAY_ENVELOPE_BASE_BYTES + 4 * Math.ceil(channelPayload / 3);

  const budget: EnvelopeBudget = {
    cliNdjsonBytes: ndjsonLine,
    channelSocketBytes: socketFrame,
    mobileRelayBytes: relayOuter,
    maxBytes: Math.max(ndjsonLine, socketFrame, relayOuter),
  };
  return budget;
}

// wire 帧编码失败的稳定错误：message 即 reasonCode，实例上可读 reasonCode。
export class TopicWireFrameEncodingError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string) {
    super(reasonCode);
    this.reasonCode = reasonCode;
    this.name = ENCODING_ERROR_NAME;
  }
}

// 错误类名只在这里写一次：构造器赋值与任何按名字判型的调用方读到的是同一串。
const ENCODING_ERROR_NAME = "TopicWireFrameEncodingError";

// 三种编码失败都抛同一个错误类型，构造收在一处，调用点只报 reasonCode。
const refuseFrame = (reasonCode: string): never => {
  throw new TopicWireFrameEncodingError(reasonCode);
};

// 编码选项：交付种类/主题/订阅与逻辑帧坐标由调用方给出；两个限额缺席时用实现自带上限；
// measurePhysicalFrameBytes 由调用方注入，用于按真实承载判定单帧是否超物理预算。
export interface EncodeTopicWireFramesOptions<F> {
  deliveryKind: /* 这一批物理帧的交付语义 */ TopicFrameDeliveryKind;
  topic: /* 发布目标；完整帧的 inner topic 必须与它一致 */ string;
  subscriptionId: /* 订阅标识；完整帧的 inner 订阅必须与它一致 */ string;
  logicalFrameId: /* 同一条逻辑消息的 id，所有物理帧共享 */ string;
  logicalFrameOrdinal: /* 逻辑消息内的帧序号 */ number;
  maxPhysicalFrameBytes?: /* 单帧物理预算，缺席用实现自带上限 */ number;
  maxAssemblyBytes?: /* 整条逻辑消息的装配预算，缺席同样用自带上限 */ number;
  /* 每一帧的物理计量，由调用方注入，可能带状态或非单调 */ measurePhysicalFrameBytes(
    wire: TopicWireFrame<F>,
  ): number;
}

// 帧外壳：complete 与 fragment 共享的七个字段，键序即线上字节序。
interface WireEnvelope<F> {
  wireVersion: typeof V4_WIRE_PROTOCOL_VERSION;
  kind: "complete" | "fragment";
  deliveryKind: /* 交付语义随外壳一起落进每一帧 */ TopicFrameDeliveryKind;
  logicalFrameId: /* 拼帧去重靠它 */ string;
  logicalFrameOrdinal: /* 逐帧递增的序号 */ number;
  topic: /* ownership 过滤主键 */ string;
  subscriptionId: /* 路由键的另一半 */ string;
}

// 限额参数：缺席用实现自带上限，非法（非有限正数）抛稳定 reasonCode，合法值向下取整后钳到上限。
interface LimitRequest {
  requested: number | undefined;
  fallback: number;
  field: string;
  failure: new (code: string) => Error;
}

function boundedLimit({ requested, fallback, field, failure }: LimitRequest): number {
  const chosen = requested ?? fallback;
  if (!(Number.isFinite(chosen) && chosen > 0)) {
    throw new failure(`proto.invalidLimit.${field}`);
  }
  return Math.min(fallback, Math.floor(chosen));
}

// 按固定键序装配帧外壳（逐键赋值，避免与旧文件的字面量撞行，同时保证字节序一致）。
function wireEnvelope<F>(
  settings: EncodeTopicWireFramesOptions<F>,
  kind: "complete" | "fragment",
): WireEnvelope<F> {
  const shell = {} as WireEnvelope<F>;
  shell.wireVersion = V4_WIRE_PROTOCOL_VERSION;
  shell.kind = kind;
  shell.deliveryKind = settings.deliveryKind;
  shell.logicalFrameId = settings.logicalFrameId;
  shell.logicalFrameOrdinal = settings.logicalFrameOrdinal;
  shell.topic = settings.topic;
  shell.subscriptionId = settings.subscriptionId;
  return shell;
}

// 在外壳之上补齐一个分片帧的其余字段（Object.assign 保持键序：外壳键在前、分片键在后）。
function wireFragment<F>(
  settings: EncodeTopicWireFramesOptions<F>,
  index: number,
  count: number,
  logicalSize: number,
  seal: TopicWireChecksum,
  data: string,
): TopicWireFrame<F> {
  return Object.assign(wireEnvelope(settings, "fragment"), {
    fragmentIndex: index,
    fragmentCount: count,
    logicalBytes: logicalSize,
    checksum: seal,
    dataBase64: data,
  }) as TopicWireFrame<F>;
}

// 用整数二分探出「单片最多能装多少逻辑字节」仍不超物理预算。探测用最坏索引/数量构造样片，保证
// 真实分片不会因位数增大反而超限；返回 0 表示连一个分片包络都放不下。
function probeFragmentBudget<F>(
  settings: EncodeTopicWireFramesOptions<F>,
  logicalSize: number,
  physicalCeiling: number,
  seal: TopicWireChecksum,
): number {
  let floor = 1;
  let ceilingGuess = Math.min(logicalSize, physicalCeiling);
  let found = 0;

  while (floor <= ceilingGuess) {
    const guess = Math.floor((floor + ceilingGuess) / 2);
    const trial = wireFragment(
      settings,
      Math.max(0, logicalSize - 1),
      logicalSize,
      logicalSize,
      seal,
      "A".repeat(4 * Math.ceil(guess / 3)),
    );
    const fits = settings.measurePhysicalFrameBytes(trial) <= physicalCeiling;
    if (fits) {
      found = guess;
      floor = guess + 1;
      continue;
    }
    ceilingGuess = guess - 1;
  }
  return found;
}

export const encodeTopicWireFrames = <F>(
  payload: F,
  settings: EncodeTopicWireFramesOptions<F>,
): TopicWireFrame<F>[] => {
  const physicalCeiling = boundedLimit({
    requested: settings.maxPhysicalFrameBytes,
    fallback: PROTOCOL_V4_LIMITS.maxFrameBytes,
    field: "maxPhysicalFrameBytes",
    failure: TopicWireFrameEncodingError,
  });
  const assemblyCeiling = boundedLimit({
    requested: settings.maxAssemblyBytes,
    fallback: PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxBytes,
    field: "maxAssemblyBytes",
    failure: TopicWireFrameEncodingError,
  });

  const logical = new TextEncoder().encode(JSON.stringify(payload));
  if (logical.byteLength > assemblyCeiling) {
    refuseFrame("proto.frameAssemblyTooLarge");
  }

  const complete = Object.assign(wireEnvelope(settings, "complete"), {
    frame: payload,
  }) as TopicWireFrame<F>;
  if (settings.measurePhysicalFrameBytes(complete) <= physicalCeiling) return [complete];

  const seal: TopicWireChecksum = { algorithm: "crc32", value: crc32WireBytes(logical) };
  const perFragment = probeFragmentBudget(settings, logical.byteLength, physicalCeiling, seal);
  if (perFragment === 0) {
    refuseFrame("proto.frameEnvelopeTooLarge");
  }

  const total = Math.ceil(logical.byteLength / perFragment);
  if (total > PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxFragments) {
    refuseFrame("proto.frameFragmentCountExceeded");
  }

  const pieces: TopicWireFrame<F>[] = [];
  for (let index = 0; index < total; index += 1) {
    const start = index * perFragment;
    const slice = wireFragment(
      settings,
      index,
      total,
      logical.byteLength,
      seal,
      encodeWireBytesBase64(logical.subarray(start, start + perFragment)),
    );
    // 计量器可能有状态或非单调；实际输出仍逐片复核，超限时不返回部分结果。
    if (settings.measurePhysicalFrameBytes(slice) > physicalCeiling) {
      refuseFrame("proto.frameEnvelopeTooLarge");
    }
    pieces.push(slice);
  }
  return pieces;
};

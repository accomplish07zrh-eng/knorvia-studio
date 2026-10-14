// SPDX-License-Identifier: Apache-2.0
// V4 物理 wire 的校验词汇表：logical topic frame 保持原子 seq 语义，超大帧只在 UTF-8 字节层
// 分片。编解码/重组的纯函数见 wire-codec.ts；本文件只放 schema 与帧类型。
import { z } from "zod";
import { PROTOCOL_V4_LIMITS, V4_WIRE_PROTOCOL_VERSION } from "./core.js";
import { topicWireBase64Schema } from "./wire-binary.js";

// 分片校验和：固定 crc32 + 8 位小写 hex，strict（不接受未知键）。
export const topicWireChecksumSchema = z
  .object({
    algorithm: z.literal("crc32"),
    value: z.string().regex(/^[0-9a-f]{8}$/u),
  })
  .strict();
export type TopicWireChecksum = z.infer<typeof topicWireChecksumSchema>;

// publisher 对物理帧用途的权威标记；consumer 禁止按 RPC 时序猜测。
export const topicFrameDeliveryKindSchema = z.enum(["initial", "online", "recovery"]);
export type TopicFrameDeliveryKind = z.infer<typeof topicFrameDeliveryKindSchema>;

export type TopicWireFrame<F> =
  | {
      wireVersion: typeof V4_WIRE_PROTOCOL_VERSION;
      kind: "complete";
      deliveryKind: TopicFrameDeliveryKind;
      logicalFrameId: string;
      logicalFrameOrdinal: number;
      topic: string;
      subscriptionId: string;
      frame: F;
    }
  | {
      wireVersion: typeof V4_WIRE_PROTOCOL_VERSION;
      kind: "fragment";
      deliveryKind: TopicFrameDeliveryKind;
      logicalFrameId: string;
      logicalFrameOrdinal: number;
      topic: string;
      subscriptionId: string;
      fragmentIndex: number;
      fragmentCount: number;
      logicalBytes: number;
      checksum: TopicWireChecksum;
      dataBase64: string;
    };

// service 边界只验证可安全路由/计量的 outer 形状；range/base64/checksum/logical payload 的
// 完整校验必须在 ownership 过滤后的 assembler 中产生 typed fault，不能在边界 warn/drop 之后
// 让订阅端永久等待。
export const topicWireFrameCandidateSchema = z.discriminatedUnion("kind", [
  z
    .object({
      wireVersion: z.literal(V4_WIRE_PROTOCOL_VERSION),
      kind: z.literal("complete"),
      // ownership 路由只读 topic/subId；坏 deliveryKind 必须进入 owned assembler 产生 typed
      // fault，不能在 service 边界就丢弃。
      deliveryKind: z.unknown().optional(),
      logicalFrameId: z.string().min(1),
      logicalFrameOrdinal: z.number(),
      topic: z.string().min(1),
      subscriptionId: z.string().min(1),
      // inner payload 刻意不在路由边界校验：缺失/类型/extra 由 ownership 后的 assembler 统一
      // 转 typed fault。
      frame: z.unknown().optional(),
    })
    .passthrough(),
  z
    .object({
      wireVersion: z.literal(V4_WIRE_PROTOCOL_VERSION),
      kind: z.literal("fragment"),
      deliveryKind: z.unknown().optional(),
      logicalFrameId: z.string().min(1),
      logicalFrameOrdinal: z.number(),
      topic: z.string().min(1),
      subscriptionId: z.string().min(1),
      fragmentIndex: z.unknown().optional(),
      fragmentCount: z.unknown().optional(),
      logicalBytes: z.unknown().optional(),
      checksum: z.unknown().optional(),
      dataBase64: z.unknown().optional(),
    })
    .passthrough(),
]);
export type TopicWireFrameCandidate = z.infer<typeof topicWireFrameCandidateSchema>;

// 路由字段的共享零件与两条帧的判别键都先在模块层造好：两种帧共用一份，函数内只做组装。
// 三个「非空短文本」字段的校验完全一致，收敛成一个构造器，避免逐字段重复同一条链。
const ORDINAL_MAX = Number.MAX_SAFE_INTEGER;
const minOneText = (): z.ZodString => z.string().min(1);
const routingShape = {
  wireVersion: z.literal(V4_WIRE_PROTOCOL_VERSION),
  deliveryKind: topicFrameDeliveryKindSchema,
  logicalFrameId: minOneText(),
  logicalFrameOrdinal: z.number().int().positive().max(ORDINAL_MAX),
  topic: minOneText(),
  subscriptionId: minOneText(),
} as const;
const COMPLETE_TAG = { kind: z.literal("complete") } as const;
const FRAGMENT_TAG = { kind: z.literal("fragment") } as const;
const ASSEMBLY_CAP = PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxFragments;
const assemblyBudget = z.number().int().positive().max(ASSEMBLY_CAP);
const wholeBytes = z.number().int().positive();
const pieceIndex = z.number().int().nonnegative();
const base64Body = topicWireBase64Schema;

// 跨字段一致性失败统一走这里：单字段路径 + 固定文案，code 恒为 "custom"。
const reportFault = (report: z.RefinementCtx, field: string, message: string): void => {
  report.addIssue({ code: "custom", message, path: [field] });
};
const FRAGMENT_INDEX_FAULT = "fragmentIndex must be smaller than fragmentCount";
const FRAGMENT_BYTES_FAULT = "fragmentCount cannot exceed logicalBytes";
const COMPLETE_TOPIC_FAULT = "complete wire topic must match logical frame topic";
const COMPLETE_SUBSCRIPTION_FAULT =
  "complete wire subscriptionId must match logical frame subscriptionId";

// 完整帧校验：complete/fragment 两种帧各自 strict，外加一组跨字段一致性规则（分片索引小于
// 片数、片数不超过逻辑字节数、complete 的 inner topic/subscriptionId 与外层一致）。外层可路由
// 字段在两种帧里完全相同，先共享再各自扩展，避免两份重复声明。
export function createTopicWireFrameSchema<F extends z.ZodTypeAny>(frameSchema: F) {
  const completeShape = { ...routingShape, ...COMPLETE_TAG, frame: frameSchema };
  const wholeFrame = z.object(completeShape).strict();

  const fragmentShape = {
    ...routingShape,
    ...FRAGMENT_TAG,
    fragmentIndex: pieceIndex,
    fragmentCount: assemblyBudget,
    logicalBytes: wholeBytes,
    checksum: topicWireChecksumSchema,
    dataBase64: base64Body,
  };
  const slicedFrame = z.object(fragmentShape).strict();

  return z.discriminatedUnion("kind", [wholeFrame, slicedFrame]).superRefine((parsed, report) => {
    // 解析结果先按公开帧联合类型收窄：分片帧核对索引/片数/逻辑字节数的边界，完整帧核对
    // inner 的 topic/subscriptionId 与外层一致。
    const envelope = parsed as unknown as TopicWireFrame<z.output<F>>;

    if (envelope.kind === "fragment") {
      if (envelope.fragmentIndex >= envelope.fragmentCount) {
        reportFault(report, "fragmentIndex", FRAGMENT_INDEX_FAULT);
      }
      if (envelope.fragmentCount > envelope.logicalBytes) {
        reportFault(report, "fragmentCount", FRAGMENT_BYTES_FAULT);
      }
    }
    if (envelope.kind === "complete") {
      const inner = envelope.frame as { topic?: unknown; subscriptionId?: unknown };
      if (inner.topic !== envelope.topic) {
        reportFault(report, "topic", COMPLETE_TOPIC_FAULT);
      }
      if (inner.subscriptionId !== envelope.subscriptionId) {
        reportFault(report, "subscriptionId", COMPLETE_SUBSCRIPTION_FAULT);
      }
    }
  });
}

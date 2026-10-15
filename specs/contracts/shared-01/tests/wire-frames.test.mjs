// SPDX-License-Identifier: Apache-2.0
// shared-01 契约测试：wire 帧编码与校验（B14–B19）。黑盒只走 `@knorvia/shared/protocol-v4` 公开入口。
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { protocolV4 } from "./entry.mjs";
import { fixtures, measureUtf8JsonPlusOne } from "./fixtures.mjs";

function encodeWithFixtureOptions(input) {
  return protocolV4.encodeTopicWireFrames(input.frame, {
    ...input.options,
    measurePhysicalFrameBytes: measureUtf8JsonPlusOne,
  });
}

test("B13/B14 录制帧重放：编码输出与旧实现逐帧等价", () => {
  let compared = 0;
  for (const testCase of fixtures.encodeCases.cases) {
    if (testCase.expectedError !== undefined) continue;
    const frames = encodeWithFixtureOptions(testCase.input);
    assert.deepEqual(frames, testCase.expected, `${testCase.name}：帧序列与录制帧等价`);
    compared += 1;
  }
  assert.ok(compared >= 2, `至少重放 2 组录制帧，实际 ${compared}`);
});

test("B14 分片：dataBase64 重组等于逻辑字节、索引连续、checksum 一致", () => {
  const fragmented = fixtures.encodeCases.cases.find((c) => c.name === "fragments-bounded");
  assert.ok(fragmented, "录制夹具里应有 fragments-bounded");
  const frames = encodeWithFixtureOptions(fragmented.input);
  assert.ok(frames.length > 1, "物理预算下必须分片");
  const logical = new TextEncoder().encode(JSON.stringify(fragmented.input.frame));
  const reassembled = Buffer.concat(frames.map((frame) => Buffer.from(frame.dataBase64, "base64")));
  assert.deepEqual(reassembled, Buffer.from(logical), "重组字节与逻辑 JSON 字节一致");
  frames.forEach((frame, index) => {
    assert.equal(frame.kind, "fragment");
    assert.equal(frame.fragmentIndex, index, "fragmentIndex 从 0 连续递增");
    assert.equal(frame.fragmentCount, frames.length);
    assert.equal(frame.logicalBytes, logical.byteLength);
    assert.match(frame.checksum.value, /^[0-9a-f]{8}$/u);
    assert.equal(frame.checksum.algorithm, "crc32");
    assert.deepEqual(frame.checksum, frames[0].checksum, "所有分片共享同一 checksum");
    assert.equal(frame.wireVersion, 3);
    assert.equal(frame.deliveryKind, "recovery");
    assert.equal(frame.topic, "conv/def");
    assert.equal(frame.subscriptionId, "sub-3");
    assert.equal(frame.logicalFrameId, "lf-3");
    assert.equal(frame.logicalFrameOrdinal, 3);
  });
});

test("B15 编码错误族：reasonCode 稳定且不返回部分结果", () => {
  for (const testCase of fixtures.encodeCases.cases) {
    if (testCase.expectedError === undefined) continue;
    assert.throws(
      () => encodeWithFixtureOptions(testCase.input),
      (error) => {
        assert.equal(error.name, "TopicWireFrameEncodingError");
        assert.equal(error.reasonCode, testCase.expectedError, `${testCase.name}：reasonCode`);
        assert.equal(error.message, error.reasonCode, "message 即 reasonCode");
        assert.ok(error instanceof protocolV4.TopicWireFrameEncodingError);
        return true;
      },
      testCase.name,
    );
  }
});

test("B15 片数超界抛 frameFragmentCountExceeded", () => {
  // 逻辑 ~160KB、物理预算只放得下 ~100 字节/片 → 片数 >1024。
  const frame = { blob: "z".repeat(160_000) };
  assert.throws(
    () =>
      protocolV4.encodeTopicWireFrames(frame, {
        deliveryKind: "online",
        topic: "c",
        subscriptionId: "s",
        logicalFrameId: "f",
        logicalFrameOrdinal: 1,
        maxPhysicalFrameBytes: 400,
        maxAssemblyBytes: 1_000_000,
        measurePhysicalFrameBytes: measureUtf8JsonPlusOne,
      }),
    (error) => {
      assert.equal(error.reasonCode, "proto.frameFragmentCountExceeded");
      return true;
    },
  );
});

test("B16 三层承载计量：与录制值逐字节一致", () => {
  for (const testCase of fixtures.measureCases.cases) {
    const measured = protocolV4.measureTopicNotificationEnvelopeBytes(testCase.wire);
    assert.deepEqual(measured, testCase.expected, `${testCase.name}：三层计量与录制值一致`);
    assert.equal(
      measured.maxBytes,
      Math.max(measured.cliNdjsonBytes, measured.channelSocketBytes, measured.mobileRelayBytes),
      "maxBytes 是三层最大值",
    );
    assert.ok(
      measured.cliNdjsonBytes > 0 &&
        measured.channelSocketBytes > 0 &&
        measured.mobileRelayBytes > 0,
    );
  }
});

const frameSchema = z.object({ topic: z.string(), subscriptionId: z.string() });
const wireSchema = protocolV4.createTopicWireFrameSchema(frameSchema);

function completeWire(overrides = {}) {
  return {
    wireVersion: 3,
    kind: "complete",
    deliveryKind: "initial",
    logicalFrameId: "lf-1",
    logicalFrameOrdinal: 1,
    topic: "conv/one",
    subscriptionId: "sub-1",
    frame: { topic: "conv/one", subscriptionId: "sub-1" },
    ...overrides,
  };
}

function fragmentWire(overrides = {}) {
  return {
    wireVersion: 3,
    kind: "fragment",
    deliveryKind: "online",
    logicalFrameId: "lf-2",
    logicalFrameOrdinal: 2,
    topic: "conv/two",
    subscriptionId: "sub-2",
    fragmentIndex: 0,
    fragmentCount: 2,
    logicalBytes: 100,
    checksum: { algorithm: "crc32", value: "0badf00d" },
    dataBase64: "AA==",
    ...overrides,
  };
}

test("B17 wire 帧 schema：合法帧通过", () => {
  assert.equal(wireSchema.safeParse(completeWire()).success, true, "complete 合法");
  assert.equal(wireSchema.safeParse(fragmentWire()).success, true, "fragment 合法");
});

test("B17 wire 帧 schema：严格校验与 superRefine 规则", () => {
  const cases = [
    [
      completeWire({ frame: { topic: "conv/other", subscriptionId: "sub-1" } }),
      "complete wire topic must match logical frame topic",
      ["topic"],
    ],
    [
      completeWire({ frame: { topic: "conv/one", subscriptionId: "sub-9" } }),
      "complete wire subscriptionId must match logical frame subscriptionId",
      ["subscriptionId"],
    ],
    [
      fragmentWire({ fragmentIndex: 2 }),
      "fragmentIndex must be smaller than fragmentCount",
      ["fragmentIndex"],
    ],
    [
      fragmentWire({ fragmentCount: 500 }),
      "fragmentCount cannot exceed logicalBytes",
      ["fragmentCount"],
    ],
    [completeWire({ wireVersion: 2 }), null, null],
    [completeWire({ deliveryKind: "sometimes" }), null, null],
    [completeWire({ logicalFrameOrdinal: 0 }), null, null],
    [completeWire({ topic: "" }), null, null],
    [fragmentWire({ checksum: { algorithm: "crc32", value: "89ABCDEF" } }), null, null],
    [fragmentWire({ checksum: { algorithm: "md5", value: "89abcdef" } }), null, null],
    [fragmentWire({ dataBase64: "!!!" }), null, null],
    [completeWire({ extra: 1 }), null, null],
  ];
  for (const [wire, message, path] of cases) {
    const result = wireSchema.safeParse(wire);
    assert.equal(result.success, false, `应拒绝：${JSON.stringify(wire).slice(0, 80)}`);
    if (message !== null) {
      assert.ok(
        result.error.issues.some((issue) => issue.message === message),
        `issue message 应为「${message}」，实际 ${JSON.stringify(result.error.issues.map((i) => i.message))}`,
      );
    }
    if (path !== null) {
      assert.ok(
        result.error.issues.some((issue) => JSON.stringify(issue.path) === JSON.stringify(path)),
        `issue path 应为 ${JSON.stringify(path)}`,
      );
    }
  }
});

test("B18 wire 候选 schema：服务边界只校验外层、保留未知键", () => {
  const candidate = {
    wireVersion: 3,
    kind: "complete",
    logicalFrameId: "lf-1",
    logicalFrameOrdinal: 1,
    topic: "conv/one",
    subscriptionId: "sub-1",
    // inner 缺席 / 坏 deliveryKind 都不在服务边界报错。
    deliveryKind: 42,
    extraKey: { keep: true },
  };
  const parsed = protocolV4.topicWireFrameCandidateSchema.safeParse(candidate);
  assert.equal(parsed.success, true, "外层可路由即通过");
  assert.deepEqual(parsed.data.extraKey, { keep: true }, "passthrough 保留未知键");
  assert.equal(parsed.data.deliveryKind, 42, "deliveryKind 不在边界校验");
  const fragmentCandidate = {
    wireVersion: 3,
    kind: "fragment",
    logicalFrameId: "lf-2",
    logicalFrameOrdinal: 2,
    topic: "conv/two",
    subscriptionId: "sub-2",
    // fragment 的所有 inner 字段都可缺席。
  };
  assert.equal(protocolV4.topicWireFrameCandidateSchema.safeParse(fragmentCandidate).success, true);
  const missingOuter = { wireVersion: 3, kind: "complete", logicalFrameId: "lf-3" };
  assert.equal(
    protocolV4.topicWireFrameCandidateSchema.safeParse(missingOuter).success,
    false,
    "外层必备字段缺失要拒绝",
  );
  assert.equal(
    protocolV4.topicWireFrameCandidateSchema.safeParse(completeWire({ wireVersion: 2 })).success,
    false,
  );
});

test("B19 wire 词汇表常量：checksum / deliveryKind / 协议版本", () => {
  assert.equal(protocolV4.V4_WIRE_PROTOCOL_VERSION, 3, "V4_WIRE_PROTOCOL_VERSION === 3");
  assert.equal(
    protocolV4.topicWireChecksumSchema.safeParse({ algorithm: "crc32", value: "89abcdef" }).success,
    true,
  );
  assert.equal(
    protocolV4.topicWireChecksumSchema.safeParse({ algorithm: "crc32", value: "89ABCDEF" }).success,
    false,
    "hex 必须小写",
  );
  assert.equal(
    protocolV4.topicWireChecksumSchema.safeParse({ algorithm: "crc32", value: "89abcde" }).success,
    false,
    "必须 8 位",
  );
  assert.equal(
    protocolV4.topicWireChecksumSchema.safeParse({ algorithm: "crc32", value: "89abcdef", x: 1 })
      .success,
    false,
    "strict",
  );
  for (const kind of ["initial", "online", "recovery"]) {
    assert.equal(protocolV4.topicFrameDeliveryKindSchema.safeParse(kind).success, true, kind);
  }
  assert.equal(protocolV4.topicFrameDeliveryKindSchema.safeParse("sometimes").success, false);
});

test("B15 限额边界：NaN / 非正数 / 非整数 / 缺席的判定（JSON 不能表示的输入在此单独断言）", () => {
  const base = {
    deliveryKind: "initial",
    topic: "conv/lim",
    subscriptionId: "sub-8",
    logicalFrameId: "lf-8",
    logicalFrameOrdinal: 8,
    maxPhysicalFrameBytes: 4096,
    maxAssemblyBytes: 65536,
  };
  const encode = (options) =>
    protocolV4.encodeTopicWireFrames(
      { a: 1 },
      { ...options, measurePhysicalFrameBytes: measureUtf8JsonPlusOne },
    );
  // NaN 只能在运行时构造（JSON 会把它写成 null，回放语义不同）；夹具里用 JSON 安全的 0 录制同一 reasonCode。
  assert.throws(
    () => encode({ ...base, maxAssemblyBytes: Number.NaN }),
    (error) => {
      assert.equal(error.reasonCode, "proto.invalidLimit.maxAssemblyBytes");
      return true;
    },
  );
  assert.throws(
    () => encode({ ...base, maxPhysicalFrameBytes: Number.NaN }),
    (error) => {
      assert.equal(error.reasonCode, "proto.invalidLimit.maxPhysicalFrameBytes");
      return true;
    },
  );
  for (const invalid of [0, -1]) {
    assert.throws(
      () => encode({ ...base, maxPhysicalFrameBytes: invalid }),
      (error) => {
        assert.equal(error.reasonCode, "proto.invalidLimit.maxPhysicalFrameBytes");
        return true;
      },
      `maxPhysicalFrameBytes=${invalid}`,
    );
    assert.throws(
      () => encode({ ...base, maxAssemblyBytes: invalid }),
      (error) => {
        assert.equal(error.reasonCode, "proto.invalidLimit.maxAssemblyBytes");
        return true;
      },
      `maxAssemblyBytes=${invalid}`,
    );
  }
  // 缺席 = 用实现自带的默认限额（null 同样按缺席处理）。
  const withoutAssembly = { ...base };
  delete withoutAssembly.maxAssemblyBytes;
  assert.equal(encode(withoutAssembly).length, 1, "maxAssemblyBytes 缺席时退回默认限额");
  assert.equal(
    encode({ ...base, maxAssemblyBytes: null }).length,
    1,
    "maxAssemblyBytes=null 按缺席处理（?? 语义）",
  );
  // 非整数向下取整后再作为物理限额使用。
  assert.equal(encode({ ...base, maxPhysicalFrameBytes: 4096.9 }).length, 1, "floor 后仍在界内");
});

test("B13/B16 utf8JsonByteLength：utf-8 字节数（跨平台）", () => {
  assert.equal(protocolV4.utf8JsonByteLength("a"), 3, '"a" 的 JSON 字节数');
  assert.equal(protocolV4.utf8JsonByteLength("中"), 5, "中文按 utf-8 多字节计数");
  assert.equal(protocolV4.utf8JsonByteLength({ a: "中" }), 11, "对象含键引号与 utf-8 多字节");
});

// New consumer checks; root Apache-2.0 retained. No production caller changes.
import assert from "node:assert/strict";
import test from "node:test";
import { BufferReader, BufferWriter, deserialize, serialize } from "../../rpc/src/index.js";
import { identity, payload, payloadSchema } from "./protocol-wire-contract-cases.js";

const protocol = (await import(
  new URL(
    `../${process.env.KNORVIA_WIRE_TEST_TARGET ?? "src"}/protocol-v4/index.js`,
    import.meta.url,
  ).href
)) as typeof import("@knorvia/shared/protocol-v4");

test("wire envelope budget equals real RPC serialization for plain JSON payloads", () => {
  for (const size of [0, 1, 126, 127, 128, 16370, 16384]) {
    const wire = protocol.encodeTopicWireFrames(
      { ...payload, text: "x".repeat(size) },
      { ...identity, measurePhysicalFrameBytes: () => 0 },
    )[0]!;
    const writer = new BufferWriter();
    serialize(writer, [204, Number.MAX_SAFE_INTEGER]);
    serialize(writer, wire);
    const budget = protocol.measureTopicNotificationEnvelopeBytes(wire);
    assert.equal(
      budget.cliNdjsonBytes,
      Buffer.byteLength(JSON.stringify({ method: "v4/conversation/frame", params: wire }) + "\n"),
    );
    assert.equal(budget.channelSocketBytes, writer.buffer.byteLength + 13);
    const reader = new BufferReader(writer.buffer);
    assert.deepEqual(deserialize(reader), [204, Number.MAX_SAFE_INTEGER]);
    assert.deepEqual(deserialize(reader), wire);
    const relay = {
      type: "data",
      payload: {
        knorvia_type: "rpc-frame",
        bridgeSessionId: "x".repeat(protocol.PROTOCOL_V4_LIMITS.transportEnvelopeIdMaxChars),
        bridgeGeneration: Number.MAX_SAFE_INTEGER,
        recoveryId: "x".repeat(protocol.PROTOCOL_V4_LIMITS.transportEnvelopeIdMaxChars),
        seq: Number.MAX_SAFE_INTEGER,
        dataBase64: Buffer.from(writer.buffer.buffer).toString("base64"),
      },
      client_ts: Number.MAX_SAFE_INTEGER,
      server_ts: Number.MAX_SAFE_INTEGER,
    };
    assert.equal(budget.mobileRelayBytes, Buffer.byteLength(JSON.stringify(relay)));
    assert.equal(
      budget.maxBytes,
      Math.max(budget.cliNdjsonBytes, budget.channelSocketBytes, budget.mobileRelayBytes),
    );
  }
});
for (const deliveryKind of ["initial", "online", "recovery"] as const) {
  test(`unchanged incremental assembler accepts public encoder ${deliveryKind} frames atomically`, () => {
    const logical = { ...payload, text: "中文🌍".repeat(5000) };
    const wires = protocol.encodeTopicWireFrames(logical, {
      ...identity,
      deliveryKind,
      maxPhysicalFrameBytes: 5000,
      measurePhysicalFrameBytes: (wire) =>
        protocol.measureTopicNotificationEnvelopeBytes(wire).maxBytes,
    });
    assert.ok(wires.length > 1);
    const schema = protocol.createTopicWireFrameSchema(payloadSchema);
    const assembler = new protocol.TopicWireFrameAssembler(payloadSchema, {
      maxPhysicalFrameBytes: 5000,
    });
    const events = [];
    for (const wire of wires.toReversed()) {
      assert.equal(schema.safeParse(wire).success, true);
      assert.ok(protocol.measureTopicNotificationEnvelopeBytes(wire).maxBytes <= 5000);
      events.push(...assembler.accept(wire, 100));
    }
    assert.deepEqual(events, [{ kind: "complete", frame: logical, deliveryKind }]);
    assert.deepEqual(assembler.getStats(), { assemblies: 0, stagedDecodedBytes: 0 });
    assert.deepEqual(assembler.accept(wires[0]!, 101), []);
  });
}
test("unchanged assembler reports corruption with original owned metadata and releases staging", () => {
  const wires = protocol.encodeTopicWireFrames(
    { ...payload, text: "x".repeat(5000) },
    {
      ...identity,
      deliveryKind: "recovery",
      maxPhysicalFrameBytes: 3000,
      measurePhysicalFrameBytes: (wire) =>
        protocol.measureTopicNotificationEnvelopeBytes(wire).maxBytes,
    },
  );
  const assembler = new protocol.TopicWireFrameAssembler(payloadSchema, {
    maxPhysicalFrameBytes: 3000,
  });
  assert.ok(wires.length > 1);
  const first = wires[0]!;
  assert.equal(first.kind, "fragment");
  if (first.kind !== "fragment") return;
  assert.deepEqual(assembler.accept(first, 100), []);
  const corrupt = {
    ...first,
    dataBase64: first.dataBase64.startsWith("A")
      ? `B${first.dataBase64.slice(1)}`
      : `A${first.dataBase64.slice(1)}`,
  };
  const events = assembler.accept(corrupt, 101);
  assert.deepEqual(events, [
    {
      kind: "fault",
      fault: {
        deliveryKind: "recovery",
        reasonCode: "proto.frameAssemblyFragmentConflict",
        logicalFrameId: identity.logicalFrameId,
        logicalFrameOrdinal: identity.logicalFrameOrdinal,
        topic: identity.topic,
        subscriptionId: identity.subscriptionId,
      },
    },
  ]);
  assert.deepEqual(assembler.getStats(), { assemblies: 0, stagedDecodedBytes: 0 });
});

// New contract tests; root Apache-2.0 retained. See the slice spec for exposure.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { crc32 } from "node:zlib";
import {
  loadWireHelpers,
  jsonObservation,
  wireContractCases,
  complete,
  identity,
  payload,
  payloadSchema,
} from "./protocol-wire-contract-cases.js";

const api = await loadWireHelpers();
const frozen = JSON.parse(
  await readFile(new URL("./protocol-wire-contract-observations.json", import.meta.url), "utf8"),
);
const cases = wireContractCases();
test("wire frozen case inventory is exact", () => {
  assert.deepEqual(
    Object.keys(frozen.observations),
    cases.map((item) => item.name),
  );
  assert.equal(frozen.baseline, "8e8f6310d5ca70a57a454054e44f7b61db30b83f");
});
for (const item of cases) {
  test(`wire contract: ${item.name}`, () =>
    assert.deepEqual(
      jsonObservation(() => item.run(api)),
      frozen.observations[item.name],
    ));
}
test("binary helpers match independent native byte oracles and do not mutate views", () => {
  assert.equal(api.crc32WireBytes(new TextEncoder().encode("123456789")), "cbf43926");
  const backing = Uint8Array.from({ length: 70000 }, (_, index) => (index * 19) & 255);
  const original = backing.slice();
  for (const length of [1, 2, 3, 255, 256, 12287, 12288, 12289, 32768, 65536]) {
    const view = backing.subarray(7, 7 + length);
    const expected = Buffer.from(view).toString("base64");
    assert.equal(api.encodeWireBytesBase64(view), expected);
    assert.deepEqual(api.decodeWireBase64(expected), view);
    assert.equal(api.crc32WireBytes(view), crc32(view).toString(16).padStart(8, "0"));
  }
  assert.deepEqual(backing, original);
});
test("encoder returns the original complete payload reference and preserves key order", () => {
  const wires = api.encodeTopicWireFrames(payload, {
    ...identity,
    measurePhysicalFrameBytes: () => 0,
  });
  assert.equal(wires[0]!.kind, "complete");
  if (wires[0]!.kind === "complete") assert.equal(wires[0]!.frame, payload);
  assert.deepEqual(Object.keys(wires[0]!), [
    "wireVersion",
    "kind",
    "deliveryKind",
    "logicalFrameId",
    "logicalFrameOrdinal",
    "topic",
    "subscriptionId",
    "frame",
  ]);
});
test("batch reconstruction is repeatable without mutating frozen inputs", () => {
  const immutable = Object.freeze({ ...complete, frame: Object.freeze({ ...payload }) });
  const input = Object.freeze([immutable]);
  assert.deepEqual(
    api.reassembleTopicWireFrames(input, payloadSchema),
    api.reassembleTopicWireFrames(input, payloadSchema),
  );
});
test("batch result reads delivery metadata after the caller's schema transformation", () => {
  const wire = { ...complete, deliveryKind: "initial" as "initial" | "recovery" };
  const schema = payloadSchema.transform((frame) => {
    wire.deliveryKind = "recovery";
    return frame;
  });
  assert.deepEqual(api.reassembleTopicWireFrames([wire], schema), {
    kind: "complete",
    frame: payload,
    deliveryKind: "recovery",
  });
});

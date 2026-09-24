import assert from "node:assert/strict";
import test from "node:test";
import { BufferReader, BufferWriter, deserialize, serialize } from "../src/serialization.js";

test("RPC writes a Knorvia binary marker and reads the previous marker", () => {
  const writer = new BufferWriter();
  serialize(writer, { bytes: new Uint8Array([1, 2, 3]) });
  assert.match(writer.buffer.toString(), /__knorvia_rpc_nested_uint8array_v1/u);
  assert.deepEqual(deserialize(new BufferReader(writer.buffer)), {
    bytes: new Uint8Array([1, 2, 3]),
  });

  const legacyWriter = new BufferWriter();
  serialize(legacyWriter, {
    bytes: { __zcode_rpc_nested_uint8array_v1: true, base64: "AQID" },
  });
  assert.deepEqual(deserialize(new BufferReader(legacyWriter.buffer)), {
    bytes: new Uint8Array([1, 2, 3]),
  });
});

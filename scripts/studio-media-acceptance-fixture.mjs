import assert from "node:assert/strict";
import { createServer } from "node:http";
import { inflateSync } from "node:zlib";

export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg==",
  "base64",
);
export const editedPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNgYPiPhIjiAACOsw/xs6MvMwAAAABJRU5ErkJggg==",
  "base64",
);

export function verifyPng(bytes) {
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  let offset = 8;
  const data = [];
  let ended = false;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const block = bytes.subarray(offset + 4, offset + 8 + length);
    let crc = 0xffffffff;
    for (const byte of block) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    assert.equal((crc ^ 0xffffffff) >>> 0, bytes.readUInt32BE(offset + 8 + length), `${type} CRC`);
    if (type === "IHDR") {
      assert.equal(bytes.readUInt32BE(offset + 8), 4);
      assert.equal(bytes.readUInt32BE(offset + 12), 4);
    }
    if (type === "IDAT") data.push(bytes.subarray(offset + 8, offset + 8 + length));
    if (type === "IEND") ended = true;
    offset += length + 12;
  }
  assert.equal(offset, bytes.length);
  assert.equal(ended, true);
  assert.equal(inflateSync(Buffer.concat(data)).length, 4 * (1 + 4 * 3));
}

export async function createMediaFixture() {
  verifyPng(png);
  verifyPng(editedPng);
  const broken = Buffer.from(png);
  broken[broken.length - 1] ^= 1;
  assert.throws(() => verifyPng(broken), /CRC/, "Corrupt PNG must fail fixture validation");
  const requests = [];
  const errors = [];
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.socket.remoteAddress, "127.0.0.1");
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (
        request.method !== "POST" ||
        !["/v1/images/generations", "/v1/images/edits"].includes(request.url)
      ) {
        errors.push(`Unexpected fixture request: ${request.method} ${request.url}`);
        response.writeHead(400).end();
        return;
      }
      requests.push({ path: request.url, body });
      if (request.url.endsWith("/edits")) {
        assert(body.includes(png), "Downstream must receive the complete upstream PNG");
        assert.equal(body.includes(Buffer.from("PROJECT-DECOY")), false);
        assert.match(request.headers["content-type"], /^multipart\/form-data;/);
      } else {
        const parsed = JSON.parse(body.toString("utf8"));
        assert.equal(parsed.model, "fixture-image");
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: [
            { b64_json: (request.url.endsWith("/edits") ? editedPng : png).toString("base64") },
          ],
        }),
      );
    } catch (error) {
      errors.push(error.message);
      response.writeHead(500).end();
    }
  });
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  return {
    requests,
    errors,
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    close: () => new Promise((done) => server.close(done)),
  };
}

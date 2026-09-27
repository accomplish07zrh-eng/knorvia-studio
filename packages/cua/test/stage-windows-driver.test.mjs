import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { zipSync } from "fflate";
import { verifyWindowsCuaArchive } from "../scripts/stage-windows-driver.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const driver = Buffer.from("offline driver fixture");
const pins = (archive, files = { "cua-driver.exe": digest(driver) }) => ({
  sha256: digest(archive),
  files,
});

test("driver archive extracts only pinned files, excluding SDK and traversal entries", () => {
  const archive = zipSync({
    "cua-driver.exe": driver,
    "unused-sdk.dll": Buffer.from("unused"),
    "../outside.exe": Buffer.from("untrusted path"),
  });
  const files = verifyWindowsCuaArchive(archive, pins(archive));
  assert.deepEqual(Object.keys(files), ["cua-driver.exe"]);
  assert.deepEqual(Buffer.from(files["cua-driver.exe"]), driver);
});

test("driver archive rejects modified archive bytes before decompression", () => {
  const archive = zipSync({ "cua-driver.exe": driver });
  const expected = pins(archive);
  archive[0] ^= 1;
  assert.throws(() => verifyWindowsCuaArchive(archive, expected), /archive SHA-256 mismatch/);
});

test("driver archive rejects a missing required file", () => {
  const archive = zipSync({ "unused-sdk.dll": driver });
  assert.throws(() => verifyWindowsCuaArchive(archive, pins(archive)), /binary is missing/);
});

test("driver archive verifies each binary even when the archive digest matches", () => {
  const archive = zipSync({ "cua-driver.exe": Buffer.from("wrong binary") });
  assert.throws(() => verifyWindowsCuaArchive(archive, pins(archive)), /binary SHA-256 mismatch/);
});

test("driver archive rejects oversized output before allocating its declared size", () => {
  const archive = Buffer.from(zipSync({ "cua-driver.exe": driver }));
  const directory = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(directory >= 0);
  archive.writeUInt32LE(65 * 1024 * 1024, directory + 24);
  assert.throws(() => verifyWindowsCuaArchive(archive, pins(archive)), /binary is too large/);
});

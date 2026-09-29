// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import * as nativeFs from "node:fs";
import { Writable } from "node:stream";
import { afterIoSync, beforeIo, ownedPath, writeDetails } from "./fs-policy.mjs";
import { getWorld } from "./state.mjs";

export const constants = nativeFs.constants;

export function existsSync(path) {
  try {
    const [safe] = beforeIo("existsSync", [path]);
    return nativeFs.existsSync(safe);
  } catch {
    return false;
  }
}

export function readFileSync(path, options) {
  const [safe] = beforeIo("readFileSync", [path]);
  return nativeFs.readFileSync(safe, options);
}

export function writeFileSync(path, data, options) {
  const [safe] = beforeIo("writeFileSync", [path], { ...writeDetails(data), options });
  const threshold = getWorld().config?.virtualizeWritesAtBytes;
  const bytes = typeof data === "string" ? Buffer.byteLength(data) : (data?.byteLength ?? 0);
  const result = nativeFs.writeFileSync(
    safe,
    threshold && bytes >= threshold ? new Uint8Array() : data,
    options,
  );
  afterIoSync("writeFileSync", [safe]);
  return result;
}

export function renameSync(oldPath, newPath) {
  const [oldSafe, newSafe] = beforeIo("renameSync", [oldPath, newPath]);
  const result = nativeFs.renameSync(oldSafe, newSafe);
  afterIoSync("renameSync", [oldSafe, newSafe]);
  return result;
}

export function rmSync(path, options) {
  const [safe] = beforeIo("rmSync", [path], { options });
  const result = nativeFs.rmSync(safe, options);
  afterIoSync("rmSync", [safe]);
  return result;
}

export function mkdirSync(path, options) {
  const [safe] = beforeIo("mkdirSync", [path], { options });
  const result = nativeFs.mkdirSync(safe, options);
  afterIoSync("mkdirSync", [safe]);
  return result;
}

export function statSync(path, options) {
  const [safe] = beforeIo("statSync", [path]);
  return nativeFs.statSync(safe, options);
}

export function readdirSync(path, options) {
  const [safe] = beforeIo("readdirSync", [path], { options });
  return nativeFs.readdirSync(safe, options);
}

export function accessSync(path, mode) {
  const [safe] = beforeIo("accessSync", [path], { mode });
  return nativeFs.accessSync(safe, mode);
}

export function createReadStream(path, options) {
  const [safe] = beforeIo("createReadStream", [path], { options });
  return nativeFs.createReadStream(safe, options);
}

export function createWriteStream(path, options) {
  const [safe] = beforeIo("createWriteStream", [path], { options });
  if (getWorld().config?.virtualizeWritesAtBytes) {
    nativeFs.writeFileSync(safe, new Uint8Array());
    const stream = new Writable({
      write(chunk, encoding, callback) {
        stream.bytesWritten += Buffer.isBuffer(chunk)
          ? chunk.byteLength
          : Buffer.byteLength(chunk, encoding);
        callback();
      },
    });
    stream.bytesWritten = 0;
    stream.path = safe;
    return stream;
  }
  return nativeFs.createWriteStream(safe, options);
}

const ownedFs = {
  accessSync,
  constants,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
};

export default ownedFs;
export { ownedPath };

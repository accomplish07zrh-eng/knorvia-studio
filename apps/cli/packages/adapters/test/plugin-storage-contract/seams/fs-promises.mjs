// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import * as nativeFsPromises from "node:fs/promises";
import { afterIo, beforeIo, writeDetails } from "./fs-policy.mjs";
import { getWorld } from "./state.mjs";

export async function access(path, mode) {
  const [safe] = beforeIo("access", [path], { mode });
  return nativeFsPromises.access(safe, mode);
}

export async function cp(source, destination, options) {
  const [sourceSafe, destinationSafe] = beforeIo("cp", [source, destination], { options });
  const result = await nativeFsPromises.cp(sourceSafe, destinationSafe, options);
  await afterIo("cp", [sourceSafe, destinationSafe]);
  return result;
}

export async function mkdir(path, options) {
  const [safe] = beforeIo("mkdir", [path], { options });
  const result = await nativeFsPromises.mkdir(safe, options);
  await afterIo("mkdir", [safe]);
  return result;
}

export async function mkdtemp(prefix, options) {
  const [safe] = beforeIo("mkdtemp", [prefix], { options });
  const result = await nativeFsPromises.mkdtemp(safe, options);
  await afterIo("mkdtemp", [result]);
  return result;
}

export async function readFile(path, options) {
  const [safe] = beforeIo("readFile", [path]);
  return nativeFsPromises.readFile(safe, options);
}

export async function readdir(path, options) {
  const [safe] = beforeIo("readdir", [path], { options });
  return nativeFsPromises.readdir(safe, options);
}

export async function rename(oldPath, newPath) {
  const [oldSafe, newSafe] = beforeIo("rename", [oldPath, newPath]);
  const result = await nativeFsPromises.rename(oldSafe, newSafe);
  await afterIo("rename", [oldSafe, newSafe]);
  return result;
}

export async function rm(path, options) {
  const [safe] = beforeIo("rm", [path], { options });
  const result = await nativeFsPromises.rm(safe, options);
  await afterIo("rm", [safe]);
  return result;
}

export async function stat(path, options) {
  const [safe] = beforeIo("stat", [path]);
  return nativeFsPromises.stat(safe, options);
}

export async function writeFile(path, data, options) {
  const [safe] = beforeIo("writeFile", [path], writeDetails(data));
  const threshold = getWorld().config?.virtualizeWritesAtBytes;
  const bytes = typeof data === "string" ? Buffer.byteLength(data) : (data?.byteLength ?? 0);
  const result = await nativeFsPromises.writeFile(
    safe,
    threshold && bytes >= threshold ? new Uint8Array() : data,
    options,
  );
  await afterIo("writeFile", [safe]);
  return result;
}

const ownedPromises = {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
};

export default ownedPromises;

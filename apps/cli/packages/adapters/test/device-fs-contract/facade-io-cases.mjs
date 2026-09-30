// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { world, info, ioError, portable, directoryEntry, portableIoEvents } from "./fixture.mjs";
export const facadeInputs = [
  ...["file", "directory", "symlink", "other"].map((kind) => ({ op: "stat", kind })),
  ...["utf8", "utf16le", "gb2312", "hex", "base64"].map((encoding) => ({
    op: "readTextFile",
    encoding,
  })),
  ...[-1, 0, 1, 3, 10].map((maxBytes) => ({ op: "readTextFile", maxBytes })),
  ...[undefined, 0, 2, 3, 10].map((maxBytes) => ({ op: "readBinaryFile", maxBytes })),
  { op: "readBinaryFile", maxBytes: 3, growth: true },
  { op: "readTextFile", kind: "directory" },
  { op: "readTextFile", kind: "symlink" },
  { op: "readBinaryFile", kind: "directory" },
  { op: "readBinaryFile", kind: "other" },
  { op: "readTextFileRange", kind: "directory" },
  { op: "readTextFileRange", kind: "other" },
  { op: "readTextFileRange", aborted: true },
  ...[true, false].map((atomic) => ({ op: "writeTextFile", atomic })),
  { op: "writeTextFile", atomic: true, renameFails: true },
  { op: "writeTextFile", atomic: true, kind: "symlink" },
  { op: "writeTextFile", atomic: false, encoding: "gbk", content: "😀" },
  { op: "writeTextFile", atomic: false, revisionConflict: true },
  { op: "writeTextFile", atomic: false, createParents: true },
  { op: "createDirectory" },
  { op: "createDirectory", fault: true },
  { op: "removeFile" },
  { op: "removeFile", missing: true, missingOk: true },
  { op: "removeFile", missing: true },
  { op: "removeFile", aborted: true },
  { op: "listDirectory", kind: "directory" },
  { op: "listDirectory", kind: "file" },
  { op: "listDirectory", kind: "directory", aborted: true },
  ...["ENOENT", "EACCES", "EPERM", "EISDIR", "ENAMETOOLONG", "UNKNOWN"].map((code) => ({
    op: "stat",
    statError: code,
  })),
  { op: "stat", relative: true },
];
export async function observeFacade(loaded, input) {
  const w = world();
  const p = w.put("target.txt", Buffer.from("610d0a620a", "hex"), input.kind ?? "file");
  if (input.missing) {
    w.files.delete(p);
    w.metadata.delete(p);
  }
  if (input.growth) w.metadata.set(p, info("file", 2));
  if (input.statError)
    w.stat = async (name) => {
      w.events.push(["stat", name]);
      throw ioError(input.statError);
    };
  if (input.fault)
    w.fault = (r) => {
      w.events.push(["fault", r.operation, r.path]);
      throw ioError("EACCES");
    };
  if (input.renameFails)
    w.rename = async (...a) => {
      w.events.push(["rename", ...a]);
      throw ioError("EPERM");
    };
  w.readdir = async (name, options) => {
    w.events.push(["readdir", name, options]);
    return [
      directoryEntry("z"),
      directoryEntry("a", "symlink"),
      directoryEntry("middle", "directory"),
    ];
  };
  const controller = new AbortController();
  if (input.aborted) controller.abort();
  const port = new (loaded.use(w).fs.NodeFileSystemAdapter)();
  const request = {
    ...input,
    path: input.relative ? "relative.txt" : p,
    content: input.content ?? "new\ntext",
  };
  if (input.revisionConflict)
    request.expectedRevision = { id: "old-revision", mtimeMs: 0, sizeBytes: 0 };
  let outcome;
  try {
    outcome = { value: portable(await port[input.op](request, { signal: controller.signal })) };
  } catch (error) {
    outcome = { error: portable(error) };
  }
  return {
    ...outcome,
    events: portableIoEvents(w.events),
    files: portable([...w.files].sort(([a], [b]) => a.localeCompare(b))),
  };
}

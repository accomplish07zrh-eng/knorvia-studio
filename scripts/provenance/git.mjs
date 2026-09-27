// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { spawn } from "node:child_process";
import { lstat, readFile, readlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  assertRelativePath,
  BASELINE_COMMIT,
  BASELINE_SOURCE,
  fingerprint,
  REPORT_PATH,
} from "./model.mjs";

export function git(cwd, args, input) {
  return new Promise((accept, reject) => {
    const process = spawn("git", ["-C", cwd, ...args], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks = [];
    const errors = [];
    let bytes = 0;
    process.on("error", reject);
    process.stdin.on("error", reject);
    process.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 256 * 1024 * 1024) {
        process.kill();
        reject(new Error("Git audit input exceeded 256 MiB"));
      } else chunks.push(chunk);
    });
    process.stderr.on("data", (chunk) => errors.push(chunk));
    process.on("close", (code) => {
      if (code === 0) accept(Buffer.concat(chunks));
      else
        reject(new Error(`Git ${args[0]} failed (${code}): ${Buffer.concat(errors).toString()}`));
    });
    process.stdin.end(input);
  });
}

function contained(root, path) {
  const result = relative(root, path);
  return (
    result !== ".." &&
    !result.startsWith("../") &&
    !result.startsWith("..\\") &&
    !isAbsolute(result)
  );
}

export async function readRepositoryFile(root, path) {
  assertRelativePath(path);
  const canonicalRoot = await realpath(root);
  const absolute = resolve(canonicalRoot, path);
  // 父目录被 junction/symlink 替换后，不能让来源扫描读取仓库外的真实用户文件。
  if (!contained(canonicalRoot, await realpath(dirname(absolute)))) {
    throw new Error(`Audit path escapes repository through parent link: ${path}`);
  }
  const before = await lstat(absolute);
  if (!before.isSymbolicLink() && !before.isFile())
    throw new Error(`Unsupported source entry: ${path}`);
  const bytes = before.isSymbolicLink()
    ? Buffer.from(await readlink(absolute))
    : await readFile(absolute);
  const after = await lstat(absolute);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) {
    throw new Error(`File changed during provenance audit: ${path}`);
  }
  return { path, kind: before.isSymbolicLink() ? "symlink" : "file", ...fingerprint(bytes) };
}

export async function readCurrentFiles(root) {
  const output = await git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  const deleted = new Set(
    (await git(root, ["ls-files", "-z", "--deleted"])).toString().split("\0"),
  );
  const listed = [...new Set(output.toString().split("\0").filter(Boolean))]
    .filter((path) => path !== REPORT_PATH && !deleted.has(path))
    .sort();
  const parents = new Map();
  const collapsed = [];
  for (const path of listed) {
    assertRelativePath(path);
    const segments = path.split("/");
    let sourcePath = path;
    for (let length = 1; length < segments.length; length++) {
      const parent = segments.slice(0, length).join("/");
      if (!parents.has(parent)) parents.set(parent, await lstat(resolve(root, parent)));
      // Windows Git 把 junction 当目录展开；来源清单收敛到第一个链接，绝不读取其后文件。
      if (parents.get(parent).isSymbolicLink()) {
        sourcePath = parent;
        break;
      }
    }
    collapsed.push(sourcePath);
  }
  const paths = [...new Set(collapsed)].sort();
  const records = [];
  for (let offset = 0; offset < paths.length; offset += 24) {
    records.push(
      ...(await Promise.all(
        paths.slice(offset, offset + 24).map((path) => readRepositoryFile(root, path)),
      )),
    );
  }
  return records;
}

export async function readBaselineRepository(directory) {
  const revision = (await git(directory, ["rev-parse", `${BASELINE_COMMIT}^{commit}`]))
    .toString()
    .trim();
  if (revision !== BASELINE_COMMIT)
    throw new Error("Upstream commit does not match the provenance pin");
  const tree = (
    await git(directory, ["ls-tree", "-rz", "--full-tree", BASELINE_COMMIT])
  ).toString();
  const entries = tree
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf("\t");
      const [mode, type, blob] = entry.slice(0, tab).split(" ");
      const path = assertRelativePath(entry.slice(tab + 1));
      if (type !== "blob") throw new Error(`Unsupported upstream entry ${type}: ${path}`);
      return { path, mode, blob, kind: mode === "120000" ? "symlink" : "file" };
    });
  const ids = [...new Set(entries.map((entry) => entry.blob))];
  const contents = await git(directory, ["cat-file", "--batch"], `${ids.join("\n")}\n`);
  const hashes = new Map();
  let cursor = 0;
  for (const id of ids) {
    const end = contents.indexOf(10, cursor);
    const [actual, type, length] = contents.toString("utf8", cursor, end).split(" ");
    const size = Number(length);
    if (
      end < 0 ||
      actual !== id ||
      type !== "blob" ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      end + size + 1 >= contents.length
    ) {
      throw new Error(`Invalid upstream object stream: ${id}`);
    }
    hashes.set(id, fingerprint(contents.subarray(end + 1, end + 1 + size)));
    cursor = end + size + 2;
  }
  if (cursor !== contents.length) throw new Error("Unexpected trailing upstream object data");
  return {
    schemaVersion: 1,
    source: BASELINE_SOURCE,
    commit: BASELINE_COMMIT,
    encoding: "UTF-8 CRLF normalized to LF only; binary bytes and original blob IDs preserved",
    files: entries.map((entry) => ({ ...entry, ...hashes.get(entry.blob) })),
  };
}

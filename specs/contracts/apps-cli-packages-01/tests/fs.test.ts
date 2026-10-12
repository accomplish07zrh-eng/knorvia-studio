// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01 合同测试：fs/*（B95–B113）。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize, resolve } from "node:path";
import test from "node:test";
import { load } from "./entry.mjs";

const fsIndex = await load("fs/index");
const paths = await load("fs/file-search-paths");
const io = await load("fs/node-file-io");
const policy = await load("fs/node-file-policy");
const search = await load("fs/node-search");
const plan = await load("fs/ripgrep-plan");
const worker = await load("fs/ripgrep-worker");
const lineWindow = await load("fs/text-line-window");
const metadata = await load("fs/text-metadata");
const rangeReader = await load("fs/text-range-reader");
const lines = await load("fs/text-search-lines");
const results = await load("fs/text-search-results");

async function tempDir(t, prefix = "knorvia-contract-fs-") {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(async () => await rm(directory, { recursive: true, force: true }));
  return directory;
}

function adapter(options = {}) {
  return fsIndex.createNodeFileSystemAdapter(options);
}

test("B95 门面错误转换与基础操作", async (t) => {
  const root = await tempDir(t);
  const port = adapter();
  await assert.rejects(
    () => port.stat({ path: "relative.txt" }),
    (error) => error.code === "invalid_path",
  );
  const directory = join(root, "nested");
  const created = await port.createDirectory({ path: directory });
  assert.equal(created.path, normalize(directory));
  const file = join(root, "a.txt");
  await writeFile(file, "hello");
  const info = await port.stat({ path: join(root, ".", "a.txt") });
  assert.equal(info.kind, "file");
  assert.match(info.revision.id, /^mtime:\d+:size:\d+$/u);
  const removed = await port.removeFile({ path: join(root, "missing.txt"), missingOk: true });
  assert.deepEqual(removed, { path: normalize(join(root, "missing.txt")), removed: false });
  await assert.rejects(
    () => port.removeFile({ path: join(root, "missing.txt") }),
    (error) => error.code === "not_found",
  );
  assert.deepEqual(await port.removeFile({ path: file }), { path: normalize(file), removed: true });
});

test("B96 readTextFile 的编码、行尾与截断", async (t) => {
  const root = await tempDir(t);
  const port = adapter();
  const crlf = join(root, "crlf.txt");
  await writeFile(crlf, "a\r\nb\r\n");
  const read = await port.readTextFile({ path: crlf });
  assert.equal(read.content, "a\nb\n");
  assert.equal(read.lineEndings, "CRLF");
  assert.equal(read.encoding, "utf8");
  assert.equal(read.truncated, false);
  assert.match(read.revision.hash, /^sha256:[0-9a-f]{64}$/u);
  const lf = join(root, "lf.txt");
  await writeFile(lf, "a\nb\n");
  assert.equal((await port.readTextFile({ path: lf })).lineEndings, "LF");
  const truncated = await port.readTextFile({ path: lf, maxBytes: 2 });
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.bytesRead, 2);
  assert.equal(truncated.sizeBytes, 4);
  const nul = join(root, "nul.txt");
  await writeFile(nul, Buffer.from([0x61, 0x00, 0x62]));
  await assert.rejects(
    () => port.readTextFile({ path: nul }),
    (error) => error.code === "unsupported",
  );
  await assert.rejects(
    () => port.readTextFile({ path: root }),
    (error) => error.code === "is_directory",
  );
});

test("B97 readBinaryFile 的大小上限与短读推进", async (t) => {
  const root = await tempDir(t);
  const port = adapter();
  const file = join(root, "blob.bin");
  await writeFile(file, Buffer.alloc(1024, 7));
  const exact = await port.readBinaryFile({ path: file, maxBytes: 1024 });
  assert.equal(exact.bytesRead, 1024);
  assert.equal(exact.revision.hash !== undefined, true);
  await assert.rejects(
    () => port.readBinaryFile({ path: file, maxBytes: 1023 }),
    (error) =>
      error.code === "too_large" &&
      error.message ===
        "File content (1KB) exceeds maximum allowed size (1023B). Use a smaller file.",
  );
  const full = await port.readBinaryFile({ path: file });
  assert.equal(full.bytesRead, 1024);
});

test("B98 writeTextFile 的 revision、父目录与原子写", async (t) => {
  const root = await tempDir(t);
  const port = adapter();
  const file = join(root, "nested", "out.txt");
  const written = await port.writeTextFile({
    path: file,
    content: "a\nb",
    lineEndings: "CRLF",
    createParents: true,
  });
  assert.equal(await readFile(file, "utf8"), "a\r\nb");
  assert.equal(written.bytesWritten, Buffer.byteLength("a\r\nb"));
  assert.match(written.revision.id, /^mtime:/u);
  assert.equal(
    (await readdir(join(root, "nested"))).some((name) => name.endsWith(".tmp")),
    false,
  );
  await assert.rejects(
    () => port.writeTextFile({ path: join(root, "missing-dir", "x.txt"), content: "x" }),
    (error) => error.code === "not_found",
  );
  const first = await port.stat({ path: file });
  await writeFile(file, "changed externally");
  await assert.rejects(
    () => port.writeTextFile({ path: file, content: "next", expectedRevision: first.revision }),
    (error) =>
      error.code === "stale_write" &&
      error.message === `File changed since it was read: ${normalize(file)}`,
  );
  await port.writeTextFile({ path: file, content: "direct", atomic: false });
  assert.equal(await readFile(file, "utf8"), "direct");
});

test("B99 readTextFileRange 的选行与流式扫描", async (t) => {
  const root = await tempDir(t);
  const port = adapter();
  const file = join(root, "lines.txt");
  await writeFile(file, "a\nb\nc\n");
  const range = await port.readTextFileRange({ path: file, offsetLine: 1, limitLines: 1 });
  assert.equal(range.content, "b");
  assert.equal(range.startLine, 2);
  assert.equal(range.lineCount, 1);
  assert.equal(range.totalLines, 4);
  assert.equal(range.truncated, false);
  assert.equal(Object.hasOwn(range.revision, "hash"), false);
  const beyond = await port.readTextFileRange({ path: file, offsetLine: 99 });
  assert.equal(beyond.content, "");
  assert.equal(beyond.lineCount, 0);
  assert.equal(beyond.totalLines, 4);
  const zeroLimit = await port.readTextFileRange({ path: file, offsetLine: -5, limitLines: 0 });
  assert.equal(zeroLimit.content, "");
  assert.equal(zeroLimit.startLine, 1);
  assert.equal(zeroLimit.totalLines, 4);
  await assert.rejects(
    () => port.readTextFileRange({ path: file, maxBytes: 2 }),
    (error) => error.code === "too_large" && error.message.includes("offset and limit parameters"),
  );
  const withoutTrailingNewline = join(root, "lines2.txt");
  await writeFile(withoutTrailingNewline, "a\nb\nc");
  const scanned = await rangeReader.readTextFileRangeFromNode(
    { path: withoutTrailingNewline, offsetLine: 1 },
    { size: 5, mtimeMs: 1.9 },
  );
  assert.equal(scanned.content, "b\nc");
  assert.equal(scanned.totalLines, 3);
  assert.equal(scanned.revision.id, "mtime:1:size:5");
});

test("B100 listDirectory 的排序与计时", async (t) => {
  const root = await tempDir(t);
  const port = adapter();
  await writeFile(join(root, "b.txt"), "b");
  await writeFile(join(root, "c"), "c");
  await mkdir(join(root, "a"));
  const listed = await port.listDirectory({ path: root });
  assert.equal(listed.numEntries, 3);
  assert.deepEqual(
    listed.entries.map((entry) => entry.name),
    ["a", "b.txt", "c"],
  );
  assert.deepEqual(
    listed.entries.map((entry) => entry.kind),
    ["directory", "file", "file"],
  );
  assert.equal(Number.isInteger(listed.durationMs) && listed.durationMs >= 0, true);
  assert.equal(listed.entries[0].path, join(root, "a"));
  await assert.rejects(
    () => port.listDirectory({ path: join(root, "b.txt") }),
    (error) => error.code === "not_file" && error.message.includes("must be a directory"),
  );
  await assert.rejects(
    () => port.listDirectory({ path: join(root, "missing") }),
    (error) => error.code === "not_found",
  );
});

test("B101 searchFiles 的 glob 遍历、排序与分页", async (t) => {
  const root = await tempDir(t);
  const port = adapter();
  await writeFile(join(root, "x.ts"), "x");
  await writeFile(join(root, "y.md"), "y");
  await mkdir(join(root, "sub"));
  await writeFile(join(root, "sub", "z.ts"), "z");
  const found = await port.searchFiles({ path: root, pattern: "**/*.ts" });
  assert.deepEqual(found.files.map((file) => file.split(/[\\/]/u).at(-1)).sort(), ["x.ts", "z.ts"]);
  assert.equal(found.numFiles, 2);
  assert.equal(found.truncated, false);
  await assert.rejects(
    () => port.searchFiles({ path: root, pattern: "" }),
    (error) =>
      error.code === "invalid_pattern" && error.message === "Glob pattern must not be empty",
  );
  await assert.rejects(
    () => port.searchFiles({ path: join(root, "x.ts"), pattern: "*.ts" }),
    (error) =>
      error.code === "not_file" && error.message.includes("Glob search path must be a directory"),
  );
  const limited = await port.searchFiles({ path: root, pattern: "**/*", maxResults: 1 });
  assert.equal(limited.numFiles, 1);
  assert.equal(limited.truncated, true);
  const offset = await port.searchFiles({ path: root, pattern: "**/*", offset: 1, maxResults: 1 });
  assert.equal(offset.numFiles, 1);
  assert.notEqual(offset.files[0], limited.files[0]);
  const stable = await port.searchFiles({ path: root, pattern: "**/*" });
  const again = await port.searchFiles({ path: root, pattern: "**/*" });
  assert.deepEqual(stable.files, again.files);
});

test("B102 searchText 的引擎选择与降级", async (t) => {
  const root = await tempDir(t);
  const jsPort = adapter({ textSearchEngine: "javascript" });
  await writeFile(join(root, "one.txt"), "foo\nfoo bar\n");
  await writeFile(join(root, "two.txt"), "foo\n");
  await writeFile(join(root, "binary.txt"), Buffer.from([0x66, 0x00, 0x6f, 0x6f]));
  const files = await jsPort.searchText({ path: root, pattern: "foo" });
  assert.equal(files.mode, "files_with_matches");
  assert.equal(files.files.length, 2);
  assert.equal(files.numMatches, 3);
  const counts = await jsPort.searchText({ path: root, pattern: "foo", outputMode: "count" });
  assert.deepEqual(counts.entries.map((entry) => entry.count).sort(), [1, 2]);
  const content = await jsPort.searchText({ path: root, pattern: "foo", outputMode: "content" });
  assert.equal(
    content.entries.every((entry) => entry.matched === true),
    true,
  );
  assert.equal(
    content.entries.some((entry) => entry.lineNumber === 2),
    true,
  );
  await assert.rejects(
    () => jsPort.searchText({ path: root, pattern: "(" }),
    (error) =>
      error.code === "invalid_pattern" && error.message === "Invalid grep regular expression: (",
  );
  await assert.rejects(
    () => jsPort.searchText({ path: root, pattern: "" }),
    (error) =>
      error.code === "invalid_pattern" && error.message === "Grep pattern must not be empty",
  );
  const restoreFactory = fsIndex.setRipgrepWorkerFactoryForTests(() => {
    throw new Error("worker factory unavailable");
  });
  try {
    const fallback = await adapter().searchText({ path: root, pattern: "foo" });
    assert.equal(fallback.numMatches, 3);
  } finally {
    restoreFactory();
  }
});

test("B103 glob、类型过滤与排序工具", () => {
  assert.deepEqual([...paths.VCS_NAMES], [".git", ".svn", ".hg", ".bzr", ".jj", ".sl"]);
  assert.equal(paths.posixRelative("/a", "/a/b/c.ts"), "b/c.ts");
  assert.equal(paths.glob("**/*.ts")("src/a.ts", "a.ts"), true);
  assert.equal(paths.glob("**/*.ts")("a.md", "a.md"), false);
  assert.equal(paths.glob("*.md")("sub/a.md", "a.md"), true);
  assert.equal(paths.glob("{a,b}.ts")("b.ts", "b.ts"), true);
  assert.equal(paths.glob("{a,b")("a", "a"), false);
  assert.equal(paths.glob("?.ts")("a.ts", "a.ts"), true);
  assert.equal(paths.glob("?.ts")("ab.ts", "ab.ts"), false);
  assert.equal(paths.glob("src/**")("src/a/b.ts", "b.ts"), true);
  assert.equal(paths.glob("src\\**\\*.ts")("src/a.ts", "a.ts"), true);
  assert.equal(paths.matchesType("a.TS", "ts"), true);
  assert.equal(paths.matchesType("a.txt", ".txt"), true);
  assert.equal(paths.matchesType("a.ts", "python"), false);
  assert.equal(paths.fileType(".TS"), "ts");
  assert.equal(paths.recent({ path: "b", mtimeMs: 1 }, { path: "a", mtimeMs: 1 }) > 0, true);
  assert.equal(paths.recent({ path: "a", mtimeMs: 2 }, { path: "b", mtimeMs: 1 }) < 0, true);
  assert.equal(paths.filter("/root", {})("/root/x.ts"), true);
});

test("B104 walk 的递归规则与取消", async (t) => {
  const root = await tempDir(t);
  await mkdir(join(root, "a"));
  await mkdir(join(root, "b"));
  await mkdir(join(root, ".git"));
  await writeFile(join(root, "a", "x.txt"), "x");
  await writeFile(join(root, "b", "y.txt"), "y");
  await writeFile(join(root, ".git", "config"), "git");
  const visited = [];
  await paths.walk(root, undefined, (file) => visited.push(file.split(/[\\/]/u).at(-1)));
  assert.deepEqual(visited.sort(), ["x.txt", "y.txt"]);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => paths.walk(root, controller.signal, () => {}),
    (error) => error.name === "AbortError",
  );
  const info = await (await import("node:fs/promises")).stat(join(root, "a", "x.txt"));
  const candidates = await paths.candidates(join(root, "a", "x.txt"), info, {
    path: join(root, "a", "x.txt"),
  });
  assert.deepEqual(
    candidates.map((candidate) => candidate.path),
    [join(root, "a", "x.txt")],
  );
  const directoryCandidates = await paths.candidates(
    root,
    await (await import("node:fs/promises")).stat(root),
    { path: root },
  );
  assert.deepEqual(
    directoryCandidates.map((candidate) => candidate.path.split(/[\\/]/u).at(-1)),
    ["x.txt", "y.txt"],
  );
  const fake = { isFile: () => false, isDirectory: () => false };
  await assert.rejects(
    () => paths.candidates(join(root, "other"), fake, { path: join(root, "other") }),
    (error) => error.code === "not_file" && error.message.includes("must be a file or directory"),
  );
});

test("B105 ripgrep 参数计划", () => {
  const directoryPlan = plan.searchPlan(
    {
      path: "/abs/dir",
      pattern: "a b",
      outputMode: "content",
      onlyMatching: true,
      context: 2,
      type: "ts",
      ignoreCase: true,
      multiline: true,
    },
    true,
  );
  assert.equal(directoryPlan.root, "/abs/dir");
  assert.deepEqual(directoryPlan.preopens, { ".": "/abs/dir" });
  assert.equal(directoryPlan.args.includes("--json"), true);
  assert.equal(directoryPlan.args.includes("--only-matching"), true);
  assert.equal(directoryPlan.args.includes("-i"), true);
  assert.equal(directoryPlan.args.includes("-U"), true);
  assert.equal(directoryPlan.args.includes("--multiline-dotall"), true);
  assert.equal(directoryPlan.args.join(" ").includes("-C 2"), true);
  assert.equal(directoryPlan.args.includes("!.git"), true);
  assert.equal(directoryPlan.args.includes("!**/.git/**"), true);
  assert.equal(directoryPlan.args.includes("**/*.ts"), true);
  assert.deepEqual(directoryPlan.args.slice(-4), ["-e", "a b", "--", "."]);
  const filePlan = plan.searchPlan({ path: "/abs/dir/file.ts", pattern: "x" }, false);
  assert.equal(filePlan.root, "/abs/dir");
  assert.deepEqual(filePlan.args.slice(-4), ["-e", "x", "--", "file.ts"]);
  assert.equal(filePlan.args.includes("-c"), true);
  const globPlan = plan.searchPlan({ path: "/abs/dir", pattern: "x", glob: "**/*.ts, *.md" }, true);
  const globValues = globPlan.args.filter((value, index) => globPlan.args[index - 1] === "--glob");
  assert.equal(globValues.includes("**/*.ts"), true);
  assert.equal(globValues.includes("*.md"), true);
});

test("B106 ripgrep worker 的超时、取消与错误分类", async () => {
  assert.equal(worker.RipgrepRuntimeFailure.name, "RipgrepRuntimeFailure");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => worker.runSearch([], {}, controller.signal),
    (error) =>
      error.name === "AbortError" &&
      error.message === "ripgrep search was cancelled before it started",
  );
  const hanging = () => ({
    once() {},
    terminate() {
      hanging.terminated = true;
    },
  });
  const restoreTimeout = worker.setRipgrepTimeoutMsForTests(5);
  const restoreFactory = worker.setRipgrepWorkerFactoryForTests(hanging);
  try {
    await assert.rejects(
      () => worker.runSearch(["x"], {}, undefined),
      (error) =>
        error.name === "RipgrepTimeoutFailure" &&
        error.message ===
          "ripgrep search timed out after 5ms. The search was terminated before it completed.",
    );
    assert.equal(hanging.terminated, true);
  } finally {
    restoreFactory();
    restoreTimeout();
  }
  const failing = () => ({
    once(event, callback) {
      if (event === "error") queueMicrotask(() => callback(new Error("worker boom")));
    },
    terminate() {},
  });
  const restoreFailing = worker.setRipgrepWorkerFactoryForTests(failing);
  try {
    await assert.rejects(
      () => worker.runSearch([], {}),
      (error) =>
        error instanceof worker.RipgrepRuntimeFailure &&
        error.message === "Bundled ripgrep WASM failed to run",
    );
  } finally {
    restoreFailing();
  }
  const restoreThrowing = worker.setRipgrepWorkerFactoryForTests(() => {
    throw new Error("factory boom");
  });
  try {
    await assert.rejects(
      () => worker.runSearch([], {}),
      (error) => error instanceof worker.RipgrepRuntimeFailure,
    );
  } finally {
    restoreThrowing();
  }
});

test("B107 prefix / bounded / publish 读写原语", async (t) => {
  const root = await tempDir(t);
  const file = join(root, "data.bin");
  await writeFile(file, Buffer.from(Array.from({ length: 1024 }, (_, index) => index % 256)));
  assert.equal((await io.prefix(file, 10)).byteLength, 10);
  assert.equal((await io.bounded(file, 5, 1024)).byteLength, 5);
  assert.equal((await io.bounded(file, 5000, 3)).byteLength, 1024);
  const target = join(root, "published.bin");
  await io.publish(target, Buffer.from("first"));
  assert.equal(await readFile(target, "utf8"), "first");
  await io.publish(target, Buffer.from("second"));
  assert.equal(await readFile(target, "utf8"), "second");
  assert.equal(
    (await readdir(root)).some((name) => name.includes(".tmp.")),
    false,
  );
  const linked = join(root, "link.bin");
  try {
    await symlink(target, linked);
  } catch {
    return;
  }
  await assert.rejects(
    () => io.publish(linked, Buffer.from("x")),
    (error) =>
      error.name === "SymlinkWriteRefusedError" &&
      error.message.includes("Refusing to write through symlink"),
  );
});

test("B108 错误策略与 revision/大小格式化", () => {
  assert.throws(
    () => policy.absolute("rel"),
    (error) => error.code === "invalid_path",
  );
  assert.equal(policy.absolute("/a/../b"), normalize("/b"));
  const notFound = policy.failure(Object.assign(new Error("x"), { code: "ENOENT" }), "p");
  assert.equal(notFound.code, "not_found");
  assert.equal(notFound.message, "File not found: p");
  assert.equal(
    policy.failure(Object.assign(new Error("x"), { code: "EACCES" }), "p").code,
    "permission_denied",
  );
  assert.equal(
    policy.failure(Object.assign(new Error("x"), { code: "EPERM" }), "p").code,
    "permission_denied",
  );
  assert.equal(
    policy.failure(Object.assign(new Error("x"), { code: "EISDIR" }), "p").code,
    "is_directory",
  );
  assert.equal(
    policy.failure(Object.assign(new Error("x"), { code: "ENAMETOOLONG" }), "p").code,
    "invalid_path",
  );
  const unknown = policy.failure(new Error("weird"), "p");
  assert.equal(unknown.code, "io_error");
  assert.equal(unknown.message, "weird");
  assert.equal(policy.failure("nope", "p").message, "File system error for path: p");
  assert.throws(
    () => policy.aborted({ aborted: true }),
    (error) => error.name === "AbortError",
  );
  assert.equal(policy.nodeKind({ isFile: () => true }), "file");
  assert.equal(policy.nodeKind({ isFile: () => false, isDirectory: () => true }), "directory");
  assert.equal(
    policy.nodeKind({ isFile: () => false, isDirectory: () => false, isSymbolicLink: () => true }),
    "symlink",
  );
  assert.equal(
    policy.nodeKind({ isFile: () => false, isDirectory: () => false, isSymbolicLink: () => false }),
    "other",
  );
  assert.throws(
    () => policy.regular({ isFile: () => false, isDirectory: () => true }, "p", "text"),
    (error) =>
      error.code === "is_directory" && error.message === "Cannot read directory as text file: p",
  );
  assert.throws(
    () => policy.regular({ isFile: () => false, isDirectory: () => false }, "p", "binary"),
    (error) =>
      error.code === "not_file" && error.message === "Cannot read non-file path as binary: p",
  );
  assert.equal(policy.revision({ mtimeMs: 1.9, size: 3 }).id, "mtime:1:size:3");
  assert.equal(Object.hasOwn(policy.revision({ mtimeMs: 1, size: 3 }), "hash"), false);
  assert.equal(
    policy.revision({ mtimeMs: 1, size: 3 }, Buffer.from("ab")).hash,
    `sha256:${createHash("sha256").update("ab").digest("hex")}`,
  );
  assert.equal(policy.byteCount(1023), "1023B");
  assert.equal(policy.byteCount(1024), "1KB");
  assert.equal(policy.byteCount(1025), "1KB");
  assert.equal(policy.byteCount(1536), "1.5KB");
  assert.equal(policy.byteCount(1048576), "1MB");
  assert.equal(policy.code({ code: "X" }), "X");
  assert.equal(policy.code(null), undefined);
  assert.equal(policy.abortError("m").name, "AbortError");
});

test("B109 编码检测与行尾工具", () => {
  assert.equal(metadata.detectTextEncoding(Buffer.from("hi")), "utf8");
  assert.equal(metadata.detectTextEncoding(Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x69])), "utf8");
  assert.equal(metadata.detectTextEncoding(Buffer.from([0xff, 0xfe, 0x68, 0x00])), "utf16le");
  assert.throws(
    () => metadata.detectTextEncoding(Buffer.from([0x61, 0x00])),
    (error) => error.code === "unsupported",
  );
  assert.throws(
    () => metadata.detectTextEncoding(Buffer.alloc(100, 1)),
    (error) => error.code === "unsupported",
  );
  const gbk = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]);
  const detected = metadata.detectTextEncoding(gbk);
  assert.equal(["gb2312", "gbk", "gb18030"].includes(detected), true);
  assert.equal(metadata.decodeTextBuffer({ buffer: gbk }).content, "中文");
  assert.equal(metadata.decodeTextBuffer({ buffer: gbk, encoding: "gbk" }).encoding, "gbk");
  assert.deepEqual(metadata.encodeTextContent({ content: "中文", encoding: "gbk" }), gbk);
  assert.equal(metadata.shouldNormalizeLineEndings("base64"), false);
  assert.equal(metadata.shouldNormalizeLineEndings("utf8"), true);
  assert.equal(metadata.detectLineEndings("a\r\nb"), "CRLF");
  assert.equal(metadata.detectLineEndings("a\nb"), "LF");
  assert.equal(metadata.normalizeLineEndings("a\r\nb"), "a\nb");
  assert.equal(metadata.applyRequestedLineEndings("a\r\nb", "CRLF"), "a\r\nb");
  assert.equal(metadata.applyRequestedLineEndings("a\nb", "LF"), "a\nb");
  assert.equal(metadata.applyRequestedLineEndings("a\r\nb", undefined), "a\r\nb");
  const decoder = metadata.createStreamingTextDecoder("utf8");
  assert.equal(decoder.write(Buffer.from("a")) + decoder.end(), "a");
});

test("B110 TextLineWindow 的行窗口语义", () => {
  const window = new lineWindow.TextLineWindow(1, 2);
  window.write("a\nb\nc\nd\n");
  window.finish("", true);
  assert.deepEqual(window.lines, ["b", "c"]);
  assert.equal(window.totalLines, 5);
  const zero = new lineWindow.TextLineWindow(0, 0);
  zero.write("x\ny\n");
  zero.finish("", true);
  assert.deepEqual(zero.lines, []);
  assert.equal(zero.totalLines, 3);
  const nan = new lineWindow.TextLineWindow(Number.NaN, undefined);
  nan.write("x\ny\n");
  nan.finish("", true);
  assert.deepEqual(nan.lines, ["x", "y", ""]);
  const crlf = new lineWindow.TextLineWindow(0, undefined);
  crlf.write("x\r\ny");
  crlf.finish("", true);
  assert.deepEqual(crlf.lines, ["x", "y"]);
  assert.equal(crlf.lineEndings, "CRLF");
  const unfinished = new lineWindow.TextLineWindow(0, undefined);
  unfinished.write("only");
  assert.equal(unfinished.totalLines, 0);
  assert.deepEqual(unfinished.lines, []);
});

test("B111 matchContent 与匹配片段", () => {
  assert.deepEqual(lines.matchingFragments("p", "", 3), [
    { path: "p", lineNumber: 3, text: "", matched: true },
  ]);
  assert.deepEqual(lines.matchingFragments("p", "a\nb", 1), [
    { path: "p", lineNumber: 1, text: "a", matched: true },
    { path: "p", lineNumber: 2, text: "b", matched: true },
  ]);
  const simple = lines.matchContent("p", "a\nb\nc", /b/u, { path: "p" });
  assert.equal(simple.matchCount, 1);
  assert.deepEqual(simple.entries, [{ path: "p", lineNumber: 2, text: "b", matched: true }]);
  const contextual = lines.matchContent("p", "a\nb\nc", /b/u, {
    path: "p",
    beforeContext: 1,
    afterContext: 1,
  });
  assert.equal(contextual.entries.length, 3);
  assert.deepEqual(
    contextual.entries.map((entry) => entry.matched),
    [false, true, false],
  );
  const only = lines.matchContent("p", "a\nb\nc", /b/u, { path: "p", onlyMatching: true });
  assert.deepEqual(only.entries, [{ path: "p", lineNumber: 2, text: "b", matched: true }]);
  const multiline = lines.matchContent("p", "a\nb\nc", /a\nb/u, { path: "p", multiline: true });
  assert.equal(multiline.matchCount, 1);
  assert.deepEqual(multiline.entries, [{ path: "p", lineNumber: 1, text: "a", matched: true }]);
  const multilineOnly = lines.matchContent("p", "a\nb\nc", /a\nb/u, {
    path: "p",
    multiline: true,
    onlyMatching: true,
  });
  assert.deepEqual(
    multilineOnly.entries.map((entry) => entry.lineNumber),
    [1, 2],
  );
  assert.equal(lines.matchContent("p", "", /x/u, { path: "p" }).matchCount, 0);
  assert.equal(lines.matchContent("p", "", /x/u, { path: "p" }).entries.length, 0);
});

test("B112 搜索结果截断、解析与失败分类", async (t) => {
  const root = await tempDir(t);
  const finished = results.finish(
    { path: root, pattern: " a ", outputMode: "files_with_matches", headLimit: 1 },
    0,
    { files: [join(root, "a.ts"), join(root, "b.ts")], entries: [], numMatches: 5 },
  );
  assert.equal(finished.truncated, true);
  assert.equal(finished.appliedLimit, 1);
  assert.equal(finished.pattern, "a");
  assert.equal(finished.files.length, 1);
  assert.equal(finished.numMatches, 5);
  const unlimited = results.finish({ path: root, pattern: "a", headLimit: 0, offset: 1 }, 0, {
    files: [join(root, "a.ts"), join(root, "b.ts")],
    entries: [],
    numMatches: 0,
  });
  assert.equal(unlimited.truncated, false);
  assert.equal(unlimited.appliedOffset, 1);
  assert.equal(unlimited.files.length, 1);
  const counts = results.parseOutput(`a.ts:2\nb.md:0\n`, root, { path: root, outputMode: "count" });
  assert.deepEqual(counts.files, [join(root, "a.ts")]);
  assert.equal(counts.numMatches, 2);
  assert.deepEqual(counts.entries, [{ path: join(root, "a.ts"), count: 2 }]);
  assert.throws(
    () => results.parseOutput("{bad json}\n", root, { path: root, outputMode: "content" }),
    (error) => error.code === "io_error" && error.message === "Failed to parse ripgrep JSON output",
  );
  const jsonLine = JSON.stringify({
    type: "match",
    data: {
      path: { text: "./a.ts" },
      line_number: 3,
      lines: { text: "x\n" },
      submatches: [{ match: { text: "x" } }],
    },
  });
  const parsed = results.parseOutput(`${jsonLine}\n`, root, { path: root, outputMode: "content" });
  assert.deepEqual(parsed.entries, [
    { path: join(root, "a.ts"), lineNumber: 3, text: "x", matched: true },
  ]);
  assert.deepEqual(parsed.files, [join(root, "a.ts")]);
  await writeFile(join(root, "a.ts"), "x");
  const sorted = await results.sortFiles([join(root, "missing.ts"), join(root, "a.ts")]);
  assert.deepEqual(sorted, [join(root, "a.ts"), join(root, "missing.ts")]);
  assert.equal(results.ripgrepFailure("regex parse error", "p", "(").code, "invalid_pattern");
  assert.equal(results.ripgrepFailure("Permission denied", "p", "x").code, "permission_denied");
  assert.equal(results.ripgrepFailure("no such file", "p", "x").code, "not_found");
  const generic = results.ripgrepFailure("", "p", "x");
  assert.equal(generic.code, "io_error");
  assert.equal(generic.message, "ripgrep failed while searching p");
  assert.equal(Object.hasOwn(finished, "mode"), true);
});

test("B113 fs 导出面", async () => {
  assert.deepEqual(Object.keys(fsIndex).sort(), [
    "NodeFileSystemAdapter",
    "createNodeFileSystemAdapter",
    "setRipgrepTimeoutMsForTests",
    "setRipgrepWorkerFactoryForTests",
  ]);
  assert.deepEqual(Object.keys(io).sort(), ["bounded", "prefix", "publish"]);
  assert.deepEqual(Object.keys(policy).sort(), [
    "abortError",
    "aborted",
    "absolute",
    "byteCount",
    "code",
    "failure",
    "nodeKind",
    "regular",
    "revision",
  ]);
  assert.deepEqual(Object.keys(search).sort(), ["searchFiles", "searchText"]);
  assert.deepEqual(Object.keys(plan), ["searchPlan"]);
  assert.deepEqual(Object.keys(lineWindow), ["TextLineWindow"]);
  assert.deepEqual(Object.keys(rangeReader), ["readTextFileRangeFromNode"]);
  assert.deepEqual(Object.keys(results).sort(), [
    "finish",
    "parseOutput",
    "ripgrepFailure",
    "sortFiles",
  ]);
  assert.deepEqual(Object.keys(lines).sort(), ["matchContent", "matchingFragments"]);
  assert.equal(worker.RipgrepTimeoutFailure, undefined);
  assert.equal(io.SymlinkWriteRefusedError, undefined);
  assert.equal(results.outputLines, undefined);
  for (const name of [
    "VCS_NAMES",
    "posixRelative",
    "glob",
    "TYPE_EXTENSIONS",
    "fileType",
    "matchesType",
    "filter",
    "walk",
    "candidates",
    "recent",
  ]) {
    assert.equal(typeof paths[name] !== "undefined", true, `file-search-paths 应导出 ${name}`);
  }
  for (const name of [
    "detectTextEncoding",
    "decodeTextBuffer",
    "encodeTextContent",
    "createStreamingTextDecoder",
    "shouldNormalizeLineEndings",
    "detectLineEndings",
    "normalizeLineEndings",
    "applyRequestedLineEndings",
  ]) {
    assert.equal(typeof metadata[name] === "function", true, `text-metadata 应导出 ${name}`);
  }
  assert.equal(typeof worker.runSearch, "function");
  assert.equal(typeof worker.setRipgrepTimeoutMsForTests, "function");
  assert.equal(typeof worker.setRipgrepWorkerFactoryForTests, "function");
  assert.equal(policy.byteCount(1024), "1KB");
  assert.equal(results.ripgrepFailure("", "p", "x").code, "io_error");
});

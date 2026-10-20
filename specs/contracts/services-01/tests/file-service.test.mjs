// SPDX-License-Identifier: Apache-2.0
// S31–S41：工作区文件服务的目录读取、stat、存在性缓存、路径解析、工作区目录创建，
// 以及 fileServiceIO 的文本切片、二进制判定、字节区间与媒体/二进制预览边界。
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { realpath } from "node:fs/promises";
import { describe, it } from "node:test";

import { entryLabel, importDeep, repoRoot, services, servicesNode } from "./entry.mjs";
import { extractExports } from "./exports-ast.mjs";
import {
  knorviaDataRoot,
  makeTempRoot,
  pathExists,
  readText,
  testCleanup,
  writeText,
} from "./helpers.mjs";

const { createFileService } = servicesNode;
const fileIO = await importDeep("file/fileServiceIO.ts");

const isPosix = process.platform !== "win32";

/**
 * 独立的工作区根（与被测数据目录无关）。
 *
 * 权限还原与目录删除都登记进统一的清理钩子：POSIX 上夹具会把某些目录改成不可写
 * 来验证权限边界，不先恢复就删会 `EACCES`；Windows 上仍可能有个别句柄延迟释放。
 * 两条都走同一钩子，任一步失败不会顶掉另一步（`t.after` 抛错即跳过后续钩子）。
 */
async function makeWorkspace(t, label) {
  const base = await mkdtemp(join(tmpdir(), `svc01-${label}-`));
  const cleanup = testCleanup(t);
  cleanup.release(() => restoreWritable(base));
  cleanup.directory(base);
  return base;
}

/**
 * 断言用的查询词：在真实文件名里保留可命中的核心词，同时保证它不会在**根路径**里
 * 以子序列形式出现。
 *
 * 搜索有三档打分，第三档把绝对路径也纳入模糊匹配；Windows 的临时根路径
 * `C:\Users\<用户>\AppData\Local\Temp\…` 字母充足，`alpha`/`late` 这类短词会跨段
 * 子序列命中每一个候选（`a`ppdata→`l`ocal→`p`Temp→`h`→`a`），让「未命中项被剔除」
 * 类断言在 Windows 上恒假。POSIX 的 `/tmp/…` 前缀字母少，不暴露该噪声。
 *
 * 返回 `{ core, file }`：`core` 是查询词（含原词，保证名字档命中），
 * `file` 是对应的文件名主体（含 `core` 前缀）。
 */
function pickCoreAbsentFromRoot(rootPath, core) {
  const haystack = rootPath.toLowerCase();
  const isSubsequence = (needle) => {
    let matched = 0;
    for (const char of haystack) {
      if (char === needle[matched]) {
        matched += 1;
        if (matched === needle.length) return true;
      }
    }
    return false;
  };
  // 后缀取非常用字母组合，逐步加长，直到整词不再是根路径的子序列。
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const suffix = `q${attempt}${"zkvwyq"[attempt % 6]}`;
    const candidate = `${core}-${suffix}`;
    if (!isSubsequence(candidate)) return candidate;
  }
  throw new Error("cannot pick a query core absent from the workspace root");
}

async function restoreWritable(base) {
  if (!isPosix) return;
  const { chmod } = await import("node:fs/promises");
  const stack = [base];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const name of await readdir(current).catch(() => [])) stack.push(join(current, name));
    await chmod(current, 0o700).catch(() => undefined);
  }
}

const makeDir = async (path) => mkdir(path, { recursive: true });

const entry = (root, name, type, isSymbolicLink = false) => ({
  name,
  path: join(root, name),
  type,
  isSymbolicLink,
});

/** 排序契约的期望值：目录整体在前，组内按 localeCompare。 */
function expectedOrder(entries) {
  return [...entries].sort((left, right) => {
    if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

describe(`S31 IFileService 描述符与实现面（${entryLabel}）`, () => {
  it("描述符频道名冻结为 file，实例方法集与接口声明的方法集完全一致", async (t) => {
    assert.deepEqual(services.IFileService, { channelName: "file" });
    const interfaceRow = extractExports(repoRoot, "file/file.ts").find(
      (row) => row.name === "IFileService" && row.kind === "interface",
    );
    assert.ok(interfaceRow, "file.ts 必须导出 IFileService 接口声明");
    const declared = [...interfaceRow.signature.matchAll(/^ {2}([A-Za-z][A-Za-z0-9]*)\(/gmu)].map(
      (match) => match[1],
    );
    assert.ok(declared.length > 1, "接口里必须解析出多个方法声明");
    const root = await makeWorkspace(t, "surface");
    const service = createFileService();
    assert.deepEqual(Object.keys(service).sort(), [...declared].sort());
    for (const name of declared) assert.equal(typeof service[name], "function", name);
    // 抽样真实调用：方法不是空壳，返回的是磁盘事实。
    assert.deepEqual(await service.readdir({ path: root }), []);
    assert.deepEqual(await service.stat({ path: root }), { path: root, type: "directory" });
  });
});

describe(`S32 readdir（${entryLabel}）`, () => {
  it("默认隐藏点开头条目，目录整体先于文件，组内顺序等于 localeCompare", async (t) => {
    const root = await makeWorkspace(t, "readdir");
    await makeDir(join(root, "sub"));
    await makeDir(join(root, "Alpha"));
    await makeDir(join(root, ".cfg"));
    for (const name of ["Zeta.ts", "a.md", "beta.md", ".hidden"]) {
      await writeText(join(root, name), "x");
    }
    await writeText(join(root, "sub", "inner.txt"), "x");
    const service = createFileService();
    const visible = await service.readdir({ path: root });
    assert.deepEqual(
      visible,
      expectedOrder([
        entry(root, "Alpha", "directory"),
        entry(root, "sub", "directory"),
        entry(root, "a.md", "file"),
        entry(root, "beta.md", "file"),
        entry(root, "Zeta.ts", "file"),
      ]),
    );
    assert.ok(!visible.some((item) => item.name.startsWith(".")), "默认必须隐藏点开头条目");
    const withHidden = await service.readdir({ path: root, includeHidden: true });
    assert.deepEqual(
      withHidden,
      expectedOrder([
        entry(root, "Alpha", "directory"),
        entry(root, "sub", "directory"),
        entry(root, ".cfg", "directory"),
        entry(root, "a.md", "file"),
        entry(root, "beta.md", "file"),
        entry(root, "Zeta.ts", "file"),
        entry(root, ".hidden", "file"),
      ]),
      "includeHidden 只放开隐藏项，分组与排序规则不变",
    );
    assert.deepEqual(await service.readdir({ path: join(root, "sub") }), [
      entry(join(root, "sub"), "inner.txt", "file"),
    ]);
    await assert.rejects(
      () => service.readdir({ path: join(root, "nope") }),
      (error) => error.code === "ENOENT",
    );
    await assert.rejects(
      () => service.readdir({ path: join(root, "a.md") }),
      (error) => ["ENOTDIR", "EISDIR", "EBADF", "EPERM"].includes(error.code),
    );
  });

  it("符号链接目录的 type 由目标决定，isSymbolicLink 保留 dirent 原始事实，悬空链接退回 file", async (t) => {
    const root = await makeWorkspace(t, "readdir-link");
    await makeDir(join(root, "real"));
    await writeText(join(root, "real", "inside.txt"), "x");
    let linkCreated = false;
    try {
      await symlink(join(root, "real"), join(root, "link-dir"), "dir");
      await symlink(join(root, "real", "inside.txt"), join(root, "link-file"), "file");
      await symlink(join(root, "no-target"), join(root, "dangling"), "file");
      linkCreated = true;
    } catch {
      linkCreated = false;
    }
    const service = createFileService();
    const entries = await service.readdir({ path: root, includeHidden: true });
    const byName = new Map(entries.map((item) => [item.name, item]));
    assert.equal(byName.get("real").type, "directory");
    assert.equal(byName.get("real").isSymbolicLink, false);
    assert.equal(byName.get("inside.txt"), undefined, "子项不属于本层目录");
    if (linkCreated) {
      assert.deepEqual(
        entries,
        expectedOrder([
          entry(root, "link-dir", "directory", true),
          entry(root, "real", "directory"),
          entry(root, "dangling", "file", true),
          entry(root, "link-file", "file", true),
        ]),
      );
      assert.equal(byName.get("link-dir").type, "directory", "指向目录的链接按目标归类");
      assert.equal(byName.get("link-file").type, "file");
      assert.equal(byName.get("dangling").type, "file", "悬空链接的 stat 失败退回 file 而不抛错");
      for (const name of ["link-dir", "link-file", "dangling"]) {
        assert.equal(byName.get(name).isSymbolicLink, true, "链接标记不能被目标事实覆盖");
      }
    } else {
      assert.deepEqual(entries, [entry(root, "real", "directory")]);
    }
  });
});

describe(`S33 stat（${entryLabel}）`, () => {
  it("目录只回 path/type，文件带真实 size/mtimeMs，路径原样回显且不做词法归一", async (t) => {
    const root = await makeWorkspace(t, "stat");
    await writeText(join(root, "f.txt"), "abcdefg");
    const service = createFileService();
    assert.deepEqual(await service.stat({ path: root }), { path: root, type: "directory" });
    const unnormalized = `${root}${sep}.${sep}f.txt`;
    const result = await service.stat({ path: unnormalized });
    assert.equal(result.path, unnormalized, "stat 不改写调用方给的路径字符串");
    assert.equal(result.type, "file");
    assert.equal(result.size, 7);
    assert.ok(Number.isFinite(result.mtimeMs));
    assert.deepEqual(Object.keys(result).sort(), ["mtimeMs", "path", "size", "type"]);
    await assert.rejects(
      () => service.stat({ path: join(root, "missing") }),
      (error) => error.code === "ENOENT",
    );
  });
});

describe(`S34 checkFilesExist（${entryLabel}）`, () => {
  it("只把普通文件算作存在、保持入参顺序，并在同一实例内复用带 TTL 的结果缓存", async (t) => {
    const root = await makeWorkspace(t, "exist");
    const file = join(root, "a.txt");
    const missing = join(root, "gone.txt");
    const service = createFileService();
    assert.deepEqual(await service.checkFilesExist({ paths: [missing, root, file] }), [
      { path: missing, exists: false },
      { path: root, exists: false },
      { path: file, exists: false },
    ]);
    await writeText(file, "hello");
    assert.deepEqual(
      await service.checkFilesExist({ paths: [file] }),
      [{ path: file, exists: false }],
      "负结果被同一实例缓存，外部新建文件在 TTL 内仍不可见",
    );
    const fresh = createFileService();
    assert.deepEqual(await fresh.checkFilesExist({ paths: [file, root, missing] }), [
      { path: file, exists: true },
      { path: root, exists: false },
      { path: missing, exists: false },
    ]);
    await rm(file);
    assert.deepEqual(
      await fresh.checkFilesExist({ paths: [file] }),
      [{ path: file, exists: true }],
      "正结果同样被缓存，删除后 TTL 内仍报存在",
    );
    assert.deepEqual(await fresh.checkFilesExist({ paths: [] }), []);
    const sixteen = Array.from({ length: 16 }, (_value, index) => join(root, `p${index}`));
    await assert.rejects(
      () => fresh.checkFilesExist({ paths: sixteen }),
      /^Error: File existence check supports at most 15 paths\.$/u,
    );
    assert.equal((await fresh.checkFilesExist({ paths: sixteen.slice(0, 15) })).length, 15);
    const dup = await fresh.checkFilesExist({ paths: [missing, missing, file, file, file] });
    assert.deepEqual(
      dup.map((item) => item.exists),
      [false, false, true, true, true],
    );
  });
});

describe(`S35 resolvePath（${entryLabel}）`, () => {
  it("走 realpath：消除冗余段与链接成分返回规范绝对路径，路径缺失即拒绝", async (t) => {
    const root = await makeWorkspace(t, "resolve");
    const target = join(root, "real.txt");
    await writeText(target, "x");
    const service = createFileService();
    const canonical = await realpath(target);
    const resolved = await service.resolvePath({ path: `${root}${sep}.${sep}real.txt` });
    assert.equal(resolved, canonical);
    assert.ok(!resolved.split(sep).includes("."), "冗余段必须被 realpath 消除");
    let linkResolved = false;
    try {
      const link = join(root, "via-link.txt");
      await symlink(target, link, "file");
      assert.equal(await service.resolvePath({ path: link }), canonical);
      assert.notEqual(await service.resolvePath({ path: link }), link, "返回的是目标而非链接本身");
      linkResolved = true;
    } catch {
      linkResolved = false;
    }
    if (!linkResolved) assert.ok(canonical.length > 0, "无链接能力时至少 realpath 可用");
    await assert.rejects(
      () => service.resolvePath({ path: join(root, "missing.txt") }),
      (error) => ["ENOENT", "ENOTDIR", "EINVAL"].includes(error.code),
    );
  });
});

describe(`S36 工作区目录创建（${entryLabel}）`, () => {
  it("对话/默认/草稿工作区都落在数据根内，created 只反映真实新建，名字校验先于 IO", async (t) => {
    const base = await makeTempRoot(t);
    const knorvia = knorviaDataRoot(base);
    const service = createFileService();
    assert.deepEqual(await service.ensureConversationWorkspace(), {
      path: join(knorvia, "workspace", "default"),
      created: true,
      workspacePurpose: "conversation",
    });
    assert.deepEqual(await service.ensureConversationWorkspace(), {
      path: join(knorvia, "workspace", "default"),
      created: false,
      workspacePurpose: "conversation",
    });
    assert.deepEqual(await service.createDefaultWorkspace(), {
      path: join(knorvia, "workspace", "projects"),
    });
    assert.deepEqual(await service.createScratchWorkspace({ name: "  proj-a  " }), {
      path: join(knorvia, "workspace", "projects", "proj-a"),
    });
    assert.equal(await pathExists(join(knorvia, "workspace", "projects", "proj-a")), true);
    assert.deepEqual(await service.createScratchWorkspace({ name: "proj-a" }), {
      path: join(knorvia, "workspace", "projects", "proj-a"),
    });
    for (const name of ["", "   ", "\t"]) {
      await assert.rejects(
        () => service.createScratchWorkspace({ name }),
        /^Error: Workspace name is required\.$/u,
        JSON.stringify(name),
      );
    }
    for (const name of ["a/b", "a\\b", "/", "\\", "../escape"]) {
      await assert.rejects(
        () => service.createScratchWorkspace({ name }),
        /^Error: Workspace name cannot contain path separators\.$/u,
        name,
      );
    }
    assert.equal(await pathExists(join(knorvia, "workspace", "projects", "a")), false);
    assert.equal(await pathExists(join(base, "escape")), false);
    await writeText(join(knorvia, "workspace", "projects", "blocked"), "x");
    await assert.rejects(
      () => service.createScratchWorkspace({ name: "blocked" }),
      (error) => error.code === "EEXIST" || /not a directory/u.test(error.message),
    );
  });

  it("对话工作区被普通文件占据时抛稳定文案并保留 mkdir 原始 cause，不覆盖占位内容", async (t) => {
    const base = await makeTempRoot(t);
    const knorvia = knorviaDataRoot(base);
    const occupied = join(knorvia, "workspace", "default");
    await writeText(occupied, "not a directory");
    await assert.rejects(
      () => createFileService().ensureConversationWorkspace(),
      (error) => {
        assert.equal(error.message, `Workspace path is not a directory: ${occupied}`);
        assert.equal(error.cause?.code, "EEXIST");
        return true;
      },
    );
    assert.equal(await readText(occupied), "not a directory");
    await writeText(join(knorvia, "workspace", "projects"), "x");
    await assert.rejects(
      () => createFileService().createDefaultWorkspace(),
      (error) => error.code === "EEXIST" || /not a directory/u.test(error.message),
    );
  });
});

describe(`S37 readTextFile 切片（${entryLabel}）`, () => {
  it("offset/length 按字节裁剪并回写 truncated/totalBytes，越界 offset 返回空段而不读盘", async (t) => {
    const root = await makeWorkspace(t, "text");
    const path = join(root, "slice.txt");
    await writeText(path, "0123456789");
    const service = createFileService();
    assert.deepEqual(await service.readTextFile({ path }), {
      path,
      content: "0123456789",
      offset: 0,
      bytesRead: 10,
      totalBytes: 10,
      truncated: false,
      isBinary: false,
    });
    assert.deepEqual(await service.readTextFile({ path, offset: 3, length: 4 }), {
      path,
      content: "3456",
      offset: 3,
      bytesRead: 4,
      totalBytes: 10,
      truncated: true,
      isBinary: false,
    });
    assert.deepEqual(await service.readTextFile({ path, offset: 6, length: 99 }), {
      path,
      content: "6789",
      offset: 6,
      bytesRead: 4,
      totalBytes: 10,
      truncated: false,
      isBinary: false,
    });
    assert.deepEqual(await service.readTextFile({ path, offset: 99 }), {
      path,
      content: "",
      offset: 99,
      bytesRead: 0,
      totalBytes: 10,
      truncated: false,
      isBinary: false,
    });
    // 下限保护：0 与负数不是「空读」，而是被抬到 1 字节；NaN 才走缺省值。
    assert.equal((await service.readTextFile({ path, length: 0 })).bytesRead, 1);
    assert.equal((await service.readTextFile({ path, length: -7 })).bytesRead, 1);
    assert.equal((await service.readTextFile({ path, length: Number.NaN })).bytesRead, 10);
    assert.equal((await service.readTextFile({ path, offset: -3 })).offset, 0);
    const large = join(root, "large.txt");
    await writeText(large, "a".repeat(300_000));
    const defaulted = await service.readTextFile({ path: large });
    assert.deepEqual(
      [defaulted.bytesRead, defaulted.totalBytes, defaulted.truncated, defaulted.content.length],
      [131_072, 300_000, true, 131_072],
      "缺省窗口 128KiB",
    );
    const clamped = await service.readTextFile({ path: large, length: 1_000_000 });
    assert.deepEqual([clamped.bytesRead, clamped.truncated], [262_144, true], "单次上限 256KiB");
    await assert.rejects(
      () => service.readTextFile({ path: root }),
      (error) => error.message === `Path is not a file: ${root}`,
    );
    await assert.rejects(
      () => service.readTextFile({ path: join(root, "missing.txt") }),
      (error) => error.code === "ENOENT",
    );
    assert.deepEqual(
      (await fileIO.readTextSlice({ path, offset: 2, length: 3 })).content,
      (await service.readTextFile({ path, offset: 2, length: 3 })).content,
      "深层函数与服务方法同源",
    );
  });

  it("切片不做码点对齐：截断的多字节字符解码成替换字符", async (t) => {
    const root = await makeWorkspace(t, "utf8");
    const path = join(root, "u8.txt");
    await writeFile(path, Buffer.from([0x61, 0xc3, 0xb6, 0x62]));
    const service = createFileService();
    const half = await service.readTextFile({ path, offset: 1, length: 1 });
    assert.equal(half.content, "\uFFFD", "半个字符按 UTF-8 解码成替换字符");
    assert.deepEqual(
      [half.bytesRead, half.totalBytes, half.truncated, half.isBinary],
      [1, 4, true, false],
    );
    assert.equal((await service.readTextFile({ path, offset: 1, length: 2 })).content, "ö");
    assert.equal((await service.readTextFile({ path })).content, "aöb");
    assert.equal((await service.readTextFile({ path, offset: 2, length: 1 })).content, "\uFFFD");
  });
});

describe(`S38 二进制判定（${entryLabel}）`, () => {
  it("NUL 立即判二进制并清空内容，控制字符按占比阈值判定，制表与换行不计入", async (t) => {
    const root = await makeWorkspace(t, "binary");
    const service = createFileService();
    const withNul = join(root, "nul.bin");
    await writeFile(withNul, Buffer.from([0x41, 0x00, 0x42]));
    assert.deepEqual(await service.readTextFile({ path: withNul }), {
      path: withNul,
      content: "",
      offset: 0,
      bytesRead: 3,
      totalBytes: 3,
      truncated: false,
      isBinary: true,
    });
    const controls = join(root, "controls.bin");
    await writeFile(controls, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 0x7f]));
    assert.equal((await service.readTextFile({ path: controls })).isBinary, true);
    const diluted = join(root, "diluted.bin");
    await writeFile(diluted, Buffer.from([1, ...Array.from({ length: 40 }, () => 0x41)]));
    const dilutedResult = await service.readTextFile({ path: diluted });
    assert.equal(dilutedResult.isBinary, false, "控制字符占比不足阈值仍按文本返回");
    assert.equal(dilutedResult.content.startsWith("\u0001A"), true);
    const whitespace = join(root, "tabs.txt");
    await writeFile(whitespace, Buffer.from("\t\n\r\t\n\r".repeat(8), "utf8"));
    const tabs = await service.readTextFile({ path: whitespace });
    assert.equal(tabs.isBinary, false, "制表/换行/回车不算控制字符");
    assert.equal(tabs.content, "\t\n\r\t\n\r".repeat(8));
    const empty = join(root, "empty.txt");
    await writeFile(empty, Buffer.alloc(0));
    assert.deepEqual(await service.readTextFile({ path: empty }), {
      path: empty,
      content: "",
      offset: 0,
      bytesRead: 0,
      totalBytes: 0,
      truncated: false,
      isBinary: false,
    });
    assert.equal(
      (await service.readTextFile({ path: controls, offset: 1 })).isBinary,
      true,
      "判定只看本次读到的窗口",
    );
    assert.equal(
      (await service.readTextFile({ path: withNul, offset: 1, length: 1 })).isBinary,
      true,
      "单字节 NUL 也立即判二进制",
    );
  });
});

describe(`S39 readFileRange（${entryLabel}）`, () => {
  it("顶层返回 Uint8Array，EOF 给短数组，越界 offset 给空数组，长度落在 1 与 1MiB 之间", async (t) => {
    const root = await makeWorkspace(t, "range");
    const path = join(root, "bytes.bin");
    await writeFile(path, Buffer.from([1, 2, 3, 4, 5, 6, 7]));
    const service = createFileService();
    const slice = await service.readFileRange({ path, offset: 2, length: 4 });
    assert.equal(slice.constructor, Uint8Array, "RPC 二进制通道要求顶层 Uint8Array");
    assert.deepEqual([...slice], [3, 4, 5, 6]);
    assert.deepEqual(
      [...(await service.readFileRange({ path, offset: 4, length: 100 }))],
      [5, 6, 7],
    );
    assert.equal((await service.readFileRange({ path, offset: 99, length: 10 })).length, 0);
    assert.deepEqual([...(await service.readFileRange({ path, offset: -1, length: 2 }))], [1, 2]);
    assert.equal((await service.readFileRange({ path, offset: 0, length: 0 })).length, 1);
    assert.equal((await service.readFileRange({ path, offset: 0, length: Number.NaN })).length, 7);
    const huge = join(root, "huge.bin");
    await writeFile(huge, Buffer.alloc(1));
    await truncate(huge, 2_000_000);
    assert.equal(
      (await service.readFileRange({ path: huge, offset: 0, length: 9_000_000 })).length,
      1_048_576,
      "单次上限 1MiB",
    );
    assert.equal(
      (await service.readFileRange({ path: huge, offset: 100, length: 1 })).length,
      1,
      "offset 之后仍有空间时按请求长度返回",
    );
    const direct = await fileIO.readByteRange({ path, offset: 0, length: 3 });
    assert.deepEqual([...direct], [1, 2, 3]);
    assert.equal(direct.byteLength, 3, "返回视图长度必须等于实际读到的字节数");
    await assert.rejects(
      () => service.readFileRange({ path: root, offset: 0, length: 10 }),
      (error) => error.message === `Path is not a file: ${root}`,
    );
    await assert.rejects(
      () => service.readFileRange({ path, offset: Number.NaN, length: 3 }),
      (error) => error instanceof RangeError && error.code === "ERR_OUT_OF_RANGE",
      "offset 缺省值未做校验：NaN 直达 Buffer.allocUnsafe 抛出底层 RangeError",
    );
  });
});

describe(`S40 媒体预览（${entryLabel}）`, () => {
  it("MIME 取小写扩展名，图片表优先于共享音视频表，未知类型回落 octet-stream，base64 可逆", async (t) => {
    const root = await makeWorkspace(t, "preview");
    const service = createFileService();
    const png = join(root, "pic.png");
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    await writeFile(png, pngBytes);
    assert.deepEqual(await service.readMediaPreview({ path: png }), {
      path: png,
      mediaType: "image/png",
      dataBase64: pngBytes.toString("base64"),
      totalBytes: pngBytes.length,
    });
    assert.deepEqual(
      [
        ...Buffer.from(
          (await service.readMediaPreview({ path: png, maxBytes: 1e6 })).dataBase64,
          "base64",
        ),
      ],
      [...pngBytes],
      "base64 往返无损",
    );
    for (const [name, mediaType] of [
      ["a.SVG", "image/svg+xml"],
      ["b.ico", "image/x-icon"],
      ["c.jpeg", "image/jpeg"],
      ["d.jpg", "image/jpeg"],
      ["e.mp4", "video/mp4"],
      ["f.MOV", "video/quicktime"],
      ["g.mp3", "audio/mpeg"],
      ["h.pdf", "application/octet-stream"],
      ["i.txt", "application/octet-stream"],
      ["no-extension", "application/octet-stream"],
    ]) {
      const target = join(root, name);
      await writeText(target, "sample");
      const preview = await service.readMediaPreview({ path: target });
      assert.equal(preview.mediaType, mediaType, name);
      assert.deepEqual([preview.path, preview.totalBytes], [target, 6]);
    }
    const oversize = join(root, "two-bytes.bin");
    await writeFile(oversize, Buffer.from([1, 2]));
    await assert.rejects(
      () => service.readMediaPreview({ path: oversize, maxBytes: 1 }),
      (error) => error.message === `File is too large to preview: ${oversize}`,
    );
    const sparse = join(root, "sparse.mp4");
    await writeFile(sparse, Buffer.alloc(1));
    await truncate(sparse, 9 * 1024 * 1024);
    await assert.rejects(
      () => service.readMediaPreview({ path: sparse, maxBytes: 1e9 }),
      (error) => error.message === `File is too large to preview: ${sparse}`,
      "maxBytes 被夹到 8MiB 绝对上限，请求更大不生效",
    );
    await assert.rejects(
      () => service.readMediaPreview({ path: root }),
      (error) => error.message === `Path is not a file: ${root}`,
    );
    await assert.rejects(
      () => service.readMediaPreview({ path: join(root, "gone.png") }),
      (error) => error.code === "ENOENT",
    );
  });
});

describe(`S41 二进制预览与 classifyFileEntry（${entryLabel}）`, () => {
  it("readBinaryPreview 只有三键、与媒体预览共用闸门但上限是 25MiB", async (t) => {
    const root = await makeWorkspace(t, "binary-preview");
    const service = createFileService();
    const pdf = join(root, "doc.pdf");
    const pdfBytes = Buffer.from("%PDF-1.4\n");
    await writeFile(pdf, pdfBytes);
    const preview = await service.readBinaryPreview({ path: pdf });
    assert.deepEqual(preview, {
      path: pdf,
      dataBase64: pdfBytes.toString("base64"),
      totalBytes: pdfBytes.length,
    });
    assert.equal(
      (await service.readBinaryPreview({ path: pdf, maxBytes: 1_000_000_000 })).totalBytes,
      pdfBytes.length,
    );
    await assert.rejects(
      () => service.readBinaryPreview({ path: pdf, maxBytes: 1 }),
      (error) => error.message === `File is too large to preview: ${pdf}`,
    );
    const sparse = join(root, "sparse.bin");
    await writeFile(sparse, Buffer.alloc(1));
    await truncate(sparse, 26 * 1024 * 1024);
    for (const maxBytes of [undefined, 40 * 1024 * 1024]) {
      await assert.rejects(
        () => service.readBinaryPreview({ path: sparse, maxBytes }),
        (error) => error.message === `File is too large to preview: ${sparse}`,
        "25MiB 绝对上限不因缺省或更大的 maxBytes 放宽",
      );
    }
    await assert.rejects(
      () => service.readBinaryPreview({ path: join(root, "gone.bin") }),
      (error) => error.code === "ENOENT",
    );
  });

  it("classifyFileEntry：目录直接判定、普通文件不额外 stat、符号链接按目标解析且悬空退回 file", async (t) => {
    const root = await makeWorkspace(t, "classify");
    await makeDir(join(root, "dir"));
    await writeText(join(root, "file.txt"), "x");
    const dirent = (name, { directory = false, symbolic = false }) => ({
      name,
      parentPath: root,
      isDirectory: () => directory,
      isFile: () => !directory && !symbolic,
      isSymbolicLink: () => symbolic,
    });
    assert.equal(
      await fileIO.classifyFileEntry(join(root, "dir"), dirent("dir", { directory: true })),
      "directory",
    );
    assert.equal(
      await fileIO.classifyFileEntry(join(root, "file.txt"), dirent("file.txt", {})),
      "file",
    );
    assert.equal(
      await fileIO.classifyFileEntry(join(root, "dir"), dirent("dir", { symbolic: true })),
      "directory",
      "指向目录的链接归类为目录",
    );
    assert.equal(
      await fileIO.classifyFileEntry(
        join(root, "file.txt"),
        dirent("file.txt", { symbolic: true }),
      ),
      "file",
    );
    assert.equal(
      await fileIO.classifyFileEntry(join(root, "broken"), dirent("broken", { symbolic: true })),
      "file",
      "悬空链接不抛错，退回 file",
    );
    assert.equal(
      await fileIO.classifyFileEntry(join(root, "ghost"), dirent("ghost", {})),
      "file",
      "非链接条目即使目标不存在也不 stat",
    );
    const service = createFileService();
    assert.deepEqual(await service.readdir({ path: root }), [
      entry(root, "dir", "directory"),
      entry(root, "file.txt", "file"),
    ]);
  });
});

describe(`S42 工作区文件搜索索引与忽略规则（${entryLabel}）`, () => {
  it("索引按 identity 分桶、目录先于文件、忽略规则命中即剪枝，且 60s 内命中缓存", async (t) => {
    const root = await makeWorkspace(t, "search-index");
    await makeDir(join(root, "src", "nested"));
    await makeDir(join(root, "node_modules", "pkg"));
    await makeDir(join(root, ".hidden"));
    await writeText(join(root, "src", "a.ts"), "export {};\n");
    await writeText(join(root, "src", "nested", "b.ts"), "export {};\n");
    await writeText(join(root, "node_modules", "pkg", "c.js"), "module.exports = 1;\n");
    await writeText(join(root, ".hidden", "d.ts"), "export {};\n");
    await writeText(join(root, "readme.md"), "# r\n");
    const service = createFileService();

    const length = await service.listWorkspaceFilesLength({ rootPath: root });
    assert.ok(length > 0);
    const packed = await service.listWorkspaceFilesRange({ rootPath: root, offset: 0, length });
    assert.equal(packed.length, length);
    assert.equal(
      await service.listWorkspaceFilesRange({ rootPath: root, offset: length, length: 10 }),
      "",
      "offset 越界返回空串而不是抛错",
    );
    assert.equal(
      await service.listWorkspaceFilesRange({ rootPath: root, offset: length - 1, length: 0 }),
      "",
    );

    // 索引行是 TSV：目录整体在前，组内 localeCompare；隐藏目录与 node_modules 被忽略。
    const lines = packed.split("\n").filter(Boolean);
    const paths = lines.map((line) => line.split("\t")[1]);
    assert.deepEqual(
      paths,
      [...paths].sort((left, right) => {
        const leftType = lines[paths.indexOf(left)].split("\t")[0];
        const rightType = lines[paths.indexOf(right)].split("\t")[0];
        if (leftType !== rightType) return leftType === "directory" ? -1 : 1;
        return left.localeCompare(right);
      }),
    );
    assert.equal(lines[0].startsWith("directory\t"), true, "目录整体排在文件之前");
    for (const path of paths) {
      assert.equal(path.includes("node_modules"), false, "内置默认规则必须剪掉 node_modules");
    }
    assert.equal(paths.includes("src"), true);
    assert.equal(paths.includes("src/nested"), true);
    assert.equal(paths.includes("src/a.ts"), true);
    assert.equal(paths.includes("readme.md"), true);
    // 隐藏目录自身不进索引，但其中的文件仍可见（隐藏只作用于目录条目本身）。
    assert.equal(paths.includes(".hidden"), false, "隐藏目录条目被过滤");
    assert.equal(paths.includes(".hidden/d.ts"), true, "隐藏目录内的文件仍可检索");
    // .knorviaignore 自身永不进入索引。
    assert.equal(paths.includes(".knorviaignore"), false);
    assert.equal(
      await pathExists(join(root, ".knorviaignore")),
      true,
      "首次索引会自动创建忽略文件",
    );

    // 60s TTL 内命中缓存：新建文件不改变已冻结的索引，refresh 才重建。
    const countEntries = async (params) => {
      const size = await service.listWorkspaceFilesLength(params);
      const text = await service.listWorkspaceFilesRange({ ...params, offset: 0, length: size });
      return text.split("\n").filter(Boolean).length;
    };
    const before = await countEntries({ rootPath: root });
    // 「晚到文件」的名字自选：必须保证它不会因为绝对路径档的子序列匹配而在
    // 未刷新时就命中（见 pickCoreAbsentFromRoot 的说明），否则「缓存里没有它」无法断言。
    const lateToken = pickCoreAbsentFromRoot(root, "late");
    await writeText(join(root, `${lateToken}.txt`), "x");
    assert.equal(
      await service.listWorkspaceFilesLength({ rootPath: root }),
      length,
      "TTL 内 packed 字节数完全不变",
    );
    assert.deepEqual(
      await service.searchWorkspaceFiles({ rootPath: root, query: lateToken }),
      [],
      "缓存索引里没有晚到文件，未命中补扫要靠调用方显式 refresh",
    );
    const refreshed = await service.searchWorkspaceFiles({
      rootPath: root,
      query: lateToken,
      refresh: true,
    });
    assert.deepEqual(
      refreshed.map((item) => item.relativePath),
      [`${lateToken}.txt`],
      "refresh 绕过未过期索引并就地重建该桶",
    );
    assert.equal(
      await countEntries({ rootPath: root }),
      before + 1,
      "refresh 之后桶里已有晚到文件",
    );

    // identity 是缓存桶键：同一 root 换 identity 得到独立桶，各自扫描。
    const identityToken = pickCoreAbsentFromRoot(root, "identity");
    await writeText(join(root, `${identityToken}.txt`), "x");
    assert.deepEqual(
      await service.searchWorkspaceFiles({
        rootPath: root,
        query: identityToken,
        workspaceIdentity: "ws-a",
      }),
      [
        {
          name: `${identityToken}.txt`,
          path: join(root, `${identityToken}.txt`),
          relativePath: `${identityToken}.txt`,
          type: "file",
        },
      ],
      "新 identity 桶重新扫描，能看到晚到文件",
    );
    assert.deepEqual(
      await service.searchWorkspaceFiles({ rootPath: root, query: identityToken }),
      [],
      "root 桶仍是旧快照，不被 identity 桶顶掉",
    );
    // listWorkspaceFilesLength/Range 不接 identity 与 refresh：它们恒读 root 桶。
    const rootLength = await service.listWorkspaceFilesLength({ rootPath: root });
    assert.equal(
      await service.listWorkspaceFilesLength({ rootPath: root, workspaceIdentity: "ws-a" }),
      rootLength,
      "只有 searchWorkspaceFiles 透传 identity，分页读接口按 root 取桶",
    );
  });

  it("搜索按名字/相对路径/绝对路径三档打分，limit 截断到 1000 上限，非法入参拒绝", async (t) => {
    const root = await makeWorkspace(t, "search-query");
    // 名字统一用「不会在根路径里子序列出现」的词构造：Windows 临时根路径字母充足，
    // 短词会跨段命中绝对路径档，让未命中项也进结果（见 pickCoreAbsentFromRoot）。
    const core = pickCoreAbsentFromRoot(root, "alpha");
    await makeDir(join(root, core));
    await writeText(join(root, core, `${core}-report.md`), "x");
    await writeText(join(root, `beta-${core}.txt`), "x");
    await writeText(join(root, "gamma.txt"), "x");
    const service = createFileService();

    const byName = await service.searchWorkspaceFiles({ rootPath: root, query: core });
    assert.deepEqual(
      byName.map((item) => item.relativePath),
      [core, `${core}/${core}-report.md`, `beta-${core}.txt`],
      "目录与文件同名命中按索引序返回，未命中项被剔除",
    );
    for (const item of byName) {
      assert.deepEqual(Object.keys(item).sort(), ["name", "path", "relativePath", "type"]);
      assert.equal(item.path, join(root, item.relativePath));
    }

    // 空白查询不是「无结果」：searchWorkspaceFiles 不传 requireQuery，返回全量候选，
    // 且文件整体排在目录之前。
    const empty = await service.searchWorkspaceFiles({ rootPath: root, query: "  " });
    assert.deepEqual(
      empty.map((item) => item.relativePath),
      [`${core}/${core}-report.md`, `beta-${core}.txt`, "gamma.txt", core],
    );

    const none = await service.searchWorkspaceFiles({ rootPath: root, query: "zzz-nope" });
    assert.deepEqual(none, []);

    // 绝对路径档单独覆盖：查询词只出现在**绝对路径前缀**里、不出现在任何名字或相对路径里。
    // 三段打分中 `fullMatch + 300` 才是绝对路径档，这里断言它确实能把候选带进结果，
    // 否则「换查询词」的修法会让这一档永远不被测到。
    const rootSegment = root.slice(root.length - 24).replace(/\\/gu, "/");
    const byAbsolutePath = await service.searchWorkspaceFiles({
      rootPath: root,
      query: rootSegment,
    });
    assert.ok(byAbsolutePath.length > 0, "只命中绝对路径前缀的查询词必须经绝对路径档返回结果");
    for (const item of byAbsolutePath) {
      assert.equal(
        item.name.toLowerCase().includes(rootSegment.toLowerCase()) ||
          item.relativePath.toLowerCase().includes(rootSegment.toLowerCase()),
        false,
        "该查询词不得出现在名字或相对路径里，命中只能来自绝对路径档",
      );
      assert.ok(item.path.toLowerCase().includes(rootSegment.toLowerCase()));
    }

    assert.deepEqual(
      await service.searchWorkspaceFiles({ rootPath: root, query: core, limit: 0 }),
      [],
      "limit=0 直接短路，不建立索引",
    );
    assert.equal(
      (await service.searchWorkspaceFiles({ rootPath: root, query: core, limit: 1 })).length,
      1,
    );
    // 上限是 1000：超出的请求被截断而不是报错。
    assert.equal(
      (await service.searchWorkspaceFiles({ rootPath: root, query: core, limit: 5000 })).length,
      byName.length,
    );
    await assert.rejects(
      () => service.searchWorkspaceFiles({ rootPath: root, query: core, limit: Number.NaN }),
      /^Error: Invalid workspace file search query or limit$/u,
    );
    await assert.rejects(
      () => service.searchWorkspaceFiles({ rootPath: root, query: 42, limit: 1 }),
      /^Error: Invalid workspace file search query or limit$/u,
    );
  });

  it("忽略文件模板带同步/默认两段标记，transform 只重写对应段，写回是原子替换", async (t) => {
    const root = await makeWorkspace(t, "search-ignore");
    await writeText(join(root, ".gitignore"), "dist/\n*.log\n");
    const service = createFileService();

    const template = await service.readWorkspaceFileSearchIgnore({ rootPath: root });
    assert.equal(template.source, "template", "文件不存在时回模板而不落盘");
    assert.equal(await pathExists(join(root, ".knorviaignore")), false);
    assert.ok(template.content.includes("dist/"), "模板同步 .gitignore 内容");
    assert.ok(template.content.includes("*.log"));
    assert.ok(template.content.includes("# ====="), "同步段标记存在");
    assert.ok(template.content.includes("# -----"), "默认段标记存在");

    await service.writeWorkspaceFileSearchIgnore({
      rootPath: root,
      content: `${template.content}custom-keep/\n`,
    });
    const written = await service.readWorkspaceFileSearchIgnore({ rootPath: root });
    assert.equal(written.source, "file");
    assert.ok(written.content.endsWith("custom-keep/\n"));
    assert.equal(
      (await readdir(root)).includes(".knorviaignore.tmp"),
      false,
      "写入走临时文件 + rename，不留中间产物",
    );

    // 改 .gitignore 后 sync 只重写同步段，自定义段原样保留。
    await writeText(join(root, ".gitignore"), "build/\n");
    const synced = await service.applyWorkspaceFileSearchIgnoreTransform({
      rootPath: root,
      transform: "sync-gitignore",
    });
    assert.ok(synced.content.includes("build/"));
    assert.ok(synced.content.includes("custom-keep/"), "自定义段不被同步覆盖");
    assert.equal(synced.content.includes("dist/"), false, "旧同步段被整体替换");

    // reset-defaults 恢复内置默认段，但同样保留自定义段。
    const reset = await service.applyWorkspaceFileSearchIgnoreTransform({
      rootPath: root,
      transform: "reset-defaults",
    });
    assert.ok(reset.content.includes("node_modules/"));
    assert.ok(reset.content.includes("custom-keep/"));
  });

  it("忽略文件损坏时降级为 .gitignore 或内置规则，索引不因坏规则整体失败", async (t) => {
    const root = await makeWorkspace(t, "search-ignore-broken");
    await makeDir(join(root, "keep"));
    await writeText(join(root, "keep", "f.txt"), "x");
    await makeDir(join(root, "node_modules"));
    await writeText(join(root, "node_modules", "x.js"), "x");
    const service = createFileService();
    await service.listWorkspaceFilesLength({ rootPath: root });
    assert.equal(await pathExists(join(root, ".knorviaignore")), true);

    // 坏规则（未闭合的字符类）不能让整个索引抛错。
    await writeText(join(root, ".knorviaignore"), "[\n");
    const length = await service.listWorkspaceFilesLength({ rootPath: root });
    assert.ok(length > 0);
    const packed = await service.listWorkspaceFilesRange({ rootPath: root, offset: 0, length });
    assert.equal(packed.includes("keep"), true, "坏规则降级后仍能看到正常条目");
  });
});

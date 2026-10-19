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
import { knorviaDataRoot, makeTempRoot, pathExists, readText, writeText } from "./helpers.mjs";

const { createFileService } = servicesNode;
const fileIO = await importDeep("file/fileServiceIO.ts");

const isPosix = process.platform !== "win32";

/** 独立的工作区根（与被测数据目录无关），用例结束先恢复权限再清理。 */
async function makeWorkspace(t, label) {
  const base = await mkdtemp(join(tmpdir(), `svc01-${label}-`));
  t.after(async () => {
    await restoreWritable(base);
    await rm(base, { recursive: true, force: true });
  });
  return base;
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

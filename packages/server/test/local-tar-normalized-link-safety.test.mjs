import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

let sequence = 0;
async function injectedArchiveOwner(state) {
  // 每个路径变体独占导入键，避免 data URL 模块缓存复用先前的夹具状态。
  const key = `knorvia.synthetic.archive.${++sequence}`;
  globalThis[Symbol.for(key)] = state;
  try {
    const output = await build({
      entryPoints: [
        process.env.KNORVIA_SYNTHETIC_OWNER_SOURCE ??
          fileURLToPath(new URL("../src/remote/localTarGz.ts", import.meta.url)),
      ],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      logLevel: "silent",
      plugins: [
        {
          name: "synthetic-archive-fs",
          setup(plugin) {
            plugin.onResolve({ filter: /^node:(?:fs\/promises|path)$/ }, ({ path }) => ({
              path,
              namespace: "synthetic",
            }));
            plugin.onLoad({ filter: /.*/, namespace: "synthetic" }, ({ path }) => ({
              contents:
                path === "node:path"
                  ? `const state = globalThis[Symbol.for(${JSON.stringify(key)})];
                 export const { posix, relative, resolve, isAbsolute, dirname, join, sep } = state.pathApi;`
                  : `
              const state = globalThis[Symbol.for(${JSON.stringify(key)})];
              export const lstat = async () => ({mtimeMs:0,isDirectory:()=>false,isFile:()=>false,isSymbolicLink:()=>true});
              export const readlink = async () => 'a/../C:escape';
              export const readFile = async () => state.archive;
              export const mkdir = async (...args) => state.calls.push(['mkdir',...args]);
              const forbidden = async () => { throw new Error('unexpected filesystem write'); };
              export const chmod = forbidden, writeFile = forbidden, symlink = forbidden, unlink = forbidden, readdir = forbidden;
            `,
              loader: "js",
            }));
          },
        },
      ],
    });
    return await import(
      `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
    );
  } finally {
    delete globalThis[Symbol.for(key)];
  }
}

// 归档成员保持 POSIX；物理路径单独覆盖宿主分隔符与 Windows 盘符。
const pathVariants = [
  ["native", path, path.resolve("synthetic")],
  ["POSIX", path.posix, "/synthetic"],
  ["Win32", path.win32, "C:\\synthetic"],
];
for (const [variant, pathApi, fixtureRoot] of pathVariants) {
  test(
    "normalized drive-like link targets are rejected before archive publication or link replacement" +
      (variant === "native" ? "" : ` (${variant} paths)`),
    async () => {
      const header = Buffer.alloc(512);
      header.write("nested/link", 0, 100);
      header.write("0000777", 100, 7);
      header.write("00000000000", 124, 11);
      header.write("2", 156, 1);
      header.write("a/../C:escape", 157, 100);
      const state = {
        archive: gzipSync(Buffer.concat([header, Buffer.alloc(1024)])),
        calls: [],
        pathApi,
      };
      const owner = await injectedArchiveOwner(state);
      const archivePath = pathApi.join(fixtureRoot, "archive.tar.gz");
      const targetDir = pathApi.join(fixtureRoot, "target");
      const unsafe = /unsafe tar symlink target: a\/\.\.\/C:escape/;
      await assert.rejects(
        owner.createTarGzArchive(archivePath, [
          { sourcePath: pathApi.join(fixtureRoot, "source-link"), archivePath: "nested/link" },
        ]),
        unsafe,
      );
      assert.deepEqual(state.calls, []);
      await assert.rejects(owner.extractTarGzArchive(archivePath, targetDir), unsafe);
      assert.deepEqual(state.calls, [["mkdir", targetDir, { recursive: true }]]);
    },
  );
}

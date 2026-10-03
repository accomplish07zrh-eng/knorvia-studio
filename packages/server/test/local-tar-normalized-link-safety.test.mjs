import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

async function injectedArchiveOwner() {
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
          plugin.onResolve({ filter: /^node:fs\/promises$/ }, ({ path }) => ({
            path,
            namespace: "synthetic",
          }));
          plugin.onLoad({ filter: /.*/, namespace: "synthetic" }, () => ({
            contents: `
              const state = globalThis[Symbol.for('knorvia.synthetic.archive')];
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
  return import(
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
  );
}

test("normalized drive-like link targets are rejected before archive publication or link replacement", async () => {
  const header = Buffer.alloc(512);
  header.write("nested/link", 0, 100);
  header.write("0000777", 100, 7);
  header.write("00000000000", 124, 11);
  header.write("2", 156, 1);
  header.write("a/../C:escape", 157, 100);
  const state = { archive: gzipSync(Buffer.concat([header, Buffer.alloc(1024)])), calls: [] };
  const key = Symbol.for("knorvia.synthetic.archive");
  globalThis[key] = state;
  try {
    const owner = await injectedArchiveOwner();
    const unsafe = /unsafe tar symlink target: a\/\.\.\/C:escape/;
    await assert.rejects(
      owner.createTarGzArchive("/synthetic/archive.tar.gz", [
        { sourcePath: "/synthetic/source-link", archivePath: "nested/link" },
      ]),
      unsafe,
    );
    assert.deepEqual(state.calls, []);
    await assert.rejects(
      owner.extractTarGzArchive("/synthetic/archive.tar.gz", "/synthetic/target"),
      unsafe,
    );
    assert.deepEqual(state.calls, [["mkdir", "/synthetic/target", { recursive: true }]]);
  } finally {
    delete globalThis[key];
  }
});

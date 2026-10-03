import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

let sequence = 0;
async function load(name, state) {
  const key = `knorvia.native.final.remote.${++sequence}`;
  globalThis[Symbol.for(key)] = state;
  try {
    const result = await build({
      entryPoints: [fileURLToPath(new URL(`../src/remote/${name}.ts`, import.meta.url))],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      logLevel: "silent",
      plugins: [
        {
          name: "native-final-remote-ports",
          setup(plugin) {
            plugin.onResolve(
              { filter: /^(?:node:fs\/promises|@knorvia\/server\/remote\/posixShell\.js)$/ },
              ({ path }) => ({ path, namespace: "native-final-port" }),
            );
            plugin.onLoad({ filter: /.*/, namespace: "native-final-port" }, ({ path }) => ({
              loader: "js",
              contents:
                path === "node:fs/promises"
                  ? `const state=globalThis[Symbol.for(${JSON.stringify(key)})];
                     export const readFile=async()=>state.archive;
                     export const mkdir=async(...args)=>state.calls.push(['mkdir',...args]);
                     export const writeFile=async(path,data)=>state.calls.push(['write',path,data.toString()]);
                     export const chmod=async(...args)=>state.calls.push(['chmod',...args]);
                     const forbidden=async()=>{throw new Error('unexpected filesystem operation');};
                     export const lstat=forbidden,readlink=forbidden,symlink=forbidden,unlink=forbidden,readdir=forbidden;`
                  : "export const quotePosixShellArg=value=>JSON.stringify(value);",
            }));
          },
        },
      ],
    });
    return await import(
      `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
    );
  } finally {
    delete globalThis[Symbol.for(key)];
  }
}

test("tar full headers preserve NUL and ASCII regular flags while short headers stay unread", async () => {
  const blocks = [];
  for (const [name, flag, content] of [
    ["nul.txt", 0, "N"],
    ["ascii.txt", "0".charCodeAt(0), "A"],
  ]) {
    const header = Buffer.alloc(512);
    header.write(name);
    header.write("0000600", 100, 7);
    header.write("00000000001", 124, 11);
    header[156] = flag;
    blocks.push(header, Buffer.from(content), Buffer.alloc(511));
  }
  const state = { archive: gzipSync(Buffer.concat(blocks)), calls: [] };
  const owner = await load("localTarGz", state);
  await owner.extractTarGzArchive("/synthetic/archive", "/synthetic/target");
  assert.deepEqual(state.calls, [
    ["mkdir", "/synthetic/target", { recursive: true }],
    ["mkdir", "/synthetic/target", { recursive: true }],
    ["write", "/synthetic/target/nul.txt", "N"],
    ["chmod", "/synthetic/target/nul.txt", 0o600],
    ["mkdir", "/synthetic/target", { recursive: true }],
    ["write", "/synthetic/target/ascii.txt", "A"],
    ["chmod", "/synthetic/target/ascii.txt", 0o600],
  ]);
  state.archive = gzipSync(Buffer.alloc(511, 1));
  state.calls.length = 0;
  await owner.extractTarGzArchive("/synthetic/short", "/synthetic/target");
  assert.deepEqual(state.calls, [["mkdir", "/synthetic/target", { recursive: true }]]);
});

test("WSL gateway parsing keeps source priority, IPv4 octet limits, IPv6 and invalid exclusion", async () => {
  const { parseWslHostGatewayOutput: parse } = await load("wslProxy");
  for (const address of ["10.0.0.1", "192.168.1.1", "172.16.0.1", "172.31.1.1", "169.254.1.1"]) {
    assert.equal(parse(`resolv=${address}`), address);
    assert.equal(parse(address), address);
  }
  for (const address of ["172.15.0.1", "172.32.0.1", "8.8.8.8", "127.0.0.1", "172", "172.x.0.1"]) {
    assert.equal(parse(`resolv=${address}`), null);
  }
  assert.equal(parse("resolv=8.8.8.8 route=203.0.113.1 resolv=10.0.0.2"), "203.0.113.1");
  assert.equal(parse("resolv=[fe80::1]"), "fe80::1");
  assert.equal(parse("resolv=fd00::1"), "fd00::1");
  assert.equal(parse("resolv=[::1] route=127.0.0.1 resolv=1.1.1.1"), null);
  assert.equal(parse("resolv=2001:db8::1 route=[2001:db8::2]"), "2001:db8::2");
  assert.equal(parse("route= resolv="), null);
});

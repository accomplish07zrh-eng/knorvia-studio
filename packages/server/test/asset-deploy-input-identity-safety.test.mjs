import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

async function injectedDecisionOwner() {
  const sources = {
    "@knorvia/shared": "export const KNORVIA_VERSION = 'synthetic-app';",
    "@knorvia/server/remote/deployShared.js":
      "export const REMOTE_BASE = '~/.knorvia-studio/server';",
    "@knorvia/server/remote/remoteAssetCache.js": `
      export const resolveRemoteAssetComponentCacheVersion = value => value;
      export const fetchRemoteAssetManifestFromCdn = async () => null;
      export const selectRemoteAssetManifestComponents = () => [];
    `,
    "@knorvia/server/remote/remoteAssetInstaller.js": "export class LocalUploadAssetInstaller {}",
    "@knorvia/server/remote/remoteAssetLiveIdentity.js": `
      export const readRemoteAssetComponentMeta = async () => null;
      export const writeRemoteAssetComponentMeta = async (backend, meta) => {
        backend.syntheticMetadataWrites.push(meta);
      };
    `,
  };
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL("../src/remote/remoteAssetDeployDecision.ts", import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        name: "synthetic-ports-only",
        setup(plugin) {
          plugin.onResolve({ filter: /^@knorvia\// }, ({ path }) => {
            assert.ok(Object.hasOwn(sources, path), `unexpected real dependency: ${path}`);
            return { path, namespace: "synthetic" };
          });
          plugin.onLoad({ filter: /.*/, namespace: "synthetic" }, ({ path }) => ({
            contents: sources[path],
            loader: "js",
          }));
        },
      },
    ],
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  );
}

test("runtime deployment retains admitted installer and platform across async existence check", async () => {
  const owner = await injectedDecisionOwner();
  const admittedWrites = [];
  const replacementWrites = [];
  const admittedInstaller = {
    mode: "remote-download",
    async installFile(value) {
      admittedWrites.push(value);
    },
  };
  const replacementInstaller = {
    mode: "remote-download",
    async installFile(value) {
      replacementWrites.push(value);
    },
  };
  let completeExists;
  const backend = {
    syntheticMetadataWrites: [],
    exists() {
      return new Promise((resolve) => {
        completeExists = resolve;
      });
    },
  };
  const options = {
    platformArch: "synthetic-original",
    installer: admittedInstaller,
    expectedVersion: "synthetic-version",
  };
  const pending = owner.deployNodeRuntime(backend, options, { log() {}, logWarn() {} });
  assert.equal(typeof completeExists, "function");
  options.platformArch = "synthetic-replacement";
  options.installer = replacementInstaller;
  completeExists(false);
  await pending;
  assert.deepEqual(admittedWrites, [
    {
      componentId: "node-runtime",
      sourceRelativePath: "node/synthetic-original/node",
      remotePath: "~/.knorvia-studio/server/node",
      executable: true,
    },
  ]);
  assert.deepEqual(replacementWrites, []);
  assert.deepEqual(backend.syntheticMetadataWrites, [
    {
      id: "node-runtime",
      version: "synthetic-version",
      platformArch: "synthetic-original",
    },
  ]);
});

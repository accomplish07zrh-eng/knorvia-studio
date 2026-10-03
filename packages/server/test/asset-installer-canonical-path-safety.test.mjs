import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function injectedInstallerOwner() {
  const forbidden = "() => { throw new Error('unexpected non-synthetic material operation'); }";
  const sources = {
    "@knorvia/shared": "export {};",
    "@knorvia/server/remote/deployShared.js": `
      export const REMOTE_BASE = '~/.knorvia-studio/server';
      export const waitForClose = async stream => { if (!stream.synthetic) throw new Error('real stream'); };
      export const buildRemoteMoveCommand = (from,to) => 'synthetic-move ' + JSON.stringify(from) + ' ' + JSON.stringify(to);
      export const buildRemoteExecutableReplaceCommand = (from,to) => 'synthetic-replace ' + JSON.stringify(from) + ' ' + JSON.stringify(to);
      export const createRemoteAssetPlaceholderError = ${forbidden};
      export const fileExists = ${forbidden};
    `,
    "@knorvia/server/remote/posixShell.js": `
      export const quotePosixPathArg = value => JSON.stringify(value);
      export const quotePosixShellArg = value => JSON.stringify(value);
    `,
    "@knorvia/server/remote/localTarGz.js": `export const createTarGzArchive = ${forbidden};`,
    "@knorvia/server/remote/remoteAssetCache.js": `
      export const selectRemoteAssetManifestComponents = (manifest, ids) => manifest.components.filter(component => component.id === ids[0].trim());
      export const usesRemoteAssetContentAddressedCacheIdentity = () => true;
      export const resolveRemoteAssetComponentCacheVersion = value => value;
      export const ensureRemoteReleaseDirFromCdn = ${forbidden};
      export const buildRemoteAssetManifestFileCandidates = ${forbidden};
      export const createRemoteAssetManifestRequestSignal = ${forbidden};
      export const parseRemoteAssetManifestFromResponse = ${forbidden};
    `,
    "@knorvia/server/remote/remoteAssetCdn.js": `
      export const buildComponentArtifactUrlCandidates = ${forbidden};
      export const buildReleaseAssetUrlCandidates = ${forbidden};
      export const buildReleaseBaseCandidates = ${forbidden};
      export const resolveRemoteCdnBaseUrls = ${forbidden};
    `,
    "@knorvia/server/remote/remoteAssetNetwork.js": `export const resolveRemoteAssetFetch = ${forbidden};`,
  };
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/remote/remoteAssetInstaller.ts", import.meta.url))],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        name: "synthetic-material-ports-only",
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

test("cached material path uses selected canonical component and Unicode-safe platform", async () => {
  const { RemoteDownloadAssetInstaller } = await injectedInstallerOwner();
  const probes = [];
  const commands = [];
  const backend = {
    async exists(path) {
      probes.push(path);
      return true;
    },
    async exec(command) {
      commands.push(command);
      return { synthetic: true };
    },
  };
  const manifest = {
    schemaVersion: 1,
    appVersion: "synthetic-app",
    platformArch: "synthetic-🧭-arch",
    components: [
      {
        id: "node-runtime",
        version: "synthetic-version",
        sha256: "synthetic-sha",
        artifactPath: "synthetic/artifact.tar.gz",
        mount: "node/synthetic",
      },
    ],
  };
  const owner = new RemoteDownloadAssetInstaller(
    backend,
    { version: "synthetic-app", platformArch: "synthetic-🧭-arch" },
    { download: "curl", tar: "tar", sha256: "sha256sum" },
    { log() {}, logWarn() {} },
    Promise.resolve({ manifest, releaseBaseCandidatesForComponents: [] }),
  );
  await owner.installFile({
    componentId: " node-runtime ",
    sourceRelativePath: "node/synthetic/bin/node",
    remotePath: "/synthetic-runtime/node",
    executable: true,
  });
  const componentDir =
    "~/.knorvia-studio/server/asset-cache/components/synthetic-_-arch/node-runtime/synthetic-sha";
  assert.deepEqual(probes, [`${componentDir}/.ready`]);
  assert.equal(commands.length, 1);
  assert.ok(commands[0].includes(`cp -f ${JSON.stringify(`${componentDir}/bin/node`)} `));
});

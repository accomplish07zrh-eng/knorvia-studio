import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function injectedDeploymentOwner() {
  const common = "const state = globalThis[Symbol.for('knorvia.synthetic.deploy')];";
  const sources = {
    "@knorvia/shared": `export const KNORVIA_VERSION='synthetic-version'; export const formatLogPrefix=()=> '[synthetic-deploy]'; export const normalizeRemoteResourcePackageSelection=()=> [];`,
    "./agentDeploy.js": "export const deployKnorviaAgentRuntime=async()=> {};",
    "@knorvia/server/remote/agentOfficialPluginAssets.js":
      "export const REMOTE_AGENT_OFFICIAL_PLUGIN_REQUIRED_RELATIVE_PATHS=[];",
    "@knorvia/server/remote/remoteAssetDeployDecision.js": `${common} export const createRemoteComponentVersionResolver=()=>async()=>null; export const deployNodeRuntime=async()=>state.writes.push('node'); export const deployNodePtyPrebuilds=async()=>state.writes.push('pty'); export const logDeployRequired=()=>{};`,
    "@knorvia/server/remote/deployShared.js":
      "export const REMOTE_BASE='/synthetic/install'; export const fileExists=async()=>true; export const formatOptionalValue=()=>'<synthetic>'; export const formatOptionalValues=()=>'<synthetic>';",
    "@knorvia/server/remote/posixShell.js":
      "export const quotePosixPathArg=value=>JSON.stringify(value);",
    "@knorvia/server/remote/serverBundleDeployCheck.js": `${common} export const checkServerBundleRequiredMarkers=async()=>state.decision;`,
    "@knorvia/server/remote/runtimeToolDeploy.js": "export const deployRuntimeTools=async()=>{};",
    "@knorvia/server/remote/remoteAssetCache.js": `${common} export const selectRemoteAssetManifestComponents=()=>[{sha256:'synthetic-sha'}]; export const ensureRemoteReleaseDirFromCdn=async()=>{throw new Error('unexpected materialization')};`,
    "@knorvia/server/remote/remoteAssetInstaller.js": `${common} export class LocalUploadAssetInstaller { mode='local-upload'; async installFile(){state.writes.push('server')} } export class RemoteDownloadAssetInstaller{} export const fetchRemoteDownloadManifest=async()=>{throw new Error('unexpected network')};`,
    "@knorvia/server/remote/remoteAssetLiveIdentity.js": `${common} export const createFreshRemoteAssetManifestRefResolver=()=>async()=>{state.events.push('manifest');return {manifest:{}}}; export const checkRemoteAssetComponentIdentity=async()=>({shouldDeploy:false}); export const hasRemoteAssetComponentRefreshPending=async()=>{state.decision.shouldDeploy=false;return false}; export const markRemoteAssetComponentRefreshPending=async()=>state.writes.push('refresh'); export const writeRemoteAssetComponentMeta=async()=>state.writes.push('identity');`,
    "@knorvia/server/remote/remoteAssetPreflight.js":
      "export const detectRemoteAssetTools=async()=>{throw new Error('unexpected command probe')};",
    "@knorvia/server/remote/remotePlatformSupport.js":
      "export const assertSupportedRemoteEnvironment=()=>{};",
    "@knorvia/server/remote/remoteDeployLock.js": `${common} export const acquireRemoteDeployLock=async()=>{state.events.push('lock');return {release:async()=>state.events.push('release')}};`,
  };
  const output = await build({
    entryPoints: [
      process.env.KNORVIA_SYNTHETIC_OWNER_SOURCE ??
        fileURLToPath(new URL("../src/remote/deploy.ts", import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        name: "synthetic-deploy-ports",
        setup(plugin) {
          plugin.onResolve({ filter: /^(?:@knorvia\/|\.\/)/ }, ({ path }) => {
            assert.ok(Object.hasOwn(sources, path), `unexpected dependency: ${path}`);
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
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
  );
}

test("refresh lookup precedes server-write admission and manifest snapshot follows owned lock", async () => {
  const state = {
    decision: { shouldDeploy: true, reason: "synthetic marker" },
    writes: [],
    events: [],
  };
  const key = Symbol.for("knorvia.synthetic.deploy");
  globalThis[key] = state;
  try {
    const owner = await injectedDeploymentOwner();
    const backend = {
      exists: async () => true,
      async exec() {
        const stdout = new EventEmitter();
        return {
          stdout,
          onClose(callback) {
            queueMicrotask(() => {
              stdout.emit("data", Buffer.from("synthetic-version"));
              callback(0);
            });
            return { dispose() {} };
          },
        };
      },
    };
    assert.equal(
      await owner.deployServer(backend, { platform: "synthetic", arch: "synthetic" }),
      false,
    );
    assert.deepEqual(state.writes, []);
    assert.deepEqual(state.events, ["lock", "manifest", "release"]);
  } finally {
    delete globalThis[key];
  }
});

// Synthetic records and virtual IO only; no live authority, environment, settings or hooks.
import assert from "node:assert/strict";
import { posix } from "node:path";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { z } from "zod";

const root = process.argv[2];
assert.ok(root, "Supply source root.");
export const plain = (value) => JSON.parse(JSON.stringify(value));
export const syntheticError = (code) => Object.assign(new Error("synthetic " + code), { code });
const ports = {
  zod: "export const z=fixture.z;",
  "node:path":
    "export const resolve=(...a)=>fixture.path.resolve(...a);export const dirname=(...a)=>fixture.path.dirname(...a);export const basename=(...a)=>fixture.path.basename(...a);export const join=(...a)=>fixture.path.join(...a);",
  "node:fs":
    "export const existsSync=(...a)=>fixture.existsSync(...a);export const statSync=(...a)=>fixture.statSync(...a);",
  "node:fs/promises":
    "export const access=(...a)=>fixture.access(...a);export const stat=(...a)=>fixture.stat(...a);export const readFile=(...a)=>fixture.readFile(...a);export const mkdir=(...a)=>fixture.mkdir(...a);export const open=(...a)=>fixture.open(...a);export const rename=(...a)=>fixture.rename(...a);export const rm=(...a)=>fixture.rm(...a);",
  "./workspace-hook-config.js": "export const workspaceHooksConfigSchema=fixture.hookSchema;",
  "./workspace-hook-digest.js":
    "export const createWorkspaceHookDeclarationDigest=(...a)=>fixture.digest(...a);",
  "./remoteAssetInstallMode.js": 'export const REMOTE_ASSET_INSTALL_MODES=["auto","manual"];',
  "./remoteResourcePackages.js": "export const isKnownRemoteResourcePackageId=()=>false;",
  "./wslUserValidation.js": "export const wslUserSchema=fixture.z.string();",
  "./endpoint.js":
    'export const normalizeKnorviaEndpointOrigin=v=>{if(v==="https://synthetic.example/path"||v==="https://synthetic.example")return "https://synthetic.example";throw new Error("synthetic endpoint rejection");};',
  "./releaseUpdate.js": "export const validReleaseInfoUrl=()=>false;",
  "./browser-use/command-metadata.js":
    "export const DEFAULT_EMBEDDED_BROWSER_VIEWPORT_PREFERENCE={width:800,height:600};export const embeddedBrowserViewportPreferenceSchema=fixture.z.object({width:fixture.z.number().positive(),height:fixture.z.number().positive()});",
  "./provider-family-connection-selection.js":
    "export const providerFamilyConnectionSelectionSettingsSchema=fixture.z.record(fixture.z.string(),fixture.z.unknown());",
};

export async function load(name, supplied = {}) {
  const fixture = supplied;
  fixture.z = z;
  fixture.path ??= { ...posix, resolve: (...args) => posix.resolve("/synthetic", ...args) };
  const output = await build({
    entryPoints: [posix.resolve(root, name + ".ts")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    plugins: [
      {
        name: "synthetic-authority-ports",
        setup(builder) {
          builder.onResolve({ filter: /(?:\.js$|^node:|^zod$)/ }, (args) =>
            ports[args.path] ? { path: args.path, namespace: "synthetic" } : undefined,
          );
          builder.onLoad({ filter: /.*/, namespace: "synthetic" }, (args) => ({
            contents: ports[args.path],
          }));
        },
      },
    ],
  });
  const module = { exports: {} };
  runInNewContext(output.outputFiles[0].text, {
    module,
    exports: module.exports,
    fixture,
    URL,
    Error,
    Date: { now: () => 100 },
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    process: { pid: 47, env: Object.freeze({}) },
  });
  return module.exports;
}

import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function injectedConnectionOwner() {
  const sources = {
    "@knorvia/rpc":
      "export class SocketProtocol { dispose() {} } export class ChannelClient { dispose() {} }",
    "@knorvia/client": "export class RemoteServiceAccess {}",
    "@knorvia/shared": `
      export const SERVICE_AUTHORITY_MODE_ENV = 'SYNTHETIC_SERVICE_AUTHORITY';
      export const KNORVIA_APP_VERSION_ENV = 'SYNTHETIC_APP_VERSION';
      export const KNORVIA_DESKTOP_CONTEXT_PROMPT_ENABLED_ENV = 'SYNTHETIC_CONTEXT';
      export const KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV = 'SYNTHETIC_WORKFLOW';
      export const KNORVIA_REMOTE_HTTP_PROXY_ENV_KEY = 'SYNTHETIC_HTTP_PROXY';
      export const KNORVIA_REMOTE_NO_PROXY_ENV_KEY = 'SYNTHETIC_NO_PROXY';
      export const KNORVIA_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY = 'SYNTHETIC_NETWORK_AUTHORITY';
      export const formatLogPrefix = () => '[synthetic-connect]';
    `,
    "@knorvia/server/remote/remotePlatformSupport.js":
      "export const assertSupportedRemoteEnvironment = () => {};",
    "./deploy.js":
      "export const deployServer = () => { throw new Error('unexpected deployment'); };",
    "./handshake.js":
      "export const performHandshake = async () => ({hello:{version:'synthetic'}, remaining:Buffer.alloc(0)});",
    "./stdio-socket.js": "export const wrapStdioStream = () => ({dispose(){}});",
    "./posixShell.js": "export const quotePosixShellArg = value => JSON.stringify(value);",
    "./wslProxy.js": "export const formatWslProxyForLog = () => '<synthetic-proxy>';",
  };
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/remote/connect.ts", import.meta.url))],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        name: "synthetic-connect-ports-only",
        setup(plugin) {
          plugin.onResolve({ filter: /^(?:@knorvia\/|\.\/)/ }, ({ path }) => {
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

test("launch proxy assignments retain the existing authoritative admission guard", async () => {
  const { connectRemote } = await injectedConnectionOwner();
  const commands = [];
  const backend = {
    async detect() {
      return { platform: "synthetic-platform", arch: "synthetic-arch" };
    },
    async resolveRuntimeProxy(value) {
      return value;
    },
    async exec(command) {
      commands.push(command);
      return {
        stdin: new EventEmitter(),
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        onClose() {
          return { dispose() {} };
        },
      };
    },
    dispose() {},
  };
  for (const authoritative of [false, true]) {
    const connection = await connectRemote(backend, {
      skipDeploy: true,
      remoteRuntimeNetwork: {
        authoritative,
        httpProxy: "http://synthetic.invalid:8080",
        noProxy: "synthetic.invalid",
      },
    });
    connection.dispose();
  }
  assert.equal(commands.length, 2);
  for (const key of [
    "SYNTHETIC_NETWORK_AUTHORITY=",
    "SYNTHETIC_HTTP_PROXY=",
    "SYNTHETIC_NO_PROXY=",
  ]) {
    assert.equal(commands[0].includes(key), false, `unadmitted assignment: ${key}`);
    assert.equal(commands[1].includes(key), true, `missing admitted assignment: ${key}`);
  }
});

// Real unchanged consumers, bundled against the selected public shared entry.
// New tests under retained root Apache-2.0; no production caller/state changes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { remoteModuleRoot } from "./remote-identity-contract-cases.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const publicEntry = fileURLToPath(new URL("index.js", remoteModuleRoot));
const cliWorkspaceModule =
  (process.env.KNORVIA_REMOTE_TEST_TARGET ?? "src") === "src"
    ? "src/protocol/workspace.ts"
    : "dist/protocol/workspace.js";
const bundled = await build({
  stdin: {
    contents: `
    export {resolveWorkspaceRefFromId} from './apps/cli/packages/bootstrap/${cliWorkspaceModule}';
    export {buildRemoteTarget} from './packages/ui/src/lib/remoteConnectionWizard.ts';
    export {createWindowRemoteConnectionRegistry} from './packages/desktop/src/host/windowRemoteConnectionRegistry.ts';
    export {resolveResourceTelemetryEnvironmentKey} from './packages/desktop/src/host/hostResourceTelemetryEnvironment.ts';
    export {buildRemoteEnvironmentKey,remoteTargetSchema} from '@knorvia/shared';
  `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  treeShaking: true,
  plugins: [
    {
      name: "selected-shared-public-entry",
      setup(builder) {
        builder.onResolve({ filter: /^@knorvia\/shared$/ }, () => ({
          path: publicEntry.replace(
            /index\.js$/,
            remoteModuleRoot.pathname.endsWith("/src/") ? "index.ts" : "index.js",
          ),
        }));
      },
    },
  ],
});
type Consumers = {
  resolveWorkspaceRefFromId: typeof import("../../../apps/cli/packages/bootstrap/src/protocol/workspace.js").resolveWorkspaceRefFromId;
  buildRemoteTarget: typeof import("../../ui/src/lib/remoteConnectionWizard.js").buildRemoteTarget;
  createWindowRemoteConnectionRegistry: typeof import("../../desktop/src/host/windowRemoteConnectionRegistry.js").createWindowRemoteConnectionRegistry;
  resolveResourceTelemetryEnvironmentKey: typeof import("../../desktop/src/host/hostResourceTelemetryEnvironment.js").resolveResourceTelemetryEnvironmentKey;
  buildRemoteEnvironmentKey: typeof import("../src/remoteEnvironmentKey.js").buildRemoteEnvironmentKey;
  remoteTargetSchema: typeof import("../src/validation.js").remoteTargetSchema;
};
const consumers = (await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0]!.text).toString("base64")}`
)) as Consumers;

test("real CLI workspace ref consumer preserves identity/path and fails closed", () => {
  for (const identity of [
    "remote:ssh:fixture.invalid:22:user:/fixture:path",
    "remote:wsl:d:/fixture",
    "remote:wsl:d:user:/fixture",
    "remote:docker:c:/fixture",
  ]) {
    const ref = consumers.resolveWorkspaceRefFromId(identity);
    assert.equal(ref.workspaceIdentity, identity);
    assert.equal(ref.workspaceKey, identity);
    assert.equal(ref.workspacePath, identity.slice(identity.indexOf(":/fixture") + 1));
  }
  assert.deepEqual(consumers.resolveWorkspaceRefFromId("C:/fixture"), {
    workspaceIdentity: undefined,
    workspaceKey: "C:/fixture",
    workspacePath: "C:/fixture",
  });
  const invalid = "remote:wsl:d:user:relative";
  assert.throws(() => consumers.resolveWorkspaceRefFromId(invalid), {
    name: "Error",
    message: `Invalid remote workspace identity: ${invalid}`,
  });
});
test("real UI WSL wizard and public remote schema preserve blank/default and error behavior", () => {
  const intl = { formatMessage: ({ id }: { id: string }) => id };
  const defaults = {
    kind: "wsl" as const,
    host: "",
    port: "",
    username: "",
    sshAuthMethod: "password" as const,
    password: "",
    privateKeyPath: "",
    privateKeyPassphrase: "",
    wslDistro: "FixtureDistro",
    dockerContainer: "",
  };
  for (const [user, valid] of [
    ["", true],
    [" ", true],
    [" fixture-user ", true],
    ["中文", true],
    ["😀".repeat(32), true],
    ["bad:user", false],
    ["bad/user", false],
    ["bad\u0000user", false],
    ["x".repeat(65), false],
  ] as const) {
    const result = consumers.buildRemoteTarget(intl, { ...defaults, wslUser: user });
    if (valid) {
      const trimmed = user.trim();
      assert.deepEqual(result, {
        target: { kind: "wsl", distro: "FixtureDistro", ...(trimmed ? { user: trimmed } : {}) },
      });
      assert.deepEqual(consumers.remoteTargetSchema.parse(result.target), result.target);
    } else assert.deepEqual(result, { errorMessage: "wsl.validation.invalidUser" });
  }
});
test("real telemetry consumer hashes the unchanged canonical SSH environment key", () => {
  const target = {
    kind: "ssh" as const,
    host: " FIXTURE.INVALID ",
    username: " user ",
    privateKeyPath: "c:\\fixture\\keys\\..\\id",
  };
  const environment = 'ssh:["ssh:v1","fixture.invalid",22,"user","private-key","C:/fixture/id"]';
  assert.equal(consumers.buildRemoteEnvironmentKey(target), environment);
  assert.equal(
    consumers.resolveResourceTelemetryEnvironmentKey(target),
    createHash("sha256").update(environment).digest("hex"),
  );
});
test("real Host registry reuses equivalent SSH paths and isolates distinct authorities", async () => {
  let connects = 0,
    disposals = 0,
    ids = 0;
  const registry = consumers.createWindowRemoteConnectionRegistry({
    createId: () => `fixture-session-${++ids}`,
    connect: async () => ({
      services: { connection: ++connects },
      dispose: () => {
        disposals++;
      },
    }),
  });
  try {
    const base = {
      kind: "ssh" as const,
      host: " FIXTURE.INVALID ",
      username: " user ",
      privateKeyPath: "c:\\fixture\\keys\\..\\id",
    };
    await registry.connect({ requestId: "fixture-1", target: base, remoteAssets: {} });
    await registry.connect({
      requestId: "fixture-2",
      target: {
        ...base,
        host: "fixture.invalid",
        username: "user",
        port: 22,
        privateKeyPath: "C:/fixture/id",
      },
      remoteAssets: {},
    });
    assert.equal(connects, 1);
    assert.deepEqual(registry.getStats(), { connectionCount: 1, logicalSessionCount: 2 });
    await registry.connect({
      requestId: "fixture-3",
      target: { ...base, username: "other-user" },
      remoteAssets: {},
    });
    await registry.connect({
      requestId: "fixture-4",
      target: { ...base, privateKeyPath: "C:/fixture/other-id" },
      remoteAssets: {},
    });
    assert.equal(connects, 3);
    assert.deepEqual(registry.getStats(), { connectionCount: 3, logicalSessionCount: 4 });
  } finally {
    await registry.dispose();
  }
  assert.equal(disposals, 3);
});

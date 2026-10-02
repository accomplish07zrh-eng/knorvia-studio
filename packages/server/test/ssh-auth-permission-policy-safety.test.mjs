import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const safetyKey = Symbol.for("knorvia.synthetic.ssh-auth-permission");
async function loadOwner(name) {
  const base = process.env.KNORVIA_SYNTHETIC_OWNER_DIR;
  const source = base
    ? base + "/" + name
    : fileURLToPath(new URL("../src/remote/" + name, import.meta.url));
  const ports = {
    "@knorvia/shared": "export const KNORVIA_AGENT_PROVIDER='synthetic-provider';",
    "@knorvia/server/remote/deployShared.js": "export const waitForClose=stream=>stream.wait();",
    "@knorvia/server/remote/posixShell.js": `export const quotePosixPathArg=value=>globalThis[Symbol.for('knorvia.synthetic.ssh-auth-permission')].quote(value);`,
  };
  const result = await build({
    entryPoints: [source],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    banner: { js: "const process={env:{SSH_AUTH_SOCK:'synthetic-agent-socket'}};" },
    plugins: [
      {
        name: "synthetic-auth-permission-ports",
        setup(plugin) {
          plugin.onResolve({ filter: /^@knorvia\// }, ({ path }) => {
            assert.ok(Object.hasOwn(ports, path), "unexpected real dependency: " + path);
            return { path, namespace: "synthetic" };
          });
          plugin.onLoad({ filter: /.*/, namespace: "synthetic" }, ({ path }) => ({
            contents: ports[path],
            loader: "js",
          }));
        },
      },
    ],
  });
  return import(
    "data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64")
  );
}

test("caller-selected auth keeps implicit agent disabled for password and preserves explicit inputs", async () => {
  const { buildSSHConnectConfig } = await loadOwner("sshAuth.ts");
  const input = { host: "synthetic.invalid", username: "synthetic-user" };
  const key = Buffer.from("synthetic-non-key");
  const withPassword = buildSSHConnectConfig({
    ...input,
    password: "synthetic-non-credential",
    privateKey: key,
  });
  assert.equal(withPassword.agent, undefined);
  assert.equal(withPassword.tryKeyboard, true);
  assert.equal(withPassword.privateKey, key);
  assert.equal(buildSSHConnectConfig({ ...input, password: "" }).agent, "synthetic-agent-socket");
  assert.equal(buildSSHConnectConfig({ ...input, password: "" }).tryKeyboard, false);
  assert.equal(
    buildSSHConnectConfig({ ...input, password: "synthetic", agent: "explicit-synthetic-agent" })
      .agent,
    "explicit-synthetic-agent",
  );
  assert.equal(buildSSHConnectConfig({ ...input, agent: "", port: 0 }).agent, "");
  assert.equal(buildSSHConnectConfig({ ...input, port: 0 }).port, 0);
  assert.equal(withPassword.readyTimeout, 60000);
  assert.equal(withPassword.keepaliveInterval, 15000);
  assert.equal(withPassword.keepaliveCountMax, 3);
});

test("keyboard callback responds only from caller input and keeps empty-input gates", async () => {
  const { createKeyboardInteractiveResponder } = await loadOwner("sshAuth.ts");
  const prompts = [
    { prompt: "synthetic challenge", echo: false },
    { prompt: "synthetic second", echo: true },
  ];
  const captured = [];
  createKeyboardInteractiveResponder()("", "", "", prompts, (value) => captured.push(value));
  createKeyboardInteractiveResponder("synthetic")("", "", "", [], (value) => captured.push(value));
  createKeyboardInteractiveResponder("synthetic")("", "", "", prompts, (value) =>
    captured.push(value),
  );
  assert.deepEqual(captured, [[], [], ["synthetic", "synthetic"]]);
});

test("auth normalization retains denial messages, passphrase branches and unrelated Error identity", async () => {
  const { normalizeSSHConnectError } = await loadOwner("sshAuth.ts");
  assert.equal(
    normalizeSSHConnectError({ level: "client-authentication" }).message,
    "SSH 认证失败：请检查用户名、密码或私钥配置",
  );
  assert.match(normalizeSSHConnectError({ level: "client-timeout" }).message, /60 秒/);
  assert.equal(
    normalizeSSHConnectError(
      new Error("Encrypted OpenSSH private key detected, but no passphrase given"),
    ).message,
    "SSH 私钥需要口令：检测到加密私钥，但当前未提供私钥口令",
  );
  assert.equal(
    normalizeSSHConnectError(new Error("bad passphrase")).message,
    "SSH 私钥口令错误：无法解密私钥，请检查私钥口令是否正确",
  );
  const original = new Error("synthetic unrelated");
  assert.equal(normalizeSSHConnectError(original), original);
  assert.equal(normalizeSSHConnectError(" ").message, " ");
  assert.equal(normalizeSSHConnectError({ message: "synthetic" }).message, "SSH 连接失败");
});

test("permission repair addresses only its quoted directory with retained conditional mode", async () => {
  const events = [];
  globalThis[safetyKey] = {
    quote: (path) => {
      events.push(["quote", path]);
      return "SYNTHETIC_QUOTED_TARGET";
    },
  };
  try {
    const { repairLegacyRemoteOfficialPluginDirectoryPermissions: repair } = await loadOwner(
      "agentOfficialPluginPermissionRepair.ts",
    );
    const target = "~/synthetic plugins/o'wn;$(synthetic)";
    const params = {
      remoteOfficialPluginDir: target,
      loggers: { logWarn: (value) => events.push(["warn", value]) },
      backend: {
        async exec(command) {
          events.push(["exec", command]);
          return {
            async wait() {
              events.push(["wait"]);
            },
          };
        },
      },
    };
    assert.equal(await repair(params), true);
    assert.deepEqual(
      events.map((row) => row[0]),
      ["warn", "quote", "exec", "wait"],
    );
    assert.equal(events[1][1], target);
    assert.equal(
      events[2][1],
      "if [ -d SYNTHETIC_QUOTED_TARGET ]; then command chmod -R u+rwX SYNTHETIC_QUOTED_TARGET; fi",
    );
  } finally {
    delete globalThis[safetyKey];
  }
});

test("repair completion failure is recoverable while invocation failure retains identity", async () => {
  globalThis[safetyKey] = { quote: () => "'synthetic-target'" };
  try {
    const { repairLegacyRemoteOfficialPluginDirectoryPermissions: repair } = await loadOwner(
      "agentOfficialPluginPermissionRepair.ts",
    );
    const warnings = [];
    const waitError = new Error("synthetic completion denial");
    const params = {
      remoteOfficialPluginDir: "/synthetic/owned/packages",
      loggers: { logWarn: (value) => warnings.push(value) },
      backend: {
        async exec() {
          return {
            wait: async () => {
              throw waitError;
            },
          };
        },
      },
    };
    assert.equal(await repair(params), false);
    assert.equal(warnings.length, 2);
    assert.match(warnings[1], /synthetic completion denial/);
    const invocationError = new Error("synthetic invocation denial");
    params.backend.exec = async () => {
      throw invocationError;
    };
    await assert.rejects(repair(params), (error) => error === invocationError);
    assert.equal(warnings.length, 3);
  } finally {
    delete globalThis[safetyKey];
  }
});

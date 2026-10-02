import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const key = Symbol.for("knorvia.synthetic.ssh-backend");
let moduleSerial = 0;
const quote = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
function makeState(options = {}) {
  const state = {
    clients: [],
    commands: [],
    readPaths: [],
    sftpTargets: [],
    cleanup: [],
    logs: [],
    connects: 0,
    sftpCalls: 0,
    endCalls: 0,
    autoReady: true,
    ...options,
  };
  state.console = Object.fromEntries(
    ["log", "warn", "error", "debug"].map((level) => [
      level,
      (...values) => state.logs.push([level, ...values]),
    ]),
  );
  state.newRead = (local) => {
    state.readPaths.push(local);
    const read = new EventEmitter();
    read.destroy = () => state.cleanup.push("read.destroy");
    read.unpipe = () => state.cleanup.push("read.unpipe");
    read.pipe = (destination) => {
      queueMicrotask(() => {
        if (state.abortOnPipe) {
          state.abortOnPipe();
          return;
        }
        if (state.localReadError) {
          read.emit("error", state.localReadError);
          return;
        }
        read.emit("data", Buffer.from("sample"));
        if (destination.transport === "sftp") {
          if (state.sftpWriteError) destination.emit("error", state.sftpWriteError);
          else destination.emit("close");
        } else destination.complete();
      });
      return destination;
    };
    return read;
  };
  state.newClient = () => {
    const client = new EventEmitter();
    state.clients.push(client);
    client.connect = (config) => {
      state.connects++;
      state.lastConfig = config;
      if (state.autoReady) queueMicrotask(() => client.emit("ready"));
    };
    client.end = () => {
      state.endCalls++;
      client.emit("end");
      client.emit("close");
    };
    client.exec = (wrapped, callback) => {
      const command = JSON.parse(wrapped.slice("SYNTHETIC_SH ".length));
      state.commands.push(command);
      const channel = new EventEmitter();
      channel.stderr = new EventEmitter();
      channel.stdin = new EventEmitter();
      channel.stdin.destroy = (error) => state.cleanup.push(["stdin.destroy", error]);
      channel.stdin.end = () => state.cleanup.push("stdin.end");
      channel.stdin.complete = () => {
        channel.emit("exit", 0);
        channel.emit("close", 0);
      };
      callback(null, channel);
      if (!command.includes(" && cat > ")) {
        queueMicrotask(() => {
          channel.emit("exit", 0);
          const output =
            command === 'printf %s "$HOME"'
              ? "/synthetic/home"
              : command === "uname -s"
                ? "Linux"
                : command === "uname -m"
                  ? "x86_64"
                  : "";
          channel.emit("data", Buffer.from(output));
          channel.emit("close", 0);
        });
      }
    };
    client.sftp = (callback) => {
      state.sftpCalls++;
      if (state.sftpSessionError) {
        callback(state.sftpSessionError);
        return;
      }
      callback(null, {
        createWriteStream(target) {
          state.sftpTargets.push(target);
          const write = new EventEmitter();
          write.transport = "sftp";
          write.destroy = () => state.cleanup.push("write.destroy");
          return write;
        },
        end() {
          state.cleanup.push("sftp.end");
        },
      });
    };
    return client;
  };
  return state;
}

async function loadBackend(state) {
  globalThis[key] = state;
  const common = "const state=globalThis[Symbol.for('knorvia.synthetic.ssh-backend')];";
  const ports = {
    ssh2: common + "export class Client {constructor(){return state.newClient();}}",
    "node:fs": common + "export const createReadStream=path=>state.newRead(path);",
    "@knorvia/shared": common + "export const resolveKnorviaRuntimeEnv=()=> 'production';",
    "@knorvia/rpc": `export class Emitter {listeners=new Set();event=listener=>{this.listeners.add(listener);return {dispose:()=>this.listeners.delete(listener)}};fire=value=>{for(const listener of this.listeners)listener(value)};dispose=()=>this.listeners.clear();}`,
    "@knorvia/server/remote/detectEnv.js":
      "export const normalizeRemotePlatform=value=>value.trim().toLowerCase();export const normalizeRemoteArch=value=>value.trim();export const resolveRemotePlatform=value=>value;",
    "@knorvia/server/remote/closeEvent.js": `export const createCloseEventController=()=>{const listeners=new Set();let ended=false,value;return {fire(code){ended=true;value=code;for(const listener of listeners)listener(code)},event(listener){if(ended)listener(value);else listeners.add(listener);return {dispose:()=>listeners.delete(listener)}}}};`,
    "@knorvia/server/remote/posixShell.js":
      common +
      `export const quotePosixShellArg=value=>state.quote(value);export const buildPosixShellExecCommand=value=>'SYNTHETIC_SH '+JSON.stringify(value);export const resolvePosixHomePath=(path,home)=>path==='~'?home:path.startsWith('~/')?home.replace(/\\/$/,'')+'/'+path.slice(2):path;`,
    "@knorvia/server/remote/sshAuth.js":
      "export const buildSSHConnectConfig=input=>({...input});export const createKeyboardInteractiveResponder=()=>()=>{};export const normalizeSSHConnectError=error=>error;",
    "@knorvia/server/remote/sshUploadProgress.js":
      common +
      "export const readLocalFileSize=async()=>6;export const formatSSHUploadLabel=value=>value.split('/').at(-1);export const formatSSHUploadError=error=>error.message;export const createSSHUploadProgressReporter=()=>()=>{};",
  };
  state.quote = quote;
  const source =
    process.env.KNORVIA_SYNTHETIC_OWNER_SOURCE ??
    fileURLToPath(new URL("../src/remote/ssh-backend.ts", import.meta.url));
  const result = await build({
    entryPoints: [source],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    banner: {
      js: "const process={env:{}};const console=globalThis[Symbol.for('knorvia.synthetic.ssh-backend')].console;",
    },
    plugins: [
      {
        name: "synthetic-ssh-only",
        setup(plugin) {
          plugin.onResolve({ filter: /^(?:ssh2$|node:fs$|@knorvia\/)/ }, ({ path }) => {
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
  const code = result.outputFiles[0].text + "\n// synthetic-instance-" + moduleSerial++;
  return (await import("data:text/javascript;base64," + Buffer.from(code).toString("base64")))
    .SSHBackend;
}
const backendOptions = { host: "synthetic.invalid", username: "synthetic-user" };

test("authorized fake exec opens once; disposed backend denies reuse and absorbs late client errors", async () => {
  const state = makeState();
  const Backend = await loadBackend(state);
  const backend = new Backend(backendOptions);
  await backend.exec("synthetic admitted command");
  backend.dispose();
  backend.dispose();
  await assert.rejects(backend.exec("synthetic denied command"), /SSH backend 已释放/);
  await assert.rejects(
    backend.upload("/synthetic/local", "/synthetic/remote"),
    /SSH backend 已释放/,
  );
  state.clients[0].emit("error", new Error("synthetic late error"));
  assert.equal(state.connects, 1);
  assert.equal(state.endCalls, 1);
  assert.equal(state.commands.length, 1);
  assert.deepEqual(state.readPaths, []);
});

test("late ready after retirement cannot create a channel or revive connection options", async () => {
  const state = makeState({ autoReady: false });
  const Backend = await loadBackend(state);
  const backend = new Backend(backendOptions);
  const pending = backend.exec("synthetic pending command");
  backend.dispose();
  state.clients[0].emit("ready");
  await assert.rejects(pending, /SSH backend 已释放/);
  assert.equal(state.connects, 1);
  assert.equal(state.endCalls, 2);
  assert.deepEqual(state.commands, []);
});

test("pre-aborted upload denies all work; admitted SFTP keeps exactly the resolved owned target", async () => {
  const state = makeState();
  const Backend = await loadBackend(state);
  const backend = new Backend(backendOptions);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    backend.upload("/synthetic/local", "/synthetic/denied", { signal: aborted.signal }),
    (error) => error.name === "AbortError",
  );
  assert.equal(state.connects, 0);
  assert.deepEqual(state.commands, []);
  assert.deepEqual(state.readPaths, []);
  const progress = [];
  const target = "~/owned/o'wn;$(synthetic).dat";
  await backend.upload("/synthetic/local", target, { onProgress: (value) => progress.push(value) });
  assert.deepEqual(state.sftpTargets, ["/synthetic/home/owned/o'wn;$(synthetic).dat"]);
  assert.deepEqual(progress, [
    { uploadedBytes: 6, totalBytes: 6 },
    { uploadedBytes: 6, totalBytes: 6 },
  ]);
  assert.equal(
    state.commands.some((command) => command.includes("cat >")),
    false,
  );
  backend.dispose();
});

test("only SFTP capability failures permit sticky exec fallback to the same quoted owned target", async () => {
  for (const kind of ["session", "write"]) {
    const failure = new Error("synthetic SFTP denial");
    const state = makeState(
      kind === "session" ? { sftpSessionError: failure } : { sftpWriteError: failure },
    );
    const Backend = await loadBackend(state);
    const backend = new Backend(backendOptions);
    const progress = [];
    const target = "/synthetic/owned/o'wn;$(synthetic).dat";
    await backend.upload("/synthetic/local", target, {
      onProgress: (value) => progress.push(value),
    });
    const expected = "mkdir -p " + quote(posix.dirname(target)) + " && cat > " + quote(target);
    assert.deepEqual(
      state.commands.filter((command) => command.includes("cat >")),
      [expected],
    );
    assert.equal(failure.uploadFailureKind, kind === "session" ? "sftp-session" : "sftp-write");
    if (kind === "write")
      assert.deepEqual(state.cleanup.slice(0, 4), [
        "read.unpipe",
        "read.destroy",
        "write.destroy",
        "sftp.end",
      ]);
    const second = [];
    await backend.upload("/synthetic/second", target, {
      onProgress: (value) => second.push(value),
    });
    assert.equal(state.sftpCalls, 1);
    assert.equal(state.commands.filter((command) => command === expected).length, 2);
    assert.equal(progress.at(-1).uploadedBytes, 6);
    assert.equal(second.at(-1).uploadedBytes, 6);
    assert.equal(
      state.logs.some((row) => row[1].includes("completed via exec pipe")),
      true,
    );
    backend.dispose();
  }
});

test("local read failure preserves Error identity and cannot authorize exec fallback", async () => {
  const failure = new Error("synthetic local read denial");
  const state = makeState({ localReadError: failure });
  const Backend = await loadBackend(state);
  const backend = new Backend(backendOptions);
  await assert.rejects(
    backend.upload("/synthetic/local", "/synthetic/owned/file"),
    (error) => error === failure,
  );
  assert.equal(failure.uploadFailureKind, "local-read");
  assert.equal(
    state.commands.some((command) => command.includes("cat >")),
    false,
  );
  assert.deepEqual(state.cleanup, ["read.unpipe", "read.destroy", "write.destroy", "sftp.end"]);
  backend.dispose();
});

test("active SFTP abort tears down only owned streams and cannot authorize fallback", async () => {
  const controller = new AbortController();
  const state = makeState({ abortOnPipe: () => controller.abort() });
  const Backend = await loadBackend(state);
  const backend = new Backend(backendOptions);
  const progress = [];
  await assert.rejects(
    backend.upload("/synthetic/local", "/synthetic/owned/file", {
      signal: controller.signal,
      onProgress: (value) => progress.push(value),
    }),
    (error) => error.name === "AbortError" && error.uploadFailureKind === "aborted",
  );
  assert.deepEqual(progress, []);
  assert.equal(
    state.commands.some((command) => command.includes("cat >")),
    false,
  );
  assert.deepEqual(state.cleanup, ["read.unpipe", "read.destroy", "write.destroy", "sftp.end"]);
  backend.dispose();
  delete globalThis[key];
});

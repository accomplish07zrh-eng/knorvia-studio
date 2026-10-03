import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Used only by the deferred tests. Every listener, filesystem operation and timer
// is a supplied port; no native socket, pipe, endpoint or user directory is opened.
let fixtureNumber = 0;

export function ports() {
  const journal = [];
  const deadlines = new Map();
  const state = {
    journal,
    deadlines,
    requests: [],
    responses: [],
    uuid: () => "fixture-generated-id",
    setTimeout(callback, ms) {
      const timer = {
        callback,
        ms,
        unrefed: false,
        unref() {
          this.unrefed = true;
        },
      };
      deadlines.set(timer, timer);
      return timer;
    },
    clearTimeout(timer) {
      journal.push(["clear-timeout", timer]);
      deadlines.delete(timer);
    },
    async rm(...args) {
      journal.push(["rm", ...args]);
    },
    async mkdir(...args) {
      journal.push(["mkdir", ...args]);
    },
    async chmod(...args) {
      journal.push(["chmod", ...args]);
    },
    parseResponse(value) {
      state.responses.push(value);
      return value;
    },
    parseRequest(value) {
      state.requests.push(value);
      return value?.command === "invalid" ? { success: false } : { success: true, data: value };
    },
    connect(endpoint) {
      journal.push(["connect", endpoint]);
      return state.client;
    },
    createServer(accept) {
      const server = new EventEmitter();
      Object.assign(server, {
        accept,
        closeCalls: 0,
        listen(endpoint, ready) {
          journal.push(["listen", endpoint]);
          ready();
          return this;
        },
        close(done) {
          this.closeCalls++;
          journal.push(["server-close"]);
          this.closed = done;
        },
      });
      state.server = server;
      return server;
    },
  };
  state.client = socket(journal);
  return state;
}

export function socket(journal = []) {
  const port = new EventEmitter();
  return Object.assign(port, {
    writes: [],
    writeCallbacks: [],
    destroys: 0,
    ends: 0,
    destroyed: false,
    writableEnded: false,
    setEncoding(value) {
      journal.push(["encoding", value]);
      return this;
    },
    write(value, callback) {
      if (this.writeFailure) throw this.writeFailure;
      this.writes.push(value);
      journal.push(["write", value]);
      if (callback) this.writeCallbacks.push(callback);
      return true;
    },
    destroy() {
      this.destroys++;
      this.destroyed = true;
      journal.push(["destroy"]);
      return this;
    },
    end() {
      this.ends++;
      this.writableEnded = true;
      journal.push(["end"]);
      return this;
    },
  });
}

export async function loadOwner(name, state = ports()) {
  const key = `knorvia.native.control.deferred.${++fixtureNumber}`;
  const root = fileURLToPath(new URL("../src/ipc/", import.meta.url));
  globalThis[Symbol.for(key)] = state;
  const binding = `const supplied = globalThis[Symbol.for(${JSON.stringify(key)})];`;
  const replacements = {
    "node:net": `${binding} export const connect = (...args) => supplied.connect(...args); export const createServer = (...args) => supplied.createServer(...args);`,
    "node:crypto": `${binding} export const randomUUID = () => supplied.uuid();`,
    "node:fs/promises": `${binding} export const rm = (...args) => supplied.rm(...args); export const mkdir = (...args) => supplied.mkdir(...args); export const chmod = (...args) => supplied.chmod(...args);`,
    "../contracts.js": `${binding}
      export const MAX_CONTROL_FRAME_BYTES = 65536;
      export const controlRequestSchema = {safeParse: value => supplied.parseRequest(value)};
      export const controlResponseSchema = {parse: value => supplied.parseResponse(value)};`,
  };
  try {
    const output = await build({
      stdin: {
        contents: `export * from ${JSON.stringify(`${root}${name}.ts`)}; export {ControlRequestError as FixtureControlRequestError} from ${JSON.stringify(`${root}controlError.ts`)};`,
        loader: "ts",
        resolveDir: root,
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      logLevel: "silent",
      banner: {
        js: `const {setTimeout, clearTimeout} = globalThis[Symbol.for(${JSON.stringify(key)})];`,
      },
      plugins: [
        {
          name: "deferred-control-ports",
          setup(plugin) {
            plugin.onResolve({ filter: /^(?:node:|\.\.\/contracts\.js$)/ }, ({ path }) => {
              assert.ok(Object.hasOwn(replacements, path), `unexpected external port ${path}`);
              return { path, namespace: "control-port" };
            });
            plugin.onLoad({ filter: /.*/, namespace: "control-port" }, ({ path }) => ({
              contents: replacements[path],
              loader: "js",
            }));
          },
        },
      ],
    });
    return await import(
      `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
    );
  } finally {
    delete globalThis[Symbol.for(key)];
  }
}

export async function flush() {
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

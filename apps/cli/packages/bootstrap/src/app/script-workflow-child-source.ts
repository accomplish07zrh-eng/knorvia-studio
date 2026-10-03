// 2026-10-03: source-exposed behavior-contract implementation of IPC/context ownership.
// Origin: zai-org/ZCode 872ad960de7ec172591f7e1952f7849229f94521,
// apps/zcode-cli/packages/bootstrap/src/app/script-workflow-child-source.ts.
// Existing Apache-2.0 attribution/history retained; see docs/lane-cli-20261003.md.
export const SCRIPT_WORKFLOW_CHILD_SOURCE = String.raw`
import { AsyncLocalStorage } from "node:async_hooks";
import { createInterface } from "node:readline";
import { Console } from "node:console";

const nodeProcess = process;
const payload = JSON.parse(Buffer.from(nodeProcess.argv.at(-1), "base64url").toString("utf8"));
const stderrConsole = new Console({ stdout: nodeProcess.stderr, stderr: nodeProcess.stderr });
globalThis.console = stderrConsole;

class ParentChannel {
  sequence = 0;
  waiters = new Map();
  reader = createInterface({ input: nodeProcess.stdin });

  constructor() {
    this.reader.on("line", (line) => this.receive(line));
  }

  receive(line) {
    if (!line.trim()) return;
    let response;
    try {
      response = JSON.parse(line);
    } catch (error) {
      stderrConsole.error("Invalid workflow runner response", error);
      return;
    }
    if (response.kind !== "response") return;
    const receiver = this.waiters.get(response.id);
    if (receiver === undefined) return;
    this.waiters.delete(response.id);
    if (response.ok) receiver.resolve(response.value);
    else receiver.reject(new Error(response.error || "Workflow runner request failed"));
  }

  send(message) {
    nodeProcess.stdout.write(JSON.stringify(message) + "\n");
  }

  request(type, value) {
    this.sequence += 1;
    const id = "req_" + this.sequence;
    this.send({ id, kind: "request", payload: value, type });
    return new Promise((resolve, reject) => {
      this.waiters.set(id, { reject, resolve });
    });
  }

  event(type, value) {
    this.send({ kind: "event", type, payload: value });
  }

  close() {
    this.reader.close();
  }
}

class CallPaths {
  storage = new AsyncLocalStorage();
  root = { nextAgent: 0, nextBlock: 0, path: "root" };

  current() {
    return this.storage.getStore() || this.root;
  }

  agent() {
    const scope = this.current();
    const ordinal = scope.nextAgent++;
    return scope.path + "/agent" + ordinal;
  }

  block(kind) {
    const parent = this.current();
    return { parent, label: kind + parent.nextBlock++ };
  }

  within(parent, label, run) {
    return this.storage.run(
      { nextAgent: 0, nextBlock: 0, path: parent.path + "/" + label },
      run,
    );
  }

  runRoot(run) {
    return this.storage.run(this.root, run);
  }
}

const channel = new ParentChannel();
const paths = new CallPaths();
const state = { phase: undefined, spentTokens: 0 };

function fanOut(kind, entries, invoke) {
  if (!Array.isArray(entries)) {
    throw new Error(kind + "() expects an array of " + (kind === "parallel" ? "thunks" : "items"));
  }
  const { parent, label } = paths.block(kind);
  return Promise.all(entries.map((entry, index) =>
    paths.within(parent, label + "/item" + index, async () => invoke(entry, index))
      .catch(() => null),
  ));
}

globalThis.agent = async function agent(prompt, opts) {
  const callPath = paths.agent();
  const result = await channel.request("agent", {
    callPath,
    opts,
    phase: opts?.phase || state.phase,
    prompt,
  });
  state.spentTokens += Number(result?.stats?.tokens?.total || 0);
  return result?.value;
};

globalThis.parallel = async function parallel(thunks) {
  return fanOut("parallel", thunks, (thunk) => thunk());
};

globalThis.pipeline = async function pipeline(items, ...stages) {
  return fanOut("pipeline", items, async (item, index) => {
    let previous = item;
    for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
      const stage = stages[stageIndex];
      previous = await paths.within(paths.current(), "stage" + stageIndex,
        async () => stage(previous, item, index),
      );
    }
    return previous;
  });
};

globalThis.log = function log(message) {
  channel.event("log", { message: String(message), phase: state.phase });
};

globalThis.phase = function phase(title) {
  state.phase = String(title);
  channel.event("phase", { title: state.phase });
};

globalThis.workflow = async function workflow(nameOrRef, args) {
  return channel.request("workflow", { args, nameOrRef });
};

globalThis.args = payload.args;
globalThis.budget = {
  total: payload.budgetTotal ?? null,
  spent() {
    return state.spentTokens;
  },
  remaining() {
    if (payload.budgetTotal === undefined || payload.budgetTotal === null) return Infinity;
    return Math.max(0, payload.budgetTotal - state.spentTokens);
  },
};

const NativeDate = Date;
class WorkflowDate extends NativeDate {
  constructor(...args) {
    if (args.length === 0) throw new Error("argless new Date() is disabled in workflows");
    super(...args);
  }
  static now() {
    throw new Error("Date.now() is disabled in workflows");
  }
  static parse(value) {
    return NativeDate.parse(value);
  }
  static UTC(...args) {
    return NativeDate.UTC(...args);
  }
}
globalThis.Date = WorkflowDate;
Math.random = function random() {
  throw new Error("Math.random() is disabled in workflows");
};

Object.defineProperty(globalThis, "process", {
  configurable: false,
  value: undefined,
  writable: false,
});

const parameters = ["agent", "parallel", "pipeline", "phase", "log", "args", "budget", "workflow"];
try {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction(...parameters, payload.scriptBody);
  const value = await paths.runRoot(async () => run(...parameters.map((name) => globalThis[name])));
  channel.send({ kind: "complete", ok: true, value });
} catch (error) {
  channel.send({
    error: error instanceof Error ? error.message : String(error),
    kind: "complete",
    ok: false,
    stack: error instanceof Error ? error.stack : undefined,
  });
}
channel.close();
`;

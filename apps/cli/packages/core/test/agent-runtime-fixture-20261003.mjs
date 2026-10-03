import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
export const hash = (b) => createHash("sha256").update(b).digest("hex");
export const plain = (v) => JSON.parse(JSON.stringify(v));
export function fixture() {
  const calls = [],
    warnings = [],
    trace = { traceId: "owned-trace" },
    controller = {},
    marker = (name) => ({ name });
  const config = {
    workingDirectory: "/owned/workspace",
    modelSelection: { providerId: "owned", modelId: "owned-model" },
    modelContextBudgetStrategy: "legacy",
    toolConcurrency: { maxConcurrency: 2 },
    memory: marker("shared-memory"),
    agentName: "owned-agent",
    taskType: "interactive",
  };
  const deps = {
    eventStore: marker("events"),
    sessionStore: marker("store"),
    modelFactory() {
      assert.fail("no model creation");
    },
    traceContext: trace,
    runtimeTaskRegistry: {
      setActiveBranchGeneration(value) {
        assert.equal(this, deps.runtimeTaskRegistry);
        calls.push("branch:" + value);
        controller.onBranch?.();
      },
    },
    subagentPort: marker("subagent"),
    toolRegistry: marker("registry"),
    contextBuilder: marker("builder"),
  };
  const logger = {
    child(fields) {
      assert.equal(this, logger);
      assert.deepEqual(plain(fields), { traceId: "owned-trace", module: "core.runtime" });
      calls.push("logger");
      return child;
    },
  };
  const child = {
    warn(message, fields) {
      assert.equal(this, child);
      warnings.push([message, plain(fields)]);
      controller.onWarn?.();
    },
  };
  deps.logger = logger;
  const record = (name) => {
    calls.push(name);
    if (controller.failAt === name) throw controller.failure;
  };
  class PermissionService {
    constructor(value) {
      assert.equal(value, defaults);
      record("default-permission");
    }
  }
  class ToolScheduler {
    constructor(value) {
      record("default-scheduler");
      assert.equal(value.maxConcurrency, config.toolConcurrency.maxConcurrency);
    }
  }
  class EventReducer {
    constructor() {
      record("reducer");
    }
  }
  class MessageHistoryImpl {
    constructor() {
      record("history");
    }
  }
  class InMemoryRuntimeTaskRegistry {
    constructor() {
      record("default-task-registry");
    }
    setActiveBranchGeneration(value) {
      record("default-branch:" + value);
    }
  }
  class RuntimeTelemetryFacade {
    constructor(options) {
      record("telemetry");
      controller.telemetry = options;
    }
  }
  const defaults = marker("default-permission-config"),
    executor = marker("executor"),
    hookRunner = marker("hook-runner"),
    startup = Promise.resolve(marker("startup"));
  const modules = {
    "@knorvia/shared": {
      DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY: "preflight-v1",
      resolveExecutionState(input) {
        assert.equal(input, config);
        record("state");
        return { mode: "build", planEnabled: false };
      },
    },
    "runtime/deps.js": {
      PermissionService,
      ToolScheduler,
      EventReducer,
      MessageHistoryImpl,
      defaultPermissionConfig: defaults,
      createDenyPermissionBroker() {
        record("default-deny");
        return marker("deny-broker");
      },
      createRootTraceContext(input) {
        record("default-trace");
        assert.equal(input.sessionId, "owned-session");
        return trace;
      },
      traceContextToLogContext(value) {
        assert.equal(value, trace);
        return { traceId: value.traceId };
      },
      createToolRegistry() {
        record("default-registry");
        return marker("default-registry");
      },
    },
    "runtime/methods/index.js": {
      installAgentRuntimeMethods(C) {
        Object.assign(C.prototype, {
          createDefaultSubagentPort(input) {
            assert.equal(input, deps);
            record("default-subagent");
            return marker("default-subagent");
          },
          initializeMessageHistoryFromContext(builder, value) {
            assert.equal(this.contextInitialized, false);
            assert.equal(builder, deps.contextBuilder);
            assert.equal(value, trace);
            record("context");
          },
          startMcpStartup(value) {
            assert.equal(value, trace);
            controller.runtime = this;
            record("startup");
            return startup;
          },
        });
      },
    },
    "runtime/command-queue.js": {
      createRuntimeCommandQueue() {
        record("queue");
        return marker("queue");
      },
    },
    "runtime/helpers/runtime-tools.js": {
      initializeRuntimeTooling(owner, input, id) {
        assert.equal(input, deps);
        assert.equal(id, "owned-session");
        assert.equal(owner.contextBuilder, null);
        assert.equal(
          owner.runtimeTaskRegistry,
          deps.runtimeTaskRegistry ?? owner.runtimeTaskRegistry,
        );
        assert.equal(owner.registry, deps.toolRegistry ?? owner.registry);
        controller.runtime = owner;
        record("tooling");
        return { executor, hookRunner };
      },
    },
    "runtime-task/registry.js": { InMemoryRuntimeTaskRegistry },
    "subagent/persistent-memory.js": {
      projectPersistentAgentMemoryTools(input) {
        assert.notEqual(input, config);
        assert.equal(input.memory, config.memory);
        assert.equal(input.modelContextBudgetStrategy, "preflight-v1");
        record("memory-policy");
        return input;
      },
    },
    "telemetry/runtime-telemetry.js": { RuntimeTelemetryFacade },
    "tool/handlers/node-repl.js": {
      disposeNodeReplSession(id) {
        assert.equal(id, "owned-session");
        record("repl");
      },
    },
    "runtime/model-selection.js": {
      cloneModelSelection(input) {
        assert.equal(input, config.modelSelection);
        record("clone-selection");
        return { ...input };
      },
    },
  };
  return {
    calls,
    warnings,
    config,
    deps,
    controller,
    trace,
    modules,
    executor,
    hookRunner,
    startup,
  };
}
export async function load(mode, f) {
  const oracleBytes = fs.readFileSync(
    path.join(repo, "apps/cli/packages/core/test/agent-runtime-baseline-20261003.json"),
  );
  assert.equal(
    hash(oracleBytes),
    "9f984bbe8006567a20894bfac07830c3cc04481bd6e872c9d6385518ef6e9a66",
  );
  const old = JSON.parse(oracleBytes);
  for (const row of Object.values(old.files))
    for (const k of ["source", "compiled", "declaration"])
      assert.equal(hash(row[k]), row[k + "Sha256"]);
  let row = old.files["agent-runtime.ts"];
  if (mode === "current") {
    const bytes = fs.readFileSync(
      path.join(repo, "docs/evidence/knorvia-agent-runtime-current-20261003.json"),
    );
    assert.equal(hash(bytes), "CURRENT_PIN");
    const m = JSON.parse(bytes);
    let selected;
    for (const [name, r] of Object.entries(m.files)) {
      const material = {};
      for (const kind of ["source", "compiled", "declaration"]) {
        const b = fs.readFileSync(path.join(repo, r[kind].path));
        assert.equal(hash(b), r[kind].sha256);
        material[kind] = b.toString();
      }
      if (name === "agent-runtime.ts") selected = material;
    }
    row = selected;
  } else assert.equal(mode, "baseline");
  class OwnedDate extends Date {
    constructor() {
      super(0);
    }
  }
  const context = vm.createContext({ Error, Map, Set, Promise, String, Date: OwnedDate });
  const modules = new Map(
    Object.entries(f.modules).map(([id, values]) => [
      id,
      new vm.SyntheticModule(
        Object.keys(values),
        function () {
          for (const [k, v] of Object.entries(values)) this.setExport(k, v);
        },
        { context, identifier: id },
      ),
    ]),
  );
  const entry = new vm.SourceTextModule(row.compiled, {
    context,
    identifier: "runtime/agent-runtime.js",
  });
  await entry.link((specifier, parent) => {
    const id = specifier.startsWith(".")
      ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier))
      : specifier;
    assert.ok(modules.has(id), id);
    return modules.get(id);
  });
  await entry.evaluate();
  return entry.namespace.AgentRuntime;
}

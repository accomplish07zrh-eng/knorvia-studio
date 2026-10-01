import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AgentInputJsonSchema,
  AgentInputSchema,
  AgentOutputSchema,
  CoreErrorType,
} from "@knorvia/contracts";
import {
  directCases,
  getterCases,
  descriptionCases,
  formatCases,
  completed,
  backgrounded,
  validInput,
} from "./agent-tool-cases.js";
import {
  clock,
  declaration,
  describe,
  entryFor,
  fixture,
  module,
  observe,
  formatObservation,
  publicDeclaration,
  projectionMatrix,
} from "./agent-tool-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./agent-tool-contract.json", import.meta.url), "utf8"),
);

test("Agent/Task source and strict emitted exports and declaration bytes remain frozen", () => {
  assert.deepEqual(Object.keys(module), frozen.exports);
  assert.equal(publicDeclaration, frozen.publicDeclaration);
  assert.deepEqual(
    [declaration(module.agentToolEntry), declaration(module.taskToolEntry)],
    frozen.declarations,
  );
});
test("factory and alias sharing retain public schema, metadata and permission identities", () => {
  const agent = module.agentToolEntry,
    task = module.taskToolEntry;
  for (const entry of [agent, task, module.createAgentToolEntry(), module.createTaskToolEntry()]) {
    assert.equal(entry.handler, agent.handler);
    assert.equal(entry.formatModelContent, agent.formatModelContent);
    assert.equal(entry.inputSchema, AgentInputJsonSchema);
    assert.equal(entry.runtimeInputSchema, AgentInputSchema);
    assert.equal(entry.runtimeOutputSchema, AgentOutputSchema);
    for (const field of [
      "outputSchema",
      "permission",
      "resultBudget",
      "timeout",
      "cancellation",
      "trace",
    ])
      assert.equal(entry[field], agent[field]);
    assert.equal(entry.metadata.readOnly, true);
    assert.equal(entry.metadata.needsApproval, false);
    assert.equal(entry.permission.permission, "subagent");
  }
  assert.equal(task.metadata.providerVisible, false);
  assert.notEqual(task.metadata, agent.metadata);
  assert.notEqual(module.createAgentToolEntry().metadata, agent.metadata);
  assert.notEqual(module.createTaskToolEntry().metadata, task.metadata);
  assert.equal(agent.timeout.kind, "none");
  assert.equal(agent.metadata.maxOutputBytes, 120000);
});
test("dynamic workflow/search/profile descriptions and factory errors are frozen", () => {
  assert.deepEqual(descriptionCases.map(describe), frozen.descriptions);
  assert.equal(
    module.createAgentToolEntry().metadata.description,
    module.agentToolEntry.metadata.description,
  );
  assert.equal(
    module.createTaskToolEntry().metadata.description,
    module.taskToolEntry.metadata.description,
  );
});
test("frozen direct input, missing/malformed/thrown/rejected ports and raw results", async () => {
  await clock(async () => {
    for (const [index, c] of directCases.entries())
      assert.deepEqual(await observe(c), frozen.direct[index].observed, c.label);
  });
});
test("frozen context/launch getter read order and failures preserve conditional reads", async () => {
  await clock(async () => {
    for (const [index, fault] of getterCases.entries())
      assert.deepEqual(
        await observe(
          {
            label: "getters",
            model: { syntheticModel: true },
            override: { syntheticOverride: true },
          },
          fault,
        ),
        frozen.getters[index].observed,
        JSON.stringify(fault),
      );
  });
});
test("formatter preserves exact foreground/background prose and malformed serialization failures", () => {
  assert.deepEqual(formatCases.map(formatObservation), frozen.formatting);
});
test("512 source/emitted projection combinations retain the frozen observation digest", () => {
  assert.deepEqual(projectionMatrix(), frozen.projectionMatrix);
  assert.equal(frozen.projectionMatrix.comparisons, 512);
});
test("schema failures precede any port getter, including Task", async () => {
  for (const alias of [false, true]) {
    const f = fixture({ label: "schema", alias });
    let reads = 0;
    Object.defineProperty(f.context, "subagentPort", {
      get() {
        reads++;
        throw new Error("Synthetic port getter");
      },
    });
    await assert.rejects(entryFor({ label: "schema", alias }).handler(null, f.context), {
      name: "ZodError",
    });
    assert.equal(reads, 0);
    await assert.rejects(entryFor({ label: "valid", alias }).handler(validInput, f.context), {
      message: "Synthetic port getter",
    });
    assert.equal(reads, 1);
    const missing = fixture({ label: "missing", alias, port: "missing" });
    await assert.rejects(
      entryFor({ label: "missing", alias }).handler(validInput, missing.context),
      (error: any) => {
        assert.equal(error.type, CoreErrorType.ConfigurationError);
        assert.equal(error.context.toolName, "Agent");
        assert.equal(error.context.code, "agent_subagent_unavailable");
        assert.equal(error.recoverable, false);
        return true;
      },
    );
  }
});
test("request fields retain insertion order and undefined own fields; outputs preserve identity", async () => {
  for (const output of [completed, backgrounded, null, undefined, "raw"]) {
    const f = fixture({ label: "own keys", output });
    f.context.turnId = undefined;
    f.context.abortSignal = undefined as any;
    assert.equal(await module.agentToolEntry.handler(validInput, f.context), output);
    const call = f.calls[0];
    assert.deepEqual(call.optionKeys, ["signal"]);
    assert.equal(call.requestKeys.includes("turnId"), true);
    assert.equal(call.traceKeys.includes("turnId"), true);
    assert.equal(call.request.agentType, "general-purpose");
    assert.equal(call.request.runInBackground, false);
    assert.equal(call.receiver, true);
  }
});
test("changing port/model/override getters retain receiver and two-read semantics", async () => {
  const f = fixture(),
    firstPort = {
      launch() {
        assert.fail("Admission receiver cannot launch");
      },
    };
  let portReads = 0,
    modelReads = 0,
    overrideReads = 0;
  const firstModel = { first: true },
    secondModel = { second: true },
    secondOverride = { second: true };
  f.expected.model = secondModel;
  f.expected.override = secondOverride;
  Object.defineProperty(f.context, "subagentPort", {
    get() {
      return ++portReads === 1 ? firstPort : f.port;
    },
  });
  Object.defineProperty(f.context, "model", {
    get() {
      return ++modelReads === 1 ? firstModel : secondModel;
    },
  });
  Object.defineProperty(f.context, "subagentModelOverride", {
    get() {
      return ++overrideReads === 1 ? {} : secondOverride;
    },
  });
  await module.agentToolEntry.handler(validInput, f.context);
  assert.equal(portReads, 2);
  assert.equal(modelReads, 2);
  assert.equal(overrideReads, 2);
  assert.equal(f.calls[0].receiver, true);
  assert.equal(f.calls[0].modelIdentity, true);
  assert.equal(f.calls[0].overrideIdentity, true);
});
test("optional truthy admission followed by undefined still inserts conditional field", async () => {
  const f = fixture();
  let count = 0;
  let seen: any;
  Object.defineProperty(f.context, "model", {
    get() {
      return ++count === 1 ? {} : undefined;
    },
  });
  f.port.launch = function (_request, options) {
    seen = options;
    return Promise.resolve(completed);
  };
  await module.agentToolEntry.handler(validInput, f.context);
  assert.deepEqual(Object.keys(seen), ["signal", "model"]);
  assert.equal(seen.model, undefined);
});

// Frozen inherited compatibility values; source exposure and limitations are in the lane spec.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CoreErrorType,
  SkillInputJsonSchema,
  SkillInputSchema,
  SkillOutputJsonSchema,
  SkillOutputSchema,
  createCoreError,
  isCoreError,
} from "@knorvia/contracts";
import { entry, fixture, frozen, handlers, registryModule } from "./skill-tool-fixture.js";

test("Skill declarations, schema identities and actual built-in consumers stay frozen", () => {
  assert.equal(frozen.baseline, "0d80f9ca37b1daef162ecc69bd18f6e8fc30a146");
  assert.deepEqual(Object.keys(entry), frozen.entryKeys);
  const declaration: Record<string, unknown> = {};
  for (const key of frozen.entryKeys)
    if (!["handler", "runtimeInputSchema", "runtimeOutputSchema"].includes(key))
      declaration[key] = entry[key as keyof typeof entry];
  assert.deepEqual(declaration, frozen.declaration);
  assert.equal(entry.inputSchema, SkillInputJsonSchema);
  assert.equal(entry.outputSchema, SkillOutputJsonSchema);
  assert.equal(entry.runtimeInputSchema, SkillInputSchema);
  assert.equal(entry.runtimeOutputSchema, SkillOutputSchema);
  assert.equal(
    handlers.builtInTools.find((tool: typeof entry) => tool.metadata.name === "Skill"),
    entry,
  );
  for (const includeSkill of [undefined, true, false]) {
    const registry = registryModule.createToolRegistry();
    handlers.registerBuiltInTools(registry, { includeSkill });
    assert.equal(registry.get("Skill"), includeSkill === false ? undefined : entry);
    const contract = registry.toContracts().find((tool: { name: string }) => tool.name === "Skill");
    if (includeSkill !== false) {
      assert.equal(contract.description, frozen.declaration.metadata && entry.metadata.description);
      assert.equal(contract.inputSchema, SkillInputJsonSchema);
      assert.equal(contract.outputSchema, SkillOutputJsonSchema);
      assert.deepEqual(contract.permission, frozen.declaration.permission);
    } else assert.equal(contract, undefined);
  }
});

test("direct runtime admission preserves current/legacy union precedence and ignored arguments", async () => {
  for (const [input, name] of [
    [{ skill: "demo:notes", args: "do not inject", extra: "ignored" }, "demo:notes"],
    [{ name: "legacy", args: "do not inject" }, "legacy"],
    [{ skill: "  exact  ", name: "legacy" }, "  exact  "],
    [{ skill: "", name: "legacy" }, ""],
    [{ skill: 9, name: "legacy" }, "legacy"],
  ] as const) {
    const f = fixture();
    await entry.handler(input, f.context);
    assert.equal(f.requests[0].request.name, name);
    assert.equal(Object.hasOwn(f.requests[0].request, "args"), false);
    assert.deepEqual(f.timeline, ["load", "metadata"]);
  }
});

test("invalid direct input fails before adapter admission", async () => {
  for (const input of [null, [], {}, { name: "" }, { skill: 4 }, { skill: "a", args: 2 }]) {
    const f = fixture();
    Object.defineProperty(f.context, "skillPort", { get: () => assert.fail("must parse first") });
    await assert.rejects(entry.handler(input, f.context), { name: "ZodError" });
    assert.deepEqual(f.timeline, []);
  }
});

test("missing SkillPort keeps exact CoreError fields and does not read request context", async () => {
  const f = fixture();
  f.context.skillPort = undefined;
  Object.defineProperty(f.context, "workingDirectory", {
    get: () => assert.fail("must check port first"),
  });
  await assert.rejects(entry.handler({ skill: "notes" }, f.context), (error) => {
    assert.ok(isCoreError(error));
    assert.equal(error.type, CoreErrorType.ConfigurationError);
    assert.equal(error.code, "CONFIGURATION_ERROR");
    assert.equal(error.message, "SkillPort is not configured for Skill tool");
    assert.equal(error.recoverable, false);
    assert.equal(error.retryable, false);
    assert.equal(error.cause, undefined);
    assert.deepEqual(error.context, { toolCallId: "example-call", toolName: "Skill" });
    return true;
  });
});

test("single load preserves request shape, trace values, undefined keys, receiver and signal identity", async () => {
  for (const complete of [true, false]) {
    const f = fixture();
    if (!complete) {
      delete f.context.spanId;
      delete f.context.parentSpanId;
      delete f.context.turnId;
    }
    await entry.handler({ skill: "demo:notes", args: "ignored" }, f.context);
    assert.deepEqual(f.requests, [
      {
        request: {
          name: "demo:notes",
          workingDirectory: "C:\\Example Workspace",
          maxBytes: 100000,
          trace: {
            traceId: "example-trace",
            spanId: complete ? "example-span" : undefined,
            parentSpanId: complete ? "example-parent" : undefined,
            sessionId: "example-session",
            turnId: complete ? "example-turn" : undefined,
          },
        },
        options: { signal: f.controller.signal },
      },
    ]);
  }
});

test("instruction strings preserve resolved names, whitespace, variables and dollar substitution", async () => {
  for (const c of frozen.outputCases) {
    const f = fixture();
    Object.assign(f.result, c);
    f.result.metadata.name = c.name;
    assert.equal(
      await entry.handler({ skill: "requested", args: "not body text" }, f.context),
      c.expected,
      c.label,
    );
  }
});

test("resolved telemetry is optional and precedes body projection, without exposing content", async () => {
  for (const qualified of [true, false]) {
    const f = fixture();
    f.result.metadata.qualifiedName = qualified ? "demo:notes" : "";
    f.result.metadata.pluginId = qualified ? "demo@example" : "";
    Object.defineProperty(f.result, "content", {
      get() {
        assert.deepEqual(f.timeline, ["load", "metadata"]);
        return "body";
      },
    });
    await entry.handler({ skill: "notes" }, f.context);
    assert.deepEqual(f.metadata, [
      qualified
        ? { qualifiedName: "demo:notes", pluginId: "demo@example", source: "plugin" }
        : { source: "plugin" },
    ]);
  }
  const f = fixture();
  delete f.context.recordSkillTelemetryMetadata;
  for (const key of ["source", "qualifiedName", "pluginId"])
    Object.defineProperty(f.result.metadata, key, {
      get: () => assert.fail("no observer means no metadata reads"),
    });
  await entry.handler({ skill: "notes" }, f.context);
  assert.deepEqual(f.timeline, ["load"]);
});

test("adapter and observer errors propagate original values without retry or projection", async () => {
  for (const failure of [
    new Error("read failed"),
    createCoreError(CoreErrorType.InvalidInput, "not found"),
    { sentinel: true },
  ]) {
    const f = fixture();
    f.behavior.load = async () => {
      throw failure;
    };
    await assert.rejects(
      entry.handler({ skill: "notes" }, f.context),
      (error) => error === failure,
    );
    assert.deepEqual(f.timeline, ["load"]);
    assert.equal(f.requests.length, 1);
  }
  const f = fixture();
  const failure = new Error("observation failed");
  f.context.recordSkillTelemetryMetadata = () => {
    throw failure;
  };
  Object.defineProperty(f.result, "content", {
    get: () => assert.fail("no projection after observer failure"),
  });
  await assert.rejects(entry.handler({ skill: "notes" }, f.context), (error) => error === failure);
});

test("direct handler delegates pre-cancelled signals and pending cancellation to the adapter", async () => {
  const f = fixture();
  const reason = new Error("cancelled");
  f.controller.abort(reason);
  f.behavior.load = async () => {
    throw f.requests[0].options!.signal!.reason;
  };
  await assert.rejects(entry.handler({ skill: "notes" }, f.context), (error) => error === reason);
  assert.equal(f.requests[0].options!.signal, f.controller.signal);
  assert.deepEqual(f.timeline, ["load"]);
});

test("projection failures preserve the original value after resolved metadata is observed", async () => {
  const f = fixture();
  const failure = { projection: "example failure" };
  Object.defineProperty(f.result, "content", {
    get: () => {
      throw failure;
    },
  });
  await assert.rejects(entry.handler({ skill: "notes" }, f.context), (error) => error === failure);
  assert.deepEqual(f.timeline, ["load", "metadata"]);
  assert.equal(f.requests.length, 1);
});

// Frozen inherited declarations/data/prose; no licensing conclusion is implied.
import assert from "node:assert/strict";
import test from "node:test";
import {
  AskUserQuestionInputJsonSchema,
  AskUserQuestionInputSchema,
  AskUserQuestionOutputJsonSchema,
  AskUserQuestionOutputSchema,
} from "@knorvia/contracts";
import {
  directContext,
  entry,
  errorShape,
  frozen,
  handlers,
  registryModule,
} from "./ask-user-question-fixture.js";

test("AskUserQuestion declarations, schema identities and actual registry remain frozen", () => {
  assert.equal(frozen.baseline, "803062001bf433d967d84f716d520cdf34d6b943");
  assert.deepEqual(Object.keys(entry), frozen.entryKeys);
  const declaration: Record<string, unknown> = {};
  for (const key of frozen.entryKeys)
    if (
      !["handler", "formatModelContent", "runtimeInputSchema", "runtimeOutputSchema"].includes(key)
    )
      declaration[key] = entry[key as keyof typeof entry];
  assert.deepEqual(declaration, frozen.declaration);
  assert.equal(entry.inputSchema, AskUserQuestionInputJsonSchema);
  assert.equal(entry.outputSchema, AskUserQuestionOutputJsonSchema);
  assert.equal(entry.runtimeInputSchema, AskUserQuestionInputSchema);
  assert.equal(entry.runtimeOutputSchema, AskUserQuestionOutputSchema);
  assert.equal(
    handlers.builtInTools.find((tool: typeof entry) => tool.metadata.name === "AskUserQuestion"),
    entry,
  );
  const registry = registryModule.createToolRegistry();
  handlers.registerBuiltInTools(registry, { includeSkill: false, includeDynamicWorkflow: false });
  assert.equal(registry.get("AskUserQuestion"), entry);
  const contract = registry
    .toContracts()
    .find((tool: { name: string }) => tool.name === "AskUserQuestion");
  assert.equal(contract.description, entry.metadata.description);
  assert.equal(contract.inputSchema, AskUserQuestionInputJsonSchema);
  assert.equal(contract.outputSchema, AskUserQuestionOutputJsonSchema);
  assert.deepEqual(contract.permission, entry.permission);
});

test("all frozen valid and malformed inputs preserve projection or exact CoreError issues", async () => {
  for (const c of frozen.cases) {
    const input = structuredClone(c.input);
    const before = JSON.stringify(input);
    if (c.error) {
      await assert.rejects(entry.handler(input, directContext()), (error) => {
        assert.deepEqual(errorShape(error), c.error, c.label);
        return true;
      });
    } else {
      const output = await entry.handler(input, directContext());
      assert.equal(JSON.stringify(output), JSON.stringify(c.output), c.label);
      assert.equal(await entry.formatModelContent!(output), c.modelContent, c.label);
      assert.equal(AskUserQuestionOutputSchema.safeParse(output).success, true);
      assert.equal(Object.hasOwn(output as object, "metadata"), false);
      assert.notEqual(
        (output as { questions: unknown }).questions,
        (input as { questions: unknown }).questions,
      );
    }
    assert.equal(JSON.stringify(input), before, c.label);
  }
});

test("raw formatter keeps early empty answers, malformed errors and unvalidated values", async () => {
  for (const c of frozen.rawCases) {
    if (c.error)
      assert.throws(
        () => entry.formatModelContent!(c.output),
        (error) => {
          assert.deepEqual(errorShape(error), c.error, c.label);
          return true;
        },
      );
    else assert.equal(await entry.formatModelContent!(c.output), c.modelContent, c.label);
  }
});

test("success reads no execution context; refusal reads only toolCallId after validation", async () => {
  const input = frozen.cases.find((c) => c.label === "complete")!.input;
  const context = new Proxy(directContext(), {
    get: () => assert.fail("success must read no context"),
  });
  assert.deepEqual(
    await entry.handler(input, context),
    frozen.cases.find((c) => c.label === "complete")!.output,
  );
  const reads: PropertyKey[] = [];
  const rejected = new Proxy(directContext(), {
    get: (target, key) => {
      reads.push(key);
      return Reflect.get(target, key);
    },
  });
  await assert.rejects(entry.handler(undefined, rejected));
  assert.deepEqual(reads, ["toolCallId"]);
  const parent = new AbortController();
  parent.abort();
  assert.deepEqual(
    await entry.handler(input, { ...directContext(), abortSignal: parent.signal }),
    frozen.cases.find((c) => c.label === "complete")!.output,
  );
});

test("input, context and annotation accessor failures preserve the original thrown value", async () => {
  const failure = { sentinel: "example question getter failure" };
  const input = {
    get questions() {
      throw failure;
    },
  };
  await assert.rejects(entry.handler(input, directContext()), (error) => error === failure);
  const context = new Proxy(directContext(), {
    get: () => {
      throw failure;
    },
  });
  await assert.rejects(entry.handler(undefined, context), (error) => error === failure);
  const output = {
    answers: { Q: "A" },
    questions: [{ question: "Q" }],
    get annotations() {
      throw failure;
    },
  };
  assert.throws(
    () => entry.formatModelContent!(output),
    (error) => error === failure,
  );
});

test("formatter reads answers and annotations in their original order and multiplicity", () => {
  const reads: string[] = [];
  const output = {
    get answers() {
      reads.push("answers");
      return { Q: "A" };
    },
    get annotations() {
      reads.push("annotations");
      return {
        Q: {
          get preview() {
            reads.push("preview");
            return "preview";
          },
          get notes() {
            reads.push("notes");
            return "notes";
          },
        },
      };
    },
    get questions() {
      reads.push("questions");
      return [{ question: "Q" }];
    },
  };
  assert.equal(
    entry.formatModelContent!(output),
    'User has answered your questions: "Q"="A" selected preview:\npreview user notes: notes. You can now continue with the user\'s answers in mind.',
  );
  assert.deepEqual(reads, [
    "answers",
    "answers",
    "annotations",
    "preview",
    "preview",
    "notes",
    "notes",
    "questions",
    "answers",
  ]);
});

test("sparse questions ignore holes and prototype answer membership remains effective", () => {
  const questions: { question: string }[] = [];
  questions.length = 3;
  questions[1] = { question: "Q" };
  questions[2] = { question: "inherited" };
  const answers = Object.assign(Object.create({ inherited: "B" }), { Q: "A" });
  assert.equal(
    entry.formatModelContent!({ questions, answers }),
    'User has answered your questions: "Q"="A". You can now continue with the user\'s answers in mind.',
  );
});

test("empty own answers skip all later fields, including inherited-only answers", () => {
  for (const answers of [{}, Object.create({ Q: "A" })]) {
    const output = {
      answers,
      get questions() {
        assert.fail("do not read questions");
      },
      get annotations() {
        assert.fail("do not read annotations");
      },
    };
    assert.equal(entry.formatModelContent!(output), frozen.rawCases[0].modelContent);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomCommandPrompt } from "../src/command-center-custom.js";
import { syntheticCommand } from "./custom-command-expansion-fixture.js";

test("existing command center loads and expands through the only command prompt path", async () => {
  const loaded: string[] = [];
  const result = await buildCustomCommandPrompt("synthetic", '"one two" tail', {
    loadCustomCommand: async (name) => {
      loaded.push(name);
      return {
        ...syntheticCommand("$2 / $1", ["first"]),
        metadata: {
          ...syntheticCommand("").metadata,
          skills: ["first"],
          description: "Synthetic fixture",
          path: "synthetic.md",
        },
      };
    },
  });
  assert.deepEqual(loaded, ["synthetic"]);
  assert.equal(
    result,
    "Run custom command /synthetic.\nCommand source: user/synthetic.md.\nRequired skills: `first`.\nBefore following the command body, call the Skill tool for `first`.\n\ntail / one two",
  );
  assert.equal(await buildCustomCommandPrompt("missing", "", {}), undefined);
  assert.equal(
    await buildCustomCommandPrompt("missing", "", {
      loadCustomCommand: async () => {
        throw new Error("command not found");
      },
    }),
    undefined,
  );
  const ownedError = new Error("synthetic load failure");
  await assert.rejects(
    buildCustomCommandPrompt("synthetic", "", {
      loadCustomCommand: async () => {
        throw ownedError;
      },
    }),
    (error) => error === ownedError,
  );
});

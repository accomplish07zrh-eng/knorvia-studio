import test from "node:test";
import { expandCliCustomCommandPrompt } from "../src/custom-command-expand.js";
import { commandExpansionCases } from "./custom-command-expansion-fixture.js";

for (const observation of commandExpansionCases) {
  test(observation.name, () => observation.run(expandCliCustomCommandPrompt));
}

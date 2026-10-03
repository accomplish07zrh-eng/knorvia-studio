import test from "node:test";
import { SCRIPT_WORKFLOW_CHILD_SOURCE } from "../src/app/script-workflow-child-source.js";
import { childRunner } from "./script-child-fixture.js";
import { childIpcCases } from "./script-child-ipc-fixture.js";
import { childPathCases } from "./script-child-path-fixture.js";

for (const observation of [...childIpcCases, ...childPathCases]) {
  test(observation.name, () => observation.run(childRunner(SCRIPT_WORKFLOW_CHILD_SOURCE)));
}

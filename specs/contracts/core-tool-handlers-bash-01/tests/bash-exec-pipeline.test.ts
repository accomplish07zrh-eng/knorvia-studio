// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-bash-01 contract tests: bash output projection, model content formatting,
// activity metadata, provider description and auto-background policy.
// Black box: asserts only public exports; expected values are recorded old-implementation output.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getBashActivityDescription,
  getBashAutoClassifierInput,
  getBashDescription,
  getBashToolUseSummary,
  getBashUserFacingName,
  readStringProperty,
} from "../../../../apps/cli/packages/core/src/tool/handlers/bash-metadata.js";
import {
  isBashOutputProviderError,
  formatBashModelContent,
} from "../../../../apps/cli/packages/core/src/tool/handlers/bash-model-content.js";
import {
  createEmptyBashPerformanceTelemetry,
  createBashBackgroundPerformanceTelemetry,
} from "../../../../apps/cli/packages/core/src/tool/handlers/bash-output.js";
import { createBashProviderDescription } from "../../../../apps/cli/packages/core/src/tool/handlers/bash-prompt.js";
import { isBashAutoBackgroundEligible } from "../../../../apps/cli/packages/core/src/tool/handlers/bash-background-policy.js";

type Telemetry = { detail?: { kind?: string; command?: Record<string, unknown> } };

test("B-ex-22 bash metadata describers project a command input", () => {
  const input = { command: "npm install lodash" };
  assert.equal(getBashDescription(input), "Run shell command");
  assert.equal(getBashUserFacingName(input), "Bash");
  assert.equal(getBashToolUseSummary(input), "npm install lodash");
  assert.equal(getBashActivityDescription(input), "Running npm install lodash");
  assert.equal(getBashAutoClassifierInput(input), "npm install lodash");
});

test("B-ex-23 bash metadata describers stay total on absent input", () => {
  assert.equal(getBashDescription(undefined), "Run shell command");
  assert.equal(getBashUserFacingName(undefined), "Bash");
  assert.equal(getBashToolUseSummary(undefined), null);
});

test("B-ex-24 readStringProperty reads only string-valued keys", () => {
  assert.equal(readStringProperty({ foo: "bar" }, "foo"), "bar");
  assert.equal(readStringProperty({ foo: "bar" }, "baz"), undefined);
  assert.equal(readStringProperty({ foo: 42 }, "foo"), undefined);
});

test("B-ex-25 isBashProviderErrorStatus mirrors the failed/non-zero/semantic rule", () => {
  assert.equal(isBashOutputProviderError({ status: "failed", exitCode: 1 }), true);
  assert.equal(isBashOutputProviderError({ status: "completed", exitCode: 0 }), false);
});

test("B-ex-26 formatBashModelContent renders the command output as text", () => {
  const content = formatBashModelContent({
    stdout: "hello",
    stderr: "",
    exitCode: 0,
    status: "completed",
  });
  assert.equal(typeof content, "string");
  assert.ok(String(content).includes("hello"));
});

test("B-ex-27 createEmptyBashPerformanceTelemetry builds an empty command span", () => {
  const perf = createEmptyBashPerformanceTelemetry({ command: "ls" }) as Telemetry | undefined;
  assert.equal(perf?.detail?.kind, "command");
  const command = perf?.detail?.command ?? {};
  assert.equal(command.category, "empty");
  assert.equal(command.count, 0);
  assert.equal(command.name, "empty");
  assert.equal(command.status, "completed");
  assert.equal(typeof command.hash, "string");
});

test("B-ex-28 createBashBackgroundPerformanceTelemetry marks a backgrounded command", () => {
  const perf = createBashBackgroundPerformanceTelemetry({
    command: "sleep 100",
    run_in_background: true,
  }) as Telemetry | undefined;
  assert.equal(perf?.detail?.kind, "command");
  const command = perf?.detail?.command ?? {};
  assert.equal(command.status, "backgrounded");
  assert.equal(command.count, 1);
  assert.equal(typeof command.hash, "string");
});

test("B-ex-29 createBashProviderDescription states the bash contract", () => {
  const description = createBashProviderDescription({ name: "Bash" });
  assert.ok(description.startsWith("Executes a bash command and returns its output."));
  assert.ok(description.includes("# Git"));
});

test("B-ex-30 isBashAutoBackgroundEligible keys off the invocation shape", () => {
  assert.equal(
    isBashAutoBackgroundEligible({ command: "sleep 300", run_in_background: true }),
    false,
  );
  assert.equal(isBashAutoBackgroundEligible({ command: "ls" }), true);
});

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArguments } from "./arguments.mjs";
import { filesystemManifest, serializeError } from "./report.mjs";
import { installWorld } from "./world-runtime.mjs";
import { casesById } from "../cases/registry.mjs";

const args = parseArguments(process.argv.slice(2));
const selected = casesById.get(args.case);
if (!selected) throw new Error(`Unknown case ${args.case}`);
const runRoot = resolve(args["run-root"]);
const outputPath = resolve(args.output);
await mkdir(runRoot, { recursive: true });

const config =
  typeof selected.world === "function"
    ? await selected.world({ runRoot, mode: "candidate", phase: args.phase ?? "normal" })
    : structuredClone(selected.world ?? {});
if (args["crash-after-mutation"] !== undefined) {
  config.crashAfterMutation = Number(args["crash-after-mutation"]);
}
const world = await installWorld({ runRoot, config });

const context = {
  assert,
  mode: "candidate",
  phase: args.phase ?? "normal",
  observe(label, value) {
    world.observations.push({ label, value });
  },
  runRoot,
  world,
};

let status = "passed";
let failure;
try {
  if (selected.setup) await selected.setup(context);
  const loaded = await import(
    `${pathToFileURL(resolve(args.bundle)).href}?case=${encodeURIComponent(selected.id)}`
  );
  assert.deepEqual(Object.keys(loaded.facades).sort(), [
    "atomic-directory",
    "github-archive-source",
    "helpers",
    "marketplace",
    "official-marketplace",
    "source-errors",
    "version-compare",
    "zip-source",
  ]);
  context.facades = loaded.facades;
  await selected.run(context);
} catch (error) {
  status = "failed";
  failure = serializeError(error);
}

const report = {
  id: selected.id,
  phase: args.phase ?? "normal",
  status,
  failure,
  observations: world.observations,
  events: world.events,
  filesystem: await filesystemManifest(runRoot),
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

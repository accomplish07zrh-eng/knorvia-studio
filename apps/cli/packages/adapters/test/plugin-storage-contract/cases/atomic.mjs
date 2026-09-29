// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { at, captureThrow, makeCase, pathExists, readText, writeJson, writeText } from "./util.mjs";

function names(target) {
  const parent = dirname(target);
  const name = basename(target);
  return {
    marker: join(parent, `.${name}.transaction.json`),
    backup: join(parent, `.${name}.backup`),
    stage: join(parent, `.${name}.stage-ABC123`),
  };
}

async function writeMarker(context, target, marker) {
  const path = names(target).marker;
  await writeText(context, path.slice(context.runRoot.length + 1), `${JSON.stringify(marker)}\n`);
}

async function putValue(context, path, value) {
  await mkdir(path, { recursive: true });
  await writeText(context, join(path.slice(context.runRoot.length + 1), "value.txt"), value);
}

function v2(target, overrides = {}) {
  return {
    version: 2,
    stageName: basename(names(target).stage),
    transactionId: "11111111-1111-4111-8111-111111111111",
    ownerId: "22222222-2222-4222-8222-222222222222",
    ownerPid: 4242,
    hadTarget: true,
    mode: "coordinated",
    ...overrides,
  };
}

async function sourceTree(context, name = "source", value = "new") {
  const path = at(context, name);
  await putValue(context, path, value);
  return path;
}

export const atomicCases = [
  makeCase("B01", async (context) => {
    const target = at(context, "target");
    const state = names(target);
    await putValue(context, state.backup, "old");
    await putValue(context, state.stage, "staged");
    await writeMarker(context, target, { version: 1, stageName: basename(state.stage) });
    context.assert.equal(
      context.facades["atomic-directory"].recoverAtomicTargetSync(target),
      target,
    );
    context.assert.equal(await readText(context, "target/value.txt"), "old");
    context.assert.equal(await pathExists(state.marker), false);
    context.assert.equal(await pathExists(state.stage), false);
  }),
  makeCase("B02", async (context) => {
    const target = at(context, "target");
    const state = names(target);
    await putValue(context, target, "new");
    await putValue(context, state.backup, "old");
    const unknown = at(context, "do-not-delete");
    await putValue(context, unknown, "sentinel");
    await writeText(context, state.marker.slice(context.runRoot.length + 1), "{broken");
    context.assert.equal(
      context.facades["atomic-directory"].recoverAtomicTargetSync(target),
      target,
    );
    context.assert.equal(await readText(context, "target/value.txt"), "new");
    context.assert.equal(await pathExists(state.backup), false);
    context.assert.equal(await pathExists(unknown), true);
  }),
  makeCase(
    "B03",
    async (context) => {
      const target = at(context, "target");
      const state = names(target);
      const authority = at(context, "authority.json");
      await putValue(context, target, "new");
      await putValue(context, state.backup, "old");
      await putValue(context, state.stage, "stage");
      await writeJson(context, "authority.json", { version: 1, plugins: [] });
      await writeMarker(context, target, v2(target, { authorityPath: authority }));
      context.assert.equal(
        context.facades["atomic-directory"].recoverAtomicTargetSync(target),
        state.backup,
      );
      for (const path of [target, state.backup, state.stage, state.marker])
        context.assert.equal(await pathExists(path), true);
    },
    { world: { process: { pid: 1111, probes: { 4242: "ok" } } } },
  ),
  makeCase(
    "B04",
    async (context) => {
      const target = at(context, "target");
      const state = names(target);
      const marker = v2(target, { authorityPath: at(context, "authority.json") });
      await putValue(context, target, "new");
      await putValue(context, state.backup, "old");
      await writeJson(context, "authority.json", {
        nested: { cacheTransactionId: marker.transactionId },
      });
      await writeMarker(context, target, marker);
      context.assert.equal(
        context.facades["atomic-directory"].recoverAtomicTargetSync(target),
        target,
      );
      context.assert.equal(await pathExists(state.marker), true);
    },
    { world: { process: { pid: 1111, probes: { 4242: "ok" } } } },
  ),
  makeCase(
    "B05",
    async (context) => {
      const target = at(context, "target");
      const state = names(target);
      await putValue(context, target, "new");
      await writeJson(context, "authority.json", { plugins: [] });
      await writeMarker(
        context,
        target,
        v2(target, { authorityPath: at(context, "authority.json"), hadTarget: false }),
      );
      context.assert.equal(
        context.facades["atomic-directory"].recoverAtomicTargetSync(target),
        state.backup,
      );
      context.assert.equal(await pathExists(state.backup), false);
      context.assert.equal(await pathExists(target), true);
    },
    { world: { process: { pid: 1111, probes: { 4242: "ok" } } } },
  ),
  makeCase(
    "B06",
    async (context) => {
      for (const missingTarget of [false, true]) {
        const target = at(context, missingTarget ? "missing-target" : "present-target");
        const state = names(target);
        const marker = v2(target, {
          authorityPath: at(context, `${basename(target)}-authority.json`),
        });
        if (!missingTarget) await putValue(context, target, "new");
        await putValue(context, state.backup, "old");
        await writeJson(context, `${basename(target)}-authority.json`, {
          anything: { cacheTransactionId: marker.transactionId },
        });
        await writeMarker(context, target, marker);
        context.assert.equal(
          context.facades["atomic-directory"].recoverAtomicTargetSync(target),
          target,
        );
        context.assert.equal(await pathExists(target), true);
        context.assert.equal(await pathExists(state.backup), false);
      }
    },
    { world: { process: { pid: 1111, probes: { 4242: "ESRCH" } } } },
  ),
  makeCase(
    "B07",
    async (context) => {
      const rollbackTarget = at(context, "rollback-target");
      const rollbackState = names(rollbackTarget);
      await putValue(context, rollbackTarget, "new");
      await putValue(context, rollbackState.backup, "old");
      await writeJson(context, "authority.json", { plugins: [] });
      await writeMarker(
        context,
        rollbackTarget,
        v2(rollbackTarget, { authorityPath: at(context, "authority.json") }),
      );
      context.facades["atomic-directory"].recoverAtomicTargetSync(rollbackTarget);
      context.assert.equal(await readText(context, "rollback-target/value.txt"), "old");

      const firstTarget = at(context, "first-target");
      await putValue(context, firstTarget, "new");
      await writeMarker(
        context,
        firstTarget,
        v2(firstTarget, { authorityPath: at(context, "authority.json"), hadTarget: false }),
      );
      context.facades["atomic-directory"].recoverAtomicTargetSync(firstTarget);
      context.assert.equal(await pathExists(firstTarget), false);
    },
    { world: { process: { pid: 1111, probes: { 4242: "ESRCH" } } } },
  ),
  makeCase(
    "B08",
    async (context) => {
      const target = at(context, "target");
      const state = names(target);
      await putValue(context, target, "new");
      await putValue(context, state.backup, "old");
      await writeJson(context, "authority.json", { plugins: [] });
      await writeMarker(
        context,
        target,
        v2(target, { ownerPid: 1111, authorityPath: at(context, "authority.json") }),
      );
      context.facades["atomic-directory"].recoverAtomicTargetSync(target);
      context.assert.equal(await readText(context, "target/value.txt"), "old");
      context.assert.equal(await pathExists(state.marker), false);
    },
    { world: { process: { pid: 1111 } } },
  ),
  makeCase(
    "B09",
    async (context) => {
      const target = at(context, "target");
      const state = names(target);
      await putValue(context, target, "new");
      await putValue(context, state.backup, "old");
      await writeJson(context, "authority.json", { plugins: [] });
      await writeMarker(
        context,
        target,
        v2(target, { authorityPath: at(context, "authority.json") }),
      );
      context.assert.equal(
        context.facades["atomic-directory"].recoverAtomicTargetSync(target),
        state.backup,
      );
      context.assert.equal(await pathExists(state.marker), true);
    },
    { world: { process: { pid: 1111, probes: { 4242: "EPERM" } } } },
  ),
  makeCase("B10", async (context) => {
    const target = at(context, "target");
    const source = await sourceTree(context);
    const first = await context.facades["atomic-directory"].activateDirectoryAtomically({
      sourcePath: source,
      targetPath: target,
    });
    const error = await captureThrow(() =>
      context.facades["atomic-directory"].activateDirectoryAtomically({
        sourcePath: source,
        targetPath: target,
      }),
    );
    context.assert.match(error.message, /^Atomic directory activation is already active:/u);
    context.assert.equal(await pathExists(names(target).marker), true);
    await first.rollback();
  }),
  makeCase("B11", async (context) => {
    if (process.platform === "win32") {
      context.observe("platformSkip", "POSIX rename overwrite is exercised on POSIX validators");
      return;
    }
    const path = at(context, "state.json");
    await writeText(context, "state.json", "old");
    await context.facades["atomic-directory"].writeFileAtomically(path, "new");
    context.assert.equal(await readText(context, "state.json"), "new");
    context.assert.equal(await pathExists(names(path).backup), false);
    context.assert.equal(await pathExists(names(path).marker), false);
  }),
  makeCase(
    "B12",
    async (context) => {
      const path = at(context, "state.json");
      if (context.phase === "recover") {
        const resolved = context.facades["atomic-directory"].recoverAtomicTargetSync(path);
        context.assert.equal(resolved, path);
        context.assert.ok(["old", "new"].includes(await readText(context, "state.json")));
        context.assert.equal(await pathExists(names(path).backup), false);
        context.assert.equal(await pathExists(names(path).marker), false);
        return;
      }
      await writeText(context, "state.json", "old");
      await context.facades["atomic-directory"].writeFileAtomically(path, "new");
      context.assert.equal(await readText(context, "state.json"), "new");
      context.assert.equal(await pathExists(names(path).backup), false);
      context.assert.equal(await pathExists(names(path).marker), false);
    },
    {
      crashMatrix: true,
      world: ({ phase }) =>
        phase === "recover"
          ? {}
          : {
              ioFaults: [
                {
                  op: "rename",
                  pathSuffix: "state.json",
                  at: [1],
                  code: "EEXIST",
                  message: "Synthetic overwrite failure",
                },
              ],
            },
    },
  ),
  makeCase(
    "B13",
    async (context) => {
      const target = at(context, "target");
      if (context.phase === "recover") {
        const resolved = context.facades["atomic-directory"].recoverAtomicTargetSync(target);
        context.assert.equal(await pathExists(resolved), true);
        context.assert.ok(
          ["old", "new"].includes(await readText({ ...context, runRoot: resolved }, "value.txt")),
        );
        context.assert.equal(await pathExists(names(target).backup), false);
        context.assert.equal(await pathExists(names(target).marker), false);
        return;
      }
      await putValue(context, target, "old");
      const source = await sourceTree(context);
      const activation = await context.facades["atomic-directory"].activateDirectoryAtomically({
        sourcePath: source,
        targetPath: target,
      });
      await activation.finalize();
      context.assert.equal(await readText(context, "target/value.txt"), "new");
    },
    { crashMatrix: true, timeoutMs: 60000 },
  ),
  makeCase("A201", async (context) => {
    const target = at(context, "target");
    const state = names(target);
    await putValue(context, target, "new");
    await putValue(context, state.backup, "old");
    await putValue(context, state.stage, "stage");
    await writeMarker(context, target, { version: 1, stageName: basename(state.stage) });
    context.facades["atomic-directory"].recoverAtomicTargetSync(target);
    context.assert.equal(await pathExists(state.stage), false);
    context.assert.equal(await pathExists(state.marker), false);
  }),
  makeCase(
    "A202",
    async (context) => {
      const target = at(context, "target");
      const invalidStage = join(dirname(target), ".target.stage-");
      await putValue(context, target, "new");
      await putValue(context, invalidStage, "sentinel");
      await writeMarker(context, target, { version: 1, stageName: basename(invalidStage) });
      context.facades["atomic-directory"].recoverAtomicTargetSync(target);
      context.assert.equal(await pathExists(invalidStage), true);
      context.assert.equal(await pathExists(names(target).marker), false);
    },
    { policy: "required-improvement", requiredOldFailure: true },
  ),
  makeCase(
    "A203",
    async (context) => {
      const target = at(context, "nested", "target");
      const outside = at(context, "outside");
      await putValue(context, target, "new");
      await putValue(context, outside, "sentinel");
      await writeMarker(context, target, { version: 1, stageName: ".target.stage-/../../outside" });
      context.facades["atomic-directory"].recoverAtomicTargetSync(target);
      context.assert.equal(await readText(context, "outside/value.txt"), "sentinel");
    },
    { policy: "required-improvement", requiredOldFailure: true },
  ),
  makeCase("A204", async (context) => {
    const target = at(context, "nested", "target");
    const outside = at(context, "nested", "..\\outside");
    await putValue(context, target, "new");
    await putValue(context, outside, "sentinel");
    await writeMarker(context, target, { version: 1, stageName: "..\\outside" });
    context.facades["atomic-directory"].recoverAtomicTargetSync(target);
    context.assert.equal(await pathExists(outside), true);
  }),
  makeCase(
    "A205",
    async (context) => {
      const target = at(context, "target");
      const state = names(target);
      await putValue(context, target, "new");
      await putValue(context, state.backup, "old");
      await writeMarker(context, target, v2(target, { authorityPath: target }));
      context.assert.equal(
        context.facades["atomic-directory"].recoverAtomicTargetSync(target),
        target,
      );
      context.assert.equal(await readText(context, "target/value.txt"), "old");
    },
    {
      policy: "required-improvement",
      requiredOldFailure: true,
      world: { process: { pid: 1111, probes: { 4242: "ESRCH" } } },
    },
  ),
  makeCase(
    "A206",
    async (context) => {
      const targetA = at(context, "A");
      const targetB = at(context, "B");
      await putValue(context, targetA, "new-A");
      await putValue(context, names(targetA).backup, "old-A");
      await putValue(context, targetB, "new-B");
      await writeMarker(context, targetA, v2(targetA, { authorityPath: targetB }));
      await writeMarker(
        context,
        targetB,
        v2(targetB, {
          authorityPath: targetA,
          transactionId: "33333333-3333-4333-8333-333333333333",
        }),
      );
      context.facades["atomic-directory"].recoverAtomicTargetSync(targetA);
      context.assert.equal(await readText(context, "A/value.txt"), "old-A");
    },
    {
      policy: "required-improvement",
      requiredOldFailure: true,
      world: { process: { pid: 1111, probes: { 4242: "ESRCH" } } },
    },
  ),
  makeCase(
    "A207",
    async (context) => {
      const target = at(context, "target");
      await putValue(context, target, "only");
      await writeMarker(context, target, v2(target, { authorityPath: target, hadTarget: true }));
      context.facades["atomic-directory"].recoverAtomicTargetSync(target);
      context.assert.equal(await readText(context, "target/value.txt"), "only");
    },
    {
      policy: "required-improvement",
      requiredOldFailure: true,
      world: { process: { pid: 1111, probes: { 4242: "ESRCH" } } },
    },
  ),
  makeCase(
    "A208",
    async (context) => {
      const target = at(context, "target");
      await putValue(context, target, "new");
      await writeMarker(context, target, v2(target, { authorityPath: target, hadTarget: false }));
      context.facades["atomic-directory"].recoverAtomicTargetSync(target);
      context.assert.equal(await pathExists(target), false);
    },
    {
      policy: "required-improvement",
      requiredOldFailure: true,
      world: { process: { pid: 1111, probes: { 4242: "ESRCH" } } },
    },
  ),
  makeCase(
    "A209",
    async (context) => {
      const target = at(context, "target");
      const state = names(target);
      await putValue(context, target, "new");
      await putValue(context, state.backup, "old");
      await writeMarker(context, target, v2(target, { authorityPath: target }));
      context.assert.equal(
        context.facades["atomic-directory"].recoverAtomicTargetSync(target),
        state.backup,
      );
      context.assert.equal(await pathExists(state.marker), true);
      context.assert.equal(await pathExists(state.backup), true);
      context.assert.equal(await pathExists(target), true);
    },
    {
      policy: "required-improvement",
      requiredOldFailure: true,
      world: { process: { pid: 1111, probes: { 4242: "ok" } } },
    },
  ),
  makeCase(
    "A210",
    async (context) => {
      const target = at(context, "target");
      const state = names(target);
      const marker = v2(target, { authorityPath: at(context, "authority.json") });
      await putValue(context, target, "new");
      await putValue(context, state.backup, "old");
      await writeJson(context, "authority.json", {
        unexpected: [{ deep: { cacheTransactionId: marker.transactionId } }],
      });
      await writeMarker(context, target, marker);
      context.facades["atomic-directory"].recoverAtomicTargetSync(target);
      context.assert.equal(await readText(context, "target/value.txt"), "new");
    },
    { world: { process: { pid: 1111, probes: { 4242: "ESRCH" } } } },
  ),
  makeCase(
    "A215",
    async (context) => {
      const target = at(context, "target");
      const state = names(target);
      await putValue(context, target, "new");
      await putValue(context, state.backup, "old");
      await writeJson(context, "authority.json", { plugins: [] });
      await writeMarker(
        context,
        target,
        v2(target, { authorityPath: at(context, "authority.json") }),
      );
      context.assert.equal(
        context.facades["atomic-directory"].recoverAtomicTargetSync(target),
        state.backup,
      );
      context.assert.equal(await pathExists(state.marker), true);
    },
    { world: { process: { pid: 1111, probes: { 4242: "ok" } } } },
  ),
  makeCase(
    "A216",
    async (context) => {
      const target = at(context, "target");
      const state = names(target);
      await putValue(context, target, "new");
      await putValue(context, state.backup, "old");
      await writeJson(context, "authority.json", { plugins: [] });
      await writeMarker(
        context,
        target,
        v2(target, { ownerPid: 1111, authorityPath: at(context, "authority.json") }),
      );
      context.facades["atomic-directory"].recoverAtomicTargetSync(target);
      context.assert.equal(await readText(context, "target/value.txt"), "old");
    },
    { world: { process: { pid: 1111 } } },
  ),
];

for (const spec of [
  {
    id: "A211",
    action: "finalize",
    authority: true,
    hadTarget: true,
    initial: "old",
    expected: "new",
  },
  {
    id: "A212",
    action: "finalize-reactivate",
    authority: true,
    hadTarget: true,
    initial: "old",
    expected: "new",
  },
  {
    id: "A213",
    action: "finalize",
    authority: false,
    hadTarget: false,
    initial: null,
    expected: "new",
  },
  {
    id: "A214",
    action: "rollback",
    authority: false,
    hadTarget: true,
    initial: "old",
    expected: "old",
  },
]) {
  atomicCases.push(
    makeCase(
      spec.id,
      async (context) => {
        const target = at(context, "target");
        if (spec.initial !== null) await putValue(context, target, spec.initial);
        const source = await sourceTree(context);
        const authorityPath = spec.authority ? at(context, "authority.json") : undefined;
        const activation = await context.facades["atomic-directory"].activateDirectoryAtomically({
          authorityPath,
          sourcePath: source,
          targetPath: target,
        });
        if (spec.authority) {
          await writeJson(context, "authority.json", {
            committed: { cacheTransactionId: activation.transactionId },
          });
        }
        await activation[spec.action === "rollback" ? "rollback" : "finalize"]();
        context.facades["atomic-directory"].recoverAtomicTargetSync(target);
        context.assert.equal(await readText(context, "target/value.txt"), spec.expected);
        context.assert.equal(await pathExists(names(target).marker), false);
        if (spec.action === "finalize-reactivate") {
          const secondSource = await sourceTree(context, "source-two", "new-two");
          const second = await context.facades["atomic-directory"].activateDirectoryAtomically({
            sourcePath: secondSource,
            targetPath: target,
          });
          await second.rollback();
        }
      },
      {
        policy: "required-improvement",
        requiredOldFailure: true,
        world: {
          ioFaults: [
            {
              op: "rm",
              pathSuffix: ".transaction.json",
              times: 3,
              code: "EACCES",
              message: "Synthetic marker cleanup failure",
            },
          ],
        },
      },
    ),
  );
}

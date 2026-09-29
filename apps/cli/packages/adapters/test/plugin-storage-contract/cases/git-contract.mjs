// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { at, captureThrow, events, makeCase, writeJson } from "./util.mjs";

async function writeMarketplace(context, storageRoot, plugin) {
  await writeJson(
    { ...context, runRoot: storageRoot },
    join("marketplaces", "sample-market", "marketplace.json"),
    {
      name: "sample-market",
      plugins: [plugin],
    },
  );
}

function gitManifest(name = "alpha", version = "1.0.0") {
  return {
    files: [
      {
        path: "$DEST/.knorvia-plugin/plugin.json",
        text: `${JSON.stringify({ name, version }, null, 2)}\n`,
      },
    ],
  };
}

async function install(context, storageRoot, signal) {
  return context.facades.marketplace.installMarketplacePlugin({
    storageRoot,
    marketplace: "sample-market",
    name: "alpha",
    signal,
  });
}

export const gitContractCases = [
  makeCase(
    "Q01",
    async (context) => {
      const scenarios = [
        { label: "missing", value: undefined, expected: "git" },
        { label: "empty", value: "", expected: "git" },
        { label: "spaces", value: "   ", expected: "git" },
        { label: "padded", value: "  synthetic-git  ", expected: "synthetic-git" },
      ];
      for (const scenario of scenarios) {
        const storageRoot = at(context, `git-binary-${scenario.label}`);
        await writeMarketplace(context, storageRoot, {
          name: "alpha",
          version: "1.0.0",
          source: { source: "git", url: "git@example.invalid:repo" },
        });
        if (scenario.value === undefined) delete context.world.config.env.KNORVIA_GIT_BINARY;
        else context.world.config.env.KNORVIA_GIT_BINARY = scenario.value;
        context.world.scripts.git.push(gitManifest());
        const before = events(context, "process.execFile").length;
        await install(context, storageRoot);
        context.assert.equal(events(context, "process.execFile")[before].file, scenario.expected);
      }
    },
    { world: { env: {} } },
  ),
  makeCase("Q02", async (context) => {
    const shallowRoot = at(context, "git-shallow");
    await writeMarketplace(context, shallowRoot, {
      name: "alpha",
      version: "1.0.0",
      source: { source: "git", url: "git@example.invalid:repo", ref: "stable" },
    });
    context.world.scripts.git.push(gitManifest());
    await install(context, shallowRoot);

    const pinnedRoot = at(context, "git-pinned");
    await writeMarketplace(context, pinnedRoot, {
      name: "alpha",
      version: "1.0.0",
      source: { source: "git", url: "git@example.invalid:repo", ref: "stable", sha: "commit-pin" },
    });
    context.world.scripts.git.push(gitManifest(), {});
    await install(context, pinnedRoot);

    const commands = events(context, "process.execFile");
    const clones = commands.filter((entry) => entry.args.includes("clone"));
    context.assert.deepEqual(clones[0].args.slice(0, -1), [
      "clone",
      "--depth",
      "1",
      "--branch",
      "stable",
      "git@example.invalid:repo",
    ]);
    context.assert.deepEqual(clones[1].args.slice(0, -1), [
      "clone",
      "--branch",
      "stable",
      "git@example.invalid:repo",
    ]);
    const checkout = commands.find((entry) => entry.args.includes("checkout"));
    context.assert.equal(checkout.args.at(-1), "commit-pin");
    for (const command of commands) {
      context.assert.equal(command.args.includes("-c"), false);
      context.assert.equal(command.timeout, 90000);
      context.assert.equal(command.killSignal, "SIGTERM");
      context.assert.equal(command.maxBuffer, 10 * 1024 * 1024);
    }
  }),
  makeCase(
    "Q03",
    async (context) => {
      const retryTexts = [
        "RPC failed",
        "Operation timed out",
        "Recv failure",
        "expected flush",
        "early EOF",
        "remote end hung up",
        "HTTP/2 stream",
        "Connection reset",
        "ETIMEDOUT",
        "ECONNRESET",
        "network timeout",
      ];
      const placements = ["message", "stdout", "stderr"];
      for (let index = 0; index < retryTexts.length; index += 1) {
        const storageRoot = at(context, `retry-${index}`);
        await writeMarketplace(context, storageRoot, {
          name: "alpha",
          version: "1.0.0",
          source: { source: "git", url: "git@example.invalid:repo" },
        });
        const placement = placements[index % placements.length];
        const failure = {
          error: {
            code: "EIO",
            message: placement === "message" ? retryTexts[index] : "synthetic clone failure",
          },
        };
        if (placement === "stdout") failure.stdout = retryTexts[index];
        if (placement === "stderr") failure.stderr = retryTexts[index];
        context.world.scripts.git.push(failure, gitManifest());
        const eventStart = context.world.events.length;
        const before = events(context, "process.execFile").filter((entry) =>
          entry.args.includes("clone"),
        ).length;
        await install(context, storageRoot);
        const after = events(context, "process.execFile").filter((entry) =>
          entry.args.includes("clone"),
        ).length;
        context.assert.equal(after - before, 2, `${placement}: ${retryTexts[index]}`);
        const scenarioEvents = context.world.events.slice(eventStart);
        const cloneEvents = scenarioEvents.filter(
          (entry) => entry.kind === "process.execFile" && entry.args.includes("clone"),
        );
        const between = scenarioEvents.filter(
          (entry) => entry.index > cloneEvents[0].index && entry.index < cloneEvents[1].index,
        );
        context.assert.ok(between.some((entry) => entry.kind === "fs.rm"));
        context.assert.ok(between.some((entry) => entry.kind === "fs.mkdir"));
      }
    },
    { timeoutMs: 60000 },
  ),
  makeCase(
    "Q04",
    async (context) => {
      for (const [label, failureText] of [
        ["auth", "Authentication failed"],
        ["ref", "Remote branch stable not found"],
      ]) {
        const storageRoot = at(context, `non-retry-${label}`);
        await writeMarketplace(context, storageRoot, {
          name: "alpha",
          source: { source: "git", url: "git@example.invalid:repo" },
        });
        context.world.scripts.git.push({
          error: { code: "EACCES", message: failureText },
          stderr: failureText,
        });
        const before = events(context, "process.execFile").filter((entry) =>
          entry.args.includes("clone"),
        ).length;
        await captureThrow(() => install(context, storageRoot));
        const after = events(context, "process.execFile").filter((entry) =>
          entry.args.includes("clone"),
        ).length;
        context.assert.equal(after - before, 1);
      }

      const checkoutRoot = at(context, "checkout-no-retry");
      await writeMarketplace(context, checkoutRoot, {
        name: "alpha",
        source: { source: "git", url: "git@example.invalid:repo", sha: "commit-pin" },
      });
      context.world.scripts.git.push(gitManifest(), {
        error: { code: "EIO", message: "RPC failed" },
      });
      const checkoutBefore = events(context, "process.execFile").length;
      await captureThrow(() => install(context, checkoutRoot));
      const checkoutCommands = events(context, "process.execFile").slice(checkoutBefore);
      context.assert.equal(
        checkoutCommands.filter((entry) => entry.args.includes("clone")).length,
        1,
      );
      context.assert.equal(
        checkoutCommands.filter((entry) => entry.args.includes("checkout")).length,
        1,
      );

      const sparseRoot = at(context, "sparse-no-retry");
      await mkdir(join(sparseRoot, "placeholder"), { recursive: true });
      context.world.scripts.git.push(
        {
          files: [
            {
              path: "$DEST/marketplace.json",
              text: `${JSON.stringify({ name: "sample-market", plugins: [] })}\n`,
            },
          ],
        },
        { error: { code: "EIO", message: "early EOF" } },
      );
      const sparseBefore = events(context, "process.execFile").length;
      try {
        await context.facades.marketplace.validateMarketplaceSource({
          storageRoot: sparseRoot,
          source: { source: "github", repo: "acme/catalog", sparsePaths: ["catalog"] },
        });
      } catch {
        // Either a thrown source error or a returned diagnostic is permitted here;
        // this case observes the process-attempt boundary only.
      }
      const sparseCommands = events(context, "process.execFile").slice(sparseBefore);
      context.assert.equal(
        sparseCommands.filter((entry) => entry.args.includes("clone")).length,
        1,
      );
      context.assert.equal(
        sparseCommands.filter((entry) => entry.args.includes("sparse-checkout")).length,
        1,
      );

      const abortRoot = at(context, "abort-backoff");
      await writeMarketplace(context, abortRoot, {
        name: "alpha",
        source: { source: "git", url: "git@example.invalid:repo" },
      });
      const controller = new AbortController();
      context.world.abortController = controller;
      context.world.config.abortOnTimerAt = context.world.counters.timer + 1;
      context.world.scripts.git.push({ error: { code: "EIO", message: "RPC failed" } });
      const abortBefore = events(context, "process.execFile").filter((entry) =>
        entry.args.includes("clone"),
      ).length;
      await captureThrow(() => install(context, abortRoot, controller.signal));
      const abortAfter = events(context, "process.execFile").filter((entry) =>
        entry.args.includes("clone"),
      ).length;
      context.assert.equal(abortAfter - abortBefore, 1);

      const commandAbortRoot = at(context, "abort-command");
      await writeMarketplace(context, commandAbortRoot, {
        name: "alpha",
        source: { source: "git", url: "git@example.invalid:repo" },
      });
      const commandController = new AbortController();
      commandController.abort();
      const commandBefore = events(context, "process.execFile").filter((entry) =>
        entry.args.includes("clone"),
      ).length;
      await captureThrow(() => install(context, commandAbortRoot, commandController.signal));
      const commandAfter = events(context, "process.execFile").filter((entry) =>
        entry.args.includes("clone"),
      ).length;
      context.assert.ok(commandAfter - commandBefore <= 1);
    },
    { timeoutMs: 60000, world: { env: {} } },
  ),
];

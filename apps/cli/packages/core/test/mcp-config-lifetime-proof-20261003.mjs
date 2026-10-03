import assert from "node:assert/strict";
import { deferred, fixture, load, trace } from "./mcp-config-fixture-20261003.mjs";
const mode = process.argv[2];
async function observe() {
  const owned = fixture(),
    replacement = deferred();
  owned.runtime.config.mcp = { servers: { owned: { type: "stdio" } } };
  owned.runtime.mcpPort = {
    connectConfiguredServers() {
      assert.equal(this, owned.runtime.mcpPort);
      return Promise.resolve({ statuses: {}, tools: [] });
    },
  };
  const debug = owned.runtime.logger.debug;
  owned.runtime.logger.debug = function (...args) {
    debug.apply(this, args);
    owned.runtime.mcpStartupPromise = replacement.promise;
  };
  await load(mode, owned);
  const returned = owned.runtime.startMcpStartup(trace);
  assert.equal(owned.runtime.mcpStartupPromise, replacement.promise);
  assert.equal(returned, replacement.promise);
  const tracked = owned.calls.find(([name]) => name === "track")[1];
  assert.notEqual(tracked, replacement.promise);
  await tracked;
}
if (mode === "sealedDraft") {
  await assert.rejects(observe(), assert.AssertionError);
  console.log(
    JSON.stringify({
      mode,
      expectedDraftFailure: "post-debug return ignored current startup lifetime",
      realOperations: 0,
    }),
  );
} else {
  await observe();
  console.log(
    JSON.stringify({ mode, postPublicationLifetimeIdentityPreserved: true, realOperations: 0 }),
  );
}

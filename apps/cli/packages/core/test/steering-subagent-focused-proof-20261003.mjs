import assert from "node:assert/strict";
import { fixture, load, trace } from "./steering-subagent-fixture-20261003.mjs";
const mode = process.argv[2];
const names = [
  "reservation-owner",
  "pending-id-bytes",
  "drain-read-phase-and-field-presence",
  "optional-logger",
  "advisory-discovery-catch",
  "child-link-undefined-field",
];
let checked = 0;
for (const name of names) {
  const f = fixture();
  if (name === "advisory-discovery-catch") {
    const policyFactory = f.modules["subagent/computer-use-policy.js"].createOfficialCuaPolicy;
    f.modules["subagent/computer-use-policy.js"].createOfficialCuaPolicy = (...args) => ({
      ...policyFactory(...args),
      isOfficialSkill() {
        throw Error("owned advisory predicate failure");
      },
    });
    f.runtime.skillPort = {
      async discoverSkills() {
        return { skills: [{ name: "owned" }], totalDiscovered: 1 };
      },
    };
    f.request.profile.skills = ["owned"];
  }
  const r = await load(mode, f);
  const probe = async () => {
    if (name === "reservation-owner") {
      r.activeTurnStartReservation = { turnId: "owned-held", traceContext: trace, kind: "product" };
      assert.throws(
        () => r.beginActiveTurn("owned-next", trace, "product", true),
        (error) => error.type === "turn_in_progress" && error.context.activeTurnId === "owned-held",
      );
    } else if (name === "pending-id-bytes") {
      assert.equal(r.createPendingInputId("owned-turn"), "pending_owned-turn_1");
    } else if (name === "drain-read-phase-and-field-presence") {
      const active = r.beginActiveTurn("owned-turn", trace, "product", true);
      const pending = {
        id: "owned-guide",
        input: "owned-initial",
        delivery: "guide",
        queuedAt: new Date(0),
      };
      active.pendingInputs.push(pending);
      f.modules["runtime/helpers/index.js"].resolveTurnAttachments = async () => {
        pending.delivery = "queue";
        pending.input = "owned-after-await";
        pending.queuedAt = new Date(80);
        return [];
      };
      // Imports capture function identity: make a fresh selected instance after changing the port.
      await load(mode, f);
      await r.drainPendingInput({ activeTurn: active, events: [], traceContext: trace });
      assert.equal(r.persisted[4].steerDelivery, "guide");
      const log = f.logs.at(-1)[1];
      assert.equal(log.inputPreviews[0], "owned-initia");
      assert.equal(log.inputSizes[0], Buffer.byteLength("owned-initial"));
      assert.equal(log.queuedDurationsMs[0], 100);
      const drained = f.events.at(-1)[0].payload.drainedInputs[0];
      assert.equal(Object.hasOwn(drained, "toolDisallowlist"), false);
    } else {
      if (name === "optional-logger") r.logger = undefined;
      if (name === "child-link-undefined-field")
        f.request.traceContext = { traceId: "owned-link-trace", attributes: {} };
      r.createDefaultSubagentPort(f.deps);
      assert.equal(await f.exploreOptions.runExploreAgent(f.request), f.result);
      if (name === "child-link-undefined-field") {
        assert.equal(Object.hasOwn(r.clientIdentity, "parentToolCallId"), true);
        assert.equal(r.clientIdentity.parentToolCallId, undefined);
      }
    }
  };
  if (mode === "rejectedDraft") {
    await assert.rejects(probe);
    console.log("preserved red " + name);
  } else {
    await probe();
    console.log("ok " + name);
  }
  checked++;
}
console.log(
  JSON.stringify({
    mode,
    concreteBoundaryProbes: checked,
    preservedRed: mode === "rejectedDraft",
    realOperations: 0,
  }),
);

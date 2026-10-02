import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { mock, test } from "node:test";
import type { ProcessIdentity } from "../src/process/processTreeTypes.js";

const known: ProcessIdentity = {
  pid: 701,
  parentPid: 1,
  startTime: "synthetic-old",
  processGroupId: 701,
};
const reused: ProcessIdentity = { ...known, startTime: "synthetic-reused" };
let captures = 0;
let filters = 0;
mock.module(new URL("../src/process/processTreeSnapshot.ts", import.meta.url).href, {
  namedExports: {
    captureProcessTreeSnapshot: () => {
      captures++;
      return { identities: [reused] };
    },
    filterCurrentProcessIdentities: (values: readonly ProcessIdentity[]) => {
      filters++;
      return [...values];
    },
  },
});
mock.module(new URL("../src/process/processTreeSnapshotAsync.ts", import.meta.url).href, {
  namedExports: {
    captureProcessTreeSnapshotAsync: async () => {
      throw new Error("forbidden real capture");
    },
    filterCurrentProcessIdentitiesAsync: async () => {
      throw new Error("forbidden real filter");
    },
  },
});
const { resolveCurrentOwnedIdentities } = await import("../src/process/processTreeOwnership.js");
test("fake ownership ports reject reused root and prohibit discovery when authorization is absent", () => {
  const child = { pid: 701, exitCode: null, signalCode: null } as ChildProcess;
  const result = resolveCurrentOwnedIdentities(child, [known], {}, true);
  assert.equal(result.childStillOwned, false);
  assert.deepEqual(result.knownIdentities, [known]);
  assert.deepEqual(result.currentIdentities, [known]);
  assert.equal(captures, 1);
  assert.equal(filters, 2);
  captures = filters = 0;
  const denied = resolveCurrentOwnedIdentities(child, [], {}, false);
  assert.deepEqual(denied, { childStillOwned: false, currentIdentities: [], knownIdentities: [] });
  assert.equal(captures + filters, 0);
});

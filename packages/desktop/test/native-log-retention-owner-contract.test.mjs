import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { loadNativeOwner } from "./native-owner-fixture.mjs";

// Authored and unrun; supplied fs ports never read or unlink real log files.
const fsModule = {
  "node:fs": "export const readdirSync = port.read; export const unlinkSync = port.unlink;",
};
function regular(name) {
  return {
    name,
    isFile() {
      assert.equal(this.name, name);
      return true;
    },
  };
}
function ports(entries, onUnlink = () => {}) {
  const state = { reads: [], unlinks: [] };
  state.read = (...args) => {
    state.reads.push(args);
    return entries;
  };
  state.unlink = (path) => {
    state.unlinks.push(path);
    return onUnlink(path);
  };
  return state;
}

test("daily retention keeps cutoff equality and rejects impossible dates, suffixes and non-files", async () => {
  const entries = [
    regular("2024-02-28.log"),
    regular("2024-02-29.log"),
    regular("2024-03-01.log"),
    regular("2024-02-30.log"),
    regular("0099-01-01.log"),
    regular("2024-02-27.LOG"),
    regular("2024-02-27.log.backup"),
    {
      get name() {
        throw new Error("directory name must not be read");
      },
      isFile() {
        return false;
      },
    },
  ];
  const state = ports(entries);
  const { LOG_RETENTION_DAYS, cleanupExpiredLogFiles: cleanup } = await loadNativeOwner(
    "logRetention",
    state,
    fsModule,
  );
  assert.equal(LOG_RETENTION_DAYS, 14);
  assert.deepEqual(cleanup("fixture-log-dir", { now: new Date(2024, 2, 13, 17) }), {
    deletedFiles: ["2024-02-28.log"],
    failedFiles: [],
  });
  assert.deepEqual(state.reads, [["fixture-log-dir", { withFileTypes: true }]]);
  assert.deepEqual(state.unlinks, [join("fixture-log-dir", "2024-02-28.log")]);
});

test("unlink failures are recorded in traversal order and do not stop later deletions", async () => {
  const state = ports(
    [regular("2024-01-01.log"), regular("2024-01-02.log"), regular("2024-01-03.log")],
    (path) => {
      if (path.endsWith("2024-01-02.log")) throw new Error("fixture locked file");
    },
  );
  const { cleanupExpiredLogFiles: cleanup } = await loadNativeOwner(
    "logRetention",
    state,
    fsModule,
  );
  assert.deepEqual(cleanup("fixture", { now: new Date(2024, 1, 1), retentionDays: 1 }), {
    deletedFiles: ["2024-01-01.log", "2024-01-03.log"],
    failedFiles: ["2024-01-02.log"],
  });
  assert.equal(state.unlinks.length, 3);
});

test("an outer traversal failure resets observed arrays while option getter errors still escape", async () => {
  const failure = new Error("fixture metadata failure");
  const state = ports([
    regular("2024-01-01.log"),
    {
      isFile() {
        throw failure;
      },
    },
  ]);
  const { cleanupExpiredLogFiles: cleanup } = await loadNativeOwner(
    "logRetention",
    state,
    fsModule,
  );
  const options = { now: new Date(2024, 1, 1) };
  const result = cleanup("fixture", options);
  assert.deepEqual(result, { deletedFiles: [], failedFiles: [] });
  assert.equal(state.unlinks.length, 1);
  assert.throws(
    () =>
      cleanup("fixture", {
        get now() {
          throw failure;
        },
      }),
    (error) => error === failure,
  );
  assert.equal(state.reads.length, 1);
});

test("each eligible file observes the caller-held Date after earlier unlink mutation", async () => {
  const now = new Date(2024, 0, 10, 12);
  const state = ports([regular("2024-01-01.log"), regular("2024-01-11.log")], () => {
    now.setDate(20);
  });
  const { cleanupExpiredLogFiles: cleanup } = await loadNativeOwner(
    "logRetention",
    state,
    fsModule,
  );
  assert.deepEqual(cleanup("fixture", { now, retentionDays: 1 }), {
    deletedFiles: ["2024-01-01.log", "2024-01-11.log"],
    failedFiles: [],
  });
});

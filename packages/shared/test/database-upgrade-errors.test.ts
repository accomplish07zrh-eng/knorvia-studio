import assert from "node:assert/strict";
import test from "node:test";
import {
  canRetryDatabaseStartup,
  classifyDatabaseStartupError,
  databaseStartupErrorCodeSchema,
} from "../src/database-startup.js";

test("upgrade errors survive startup protocol and newer data cannot retry with the same app", () => {
  for (const kind of ["newer_database", "backup_failed"] as const) {
    assert.equal(databaseStartupErrorCodeSchema.parse(kind), kind);
    assert.equal(classifyDatabaseStartupError(new Error("outer", { cause: { kind } })), kind);
    assert.equal(
      canRetryDatabaseStartup({
        phase: "failed",
        failedPhase: "preparing_session_storage",
        errorCode: kind,
      }),
      kind === "backup_failed",
    );
  }
  // 空间/权限首因仍优先，不能被外层快照错误抹掉。
  assert.equal(
    classifyDatabaseStartupError({ kind: "backup_failed", cause: { code: "ENOSPC" } }),
    "storage_full",
  );
});

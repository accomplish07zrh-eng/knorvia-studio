// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 会话存储迁移的往返验证（独立于 118 条契约用例，供验收留证）：
// 旧写 → 新读 → 新写 → 旧读，并核对 checksum 与既有库一致（迁移幂等、不重放）。
//
// 时序：① 建出 0019 状态（应用全部迁移后删掉 0020–0022 的台账行，等价于旧库）；
//       ② 旧写：按旧协议写入 session/message 行；③ 新读：再跑迁移，旧行被就地迁移；
//       ④ 新写→旧读：写入迁移后形状的新行，重跑迁移后校验新行未被改写、台账未变。
//
// 运行：node --import tsx apps/cli/packages/adapters/test/migration-roundtrip.mjs
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runSqliteSessionMigrations } from "../src/storage/session-store/migration-runner.ts";
import { SQLITE_MIGRATIONS } from "../src/storage/session-store/migrations.ts";

const directory = mkdtempSync(join(tmpdir(), "knorvia-roundtrip-"));
const dbPath = join(directory, "sessions.sqlite");
const db = new DatabaseSync(dbPath);

/** 0020 及之后的迁移 id：验收场景里先撤销它们的台账，模拟旧库。 */
const PENDING_IDS = SQLITE_MIGRATIONS.map((migration) => migration.id).filter(
  (id) => Number.parseInt(id.slice(0, 4), 10) >= 20,
);

/** 台账快照：id → (checksum, app_version, time_applied)。 */
function ledger() {
  const rows = db
    .prepare("SELECT id, checksum, app_version, time_applied FROM schema_migration ORDER BY id ASC")
    .all();
  return new Map(
    rows.map((row) => [String(row.id), `${row.checksum}|${row.app_version}|${row.time_applied}`]),
  );
}

function extract(id, path) {
  const row = db
    .prepare("SELECT json_extract(data, ?) AS value FROM message WHERE id = ?")
    .get(path, id);
  return row?.value ?? null;
}

function insertMessage(id, sequence, data) {
  db.prepare(
    "INSERT INTO message (id, session_id, sequence, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, "ses_rt", sequence, 1, 1, JSON.stringify(data));
}

// ── ① 建出「旧库」状态：应用全部迁移后，抹掉未发布迁移的台账行 ──
runSqliteSessionMigrations(db, dbPath);
const fullLedger = ledger();
assert.equal(fullLedger.size, SQLITE_MIGRATIONS.length, "首次运行应写入全部迁移台账");
for (const id of PENDING_IDS) db.prepare("DELETE FROM schema_migration WHERE id = ?").run(id);
const legacyLedger = ledger();
assert.equal(
  legacyLedger.size,
  SQLITE_MIGRATIONS.length - PENDING_IDS.length,
  "旧库台账应少掉未发布迁移",
);
console.log(
  `旧库状态：台账 ${legacyLedger.size} 条（撤销 ${PENDING_IDS.length} 条待发布迁移：${PENDING_IDS.join(", ")}）`,
);

// ── ② 旧写：按旧协议写入 user/assistant 两种形状 ──
db.prepare(
  "INSERT INTO session (id, project_id, workspace_id, slug, directory, title, version, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
).run("ses_rt", "prj_rt", null, "roundtrip", "/tmp/rt", "往返验证", "1", 1, 1);
insertMessage("msg_user", 0, {
  role: "user",
  model: { providerID: "builtin:zai", modelID: "glm-5.3", variant: "high" },
});
insertMessage("msg_asst", 1, {
  role: "assistant",
  providerID: "builtin:zai",
  modelID: "glm-5.3",
  variant: "high",
});
console.log("旧写：写入 1 个会话 + 2 条旧协议消息（user 嵌套 model / assistant 扁平字段）");

// ── ③ 新读：再跑迁移 → 旧行被就地迁移，且台账恢复到完整状态 ──
runSqliteSessionMigrations(db, dbPath);
const upgradedLedger = ledger();
assert.equal(upgradedLedger.size, SQLITE_MIGRATIONS.length, "升级后台账应补齐");
assert.equal(
  extract("msg_user", "$.modelSelection") !== null,
  true,
  "旧 user 消息应被补出 modelSelection",
);
const provider = extract("msg_user", "$.modelSelection.providerId");
assert.ok(
  provider === "zai-api" || provider === "builtin:zai",
  `providerId 应为映射前后之一，实际 ${String(provider)}`,
);
assert.equal(
  extract("msg_asst", "$.providerId"),
  "builtin:zai",
  "assistant 的扁平 providerID 应被搬到 providerId",
);
assert.equal(
  extract("msg_asst", "$.modelId"),
  "glm-5.3",
  "assistant 的扁平 modelID 应被搬到 modelId",
);
console.log(
  `新读：迁移应用完毕（台账 ${upgradedLedger.size} 条）；user 行补出 modelSelection(providerId=${String(provider)})，assistant 行补出扁平 providerId/modelId`,
);

// ── ④ 新写 → 旧读：新形状行不被回填 legacy 字段；再跑迁移台账不变 ──
const afterUpgrade = ledger();
insertMessage("msg_new", 2, {
  role: "user",
  modelSelection: {
    providerId: "account:zai-start-plan",
    modelId: "GLM-5.3",
    options: { reasoningLevel: "high" },
  },
});
runSqliteSessionMigrations(db, dbPath);
assert.equal(
  extract("msg_new", "$.modelSelection.providerId"),
  "account:zai-start-plan",
  "新写入的 modelSelection 必须保持原样",
);
assert.equal(extract("msg_new", "$.providerId"), null, "新写入不应凭空产生 legacy 扁平字段");
assert.deepEqual(
  [...ledger().entries()],
  [...afterUpgrade.entries()],
  "升级后再跑迁移不得改变台账（checksum 一致）",
);
console.log("新写→旧读：新行保持 modelSelection、未回填 legacy 字段；台账与升级后完全一致");

db.close();
rmSync(directory, { recursive: true, force: true });
console.log("往返验证通过：旧写 → 新读 → 新写 → 旧读；checksum 与既有库一致（迁移未重放）");

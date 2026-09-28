// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { DatabaseSync, StatementSync } from "node:sqlite";
import type { SessionEntryInfo, SessionStorePort } from "@knorvia/contracts";
import { saveSessionEntry } from "./session-entries.js";
import { fullAccessPayload } from "./permission-full-access-payload.js";

export type FullAccessCommitInput = Parameters<
  NonNullable<SessionStorePort["commitPermissionFullAccess"]>
>[0];
type Action =
  | { kind: "receipt"; input: FullAccessCommitInput }
  | { kind: "prepare-queue" }
  | { kind: "queue"; id: string; input: FullAccessCommitInput }
  | { kind: "entry"; entry: SessionEntryInfo };
type Receipt = { session_id: string } | undefined;
type QueueAccess = { read: StatementSync; write: StatementSync };
const PENDING_SCOPE = "id = ? AND session_id = ? AND status = 'admitted'";
const READ_PENDING = `SELECT payload FROM session_input WHERE ${PENDING_SCOPE}`;
const WRITE_PENDING = `UPDATE session_input SET payload = ?, time_updated = ? WHERE ${PENDING_SCOPE}`;

function* program(input: FullAccessCommitInput): Generator<Action, void, Receipt> {
  const receipt = yield { kind: "receipt", input };
  if (receipt) {
    if (receipt.session_id !== input.sessionID)
      throw new Error("Permission receipt session mismatch");
    return;
  }
  yield { kind: "prepare-queue" };
  // 按执行顺序读 live 引用；不能先抓全量快照再写入，改变失败和 entry 读取时点。
  for (const id of input.queueItemIds) yield { kind: "queue", id, input };
  yield { kind: "entry", entry: input.execution };
  yield { kind: "entry", entry: input.receipt };
}

function updateQueue(access: QueueAccess, action: Extract<Action, { kind: "queue" }>): void {
  const row = access.read.get(action.id, action.input.sessionID);
  if (!row || typeof row.payload !== "string")
    throw new Error(`Pending input unavailable: ${action.id}`);
  // 解析和投影先完成，写方法随后取得；坏 JSON 的首因不能被端口读取异常覆盖。
  const payload = fullAccessPayload(row.payload);
  // 原接口在写入时再次取 scope；提前复制会改变可观察的读取次序和目标。
  access.write.run(JSON.stringify(payload), Date.now(), action.id, action.input.sessionID);
}

export function applyFullAccessProgram(db: DatabaseSync, input: FullAccessCommitInput): void {
  const pending = program(input);
  let queue: QueueAccess | undefined;
  let receipt: Receipt;
  for (let step = pending.next(); !step.done; step = pending.next(receipt)) {
    receipt = undefined;
    const action = step.value;
    switch (action.kind) {
      case "receipt":
        receipt = db
          .prepare("SELECT session_id FROM session_entry WHERE id = ?")
          .get(action.input.receipt.id) as Receipt;
        break;
      case "prepare-queue":
        queue = { read: db.prepare(READ_PENDING), write: db.prepare(WRITE_PENDING) };
        break;
      case "queue":
        updateQueue(queue!, action);
        break;
      case "entry":
        saveSessionEntry(db, action.entry);
        break;
    }
  }
}

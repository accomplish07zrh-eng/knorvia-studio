// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import {
  SqliteSessionStore,
  type SqliteSessionStoreOptions,
} from "./session-store-facade.target.js";

export type Input = Parameters<SqliteSessionStore["createSession"]>[0];
export type Bundle = Parameters<SqliteSessionStore["commitForkBundle"]>[0];
export type ImportBundle = Parameters<SqliteSessionStore["commitSharedContextImportBundle"]>[0];
export type Message = Parameters<SqliteSessionStore["saveMessage"]>[0];
export type Part = Parameters<SqliteSessionStore["savePart"]>[0];
export type Entry = Parameters<SqliteSessionStore["saveSessionEntry"]>[0];
export type Goal = NonNullable<Bundle["goal"]>["source"];
export const sid = (value: string) => value as Input["id"];
export const parent = sid("facade-parent");
export const child = sid("facade-child");
export const other = sid("facade-other");
export const mid = "facade-message" as Message["id"];
export const pid = "facade-part" as Part["id"];
export const command = "facade-command";
export const factId = (owner = parent, key = command) => `v4_command_fact:child:${owner}:${key}`;

export function session(id = child, parentID?: Input["id"]): Input {
  return {
    id,
    parentID,
    projectID: "facade-project" as Input["projectID"],
    slug: id,
    directory: "/synthetic-fixture",
    title: id,
    version: "fixture",
    time: { created: 1, updated: 2 },
  };
}
export function user(id = mid, sessionID = child): Message {
  return { id, sessionID, role: "user", agent: "fixture", time: { created: 3 } };
}
export function textPart(id = pid, messageID = mid, sessionID = child): Part {
  return { id, sessionID, messageID, type: "text", text: "Synthetic", time: { start: 3 } };
}
export function metadata(owner = parent, sourceCommandId = command) {
  return {
    parentSessionId: owner,
    sourceCommandId,
    forkTarget: {
      productTurnId: "turn",
      transcriptTurnId: "transcript",
      orderedMessageIds: [],
      boundaryMessageId: "boundary",
    },
  };
}
export function bundle(owner = child): Bundle {
  return {
    child: session(owner, parent),
    messages: [{ info: user(mid, owner), parts: [textPart(pid, mid, owner)] }],
    entries: [],
    commandFact: {
      parentSessionId: parent,
      sourceCommandId: command,
      ack: {
        commandId: command,
        status: "accepted",
        revisionAtDecision: 4,
        result: { type: "forkAssistant", sessionId: owner },
      },
      metadata: { preserved: true },
    },
  };
}
export function provenance(id = `shared:${child}:first`, status = "pending"): Entry {
  return {
    id,
    sessionID: child,
    type: "v4/shared_context_import",
    time: { created: 4, updated: 5 },
    data: { contextId: "context", status, preserve: 9, sourceId: "old-source" },
  };
}
export function shared(): ImportBundle {
  const info = {
    ...user(),
    source: "shared_context" as const,
    visibility: "model-only" as const,
    metadata: { contextId: "context", sharedContextStatus: "pending", preserve: 7 },
  };
  return {
    session: session(),
    contextMessage: { info, parts: [textPart()] },
    provenance: provenance(),
  };
}
export function transition() {
  return {
    sessionID: child,
    contextId: "context",
    expectedStatus: "pending" as const,
    status: "reserved" as const,
  };
}

export async function fixture(t: TestContext, options: SqliteSessionStoreOptions = {}) {
  const store = new SqliteSessionStore({ dbPath: ":memory:", ...options });
  const raw: unknown = Reflect.get(store, "db");
  assert.ok(raw instanceof DatabaseSync);
  const db = raw;
  const nativeExec = db.exec.bind(db);
  const nativeClose = db.close.bind(db);
  t.after(() => {
    try {
      if (db.isTransaction) nativeExec("ROLLBACK");
    } finally {
      nativeClose();
    }
  });
  await store.createSession(session(parent));
  await store.createSession(session(other));
  function snapshot() {
    return Object.fromEntries(
      ["session", "message", "part", "session_entry", "session_target", "session_input"].map(
        (table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()],
      ),
    );
  }
  function data(table: "message" | "part" | "session_entry", id: string) {
    const row = db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id);
    assert.ok(row);
    return JSON.parse(String(row.data)) as Record<string, unknown>;
  }
  return { store, db, nativeExec, snapshot, data };
}
export type Fixture = Awaited<ReturnType<typeof fixture>>;

export async function enriched(f: Fixture): Promise<Bundle> {
  const b = bundle();
  const source = await f.store.setTarget({
    sessionID: parent,
    objective: "Synthetic objective",
    status: "paused",
    tokenBudget: 100,
  });
  b.goal = { source: { ...source, sessionID: child }, status: "active" };
  b.entries = [
    {
      id: "verification",
      sessionID: child,
      type: "target_completion_verification",
      time: { created: 4, updated: 4 },
      data: { payload: { targetId: source.targetID, anchorAssistantMessageId: mid } },
    },
  ];
  b.initialInput = {
    id: "fork-input",
    sessionID: child,
    kind: "sendText",
    delivery: "queue",
    payload: { text: "next" },
  };
  return b;
}
export const operations = ["legacy", "fork", "import", "transition"] as const;
export type Operation = (typeof operations)[number];
export async function compoundFixture(t: TestContext, operation: Operation) {
  const f = await fixture(t);
  if (operation === "transition") await f.store.commitSharedContextImportBundle(shared());
  function invoke() {
    switch (operation) {
      case "legacy":
        return f.store.createForkedSessionWithMetadata(session(child, parent), metadata());
      case "fork":
        return f.store.commitForkBundle(bundle());
      case "import":
        return f.store.commitSharedContextImportBundle(shared());
      case "transition":
        return f.store.transitionSharedContextImport(transition());
    }
  }
  return { ...f, invoke };
}

export function nativeFailure(
  f: Fixture,
  t: TestContext,
  operation: Operation,
  action: "ABORT" | "ROLLBACK",
) {
  const target =
    operation === "legacy"
      ? ["session_entry", factId()]
      : operation === "transition"
        ? ["message", mid]
        : ["part", pid];
  const captured: unknown[] = [];
  let hits = 0;
  f.db.function("fixture_hit", () => {
    hits += 1;
    return 0;
  });
  f.nativeExec(`CREATE TRIGGER fixture_fault BEFORE INSERT ON ${target[0]} WHEN NEW.id = '${target[1]}'
    BEGIN SELECT fixture_hit(); SELECT RAISE(${action}, 'facade synthetic business failure'); END`);
  const prepare = f.db.prepare.bind(f.db);
  t.mock.method(f.db, "prepare", (sql: string) => {
    const statement = prepare(sql);
    const run = statement.run.bind(statement);
    statement.run = ((...args: unknown[]) => {
      try {
        return Reflect.apply(run, statement, args) as ReturnType<typeof run>;
      } catch (failure) {
        captured.push(failure);
        throw failure;
      }
    }) as typeof statement.run;
    return statement;
  });
  return {
    captured,
    get hits() {
      return hits;
    },
  };
}

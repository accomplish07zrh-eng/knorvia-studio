// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type { JournalStorePort, RunRecord } from "@knorvia/dynamic-workflow";
import { encodeJson } from "../json.js";
import {
  decodeActor,
  decodeEvent,
  decodeNode,
  decodeRun,
  encodeResultJson,
  encodeRunSettlement,
  type DwfActorRow,
  type DwfEventRow,
  type DwfNodeRow,
  type DwfRunRow,
  type DwfRunSessionListItem,
} from "./dwf-journal-codecs.js";
import { listArtifactItems, listArtifactRows } from "./dwf-journal-artifacts.js";
import {
  countNodesByStatus,
  getRunRow,
  listRecentLogEvents,
  listRuns,
  listRunsByParentSession,
  listWorldNodes,
  type DwfRunIntrospectionQueries,
} from "./dwf-journal-introspection.js";

export type { DwfArtifactItem, DwfArtifactItemsQuery } from "./dwf-journal-artifacts.js";
export type {
  DwfListRunsQuery,
  DwfNodeStatusCounts,
  DwfRunIntrospectionQueries,
} from "./dwf-journal-introspection.js";

type ConcreteJournal = JournalStorePort &
  DwfRunIntrospectionQueries & {
    listNonTerminalRuns(parentSessionId: string): RunRecord[];
    listRunsByParentSession(parentSessionId: string, limit: number): DwfRunSessionListItem[];
  };

export function createDwfJournalStore(db: DatabaseSync): JournalStorePort {
  const store: ConcreteJournal = {
    createRun(record) {
      const time = Date.now();
      const settlement = encodeRunSettlement(record.status, record);
      try {
        const statement = db.prepare(`
          INSERT INTO dwf_run (
            id, parent_session_id, cwd, name, script_text, script_hash, tool_call_id, args_json,
            resumed_from, caps_max_concurrency, spent_tokens, status, result_json, failure_json,
            time_created, time_updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        statement.run(
          record.runId,
          record.parentSessionId ?? null,
          record.cwd ?? null,
          record.name ?? null,
          record.scriptText ?? null,
          record.scriptHash ?? null,
          record.toolCallId ?? null,
          encodeJson(record.args),
          record.resumedFrom ?? null,
          record.caps.maxConcurrency,
          record.spentTokens,
          settlement.status,
          encodeResultJson(record.result),
          settlement.failureJson,
          time,
          time,
        );
      } catch (cause) {
        // 兼容保留公开 receiver 诊断，诊断读取失败仍会遮住原错误。
        if (this.getRun(record.runId)) {
          throw new Error(`dwf journal: run already exists: ${record.runId}`, { cause });
        }
        throw cause;
      }
    },

    getRun(runId) {
      const row = db.prepare("SELECT * FROM dwf_run WHERE id = ?").get(runId);
      return row === undefined ? undefined : decodeRun(row as unknown as DwfRunRow);
    },

    updateRunStatus(runId, status, settlement) {
      const time = Date.now();
      const encoded = encodeRunSettlement(status, settlement);
      const clearing = status === "pending" || status === "running";
      const statement = db.prepare(
        clearing
          ? "UPDATE dwf_run SET status = ?, failure_json = NULL, result_json = NULL, time_updated = ? WHERE id = ?"
          : "UPDATE dwf_run SET status = ?, failure_json = ?, result_json = COALESCE(?, result_json), time_updated = ? WHERE id = ?",
      );
      const written = clearing
        ? statement.run(encoded.status, time, runId)
        : statement.run(
            encoded.status,
            encoded.failureJson,
            encodeResultJson(settlement?.result),
            time,
            runId,
          );
      if (!written.changes) throw new Error(`dwf journal: unknown run: ${runId}`);
    },

    updateRunUsage(runId, spentTokens) {
      const statement = db.prepare(
        "UPDATE dwf_run SET spent_tokens = ?, time_updated = ? WHERE id = ?",
      );
      const written = statement.run(spentTokens, Date.now(), runId);
      if (!written.changes) throw new Error(`dwf journal: unknown run: ${runId}`);
    },

    putActor(record) {
      const time = Date.now();
      const statement = db.prepare(`
        INSERT INTO dwf_actor (
          run_id, site_id, ordinal, name, persona_json, session_id, resolved_model, time_created, time_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, site_id, ordinal) DO UPDATE SET
          name = excluded.name, persona_json = excluded.persona_json, session_id = excluded.session_id,
          resolved_model = excluded.resolved_model, time_updated = excluded.time_updated
      `);
      statement.run(
        record.runId,
        record.siteId,
        record.ordinal,
        record.name ?? null,
        encodeJson(record.persona),
        record.sessionId ?? null,
        record.resolvedModel ?? null,
        time,
        time,
      );
    },

    getActor(runId, siteId, ordinal) {
      const row = db
        .prepare("SELECT * FROM dwf_actor WHERE run_id = ? AND site_id = ? AND ordinal = ?")
        .get(runId, siteId, ordinal);
      return row === undefined ? undefined : decodeActor(row as unknown as DwfActorRow);
    },

    listActors(runId) {
      return db
        .prepare("SELECT * FROM dwf_actor WHERE run_id = ? ORDER BY id ASC")
        .all(runId)
        .map((row) => decodeActor(row as unknown as DwfActorRow));
    },

    putNode(record) {
      const time = Date.now();
      const statement = db.prepare(`
        INSERT INTO dwf_node (
          run_id, site_id, ordinal, kind, actor_site_id, actor_ordinal, actor_seq, input_hash,
          status, result_json, error_json, stats_json, message_boundary, artifact_id, input_json,
          time_created, time_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, site_id, ordinal) DO UPDATE SET
          kind = excluded.kind, actor_site_id = excluded.actor_site_id, actor_ordinal = excluded.actor_ordinal,
          actor_seq = excluded.actor_seq, input_hash = excluded.input_hash, status = excluded.status,
          result_json = excluded.result_json, error_json = excluded.error_json, stats_json = excluded.stats_json,
          message_boundary = excluded.message_boundary, artifact_id = excluded.artifact_id,
          input_json = excluded.input_json, time_updated = excluded.time_updated
      `);
      statement.run(
        record.runId,
        record.siteId,
        record.ordinal,
        record.kind,
        record.actorSiteId ?? null,
        record.actorOrdinal ?? null,
        record.actorSeq ?? null,
        record.inputHash,
        record.status,
        encodeResultJson(record.result),
        encodeJson(record.error),
        encodeJson(record.stats),
        record.messageBoundary ?? null,
        record.artifactId ?? null,
        encodeJson(record.input),
        time,
        time,
      );
    },

    getNode(runId, siteId, ordinal) {
      const row = db
        .prepare("SELECT * FROM dwf_node WHERE run_id = ? AND site_id = ? AND ordinal = ?")
        .get(runId, siteId, ordinal);
      return row === undefined ? undefined : decodeNode(row as unknown as DwfNodeRow);
    },

    listNodes(runId) {
      return db
        .prepare("SELECT * FROM dwf_node WHERE run_id = ? ORDER BY id ASC")
        .all(runId)
        .map((row) => decodeNode(row as unknown as DwfNodeRow));
    },

    appendEvent(runId, event) {
      const time = Date.now();
      const statement = db.prepare(`
        INSERT INTO dwf_event (run_id, sequence, type, payload_json, time_created)
        SELECT ?, COALESCE(MAX(sequence) + 1, 0), ?, ?, ? FROM dwf_event WHERE run_id = ?
        RETURNING sequence
      `);
      const row = statement.get(runId, event.type, JSON.stringify(event) as string, time, runId);
      if (row === undefined) {
        throw new Error(`dwf journal: event insert returned no sequence for run: ${runId}`);
      }
      return { sequence: row.sequence as number, event, timeCreated: time };
    },

    listEvents(runId, opts) {
      const filters = ["run_id = ?"];
      const values: (string | number)[] = [runId];
      if (opts?.afterSequence !== undefined) {
        filters.push("sequence > ?");
        values.push(opts.afterSequence);
      }
      let sql = `SELECT * FROM dwf_event WHERE ${filters.join(" AND ")} ORDER BY sequence ASC`;
      if (opts?.limit !== undefined) {
        sql += " LIMIT ?";
        values.push(Math.max(0, opts.limit));
      }
      return db
        .prepare(sql)
        .all(...values)
        .map((row) => decodeEvent(row as unknown as DwfEventRow));
    },

    listNonTerminalRuns(parentSessionId) {
      return db
        .prepare(`
        SELECT * FROM dwf_run WHERE parent_session_id = ?
          AND status NOT IN ('completed', 'failed', 'cancelled') ORDER BY id ASC
      `)
        .all(parentSessionId)
        .map((row) => decodeRun(row as unknown as DwfRunRow));
    },

    listRuns(query) {
      return listRuns(db, query);
    },
    getRunRow(runId) {
      return getRunRow(db, runId);
    },
    countNodesByStatus(runId) {
      return countNodesByStatus(db, runId);
    },
    listRecentLogEvents(runId, limit) {
      return listRecentLogEvents(db, runId, limit);
    },
    listRunsByParentSession(parentSessionId, limit) {
      return listRunsByParentSession(db, parentSessionId, limit);
    },
    listArtifactRows(runId) {
      return listArtifactRows(db, runId);
    },
    listWorldNodes(runId) {
      return listWorldNodes(db, runId);
    },
    listArtifactItems(runId, artifactId, query) {
      return listArtifactItems(db, runId, artifactId, query);
    },
  };
  return store;
}

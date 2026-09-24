import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseType } from "node:sqlite";
import type { StoredRun, StudioListOptions, StudioRepository } from "../app/storePort.js";

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
const LEASE_MS = 8_000;

export class StudioDatabase implements StudioRepository {
  private readonly db: DatabaseType;
  private inTransaction = false;
  private dirty = false;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const version = this.db.prepare("PRAGMA user_version").get()?.user_version;
      if (version !== 0 && version !== 1 && version !== 2)
        throw new Error("Studio 数据版本较新，请使用较新版本打开。");
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS studio_entities (
        kind TEXT NOT NULL, id TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '',
        value TEXT NOT NULL, sequence INTEGER NOT NULL, PRIMARY KEY(kind,id)
      );
      CREATE INDEX IF NOT EXISTS studio_scope ON studio_entities(kind,scope,sequence);
      CREATE INDEX IF NOT EXISTS studio_pending_interactions ON studio_entities(scope,sequence)
        WHERE kind='interaction' AND json_extract(value,'$.status')='pending';
      CREATE INDEX IF NOT EXISTS studio_pending_steering ON studio_entities(scope,sequence)
        WHERE kind='steering' AND json_extract(value,'$.state')='pending';
      CREATE INDEX IF NOT EXISTS studio_unresolved_runs ON studio_entities(scope,sequence)
        WHERE kind='run' AND json_extract(value,'$.state')='interrupted'
          AND json_extract(value,'$.resultKnown') IS NOT 1;
      CREATE TABLE IF NOT EXISTS studio_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO studio_meta VALUES ('revision','0');
    `);
      if (version === 1)
        this.db.exec(`
          WITH ordered AS MATERIALIZED (
            SELECT rowid AS old_rowid,
              ROW_NUMBER() OVER (ORDER BY sequence,rowid) AS new_sequence
            FROM studio_entities
          )
          UPDATE studio_entities SET sequence=(
            SELECT new_sequence FROM ordered WHERE old_rowid=studio_entities.rowid
          );
        `);
      this.db.exec(`
        INSERT OR IGNORE INTO studio_meta(key,value)
          SELECT 'sequence',CAST(COALESCE(MAX(sequence),0) AS TEXT) FROM studio_entities;
        PRAGMA user_version=2;
        COMMIT;
      `);
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.db.close();
      throw error;
    }
  }

  read<T>(kind: string, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT value FROM studio_entities WHERE kind=? AND id=?")
      .get(kind, id);
    return row ? (JSON.parse(String(row.value)) as T) : undefined;
  }

  list<T>(kind: string, options: StudioListOptions = {}): T[] {
    if (options.pendingInteractionsOnly && kind !== "interaction")
      throw new Error("Pending interaction filter requires interaction records");
    if (options.pendingSteeringOnly && kind !== "steering")
      throw new Error("Pending steering filter requires steering records");
    if (options.unresolvedRunsOnly && kind !== "run")
      throw new Error("Unresolved run filter requires run records");
    const direction = options.oldestFirst ? "ASC" : "DESC";
    const rows = this.db
      .prepare(`SELECT value,sequence FROM studio_entities WHERE kind=?
      ${options.pendingInteractionsOnly ? "AND json_extract(value,'$.status')='pending'" : ""}
      ${options.pendingSteeringOnly ? "AND json_extract(value,'$.state')='pending'" : ""}
      ${options.unresolvedRunsOnly ? "AND json_extract(value,'$.state')='interrupted' AND json_extract(value,'$.resultKnown') IS NOT 1" : ""}
      AND (? IS NULL OR scope=?) AND sequence<? ORDER BY sequence ${direction},id ${direction} LIMIT ?`)
      .all(
        kind,
        options.scope ?? null,
        options.scope ?? null,
        options.before ?? Number.MAX_SAFE_INTEGER,
        Math.min(options.limit ?? 1000, 10_000),
      );
    return rows.map((row) => {
      const value = JSON.parse(String(row.value));
      return (kind === "message" ? { ...value, sequence: Number(row.sequence) } : value) as T;
    });
  }

  queuedRuns(): StoredRun[] {
    return this.db
      .prepare(`SELECT run.value FROM studio_entities AS active
        JOIN studio_entities AS run ON run.kind='run' AND run.id=active.id
        WHERE active.kind='active' AND json_extract(run.value,'$.state')='queued'
        ORDER BY run.sequence ASC LIMIT 1000`)
      .all()
      .map((row) => JSON.parse(String(row.value)) as StoredRun);
  }

  write<T>(kind: string, id: string, value: T, scope = ""): void {
    if (!this.inTransaction) throw new Error("Studio mutation requires transaction");
    const json = JSON.stringify(value);
    if (json.length > 4_000_000) throw new Error("Studio 记录超过大小限制");
    const sequence = Number(
      this.db
        .prepare(
          "UPDATE studio_meta SET value=CAST(value AS INTEGER)+1 WHERE key='sequence' RETURNING value",
        )
        .get()?.value,
    );
    if (!Number.isSafeInteger(sequence)) throw new Error("Studio 消息游标超过安全范围");
    this.db
      .prepare(`INSERT INTO studio_entities VALUES (?,?,?,?,?)
      ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value,scope=excluded.scope`)
      .run(kind, id, scope, json, sequence);
    this.dirty = true;
  }

  remove(kind: string, id: string): void {
    if (!this.inTransaction) throw new Error("Studio mutation requires transaction");
    this.db.prepare("DELETE FROM studio_entities WHERE kind=? AND id=?").run(kind, id);
    this.dirty = true;
  }

  transaction<T>(operation: () => T): T {
    if (this.inTransaction) throw new Error("Nested Studio transaction");
    this.db.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    this.dirty = false;
    try {
      const result = operation();
      if (result instanceof Promise) throw new Error("Async Studio transaction is forbidden");
      if (this.dirty)
        this.db
          .prepare("UPDATE studio_meta SET value=? WHERE key='revision'")
          .run(String(this.revision() + 1));
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  revision(): number {
    return Number(
      this.db.prepare("SELECT value FROM studio_meta WHERE key='revision'").get()?.value ?? 0,
    );
  }

  claim(owner: string, now: number): "owner" | "acquired" | "busy" {
    return this.transaction(() => {
      const raw = this.db
        .prepare("SELECT value FROM studio_meta WHERE key='executor'")
        .get()?.value;
      const lease = raw ? (JSON.parse(String(raw)) as { owner: string; until: number }) : undefined;
      if (lease && lease.owner !== owner && lease.until > now) return "busy";
      const result = lease?.owner === owner && lease.until > now ? "owner" : "acquired";
      this.db
        .prepare(
          "INSERT INTO studio_meta VALUES('executor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(JSON.stringify({ owner, until: now + LEASE_MS }));
      return result;
    });
  }

  owns(owner: string, now: number): boolean {
    const raw = this.db.prepare("SELECT value FROM studio_meta WHERE key='executor'").get()?.value;
    if (!raw) return false;
    const lease = JSON.parse(String(raw)) as { owner: string; until: number };
    return lease.owner === owner && lease.until > now;
  }

  release(owner: string): void {
    this.transaction(() => {
      const raw = this.db
        .prepare("SELECT value FROM studio_meta WHERE key='executor'")
        .get()?.value;
      if (raw && (JSON.parse(String(raw)) as { owner: string }).owner === owner)
        this.db.prepare("DELETE FROM studio_meta WHERE key='executor'").run();
    });
  }

  close(): void {
    this.db.close();
  }
}

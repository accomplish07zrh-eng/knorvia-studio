-- SPDX-License-Identifier: Apache-2.0
-- Actual v0.10.0 schema declarations at
-- 34078257b5d9d1e78c40308b34dab8ff45565156, without using the new constructor.
PRAGMA busy_timeout=5000;
PRAGMA synchronous=FULL;
PRAGMA journal_mode=WAL;
CREATE TABLE studio_entities (
  kind TEXT NOT NULL, id TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL, sequence INTEGER NOT NULL, PRIMARY KEY(kind,id)
);
CREATE INDEX studio_scope ON studio_entities(kind,scope,sequence);
CREATE INDEX studio_pending_interactions ON studio_entities(scope,sequence)
  WHERE kind='interaction' AND json_extract(value,'$.status')='pending';
CREATE INDEX studio_pending_steering ON studio_entities(scope,sequence)
  WHERE kind='steering' AND json_extract(value,'$.state')='pending';
CREATE INDEX studio_unresolved_runs ON studio_entities(scope,sequence)
  WHERE kind='run' AND json_extract(value,'$.state')='interrupted'
    AND json_extract(value,'$.resultKnown') IS NOT 1;
CREATE TABLE studio_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO studio_meta VALUES ('revision','23'), ('sequence','4');
PRAGMA user_version=2;

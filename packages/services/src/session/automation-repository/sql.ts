// Fixed SQL compatibility data retained from the designated packet.
export const sql = {
  begin: "BEGIN IMMEDIATE",
  commit: "COMMIT",
  rollback: "ROLLBACK",
  wal: "PRAGMA journal_mode = WAL",
  normal: "PRAGMA synchronous = NORMAL",
  read: "SELECT * FROM automations\n        WHERE automation_id = @id\n          AND (@workspace_key IS NULL OR workspace_key = @workspace_key)",
  count: "SELECT COUNT(*) AS count FROM automations",
  create:
    "INSERT INTO automations (\n          automation_id, title, cron_expr, prompt, model, provider, model_selection,\n          workspace_key, workspace_path, workspace_identity, target_task_id, studio_workflow_id, location_kind,\n          recurring, max_runs, end_at, schedule_rule, schedule_edited_by_user,\n          run_count, enabled, lifecycle_status,\n          next_run_at, last_run_at, running, claimed_at,\n          dispatch_status, dispatch_attempts, retry_at, last_error,\n          mode, thought_level,\n          created_at, updated_at\n        ) VALUES (\n          @automation_id, @title, @cron_expr, @prompt, @model, @provider, @model_selection,\n          @workspace_key, @workspace_path, @workspace_identity, @target_task_id, @studio_workflow_id, 'local',\n          @recurring, @max_runs, @end_at, @schedule_rule, 0,\n          0, @enabled, @lifecycle_status,\n          @next_run_at, NULL, 0, NULL,\n          'idle', 0, NULL, NULL,\n          @mode, @thought_level,\n          @created_at, @updated_at\n        )",
  list: "SELECT * FROM automations\n        WHERE (@workspace_key IS NULL OR workspace_key = @workspace_key)\n        ORDER BY created_at DESC",
  binding:
    "SELECT 1 AS bound FROM automations\n        WHERE workspace_key = @workspace_key AND target_task_id = @target_task_id\n        LIMIT 1",
  delete:
    "DELETE FROM automations\n        WHERE automation_id = @id\n          AND (@workspace_key IS NULL OR workspace_key = @workspace_key)",
  enabled:
    "UPDATE automations\n        SET enabled = @enabled,\n            lifecycle_status = @lifecycle_status,\n            updated_at = @now\n        WHERE automation_id = @id\n          AND (@workspace_key IS NULL OR workspace_key = @workspace_key)",
  restart:
    "UPDATE automations\n        SET lifecycle_status = 'active',\n            enabled = 1,\n            run_count = 0,\n            scheduled_run_count = 0,\n            dispatch_attempts = 0,\n            retry_at = NULL,\n            dispatch_status = 'idle',\n            running = 0,\n            claimed_at = NULL,\n            next_run_at = @next_run_at,\n            last_error = NULL,\n            updated_at = @now\n        WHERE automation_id = @id\n          AND (@workspace_key IS NULL OR workspace_key = @workspace_key)",
  stale:
    "UPDATE automations\n        SET running = 0, claimed_at = NULL\n        WHERE running = 1 AND claimed_at IS NOT NULL AND claimed_at <= @stale",
  manualClaim:
    "UPDATE automations\n          SET running = 1, claimed_at = @now, updated_at = @now\n          WHERE automation_id = @id\n            AND running = 0\n            AND (@workspace_key IS NULL OR workspace_key = @workspace_key)",
  manualInsert:
    "INSERT INTO automation_runs (\n          run_id, automation_id, workspace_key, scheduled_at, trigger,\n          model_selection, dispatch_status, attempts, created_at, updated_at\n        ) VALUES (\n          @run_id, @automation_id, @workspace_key, @scheduled_at, 'manual',\n          @model_selection, 'claimed', 1, @now, @now\n        )",
  expire:
    "UPDATE automations\n        SET lifecycle_status = 'completed', enabled = 0, next_run_at = NULL,\n            retry_at = NULL, running = 0, claimed_at = NULL, updated_at = @now\n        WHERE enabled = 1 AND end_at IS NOT NULL AND end_at < @now",
  due: "SELECT * FROM automations\n          WHERE enabled = 1 AND running = 0\n            AND (\n              (retry_at IS NOT NULL AND retry_at <= @now)\n              OR (retry_at IS NULL AND next_run_at IS NOT NULL AND next_run_at <= @now)\n            )",
  dueClaim:
    "UPDATE automations\n        SET running = 1, claimed_at = @now, dispatch_status = 'claimed', updated_at = @now\n        WHERE automation_id = @id AND running = 0",
  manualDue:
    "SELECT\n            a.automation_id AS a_automation_id,\n            a.title AS a_title,\n            a.cron_expr AS a_cron_expr,\n            a.prompt AS a_prompt,\n            a.model AS a_model,\n            a.provider AS a_provider,\n            a.model_selection AS a_model_selection,\n            a.mode AS a_mode,\n            a.thought_level AS a_thought_level,\n            a.workspace_key AS a_workspace_key,\n            a.workspace_path AS a_workspace_path,\n            a.workspace_identity AS a_workspace_identity,\n            a.target_task_id AS a_target_task_id,\n            a.studio_workflow_id AS a_studio_workflow_id,\n            a.location_kind AS a_location_kind,\n            a.recurring AS a_recurring,\n            a.max_runs AS a_max_runs,\n            a.end_at AS a_end_at,\n            a.schedule_rule AS a_schedule_rule,\n            a.schedule_edited_by_user AS a_schedule_edited_by_user,\n            a.run_count AS a_run_count,\n            a.scheduled_run_count AS a_scheduled_run_count,\n            a.enabled AS a_enabled,\n            a.lifecycle_status AS a_lifecycle_status,\n            a.next_run_at AS a_next_run_at,\n            a.last_run_at AS a_last_run_at,\n            a.running AS a_running,\n            a.claimed_at AS a_claimed_at,\n            a.dispatch_status AS a_dispatch_status,\n            a.dispatch_attempts AS a_dispatch_attempts,\n            a.retry_at AS a_retry_at,\n            a.last_error AS a_last_error,\n            a.created_at AS a_created_at,\n            a.updated_at AS a_updated_at,\n            r.run_id AS r_run_id,\n            r.automation_id AS r_automation_id,\n            r.workspace_key AS r_workspace_key,\n            r.scheduled_at AS r_scheduled_at,\n            r.trigger AS r_trigger,\n            r.model_selection AS r_model_selection,\n            r.dispatch_status AS r_dispatch_status,\n            r.outcome AS r_outcome,\n            r.session_id AS r_session_id,\n            r.error AS r_error,\n            r.attempts AS r_attempts,\n            r.created_at AS r_created_at,\n            r.updated_at AS r_updated_at\n          FROM automation_runs r\n          JOIN automations a ON a.automation_id = r.automation_id\n          WHERE r.trigger = 'manual'\n            AND r.dispatch_status = 'claimed'\n            AND a.running = 0\n            AND (r.attempts = 0 OR r.updated_at <= @stale)\n          ORDER BY r.created_at ASC",
  reclaimedManual:
    "UPDATE automations\n        SET running = 1, claimed_at = @now, updated_at = @now\n        WHERE automation_id = @id AND running = 0",
  manualAttempt:
    "UPDATE automation_runs\n        SET attempts = attempts + 1, updated_at = @now\n        WHERE run_id = @run_id AND trigger = 'manual' AND dispatch_status = 'claimed'",
  dispatched:
    "UPDATE automations\n        SET run_count = @run_count,\n            scheduled_run_count = @scheduled_run_count,\n            last_run_at = @dispatched_at,\n            dispatch_status = 'dispatched',\n            dispatch_attempts = 0,\n            retry_at = NULL,\n            last_error = NULL,\n            running = 0,\n            claimed_at = NULL,\n            lifecycle_status = @lifecycle_status,\n            enabled = @enabled,\n            next_run_at = @next_run_at,\n            updated_at = @now\n        WHERE automation_id = @id",
  permanentFailure:
    "UPDATE automations\n        SET dispatch_status = 'failed_to_dispatch', lifecycle_status = 'failed',\n            enabled = 0, running = 0, claimed_at = NULL,\n            last_error = @error, updated_at = @now\n        WHERE automation_id = @id",
  recurringFailure:
    "UPDATE automations\n          SET dispatch_status = 'idle', dispatch_attempts = 0, retry_at = NULL,\n              running = 0, claimed_at = NULL, next_run_at = @next_run_at,\n              last_error = @error, updated_at = @now\n          WHERE automation_id = @id",
  exhaustedFailure:
    "UPDATE automations\n          SET dispatch_status = 'failed_to_dispatch', lifecycle_status = 'failed',\n              enabled = 0, running = 0, claimed_at = NULL,\n              last_error = @error, updated_at = @now\n          WHERE automation_id = @id",
  retry:
    "UPDATE automations\n      SET dispatch_status = 'failed_to_dispatch', dispatch_attempts = @attempts,\n          retry_at = @retry_at, running = 0, claimed_at = NULL,\n          last_error = @error, updated_at = @now\n      WHERE automation_id = @id",
  release:
    "UPDATE automations\n        SET running = 0, claimed_at = NULL, dispatch_status = 'idle', updated_at = @now\n        WHERE automation_id = @id AND running = 1",
  releaseManual:
    "UPDATE automations\n        SET running = 0, claimed_at = NULL, updated_at = @now\n        WHERE automation_id = @id\n          AND workspace_key = @workspace_key\n          AND running = 1",
  touchManual:
    "UPDATE automations\n        SET claimed_at = @now, updated_at = @now\n        WHERE automation_id = @id\n          AND workspace_key = @workspace_key\n          AND running = 1",
  scheduleSkip:
    "INSERT INTO automation_runs (\n          run_id, automation_id, workspace_key, scheduled_at, trigger,\n          dispatch_status, error, attempts, created_at, updated_at\n        ) VALUES (@run_id, @automation_id, @workspace_key, @scheduled_at, 'schedule', 'skipped', @reason, 0, @now, @now)\n        ON CONFLICT(run_id) DO UPDATE SET\n          dispatch_status = 'skipped', error = excluded.error, updated_at = excluded.updated_at",
  finalize:
    "UPDATE automations\n          SET lifecycle_status = 'completed', enabled = 0, next_run_at = NULL,\n              running = 0, claimed_at = NULL,\n              dispatch_status = 'idle', dispatch_attempts = 0, retry_at = NULL,\n              updated_at = @now\n          WHERE automation_id = @id",
  reschedule:
    "UPDATE automations\n          SET next_run_at = @next_run_at, running = 0, claimed_at = NULL,\n              dispatch_status = 'idle', dispatch_attempts = 0, retry_at = NULL,\n              updated_at = @now\n          WHERE automation_id = @id",
  ensureRun:
    "INSERT INTO automation_runs (\n          run_id, automation_id, workspace_key, scheduled_at, trigger,\n          dispatch_status, attempts, created_at, updated_at\n        ) VALUES (@run_id, @automation_id, @workspace_key, @scheduled_at, @trigger, 'claimed', 0, @now, @now)\n        ON CONFLICT(run_id) DO NOTHING",
  upsertRun:
    "INSERT INTO automation_runs (\n          run_id, automation_id, workspace_key, scheduled_at, trigger,\n          model_selection, dispatch_status, attempts, created_at, updated_at\n        ) VALUES (@run_id, @automation_id, @workspace_key, @scheduled_at, @trigger, @model_selection, 'claimed', 0, @now, @now)\n        ON CONFLICT(run_id) DO UPDATE SET\n          dispatch_status = 'claimed',\n          model_selection = COALESCE(automation_runs.model_selection, excluded.model_selection),\n          outcome = NULL,\n          error = NULL,\n          attempts = attempts + 1,\n          updated_at = excluded.updated_at",
  fixModel:
    "UPDATE automation_runs\n       SET model_selection = COALESCE(model_selection, @model_selection), updated_at = @now\n       WHERE run_id = @run_id",
  readModel: "SELECT model_selection FROM automation_runs WHERE run_id = @run_id",
  runDispatch:
    "UPDATE automation_runs\n        SET dispatch_status = @dispatch_status,\n            session_id = COALESCE(@session_id, session_id),\n            error = @error,\n            updated_at = @now\n        WHERE run_id = @run_id",
  readManual:
    "SELECT automation_id, workspace_key, dispatch_status\n          FROM automation_runs\n          WHERE run_id = @run_id AND trigger = 'manual'",
  manualDispatched:
    "UPDATE automation_runs\n        SET dispatch_status = 'dispatched',\n            session_id = COALESCE(@session_id, session_id),\n            error = NULL,\n            updated_at = @now\n        WHERE run_id = @run_id AND trigger = 'manual' AND dispatch_status <> 'dispatched'",
  manualCount:
    "UPDATE automations\n          SET run_count = run_count + 1,\n              last_run_at = @dispatched_at,\n              updated_at = @now\n          WHERE automation_id = @automation_id AND workspace_key = @workspace_key",
  outcome:
    "UPDATE automation_runs\n        SET outcome = CASE\n              WHEN @outcome = 'running' AND outcome IS NOT NULL AND outcome <> 'running' THEN outcome\n              ELSE @outcome\n            END,\n            error = CASE\n              WHEN @outcome = 'running' AND outcome IS NOT NULL AND outcome <> 'running' THEN error\n              ELSE COALESCE(@error, error)\n            END,\n            updated_at = @now\n        WHERE run_id = @run_id",
  unsettled:
    "SELECT r.run_id, r.automation_id, r.workspace_key, r.scheduled_at, r.trigger,\n              r.session_id, a.studio_workflow_id\n       FROM automation_runs r JOIN automations a ON a.automation_id = r.automation_id\n       WHERE a.studio_workflow_id IS NOT NULL AND r.session_id IS NOT NULL\n         AND (r.outcome IS NULL OR r.outcome = 'running')\n       ORDER BY r.created_at DESC LIMIT 1000",
  skipped:
    "INSERT INTO automation_runs (\n          run_id, automation_id, workspace_key, scheduled_at, trigger,\n          dispatch_status, error, attempts, created_at, updated_at\n        ) VALUES (@run_id, @automation_id, @workspace_key, @scheduled_at, @trigger, 'skipped', @reason, 0, @now, @now)\n        ON CONFLICT(run_id) DO UPDATE SET\n          dispatch_status = 'skipped', error = excluded.error, updated_at = excluded.updated_at",
  runs: "SELECT * FROM automation_runs\n        WHERE automation_id = @id\n          AND (@workspace_key IS NULL OR workspace_key = @workspace_key)\n        ORDER BY created_at DESC",
  run: "SELECT * FROM automation_runs WHERE run_id = @run_id",
  deleteRun:
    "DELETE FROM automation_runs\n        WHERE run_id = @run_id\n          AND (@workspace_key IS NULL OR workspace_key = @workspace_key)",
  prune: "DELETE FROM automation_runs WHERE created_at < ?",
  update:
    "UPDATE automations SET\n          title = @title, cron_expr = @cron_expr, prompt = @prompt, model = @model, provider = @provider,\n          model_selection = @model_selection,\n          mode = @mode, thought_level = @thought_level,\n          recurring = @recurring, max_runs = @max_runs, end_at = @end_at,\n          schedule_rule = @schedule_rule,\n          schedule_edited_by_user = @schedule_edited_by_user,\n          next_run_at = @next_run_at, lifecycle_status = @lifecycle_status,\n          dispatch_attempts = @dispatch_attempts, retry_at = @retry_at, dispatch_status = @dispatch_status,\n          enabled = @enabled, updated_at = @updated_at\n        WHERE automation_id = @automation_id",
};

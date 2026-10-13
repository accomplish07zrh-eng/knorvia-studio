# apps-cli-packages-01 冻结 SQL 清单

用途：逐条列出必须**逐字节保留**的 SQL/DDL 行（兼容既有数据库、checksum 必须一致）。
`similarity.mjs --sql-freeze <本文件>` 会按「精确行匹配」把这些行从计分中剔除；剔除只影响计分，不改动任何文件。

## `apps/cli/packages/adapters/src/storage/session-store/migrations/0021-official-glm-selection.ts`

迁移版本：0021（官方 GLM 展示名回填）。保留理由：19 条模型 id 映射与 provider 白名单是发布时快照，字节必须一致。

```sql
export const OFFICIAL_GLM_SELECTION_MIGRATION_SQL = `
UPDATE session_entry
SET data = json_set(data, '$.modelSelection.modelId',
  CASE lower(json_extract(data, '$.modelSelection.modelId'))
    WHEN 'glm-5.3' THEN 'GLM-5.3'
    WHEN 'glm-5.3-flash' THEN 'GLM-5.3-Flash'
    WHEN 'glm-5v-turbo' THEN 'GLM-5V-Turbo'
    WHEN 'glm-5.2' THEN 'GLM-5.2'
    WHEN 'glm-5.1' THEN 'GLM-5.1'
    WHEN 'glm-5.1-highspeed' THEN 'GLM-5.1-Highspeed'
    WHEN 'glm-5' THEN 'GLM-5'
    WHEN 'glm-5-turbo' THEN 'GLM-5-Turbo'
    WHEN 'glm-4.7' THEN 'GLM-4.7'
    WHEN 'glm-4.7-flashx' THEN 'GLM-4.7-FlashX'
    WHEN 'glm-4.7-flash' THEN 'GLM-4.7-Flash'
    WHEN 'glm-4.6' THEN 'GLM-4.6'
    WHEN 'glm-4.5-air' THEN 'GLM-4.5-Air'
    WHEN 'glm-4.5' THEN 'GLM-4.5'
    WHEN 'glm-4.6v' THEN 'GLM-4.6V'
    WHEN 'glm-4.6v-flash' THEN 'GLM-4.6V-Flash'
    WHEN 'glm-4.6v-flashx' THEN 'GLM-4.6V-FlashX'
    WHEN 'glm-4.1v-thinking-flashx' THEN 'GLM-4.1V-Thinking-FlashX'
    WHEN 'glm-4.1v-thinking-flash' THEN 'GLM-4.1V-Thinking-Flash'
    WHEN 'glm-4-flashx-250414' THEN 'GLM-4-FlashX-250414'
    WHEN 'glm-4-flash-250414' THEN 'GLM-4-Flash-250414'
    WHEN 'glm-4v-flash' THEN 'GLM-4V-Flash'
    ELSE json_extract(data, '$.modelSelection.modelId')
  END)
WHERE type = 'runtime/model_selection' AND CASE WHEN json_valid(data) THEN
  json_extract(data, '$.modelSelection.providerId') IN ('account:zai-start-plan', 'account:bigmodel-start-plan', 'account:zai-individual-coding-plan', 'account:bigmodel-individual-coding-plan', 'account:zai-team-coding-plan', 'account:bigmodel-team-coding-plan')
  AND lower(json_extract(data, '$.modelSelection.modelId')) IN ('glm-5.3', 'glm-5.3-flash', 'glm-5v-turbo', 'glm-5.2', 'glm-5.1', 'glm-5.1-highspeed', 'glm-5', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flashx', 'glm-4.7-flash', 'glm-4.6', 'glm-4.5-air', 'glm-4.5', 'glm-4.6v', 'glm-4.6v-flash', 'glm-4.6v-flashx', 'glm-4.1v-thinking-flashx', 'glm-4.1v-thinking-flash', 'glm-4-flashx-250414', 'glm-4-flash-250414', 'glm-4v-flash')
  ELSE 0 END;
`;
```

0022 冻结行 61

## `apps/cli/packages/adapters/src/storage/session-store/migrations/0022-backfilled-session-reasoning.ts`

迁移版本：0022（回填会话 reasoning）。保留理由：与 0020/0021 同批发布，旧库必须能按原 SQL 读回，checksum 覆盖文本。

```sql
export const BACKFILLED_SESSION_REASONING_MIGRATION_SQL = `
WITH last_user AS (
  SELECT session_id, data, row_number() OVER (
    PARTITION BY session_id ORDER BY sequence DESC, time_created DESC, rowid DESC
  ) AS rank
  FROM message
  WHERE CASE WHEN json_valid(data) THEN json_extract(data, '$.role') = 'user' ELSE 0 END
), normalized_user AS (
  SELECT session_id,
    CASE trim(json_extract(data, '$.modelSelection.providerId'))
      WHEN 'builtin:bigmodel' THEN 'bigmodel-api'
      WHEN 'builtin:zai' THEN 'zai-api'
      WHEN 'builtin:bigmodel-start-plan' THEN 'account:bigmodel-start-plan'
      WHEN 'builtin:zai-start-plan' THEN 'account:zai-start-plan'
      WHEN 'builtin:bigmodel-coding-plan' THEN 'account:bigmodel-individual-coding-plan'
      WHEN 'builtin:zai-coding-plan' THEN 'account:zai-individual-coding-plan'
      ELSE CASE WHEN substr(trim(json_extract(data, '$.modelSelection.providerId')), 1, 8) = 'builtin:'
        THEN NULL ELSE trim(json_extract(data, '$.modelSelection.providerId')) END
    END AS provider_id,
    trim(json_extract(data, '$.modelSelection.modelId')) AS model_id,
    json_extract(data, '$.modelSelection.options.reasoningLevel') AS level
  FROM last_user
  WHERE rank = 1
    AND json_type(data, '$.modelSelection.providerId') = 'text'
    AND json_type(data, '$.modelSelection.modelId') = 'text'
    AND json_type(data, '$.modelSelection.options.reasoningLevel') = 'text'
    AND length(trim(json_extract(data, '$.modelSelection.options.reasoningLevel'))) > 0
), canonical_user AS (
  SELECT session_id, provider_id, level,
    CASE WHEN provider_id IN (${officialProviders.map((id) => `'${id}'`).join(", ")})
      THEN CASE lower(model_id)
        ${officialModels.map((id) => `WHEN '${id.toLowerCase()}' THEN '${id}'`).join("\n        ")}
        ELSE model_id END
      ELSE model_id END AS model_id
  FROM normalized_user
), untouched_entries AS (
  SELECT e.id, CASE WHEN json_valid(e.data) THEN e.data ELSE '{}' END AS data, e.session_id
  FROM session_entry e
  JOIN session s ON s.id = e.session_id
  JOIN schema_migration m ON m.id = '0020_provider_model_selection'
  WHERE e.type = 'runtime/model_selection'
    AND e.id = e.session_id || ':runtime-model-selection'
    AND e.time_updated <= m.time_applied AND s.time_updated <= m.time_applied
), repairs AS (
  SELECT e.id, u.level
  FROM untouched_entries e JOIN canonical_user u ON u.session_id = e.session_id
  WHERE json_type(e.data, '$.providerId') IS NULL
    AND json_type(e.data, '$.modelId') IS NULL
    AND json_type(e.data, '$.thoughtLevel') IS NULL
    AND json_type(e.data, '$.modelSelection.options') IS NULL
    AND json_type(e.data, '$.modelSelection.providerId') = 'text'
    AND json_type(e.data, '$.modelSelection.modelId') = 'text'
    AND length(u.provider_id) > 0 AND length(u.model_id) > 0
    AND json_extract(e.data, '$.modelSelection.providerId') = u.provider_id
    AND json_extract(e.data, '$.modelSelection.modelId') = u.model_id
)
UPDATE session_entry AS e
SET data = json_set(data, '$.modelSelection.options.reasoningLevel',
  (SELECT level FROM repairs WHERE repairs.id = e.id))
WHERE id IN (SELECT id FROM repairs);
`;
```

migrations.ts 分组 22 个版本、冻结行 720；首个版本 0001_base_session_store 行数 86

## `apps/cli/packages/adapters/src/storage/session-store/migrations.ts`

迁移版本：0001–0022 全量（按版本分块列出，便于逐条审计）。保留理由：既有库的 DDL/DML 必须字节一致，checksum 账本按文本计算。

版本 0001_base_session_store（86 行）：

```sql
    sql: `
      create table if not exists session (
        id text primary key,
        project_id text not null,
        workspace_id text,
        parent_id text,
        slug text not null,
        directory text not null,
        path text,
        title text not null,
        version text not null,
        share_url text,
        summary_additions integer,
        summary_deletions integer,
        summary_files integer,
        summary_diffs text,
        revert text,
        permission text,
        time_created integer not null,
        time_updated integer not null,
        time_compacting integer,
        time_archived integer
      );
      create index if not exists session_project_idx on session(project_id);
      create index if not exists session_workspace_idx on session(workspace_id);
      create index if not exists session_parent_idx on session(parent_id);
      create table if not exists message (
        id text primary key,
        session_id text not null references session(id) on delete cascade,
        time_created integer not null,
        time_updated integer not null,
        data text not null
      );
      create index if not exists message_session_time_created_id_idx
        on message(session_id, time_created, id);
      create table if not exists part (
        id text primary key,
        message_id text not null references message(id) on delete cascade,
        session_id text not null,
        time_created integer not null,
        time_updated integer not null,
        data text not null
      );
      create index if not exists part_message_id_id_idx on part(message_id, id);
      create index if not exists part_session_idx on part(session_id);
      create table if not exists todo (
        session_id text not null references session(id) on delete cascade,
        content text not null,
        status text not null,
        priority text not null,
        position integer not null,
        time_created integer not null,
        time_updated integer not null,
        primary key(session_id, position)
      );
      create index if not exists todo_session_idx on todo(session_id);
      create table if not exists session_entry (
        id text primary key,
        session_id text not null references session(id) on delete cascade,
        type text not null,
        time_created integer not null,
        time_updated integer not null,
        data text not null
      );
      create index if not exists session_entry_session_idx on session_entry(session_id);
      create index if not exists session_entry_session_type_idx on session_entry(session_id, type);
      create index if not exists session_entry_time_created_idx on session_entry(time_created);
      create table if not exists permission (
        project_id text primary key,
        time_created integer not null,
        time_updated integer not null,
        data text not null
      );
      create table if not exists input_history (
        id text primary key,
        project_id text not null,
        session_id text,
        text text not null,
        kind text not null,
        time_created integer not null
      );
      create index if not exists input_history_project_time_idx
        on input_history(project_id, time_created desc, id desc);
      create index if not exists input_history_time_idx
        on input_history(time_created desc, id desc);
    `,
```

版本 0002_local_setting（17 行）：

```sql
    sql: `
      create table if not exists local_setting (
        scope text not null,
        scope_id text not null,
        namespace text not null,
        key text not null,
        value text not null,
        schema_version integer not null,
        time_created integer not null,
        time_updated integer not null,
        primary key(scope, scope_id, namespace, key)
      );
      create index if not exists local_setting_scope_idx
        on local_setting(scope, scope_id);
      create index if not exists local_setting_namespace_key_idx
        on local_setting(namespace, key);
    `,
```

版本 0003_backfill_permission_local_setting（23 行）：

```sql
    sql: `
      insert or ignore into local_setting (
        scope,
        scope_id,
        namespace,
        key,
        value,
        schema_version,
        time_created,
        time_updated
      )
      select
        'project',
        project_id,
        'permission',
        'ruleset',
        data,
        1,
        time_created,
        time_updated
      from permission
      where data is not null;
    `,
```

版本 0004_session_target（10 行）：

```sql
    sql: `
      create table if not exists session_target (
        session_id text primary key references session(id) on delete cascade,
        target_id text not null,
        objective text not null,
        status text not null check(status in ('active', 'paused', 'complete')),
        time_created integer not null,
        time_updated integer not null
      );
    `,
```

版本 0005_session_target_accounting（37 行）：

```sql
    sql: `
      create table if not exists session_target_next (
        session_id text primary key references session(id) on delete cascade,
        target_id text not null,
        objective text not null,
        status text not null check(status in ('active', 'paused', 'budget_limited', 'complete')),
        token_budget integer,
        tokens_used integer not null default 0,
        time_used_seconds integer not null default 0,
        time_created integer not null,
        time_updated integer not null
      );
      insert into session_target_next (
        session_id,
        target_id,
        objective,
        status,
        token_budget,
        tokens_used,
        time_used_seconds,
        time_created,
        time_updated
      )
      select
        session_id,
        target_id,
        objective,
        status,
        null,
        0,
        0,
        time_created,
        time_updated
      from session_target;
      drop table session_target;
      alter table session_target_next rename to session_target;
    `,
```

版本 0006_input_history_attachments（3 行）：

```sql
    sql: `
      alter table input_history add column attachments text;
    `,
```

版本 0007_workflow_script_runtime（127 行）：

```sql
    sql: `
      alter table session add column task_type text not null default 'interactive';
      create index if not exists session_task_type_idx on session(task_type);
      create table if not exists workflow_definition (
        id text primary key,
        name text not null,
        source text not null check(source in ('builtin', 'user')),
        trusted integer not null default 0 check(trusted in (0, 1)),
        enabled integer not null default 1 check(enabled in (0, 1)),
        script_path text,
        script_hash text not null,
        meta_json text not null,
        time_created integer not null,
        time_updated integer not null
      );
      create index if not exists workflow_definition_source_idx
        on workflow_definition(source, enabled);
      create table if not exists workflow_run (
        id text primary key,
        definition_id text,
        name text not null,
        kind text not null default 'script',
        parent_session_id text references session(id) on delete set null,
        cwd text not null,
        script_path text,
        script_hash text not null,
        args_json text,
        args_hash text,
        status text not null check(status in (
          'pending',
          'running',
          'paused',
          'completed',
          'failed',
          'cancelled'
        )),
        current_phase text,
        budget_total integer,
        budget_spent integer not null default 0,
        stats_json text,
        failure_json text,
        time_created integer not null,
        time_started integer,
        time_updated integer not null,
        time_completed integer
      );
      create index if not exists workflow_run_parent_session_idx
        on workflow_run(parent_session_id);
      create index if not exists workflow_run_cwd_status_idx
        on workflow_run(cwd, status, time_updated desc);
      create index if not exists workflow_run_definition_idx
        on workflow_run(definition_id);
      create table if not exists workflow_activity (
        id text primary key,
        run_id text not null references workflow_run(id) on delete cascade,
        parent_activity_id text,
        call_index integer not null,
        call_path text not null,
        attempt integer not null default 1,
        type text not null,
        phase text,
        label text,
        input_hash text not null,
        prompt text,
        opts_json text,
        status text not null check(status in (
          'queued',
          'running',
          'completed',
          'failed',
          'skipped',
          'cancelled',
          'cached',
          'lost'
        )),
        child_session_id text references session(id) on delete set null,
        result_json text,
        error_json text,
        time_created integer not null,
        time_started integer,
        time_updated integer not null,
        time_completed integer,
        unique(run_id, call_path, attempt)
      );
      create index if not exists workflow_activity_run_status_idx
        on workflow_activity(run_id, status, call_index);
      create index if not exists workflow_activity_child_session_idx
        on workflow_activity(child_session_id);
      create table if not exists workflow_event (
        id text primary key,
        run_id text not null references workflow_run(id) on delete cascade,
        sequence integer not null,
        type text not null,
        phase text,
        activity_id text references workflow_activity(id) on delete set null,
        payload_json text,
        time_created integer not null,
        unique(run_id, sequence)
      );
      create index if not exists workflow_event_run_sequence_idx
        on workflow_event(run_id, sequence);
      create table if not exists session_task_link (
        id text primary key,
        root_workflow_run_id text references workflow_run(id) on delete cascade,
        parent_link_id text references session_task_link(id) on delete cascade,
        activity_id text references workflow_activity(id) on delete set null,
        parent_session_id text references session(id) on delete set null,
        child_session_id text not null references session(id) on delete cascade,
        role text not null,
        depth integer not null default 0,
        path text not null,
        phase text,
        label text,
        agent_type text,
        model text,
        status text not null,
        time_created integer not null,
        time_updated integer not null,
        unique(child_session_id)
      );
      create index if not exists session_task_link_root_workflow_idx
        on session_task_link(root_workflow_run_id, depth, path);
      create index if not exists session_task_link_parent_idx
        on session_task_link(parent_link_id);
      create index if not exists session_task_link_activity_idx
        on session_task_link(activity_id);
    `,
```

版本 0008_workflow_definition_scope（5 行）：

```sql
    sql: `
      alter table workflow_definition
        add column scope text not null default 'explicit'
        check(scope in ('builtin', 'explicit', 'project', 'user'));
    `,
```

版本 0009_session_title_metadata（9 行）：

```sql
    sql: `
      alter table session
        add column title_source text not null default 'first_input'
        check(title_source in ('default', 'first_input', 'generated', 'custom'));
      alter table session
        add column title_message_id text;
      alter table session
        add column time_title_updated integer;
    `,
```

版本 0010_usage_observability（118 行）：

```sql
    sql: `
      create table if not exists model_usage (
        id text primary key,
        logical_request_id text not null,
        attempt_index integer not null default 0,
        session_id text not null references session(id) on delete cascade,
        turn_id text,
        trace_id text,
        span_id text,
        assistant_message_id text,
        parent_user_message_id text,
        query_source text not null,
        provider_id text not null,
        model_id text not null,
        variant text,
        agent text,
        mode text,
        task_type text,
        status text not null check(status in ('running', 'completed', 'error', 'cancelled')),
        started_at integer not null,
        first_token_at integer,
        completed_at integer,
        duration_ms integer,
        time_to_first_token_ms integer,
        finish_reason text,
        tool_call_count integer not null default 0,
        input_tokens integer not null default 0,
        output_tokens integer not null default 0,
        reasoning_tokens integer not null default 0,
        cache_creation_input_tokens integer not null default 0,
        cache_read_input_tokens integer not null default 0,
        provider_total_tokens integer,
        computed_total_tokens integer not null default 0,
        retry_count integer not null default 0,
        retryable integer not null default 0 check(retryable in (0, 1)),
        cancelled_by_user integer not null default 0 check(cancelled_by_user in (0, 1)),
        context_exceeded integer not null default 0 check(context_exceeded in (0, 1)),
        error_type text,
        error_code text,
        error_message text,
        raw_usage_json text,
        provider_metadata_json text
      );
      create index if not exists model_usage_started_model_idx
        on model_usage(started_at, provider_id, model_id);
      create index if not exists model_usage_session_turn_idx
        on model_usage(session_id, turn_id);
      create index if not exists model_usage_trace_idx
        on model_usage(trace_id);
      create index if not exists model_usage_query_source_idx
        on model_usage(query_source);
      create table if not exists turn_usage (
        session_id text not null references session(id) on delete cascade,
        turn_id text not null,
        trace_id text,
        user_message_id text,
        status text not null check(status in ('running', 'completed', 'error', 'cancelled')),
        started_at integer not null,
        first_model_start_at integer,
        first_token_at integer,
        completed_at integer,
        duration_ms integer,
        time_to_first_token_ms integer,
        model_request_count integer not null default 0,
        model_retry_count integer not null default 0,
        tool_call_count integer not null default 0,
        tool_error_count integer not null default 0,
        input_tokens integer not null default 0,
        output_tokens integer not null default 0,
        reasoning_tokens integer not null default 0,
        cache_creation_input_tokens integer not null default 0,
        cache_read_input_tokens integer not null default 0,
        computed_total_tokens integer not null default 0,
        retryable integer not null default 0 check(retryable in (0, 1)),
        cancelled_by_user integer not null default 0 check(cancelled_by_user in (0, 1)),
        context_exceeded integer not null default 0 check(context_exceeded in (0, 1)),
        error_type text,
        error_code text,
        primary key(session_id, turn_id)
      );
      create index if not exists turn_usage_started_idx
        on turn_usage(started_at);
      create table if not exists tool_usage (
        id text primary key,
        session_id text not null references session(id) on delete cascade,
        turn_id text,
        trace_id text,
        tool_call_id text not null,
        tool_name text not null,
        side_effect_scope text,
        read_only integer check(read_only in (0, 1)),
        destructive integer check(destructive in (0, 1)),
        approval_status text,
        status text not null check(status in ('running', 'completed', 'error', 'cancelled')),
        started_at integer not null,
        first_output_at integer,
        completed_at integer,
        duration_ms integer,
        time_to_first_output_ms integer,
        exit_code integer,
        output_bytes integer not null default 0,
        stdout_bytes integer not null default 0,
        stderr_bytes integer not null default 0,
        truncated integer not null default 0 check(truncated in (0, 1)),
        retry_count integer not null default 0,
        retryable integer not null default 0 check(retryable in (0, 1)),
        cancelled_by_user integer not null default 0 check(cancelled_by_user in (0, 1)),
        error_type text,
        error_code text,
        error_message text
      );
      create unique index if not exists tool_usage_session_tool_call_idx
        on tool_usage(session_id, tool_call_id);
      create index if not exists tool_usage_started_tool_idx
        on tool_usage(started_at, tool_name);
      create index if not exists tool_usage_session_turn_idx
        on tool_usage(session_id, turn_id);
    `,
```

版本 0011_session_target_summary_title（3 行）：

```sql
    sql: `
      alter table session_target add column summary_title text;
    `,
```

版本 0012_session_trace_id（4 行）：

```sql
    sql: `
      alter table session add column trace_id text;
      create index if not exists session_trace_idx on session(trace_id);
    `,
```

版本 0013_session_target_active_run_accounting（5 行）：

```sql
    sql: `
      alter table session_target add column active_input_id text;
      alter table session_target add column active_run_started_at integer;
      alter table session_target add column active_run_last_seen_at integer;
    `,
```

版本 0014_message_part_sequence（42 行）：

```sql
    sql: `
      alter table message add column sequence integer;
      alter table part add column sequence integer;
      with ordered_message as (
        select
          id,
          row_number() over (
            partition by session_id
            order by time_created, rowid
          ) - 1 as stable_sequence
        from message
      )
      update message
      set sequence = (
        select stable_sequence
        from ordered_message
        where ordered_message.id = message.id
      )
      where sequence is null;
      with ordered_part as (
        select
          id,
          row_number() over (
            partition by message_id
            order by time_created, rowid
          ) - 1 as stable_sequence
        from part
      )
      update part
      set sequence = (
        select stable_sequence
        from ordered_part
        where ordered_part.id = part.id
      )
      where sequence is null;
      create index if not exists message_session_sequence_idx
        on message(session_id, sequence, time_created, id);
      create index if not exists part_message_sequence_idx
        on part(message_id, sequence, time_created, id);
      create index if not exists part_session_message_sequence_idx
        on part(session_id, message_id, sequence);
    `,
```

版本 0015_message_part_sequence_backfill_and_guard（72 行）：

```sql
    sql: `
      with session_max as (
        select session_id, coalesce(max(sequence), -1) as max_sequence
        from message
        group by session_id
      ),
      ordered_null_message as (
        select
          m.id as id,
          sm.max_sequence + row_number() over (
            partition by m.session_id
            order by m.time_created, m.rowid
          ) as stable_sequence
        from message m
        join session_max sm on sm.session_id = m.session_id
        where m.sequence is null
      )
      update message
      set sequence = (
        select stable_sequence
        from ordered_null_message
        where ordered_null_message.id = message.id
      )
      where sequence is null;
      with message_max as (
        select message_id, coalesce(max(sequence), -1) as max_sequence
        from part
        group by message_id
      ),
      ordered_null_part as (
        select
          p.id as id,
          mm.max_sequence + row_number() over (
            partition by p.message_id
            order by p.time_created, p.rowid
          ) as stable_sequence
        from part p
        join message_max mm on mm.message_id = p.message_id
        where p.sequence is null
      )
      update part
      set sequence = (
        select stable_sequence
        from ordered_null_part
        where ordered_null_part.id = part.id
      )
      where sequence is null;
      create trigger if not exists message_sequence_autofill
      after insert on message
      when new.sequence is null
      begin
        update message
        set sequence = (
          select coalesce(max(sequence), -1) + 1
          from message
          where session_id = new.session_id
        )
        where id = new.id;
      end;
      create trigger if not exists part_sequence_autofill
      after insert on part
      when new.sequence is null
      begin
        update part
        set sequence = (
          select coalesce(max(sequence), -1) + 1
          from part
          where message_id = new.message_id
        )
        where id = new.id;
      end;
    `,
```

版本 0016_session_input_ledger（20 行）：

```sql
    sql: `
      create table if not exists session_input (
        id text primary key,
        session_id text not null references session(id) on delete cascade,
        kind text not null,
        delivery text not null check(delivery in ('guide', 'queue')),
        payload text not null,
        admitted_sequence integer not null,
        promoted_sequence integer,
        promoted_message_id text,
        status text not null check(status in ('admitted', 'promoted', 'cancelled', 'discarded')),
        status_reason text,
        time_created integer not null,
        time_updated integer not null
      );
      create index if not exists session_input_session_admitted_idx
        on session_input(session_id, admitted_sequence);
      create index if not exists session_input_session_status_idx
        on session_input(session_id, status);
    `,
```

版本 0017_session_input_start_now_delivery（32 行）：

```sql
    sql: `
      alter table session_input rename to session_input_before_start_now;
      create table session_input (
        id text primary key,
        session_id text not null references session(id) on delete cascade,
        kind text not null,
        delivery text not null check(delivery in ('startNow', 'guide', 'queue')),
        payload text not null,
        admitted_sequence integer not null,
        promoted_sequence integer,
        promoted_message_id text,
        status text not null check(status in ('admitted', 'promoted', 'cancelled', 'discarded')),
        status_reason text,
        time_created integer not null,
        time_updated integer not null
      );
      insert into session_input (
        id, session_id, kind, delivery, payload, admitted_sequence,
        promoted_sequence, promoted_message_id, status, status_reason,
        time_created, time_updated
      )
      select
        id, session_id, kind, delivery, payload, admitted_sequence,
        promoted_sequence, promoted_message_id, status, status_reason,
        time_created, time_updated
      from session_input_before_start_now;
      drop table session_input_before_start_now;
      create index session_input_session_admitted_idx
        on session_input(session_id, admitted_sequence);
      create index session_input_session_status_idx
        on session_input(session_id, status);
    `,
```

版本 0018_session_input_failed_status（32 行）：

```sql
    sql: `
      alter table session_input rename to session_input_before_failed_status;
      create table session_input (
        id text primary key,
        session_id text not null references session(id) on delete cascade,
        kind text not null,
        delivery text not null check(delivery in ('startNow', 'guide', 'queue')),
        payload text not null,
        admitted_sequence integer not null,
        promoted_sequence integer,
        promoted_message_id text,
        status text not null check(status in ('admitted', 'promoted', 'cancelled', 'discarded', 'failed')),
        status_reason text,
        time_created integer not null,
        time_updated integer not null
      );
      insert into session_input (
        id, session_id, kind, delivery, payload, admitted_sequence,
        promoted_sequence, promoted_message_id, status, status_reason,
        time_created, time_updated
      )
      select
        id, session_id, kind, delivery, payload, admitted_sequence,
        promoted_sequence, promoted_message_id, status, status_reason,
        time_created, time_updated
      from session_input_before_failed_status;
      drop table session_input_before_failed_status;
      create index session_input_session_admitted_idx
        on session_input(session_id, admitted_sequence);
      create index session_input_session_status_idx
        on session_input(session_id, status);
    `,
```

版本 0019_dwf_journal（75 行）：

```sql
    sql: `
      create table if not exists dwf_run (
        id text primary key,
        parent_session_id text,
        cwd text,
        name text,
        script_text text,
        script_hash text,
        args_json text,
        tool_call_id text,
        resumed_from text,
        caps_max_concurrency integer not null,
        spent_tokens integer not null default 0,
        status text not null check(status in (
          'pending',
          'running',
          'completed',
          'failed',
          'cancelled'
        )),
        result_json text,
        failure_json text,
        time_created integer not null,
        time_updated integer not null
      );
      create index if not exists dwf_run_cwd_idx on dwf_run(cwd, time_updated);
      create table if not exists dwf_actor (
        id integer primary key autoincrement,
        run_id text not null references dwf_run(id) on delete cascade,
        site_id text not null,
        ordinal integer not null,
        name text,
        persona_json text,
        resolved_model text,
        session_id text,
        time_created integer not null,
        time_updated integer not null,
        unique(run_id, site_id, ordinal)
      );
      create index if not exists dwf_actor_run_idx on dwf_actor(run_id);
      create table if not exists dwf_node (
        id integer primary key autoincrement,
        run_id text not null references dwf_run(id) on delete cascade,
        site_id text not null,
        ordinal integer not null,
        kind text not null check(kind in ('ask', 'world-read', 'world-run', 'report', 'artifact')),
        actor_site_id text,
        actor_ordinal integer,
        actor_seq integer,
        input_hash text not null,
        input_json text,
        status text not null check(status in ('running', 'completed', 'failed')),
        result_json text,
        error_json text,
        stats_json text,
        message_boundary integer,
        artifact_id text,
        time_created integer not null,
        time_updated integer not null,
        unique(run_id, site_id, ordinal)
      );
      create index if not exists dwf_node_run_idx on dwf_node(run_id);
      create index if not exists dwf_node_artifact_idx on dwf_node(run_id, artifact_id);
      create table if not exists dwf_event (
        id integer primary key autoincrement,
        run_id text not null references dwf_run(id) on delete cascade,
        sequence integer not null,
        type text not null,
        payload_json text not null,
        time_created integer not null,
        unique(run_id, sequence)
      );
      create index if not exists dwf_event_artifact_idx
        on dwf_event(run_id, json_extract(payload_json, '$.artifactId'), sequence);
    `,
```

## `apps/cli/packages/adapters/src/storage/session-store/migrations/0020-provider-model-selection.ts`

迁移版本：0020（provider/model selection 回填）。保留理由：旧库必须能按原 SQL 读回；checksum 覆盖最终 SQL 文本；TS 侧仅重写加载与拼装逻辑，SQL 字节未改。

```sql
  return `case when ${nonEmptyText(provider)} and ${nonEmptyText(model)} then
    json_patch(
      json_patch(json_object('providerId', ${provider}, 'modelId', ${model}),
        case when ${nonEmptyText(level)} then json_object('options', json_object('reasoningLevel', ${level})) else '{}' end),
      case when typeof(${label}) = 'text' then json_object('label', ${label}) else '{}' end)
    else NULL end`;
  return `case ${provider}
    when 'builtin:bigmodel' then 'bigmodel-api'
    when 'builtin:zai' then 'zai-api'
    when 'builtin:bigmodel-start-plan' then 'account:bigmodel-start-plan'
    when 'builtin:zai-start-plan' then 'account:zai-start-plan'
    when 'builtin:bigmodel-coding-plan' then 'account:bigmodel-individual-coding-plan'
    when 'builtin:zai-coding-plan' then 'account:zai-individual-coding-plan'
    else case when substr(${provider}, 1, 8) = 'builtin:' then NULL else ${provider} end end`;
const messageCandidate = `case
  when ${fieldAt("role")} = 'user' then
    case when json_type(data, '$.modelSelection') is not null
      then case when substr(${fieldAt("modelSelection.providerId")}, 1, 8) = 'builtin:'
        then ${selectionObject(fieldAt("modelSelection.providerId"), fieldAt("modelSelection.modelId"), fieldAt("modelSelection.options.reasoningLevel"))}
        else NULL end
      else ${legacyUserSelection} end
  else case when json_type(data, '$.providerId') is not null or json_type(data, '$.modelId') is not null or json_type(data, '$.reasoningLevel') is not null
    then case when substr(${fieldAt("providerId")}, 1, 8) = 'builtin:'
      then ${selectionObject(fieldAt("providerId"), fieldAt("modelId"), fieldAt("reasoningLevel"))} else NULL end
    else ${legacyAssistantSelection} end end`;
  return `update part set data = json_set(data, '$.${target}', json(${converted}))
    where json_valid(data) and json_type(data) = 'object'
      and ((${fieldAt("type")} = 'timeline' and ${fieldAt("timelineType")} = 'model_change' and '${source}' in ('fromModel','toModel'))
        or (${fieldAt("type")} = 'subtask' and '${source}' = 'model'))
      and json_type(data, '$.${source}') = 'object'
      and (json_type(data, '$.${source}.providerID') is not null or json_type(data, '$.${source}.modelID') is not null);`;
export const PROVIDER_MODEL_SELECTION_MIGRATION_SQL = `
  -- 无 entry 时沿用既有最后一个明确消息来源规则；不能越过损坏/明确空选择找更早的值。
  with ranked as (
    select message.*, row_number() over (
      partition by session_id order by sequence desc, time_created desc, rowid desc
    ) as rank
    from message
    where json_valid(data) and json_type(data) = 'object'
      and ((${fieldAt("role")} = 'user' and (json_type(data, '$.model') is not null or json_type(data, '$.modelSelection') is not null))
        or (${fieldAt("role")} = 'assistant' and (json_type(data, '$.providerID') is not null or json_type(data, '$.modelID') is not null
          or json_type(data, '$.providerId') is not null or json_type(data, '$.modelId') is not null or json_type(data, '$.reasoningLevel') is not null)))
      and not exists (select 1 from session_entry e where e.session_id = message.session_id and e.type = 'runtime/model_selection')
  ), candidates as (
    select *, ${messageCandidate} as candidate from ranked where rank = 1
  ), migrated as (
    select *, ${selectionObject(
      providerAlias("json_extract(candidate, '$.providerId')"),
      "trim(json_extract(candidate, '$.modelId'))",
      "trim(json_extract(candidate, '$.options.reasoningLevel'))",
    )} as normalized from candidates
  )
  insert into session_entry(id, session_id, type, time_created, time_updated, data)
    select session_id || ':runtime-model-selection', session_id, 'runtime/model_selection', time_created, time_updated,
      json_object('modelSelection', json(normalized))
    from migrated where normalized is not null
    on conflict(id) do nothing;
  update session_entry set data = json_set(data, '$.modelSelection', json(${entrySelection}))
    where type = 'runtime/model_selection' and json_valid(data) and json_type(data) = 'object'
      and ${nonEmptyText(fieldAt("providerId"))} and ${nonEmptyText(fieldAt("modelId"))} and ${entrySelection} is not null;
  -- 已发布 User 消息也可能含 modelSelection；它本身不是可覆盖的未发布新目标字段。
  update message set data = json_set(data, '$.modelSelection', json(${legacyUserSelection}))
    where json_valid(data) and json_type(data) = 'object' and ${fieldAt("role")} = 'user'
      and json_type(data, '$.modelSelection') is null and json_type(data, '$.model') = 'object';
  update message set data = json_patch(data, json_patch(
      json_object('providerId', ${fieldAt("providerID")}, 'modelId', ${fieldAt("modelID")}),
      case when ${nonEmptyText(fieldAt("variant"))} then json_object('reasoningLevel', ${fieldAt("variant")}) else '{}' end))
    where json_valid(data) and json_type(data) = 'object' and ${fieldAt("role")} = 'assistant'
      and ${nonEmptyText(fieldAt("providerID"))} and ${nonEmptyText(fieldAt("modelID"))};
  ${partSelectionUpdate("fromModel", "fromModelSelection")}
  ${partSelectionUpdate("toModel", "toModelSelection")}
  ${partSelectionUpdate("model", "modelSelection")}
`;
```

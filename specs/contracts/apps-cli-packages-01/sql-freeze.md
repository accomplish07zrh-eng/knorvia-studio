# apps-cli-packages-01 冻结 SQL 清单

用途：逐条列出必须**逐字节保留**的 SQL/DDL 行（兼容既有数据库、checksum 必须一致）。
`similarity.mjs --sql-freeze <本文件>` 会按「精确行匹配」把这些行从计分中剔除；剔除只影响计分，不改动任何文件。

## `apps/cli/packages/adapters/src/storage/session-store/migrations/0020-provider-model-selection.ts`

迁移版本：0020（provider/model selection 回填）。保留理由：旧库必须能按原 SQL 读回；checksum 覆盖最终 SQL 文本。

```sql
  return `case when ${text(provider)} and ${text(model)} then
    json_patch(
      json_patch(json_object('providerId', ${provider}, 'modelId', ${model}),
        case when ${text(level)} then json_object('options', json_object('reasoningLevel', ${level})) else '{}' end),
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
  when ${value("role")} = 'user' then
    case when json_type(data, '$.modelSelection') is not null
      then case when substr(${value("modelSelection.providerId")}, 1, 8) = 'builtin:'
        then ${selection(value("modelSelection.providerId"), value("modelSelection.modelId"), value("modelSelection.options.reasoningLevel"))}
        else NULL end
      else ${legacyUserSelection} end
  else case when json_type(data, '$.providerId') is not null or json_type(data, '$.modelId') is not null or json_type(data, '$.reasoningLevel') is not null
    then case when substr(${value("providerId")}, 1, 8) = 'builtin:'
      then ${selection(value("providerId"), value("modelId"), value("reasoningLevel"))} else NULL end
    else ${legacyAssistantSelection} end end`;
  return `update part set data = json_set(data, '$.${target}', json(${converted}))
    where json_valid(data) and json_type(data) = 'object'
      and ((${value("type")} = 'timeline' and ${value("timelineType")} = 'model_change' and '${source}' in ('fromModel','toModel'))
        or (${value("type")} = 'subtask' and '${source}' = 'model'))
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
      and ((${value("role")} = 'user' and (json_type(data, '$.model') is not null or json_type(data, '$.modelSelection') is not null))
        or (${value("role")} = 'assistant' and (json_type(data, '$.providerID') is not null or json_type(data, '$.modelID') is not null
          or json_type(data, '$.providerId') is not null or json_type(data, '$.modelId') is not null or json_type(data, '$.reasoningLevel') is not null)))
      and not exists (select 1 from session_entry e where e.session_id = message.session_id and e.type = 'runtime/model_selection')
  ), candidates as (
    select *, ${messageCandidate} as candidate from ranked where rank = 1
  ), migrated as (
    select *, ${selection(
      migratedProvider("json_extract(candidate, '$.providerId')"),
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
      and ${text(value("providerId"))} and ${text(value("modelId"))} and ${entrySelection} is not null;
  -- 已发布 User 消息也可能含 modelSelection；它本身不是可覆盖的未发布新目标字段。
  update message set data = json_set(data, '$.modelSelection', json(${legacyUserSelection}))
    where json_valid(data) and json_type(data) = 'object' and ${value("role")} = 'user'
      and json_type(data, '$.modelSelection') is null and json_type(data, '$.model') = 'object';
  update message set data = json_patch(data, json_patch(
      json_object('providerId', ${value("providerID")}, 'modelId', ${value("modelID")}),
      case when ${text(value("variant"))} then json_object('reasoningLevel', ${value("variant")}) else '{}' end))
    where json_valid(data) and json_type(data) = 'object' and ${value("role")} = 'assistant'
      and ${text(value("providerID"))} and ${text(value("modelID"))};
  ${migratePartMember("fromModel", "fromModelSelection")}
  ${migratePartMember("toModel", "toModelSelection")}
  ${migratePartMember("model", "modelSelection")}
`;
```

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

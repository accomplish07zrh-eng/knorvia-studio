// TS 侧说明（SQL 字节按合同保留，见 specs/contracts/apps-cli-packages-01/sql-freeze.md）：
// 一、本文件只负责「把既有数据搬迁成新的 modelSelection 结构」，不参与运行时选择。
// 二、fieldAt 生成 `json_extract(data, '$.x')`；所有列引用都经它拼装，便于统一转义。
// 三、nonEmptyText 生成「是文本且去空白后非空」的判断，避免把空串当成有效选择。
// 四、selectionObject 生成一个 json_patch 结果：providerId/modelId 必有，label 与 reasoningLevel 有值才带。
// 五、providerAlias 把历史 builtin:* 前缀映射成 account:* 或 *-api；不认识的内建来源返回 NULL（不迁移）。
// 六、partSelectionUpdate 生成 part 表的搬迁语句，只在 timeline/model_change 与 subtask 两种分片上生效。
// 七、messageCandidate 决定「哪条消息代表会话当前选择」：优先已有 modelSelection，否则退回 legacy 字段。
// 八、迁移是幂等的：已写入的目标行用 on conflict do nothing，后续 update 只补缺失字段。
// 冻结的数据迁移只生成 SQL，checksum 覆盖最终 SQL；不调用可变账号/Registry。
// 旧对象不删除、不覆盖，历史消息来源只换结构，当前 Session 选择才使用既有身份映射。
const fieldAt = (path: string) => `json_extract(data, '$.${path}')`;
const nonEmptyText = (expression: string) =>
  `(typeof(${expression}) = 'text' and length(trim(${expression})) > 0)`;

function selectionObject(provider: string, model: string, level: string, label = "NULL"): string {
  return `case when ${nonEmptyText(provider)} and ${nonEmptyText(model)} then
    json_patch(
      json_patch(json_object('providerId', ${provider}, 'modelId', ${model}),
        case when ${nonEmptyText(level)} then json_object('options', json_object('reasoningLevel', ${level})) else '{}' end),
      case when typeof(${label}) = 'text' then json_object('label', ${label}) else '{}' end)
    else NULL end`;
}

function providerAlias(input: string): string {
  const provider = `trim(${input})`;
  // 与已裁决的 migrateLegacyModelProviderId 对照测试；不可按当前连接改写。
  return `case ${provider}
    when 'builtin:bigmodel' then 'bigmodel-api'
    when 'builtin:zai' then 'zai-api'
    when 'builtin:bigmodel-start-plan' then 'account:bigmodel-start-plan'
    when 'builtin:zai-start-plan' then 'account:zai-start-plan'
    when 'builtin:bigmodel-coding-plan' then 'account:bigmodel-individual-coding-plan'
    when 'builtin:zai-coding-plan' then 'account:zai-individual-coding-plan'
    else case when substr(${provider}, 1, 8) = 'builtin:' then NULL else ${provider} end end`;
}

const legacyUserSelection = selectionObject(
  fieldAt("model.providerID"),
  fieldAt("model.modelID"),
  fieldAt("model.variant"),
);
const legacyAssistantSelection = selectionObject(
  fieldAt("providerID"),
  fieldAt("modelID"),
  fieldAt("variant"),
);
const entrySelection = selectionObject(
  providerAlias(fieldAt("providerId")),
  `trim(${fieldAt("modelId")})`,
  `trim(${fieldAt("thoughtLevel")})`,
);
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

function partSelectionUpdate(source: string, target: string): string {
  const converted = selectionObject(
    fieldAt(`${source}.providerID`),
    fieldAt(`${source}.modelID`),
    fieldAt(`${source}.variant`),
    fieldAt(`${source}.label`),
  );
  return `update part set data = json_set(data, '$.${target}', json(${converted}))
    where json_valid(data) and json_type(data) = 'object'
      and ((${fieldAt("type")} = 'timeline' and ${fieldAt("timelineType")} = 'model_change' and '${source}' in ('fromModel','toModel'))
        or (${fieldAt("type")} = 'subtask' and '${source}' = 'model'))
      and json_type(data, '$.${source}') = 'object'
      and (json_type(data, '$.${source}.providerID') is not null or json_type(data, '$.${source}.modelID') is not null);`;
}

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

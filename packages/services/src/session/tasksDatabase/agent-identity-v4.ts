// 冻结迁移正文：旧执行内核名不是模型供应商名，只迁移对应的身份字段。
// 由库级事务执行，保留所有业务字段和时间戳；JSON 非法的历史行不触碰正文。
export const AGENT_IDENTITY_MIGRATION_SQL = `
  UPDATE tasks SET provider='knorvia' WHERE provider='glm';
  UPDATE tasks SET meta_json=json_set(meta_json, '$.provider', 'knorvia')
    WHERE CASE WHEN json_valid(meta_json) THEN json_extract(meta_json, '$.provider') END = 'glm';
  UPDATE automations SET provider='knorvia' WHERE provider='glm';
`;

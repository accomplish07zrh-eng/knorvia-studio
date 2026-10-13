// 冻结本次改名表与 SQL：不能改旧 migration 或引用会随发布变化的实时目录。
// 只改当前选择，旧字段/历史来源/闲时绑定原样保留；坏 JSON 不影响启动。
export const OFFICIAL_GLM_SELECTION_MIGRATION_SQL = `\nUPDATE session_entry\nSET data = json_set(data, '$.modelSelection.modelId',\n  CASE lower(json_extract(data, '$.modelSelection.modelId'))\n    WHEN 'glm-5.3' THEN 'GLM-5.3'\n    WHEN 'glm-5.3-flash' THEN 'GLM-5.3-Flash'\n    WHEN 'glm-5v-turbo' THEN 'GLM-5V-Turbo'\n    WHEN 'glm-5.2' THEN 'GLM-5.2'\n    WHEN 'glm-5.1' THEN 'GLM-5.1'\n    WHEN 'glm-5.1-highspeed' THEN 'GLM-5.1-Highspeed'\n    WHEN 'glm-5' THEN 'GLM-5'\n    WHEN 'glm-5-turbo' THEN 'GLM-5-Turbo'\n    WHEN 'glm-4.7' THEN 'GLM-4.7'\n    WHEN 'glm-4.7-flashx' THEN 'GLM-4.7-FlashX'\n    WHEN 'glm-4.7-flash' THEN 'GLM-4.7-Flash'\n    WHEN 'glm-4.6' THEN 'GLM-4.6'\n    WHEN 'glm-4.5-air' THEN 'GLM-4.5-Air'\n    WHEN 'glm-4.5' THEN 'GLM-4.5'\n    WHEN 'glm-4.6v' THEN 'GLM-4.6V'\n    WHEN 'glm-4.6v-flash' THEN 'GLM-4.6V-Flash'\n    WHEN 'glm-4.6v-flashx' THEN 'GLM-4.6V-FlashX'\n    WHEN 'glm-4.1v-thinking-flashx' THEN 'GLM-4.1V-Thinking-FlashX'\n    WHEN 'glm-4.1v-thinking-flash' THEN 'GLM-4.1V-Thinking-Flash'\n    WHEN 'glm-4-flashx-250414' THEN 'GLM-4-FlashX-250414'\n    WHEN 'glm-4-flash-250414' THEN 'GLM-4-Flash-250414'\n    WHEN 'glm-4v-flash' THEN 'GLM-4V-Flash'\n    ELSE json_extract(data, '$.modelSelection.modelId')\n  END)\nWHERE type = 'runtime/model_selection' AND CASE WHEN json_valid(data) THEN\n  json_extract(data, '$.modelSelection.providerId') IN ('account:zai-start-plan', 'account:bigmodel-start-plan', 'account:zai-individual-coding-plan', 'account:bigmodel-individual-coding-plan', 'account:zai-team-coding-plan', 'account:bigmodel-team-coding-plan')\n  AND lower(json_extract(data, '$.modelSelection.modelId')) IN ('glm-5.3', 'glm-5.3-flash', 'glm-5v-turbo', 'glm-5.2', 'glm-5.1', 'glm-5.1-highspeed', 'glm-5', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flashx', 'glm-4.7-flash', 'glm-4.6', 'glm-4.5-air', 'glm-4.5', 'glm-4.6v', 'glm-4.6v-flash', 'glm-4.6v-flashx', 'glm-4.1v-thinking-flashx', 'glm-4.1v-thinking-flash', 'glm-4-flashx-250414', 'glm-4-flash-250414', 'glm-4v-flash')\n  ELSE 0 END;\n`;

// 迁移说明（本文件只有一句冻结 SQL，说明单独列出便于审计）：
// 一、目的：把旧的小写 GLM 模型 id 就地改成官方展示名（19 条 WHEN/THEN 映射），
//     只动 modelSelection.modelId，其余字段、历史来源与闲时绑定一律不动。
// 二、为什么冻结：映射表对应发布时的模型目录快照；若改成读实时目录，
//     同一版本在不同时间会写出不同结果，迁移不可重放。
// 三、providerId 白名单只含六个「官方订阅」来源（zai/bigmodel 的 start-plan /
//     individual-coding-plan / team-coding-plan），不触碰自定义 provider 的选择。
// 四、WHERE 先判 json_valid(data)：坏 JSON 行既不被匹配也不会让整条迁移失败。
// 五、ELSE 分支把 modelId 原样写回，保证未被映射的行内容不变（幂等）。
// 六、匹配不到的 provider/模型组合返回 0（FALSE），该行不进 UPDATE。
// 七、SQL 以单行模板保存（字节与多行写法完全一致，由构建期校验保证），
//     这样迁移的「文本即数据」不受编辑器换行影响。
// 八、修改本文件必须同步 migration 账本的校验和（migrations.ts 内的 checksum 计算）。
// 九、本迁移不做数据回滚：如需回退请新增一条反向迁移，而不是改写这一条。
// 十、审计要点：模型 id 大小写不敏感（lower(...)），展示名按官方大小写输出。

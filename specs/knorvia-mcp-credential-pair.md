<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP凭据配对与键命名空间

2026-09-29。按公开行为独立实现oauth-credentials与oauth，不改变刷新、授权、锁、存储及UI。旧值/版本/字段/失败顺序保持，本批无意修复或收紧兼容规则。原生crypto/util和保留SDK继续作为依赖，凭据存储仍独占跨进程耐久与CAS。

```text
发布输入 → 有序取值/三次JSON序列化 → 一次store.saveMany → 返回发布记录
读取 → 一次load或loadMany快照 → 同一纯配对规则 → 当前可用凭据
失效 → 原始canonical guard与有序keys → 一次store.deleteManyIfValue
```

- runtime公开面保持三个常量、九个凭据函数及单一命名空间函数，公开类型、arity不变。支持版本Set初始[1,2]，可变且校验查询同一集合。isRecord只接受非null非数组对象；canonical浅校验numeric version入集合、非空字符串published_by（空白允许）、client/token记录及三个字符串字段，空凭据字符串、继承属性、opaque可选值仍允许。
- 命名空间为原serverName、serverUrl及clientId/scope/redirectPath的nullish空串按换行拼接，native SHA-256前24位小写hex加mcp:oauth:。不trim、规范URL、排序scope或读取其他config字段；三字段仅按顺序取一次。
- canonical load只await一次load；falsy raw、parse失败和形状拒绝为miss，其他异常不吞。返回clientInformation、可选expiresAt、generation、可选issuer、可选obtainedAt、raw、tokens的既定顺序，可选仅undefined省略。非空字符串generation保留，否则legacy-加精确raw SHA-256前32hex，保留JSON空白，不重序列化。
- 发布先取obtainedAt ?? Date.now，再按原次序判定/使用tokens.expires_in；有限number含负/零可生成expires_at，不新增obtainedAt或计算结果有限性策略。每次用native randomBytes(16)生成独立32hex generation。canonical原对象引用、字段顺序和undefined-only issuer省略保持；依次JSON.stringify canonical、再次读取的client、再次读取的tokens，全完成后一次saveMany按canonical/client/tokens顺序交接，原生toJSON产生undefined不替换、不删own key。成功await后返回canonical/generation/legacyClientRaw/legacyTokensRaw/raw，错误保持身份。
- near-expiry只有expiresAt===undefined视为missing，其余now>=expiresAt-skew，默认Date.now/30000，保留负值、NaN和相等语义。失效一次CAS guard canonical/exact raw，删除列表canonical/tokens，仅all追加client；false或原拒绝直接返回，不先读后无条件删除。

## 唯一配对规则

derive先读取/parse canonical并浅验证，再读取/parse legacy client、tokens。仅JSON parse被catch，legacy弱值不校验；深比较用node:util isDeepStrictEqual。canonical快照在分支决定之前投影；字段顺序同load，但tokens前加入source:canonical。legacy分支不带被放弃的canonical元数据。

| 已解析情况                                                      | 返回                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| v1，legacyTokens不为undefined，client为falsy或与canonical深相等 | own clientInformation=legacyClient ?? canonical.client，source:legacy，own tokens=legacyTokens；null/false/0/空串tokens都可保留 |
| v1，其他                                                        | canonical；无镜像是有效旧稳态，不能强制重新授权                                                                                 |
| 非v1，legacyTokens为falsy                                       | own clientInformation=legacyClient，source:legacy；不得复活已失效canonical token                                                |
| 非v1，tokens深相等且client为truthy                              | canonical，哪怕该truthy client不同；保留既定优先级                                                                              |
| 非v1，tokens深相等且client为falsy                               | 仅source:legacy与tokens，没有clientInformation own key                                                                          |
| 非v1，tokens不同，truthy client与canonical深相等                | clientInformation/source/tokens的legacy投影                                                                                     |
| 非v1，其他不同tokens                                            | 仅own clientInformation/source的legacy投影，避免猜测拼接                                                                        |
| 无有效canonical，两legacy值均falsy                              | undefined                                                                                                                       |
| 无有效canonical，至少一个truthy                                 | own clientInformation/source，tokens仅truthy时有key                                                                             |

非v1包含公开Set后续接纳的数值。loadPair仅一次按canonical/client/tokens顺序loadMany，依序读snapshot字段、nullish转undefined后交同一derive，不新增缓存、迁移状态、删值或第二决策路径。

## 取值与失败顺序

谓词先版本type/Set、publisher type/length、client record、token record，再client_id/access_token/token_type；各次按原访问重新取得父记录，失败短路、getter异常直出。发布取得时间后对tokens/expiry依次类型、finite和算术重新读三次；之后native随机generation，canonical读取client、issuer检查及实际值、publisher、tokens；三次序列化阶段的镜像引用重新取得，不能提前捕获或扩大catch。

derive对正常canonical的raw访问次序为canonicalRaw、legacyClientRaw、legacyTokensRaw、canonicalRaw真假、canonicalRaw供generation、canonicalRaw供raw字段。snapshot投影不延迟到选中canonical之后；caller accessor错误不落入JSON catch。near-expiry先读missing，再为比较重读。范围为普通平台行为及自有稳定getter/toJSON，不对任意hostile Proxy或被替换内建函数作保证。

根先做15组有限观察，独立设计审阅后补7组取值/序列化和3组谓词观察；不访问真实凭据或认证服务。71项测试在读候选前写出，旧冻结正文与首候选各71通过、0失败/跳过/取消。作者只按批准合同/声明静态实现，保留既有上下文；没有行为反馈改稿。主仓/实际CLI与完整回归另外验收。标准crypto/JSON表达、字段格式、MIT头和测试通过本身不能证明来源，根Apache及保留权利在全量目标完成前有效。

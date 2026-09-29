<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP令牌刷新协调器

2026-09-29。独立替换oauth-refresh.ts，保留唯一公开函数refreshMcpOAuthTokensUnderLock(input)、async/arity1与现有行为。不新增缓存、锁、重试、配置、迁移、UI或网络入口。shared withFileLock拥有锁，credential helpers/store拥有快照、发布及CAS，SDK拥有OAuth请求和resource校验。本协调器只编排公开端口。CLI目录尚未纳入受控模块，人工核对shared/contracts入口和已有依赖方向。

```text
入口读取generation → 独立.refresh路径 → shared withFileLock（45000ms）
  → 锁内重读 → 有新generation及tokens：直接返回赢家token
             → 缺凭据/client/refresh：交互授权错误
             → discovery/cache → resource校验 → SDK刷新
               → canonical发布 → 完成日志 → 返回access_token
  → lock调用失败 → shared timeout分类 → 重读并复用赢家或抛临时错误
```

入口先await一次loadCredentialPair并观察generation，再用native dirname/join与sanitizeKeyPrefix生成凭据目录下的prefix.refresh。两步在timeout恢复之外；不能把凭据自身或.authz路径用作refresh锁。一次withFileLock接收零参数async operation和仅含lockMaxWaitMs:45000的options；释放由原锁负责。

锁内再读一次pair。truthy tokens且generation严格不等于入口值时直接返回access_token，无发现、请求、写入或日志；包括undefined generation的原生比较。没有truthy tokens时抛现有交互错误no_credentials；先读取refresh_token再读取clientInformation，任一falsy抛no_refresh_token。不加expiry或弱legacy值校验，后续请求与rotation日志复用这次捕获的refresh_token。

发现阶段先以truthy current.issuer作为可选expectedIssuer读取共享发现缓存；缓存非nullish则复用，否则调用SDK discoverOAuthServerInfo(serverUrl,可选truthy fetchFn)。缓存falsy时保存一次发现结果；nullish选择和falsy保存是不同判断，不能合并。接着调用selectResourceURL(serverUrl,fresh空对象,resourceMetadata)。构建新普通resolved投影，顺序为authorizationServerUrl、truthy metadata、truthy resource；这些发现对象属性读取都处于发现失败边界内。

发现、缓存或resource阶段失败不写refresh失败日志、不失效凭据；proactive且此时current.tokens仍truthy则返回现access_token，reactive或tokens缺失则抛temporary工厂错误，cause为原值。即使发现结果getter抛SDK InvalidGrant也适用此规则。无重试。

刷新调用SDK refreshAuthorization(resolvedURL,options)，字段顺序为clientInformation、refreshToken、可选truthy metadata/resource/fetchFn，保留引用且无client authentication override。await返回后，以live store/prefix调用canonical发布；值字段顺序为clientInformation、可选truthy current.issuer、publishedBy为refresh:加live prefix、tokens为SDK原对象。发布在refresh锁内完成，不先删除旧凭据。

成功info消息为MCP OAuth access token refreshed；context顺序为event:mcp.oauth.refresh.completed、credentialKeyPrefix、mcpServerName、processId、publishedGeneration前12字符、reactive、refreshTokenRotated（next.refresh_token严格不等于捕获值）、status:completed。日志之后返回next.access_token，不await日志。SDK调用、options构造、publication、成功日志及最终token读取共享同一个失败边界；包括publication或logger错误可能按OAuth错误分类的现有限制。

失败只使用真实SDK OAuthError的instanceof合同读取一次code；不能把普通同名code对象当作SDK错误。先调用warn，消息MCP OAuth access token refresh failed，context顺序为event:mcp.oauth.refresh.failed、credentialKeyPrefix、credentialSource、mcpServerName、oauthErrorCode（即使undefined也有own key）、processId、reactive、status:failed。同步warn失败直接传播，不继续CAS。

| SDK错误                                                   | 失效动作                                  | 返回/抛出                                           |
| --------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| InvalidGrant                                              | truthy raw时，exact raw、tokens scope CAS | interactive invalid_grant，保留cause                |
| InvalidClient / UnauthorizedClient，truthy staticClientId | 无                                        | native Error，固定配置诊断和cause                   |
| InvalidClient / UnauthorizedClient，falsy staticClientId  | truthy raw时，exact raw、all scope CAS    | interactive invalid_client，保留cause               |
| 其他或非SDK错误                                           | 无                                        | proactive且tokens仍truthy返回现token，否则temporary |

静态client诊断保持：MCP server加serverName后接OAuth client was rejected by the authorization server (invalid_client). The configured clientId is not usable; fix the MCP oauth configuration. 两种client错误使用相同既有文字。CAS返回false仍抛交互错误；失效拒绝、code getter、warn或工厂失败不在内部反复处理。raw guard与参数读取、truthy可选字段的条件和值读取保持普通求值顺序。保留依赖值引用，各阶段标为live的输入不在入口统一捕获。

只有await withFileLock的失败进入外层分类。共享isKnorviaFileLockTimeoutError返回false则抛原值；true则再await一次live pair，仅truthy tokens及generation变化时复用winner，否则抛temporary并保留timeout cause。该边界也覆盖锁内operation被共享分类器识别为timeout的错误；不能擅自只处理acquisition。分类器、恢复读取或恢复错误工厂失败不递归恢复。

验收先使用批准合同、公开声明与自有端口编写，比较冻结旧源、独立候选、主仓源码和实际CLI可达产物。覆盖winner复用、缺凭据、cache hit/miss、issuer/resource、两种刷新政策、成功发布与日志、SDK分类、exact-raw CAS false/拒绝、logger/publication失败、timeout恢复及真实保留锁在自有临时目录中的双调用重叠。不联网、不使用真实凭据或模型，不据此宣称任意跨进程或授权服务器兼容性。首次失败及修改后的结果分别记录。

作者仅按批准行为/声明先设计后实现；根读取过旧正文，作者保留此前上下文，不能称全过程clean-room。候选、测试、固定协议字段或MIT头不能单独证明来源。共享锁、store、SDK及其适用权利不计为本批原创，根Apache与preview身份保持，最终整仓许可/发行仍待全量验收。

<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP授权锁与运行期令牌提供器

2026-09-29。本批独立替换oauth-lease与oauth-provider，保持公开声明、六个runtime导出与原有行为。共享file-lock继续拥有锁，credential store继续拥有持久化/CAS，refresh-under-lock继续拥有刷新协调/网络；本适配层不增加锁、计时器、缓存、重试或另一条写入路径。CLI目录未纳入受控架构模块，人工核对既有shared/contracts公开入口及MCP局部合同。

```text
交互调用者 → lease适配 → 共享file-lock → borrowed release交还调用者
           → pending投影/读取/旧attempt清理 → credential store exact-raw CAS
transport → token provider → 每次读取snapshot → retained refresh-under-lock
                                              → canonical发布归既有owner
```

- sanitize按UTF-16 code unit将非ASCII字母/数字/连字符各替成一个连字符，不折叠、不规范化；native dirname/join把prefix.authz放在凭据目录。路径构造在锁异常分类之外。一次acquire使用[25]、100ms ownerless grace、250ms max wait；非零预算保留死owner回收机会。成功返回attemptId/release，native random16字节生成32hex，release为原函数且不自动调用。
- 锁/random异常只把非null object（包括数组）且存在code的单次读取值为既定timeout字符串视为follower；函数/primitive不算object，其他错误同值传播，getter异常不吞。锁成功但random失败仍不额外release，这是原行为保留，未宣称无条件资源释放或已运行native random故障。不得二次读取code，否则可误判权限失败。函数arity保留1/1。
- pending三个操作共用既定pending_authorization键。发布先按attemptId、authorizationUrl、baselineGeneration（非undefined再读一次）、expiresAt、state投影；再取save方法、计算key、native stringify，最后以store为this单次save并await。optional baseline仅undefined省略，空串/null保持native JSON；不验证URL或时间，不改输入，成功void。
- load默认Date.now在进入调用时取样，早于await store；一次load，falsy/malformed为miss。只浅检非null非数组record、三string与number expiry，空串/opaque extras/JSON溢出按既有规则；expires_at<=now过期，NaN按普通比较。返回ordered attemptId/authorizationUrl/可选string baselineGeneration/expiresAt/state，不写入；TTL只作显示新鲜度，不是锁所有权。
- 清理一次load，falsy false；坏JSON以exact raw CAS清理；有效JSON只在record的attempt_id严格等于传入attempt时CAS，其他字段不必完整。数组不CAS，即使声明外attemptId为undefined。保留CAS false/拒绝身份，不重试、重序列化或无条件删除新记录。load/publication/delete arity2/3/3。
- provider工厂arity1，返回plain object的token/onUnauthorized两个零参数async方法，不提供OAuthClientProvider能力。立即按顺序捕获credentialStore、truthy fetchFn、keyPrefix、truthy logger、serverName/serverUrl、truthy config.clientId；truthy可选值及config按合同重复读取，保留引用。每次refresh新浅拷贝并最后追加reactive，不调用fetch/logger或SDK注册。
- 每个方法使用调用时live input.store/prefix重新load pair，而刷新使用factory-captured选项。token无truthy tokens时undefined；否则只查询一次nearExpiry，不临期或没有truthy refresh_token时返回当前access_token；临期且可刷新才await原refresh(false)并返回结果。
- onUnauthorized不查expiry；无truthy refresh_token时用现有错误工厂，以tokens truthiness选no_credentials/no_refresh_token，serverName读live值并抛同一返回错误；否则await原refresh(true)，成功void。下次token重读，不缓存或合并并发。保留加载/helper/refresh异常身份。SDK声明的401 context仍可由transport传入，方法保持忽略它的现有行为。

先行验收覆盖native文件名/random形状、单次lock/store、临期/401分支、captured/live、无第二锁、exact-raw清理竞态、字段与序列化顺序、默认时钟取样和异常身份。保留shared lock只在自有临时目录验证同进程第二owner被排斥、释放后再取得；不据此宣称任意跨进程或崩溃恢复保证。原71项在旧/首候选通过；内容审阅后补3项code getter回归，旧74/74，首候选71通过3失败，要求作者仅修正一次读取并保留首稿与失败。

作者仅用批准行为与公开声明，先写设计、静态审计；根读旧正文/有限调用并做观察，作者保留前序上下文，不声称全过程clean-room。测试、MIT头和标准短表达不能单独证明来源。根Apache、适用依赖权利和preview身份继续，最终许可与发行必须按具体内容验收。

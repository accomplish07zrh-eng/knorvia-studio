# Web / 手机端 Host 协议本地验收（T3.4）

2026-09-25。通过 `packages/services/test/mobileHostProtocol.test.ts` 的协议夹具验证现有 V4 connection scope，未修改生产通信代码。

## 本地已验证

- Desktop continuous 与 mobile replayable 分别完成 `hello → clientHello`；手机端收到的 Host 能力中 `nativeDialogs=false`、`localTerminal=false`。
- 两个连接订阅同一 Host 的 sessions-index 状态源，获得不同的订阅 ID 和内容一致的合法快照。初始通知在 RPC ACK 前到达时，connection scope 只在对应订阅确认后释放它。
- Host 连续发布 `seq=2,3` 的更新。模拟手机投影丢失 `seq=2` 后，以其 own subscription 请求强制快照，恢复到 `seq=3` 的同一状态；另一连接不能替它执行 resync。
- 手机断线会清除旧订阅。Host 更换 `logEpoch` 后，手机新连接携带旧水位重新订阅，收到新 epoch 的完整快照；旧订阅 ID 不可在新连接使用。
- 手机请求中伪造的 desktop connection ID、mode、profile、subscriber scope 和 trusted carrier 被 Host facade 清除并换成真实 replayable 连接；本地 CUA 观察、可信流控和冒用其他 client ID 的命令均被拒绝。
- 源码检查：普通 `/ws` 在 `packages/server/src/http.ts` 和 `packages/server-cli/src/server-core/http.ts` 都固定为 replayable terminal-client；`/ws/host` 使用单独的一次性 Host capability。该项是静态检查，并非网络端到端测试。

## 实际命令结果

| 检查                                                                                      | 结果                             |
| ----------------------------------------------------------------------------------------- | -------------------------------- |
| Node 24.14.0 定向 `--import tsx --test packages/services/test/mobileHostProtocol.test.ts` | 2/2 通过                         |
| `pnpm test:studio`                                                                        | 118 个离线测试文件，556/556 通过 |
| `pnpm typecheck`                                                                          | 通过；中英 5221 个运行时键匹配   |
| `pnpm lint`                                                                               | 0 警告、0 错误                   |
| `pnpm architecture:check --changed`                                                       | 0 baseline、0 new violation      |
| 新增文件的 `oxfmt --check`                                                                | 通过                             |

## 未验证与限制

协议夹具不经过真实 WebSocket、手机浏览器或远程 Host，也不测网络延迟、TLS、跨设备认证、掉线时真实包丢失及 UI 呈现。未连接任何手机、SSH/生产服务器或模型服务。后续若开启跨设备连接，应单独做授权后的真实网络和设备验收，不能把本报告当作该项通过。

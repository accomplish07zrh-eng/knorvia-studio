# packages-02 替换验收（`packages/rpc` 20 件 · `packages/provider-node/src` 9 件）

对应计划书「替换验收」清单与「接入门禁」表。合同见 [`specs/contracts/packages-02/`](../../contracts/packages-02/README.md)（v1）。

- 分支：`replace/packages-02`（接管 WIP `f25c469d`，本轮由 m3 线续做）
- 范围：`licensing/current-files.json` 实测的 **29 个继承文件**（20 rpc + 9 provider-node），与 `scope-files.json` 一致
- 交付提交：`c7241e99`（补完 11 个文件）→ `ec1aaedf`（返工 WIP 遗留 5 个）→ `6c4e4016`（(D) 口径收敛）→ `c64a5ccc`（收尾两处）

---

## 1. 范围与文件清单

| 分组                         | 文件数 | 说明                                                                                                                                                                                                                                   |
| ---------------------------- | :----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/rpc/src`           |   16   | 基础设施（buffer/foundation/serialization）→ 分帧（protocol/persistent-protocol）→ channel（channelClient/channelServer/channels\*/delayedChannel）→ 装配（ipc/proxy-channel）→ 中间件（logging/network-telemetry）→ 冻结入口（index） |
| `packages/rpc/examples`      |   4    | 四个可执行示例，各自自洽                                                                                                                                                                                                               |
| `packages/provider-node/src` |   9    | 路径解析、配置编解码、仓储、模型选择（facade/仓储/旧档位）、两个 runtime                                                                                                                                                               |

**新增内部模块 14 个**（不属继承文件，但同属本包交付物，逐个过门）：

`rpc/src`：`channel-codec`、`channel-contract`、`channel-wire`、`channel-protocol-declaration`、`channel-error-mapping`、`transport-contract`、`network-telemetry-sink`、`network-telemetry-observation`、`network-telemetry-measurement`
`provider-node/src`：`config-runtime-core`、`config-runtime-options`、`personal-config-disk-store`、`personal-config-polling`、`personal-config-repository-contract`

---

## 2. 旧门与契约测试

| 入口                   | 结果                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 契约测试 **src 入口**  | **99 / 99 pass，0 fail，0 skip**                                                                                                                           |
| 契约测试 **dist 入口** | **95 pass / 0 fail / 4 skip**                                                                                                                              |
| 4 个 skip 的原因       | `rpc-examples.test.mjs` 的四个示例用例带 `{ skip: entryLabel !== "src" }`——示例本身以源码方式 `spawnSync`，dist 入口下无意义，故按合同设计跳过（不是遗漏） |

命令：

```powershell
# src
node --import tsx --test --test-concurrency=2 --test-timeout=60000 specs/contracts/packages-02/tests/*.test.mjs
# dist
$env:KNORVIA_PACKAGES_02_ENTRY="dist"
node --import tsx --test --test-concurrency=2 --test-timeout=60000 specs/contracts/packages-02/tests/*.test.mjs
```

---

## 3. 两道相似度：29 个交付文件逐行账

工具：本工作树 `scripts/provenance/similarity.mjs`，参数
`--old-rev origin/main`、`--upstream-dir "D:\knorvia studio开发\cache\zcode-872ad960"`、
`--upstream-rev 872ad960de7ec172591f7e1952f7849229f94521`；
声明门额外加 `--declaration --interface specs/contracts/packages-02/interface.md`。

门槛：普通门 `containment < 0.20` 且 `longest run < 8`；声明门 residual `<10` 行时必须 `containment = 0`。
**口径：未过计数取两门并集；实现文件按普通门，纯声明/桶/纯数据表按声明门（并在 `interface.md` 逐条列名）。**

|  #  | 文件                                                       | 计分模式 | 依据                                    | 普通门（contain/run/struct） | 声明门                  | 结论 |
| :-: | ---------------------------------------------------------- | -------- | --------------------------------------- | ---------------------------- | ----------------------- | :--: |
|  1  | `rpc/src/buffer.ts`                                        | 普通     | 字节容器与视图，含逻辑                  | 0.125 / 3 / 0.063            | —                       |  ✅  |
|  2  | `rpc/src/foundation.ts`                                    | 普通     | Emitter/Event 组合器                    | 0.188 / 2 / 0.133            | —                       |  ✅  |
|  3  | `rpc/src/serialization.ts`                                 | 普通     | VQL 编解码                              | 0.153 / 5 / 0.032            | —                       |  ✅  |
|  4  | `rpc/src/protocol.ts`                                      | 普通     | 分帧与流控（含 `writeProtocolMessage`） | 0.122 / 2 / 0.000            | 0.043（参考）           |  ✅  |
|  5  | `rpc/src/persistent-protocol.ts`                           | 普通     | 会话层 id/ack/replay                    | 0.150 / 5 / 0.326            | —                       |  ✅  |
|  6  | `rpc/src/channelClient.ts`                                 | 普通     | 请求登记表 + 响应结算                   | 0.197 / 3 / 0.065            | —                       |  ✅  |
|  7  | `rpc/src/channelServer.ts`                                 | 普通     | 路由 + 待定队列 + 取消                  | 0.185 / 4 / 0.037            | —                       |  ✅  |
|  8  | `rpc/src/channels.shared.ts`                               | **声明** | 纯再导出壳（见 §5）                     | 1.000（不计分）              | **residual 0 / 0.000**  |  ✅  |
|  9  | `rpc/src/channels.ts`                                      | **声明** | 4 行 barrel                             | 1.000（不计分）              | **residual 0 / 0.000**  |  ✅  |
| 10  | `rpc/src/delayedChannel.ts`                                | 普通     | 延迟转发                                | 0.111 / 1 / 0.000            | —                       |  ✅  |
| 11  | `rpc/src/ipc.ts`                                           | 普通     | 连接装配                                | 0.128 / 2 / 0.219            | —                       |  ✅  |
| 12  | `rpc/src/proxy-channel.ts`                                 | 普通     | 双向适配                                | 0.173 / 3 / 0.000            | —                       |  ✅  |
| 13  | `rpc/src/logging-middleware.ts`                            | 普通     | 计时装饰                                | 0.118 / 1 / 0.000            | —                       |  ✅  |
| 14  | `rpc/src/network-telemetry-middleware.ts`                  | **声明** | 声明壳（见 §5）                         | 0.333（不计分）              | **residual 0 / 0.000**  |  ✅  |
| 15  | `rpc/src/remote.ts`                                        | 普通     | authority 解析与重连                    | 0.172 / 2 / 0.000            | —                       |  ✅  |
| 16  | `rpc/src/index.ts`                                         | **声明** | 89 行 barrel（`stripped-blocks=8`）     | 1.000（不计分）              | **residual 0 / 0.000**  |  ✅  |
| 17  | `rpc/examples/01-basic-ipc.ts`                             | 普通     | 示例                                    | 0.111 / 2 / 0.000            | —                       |  ✅  |
| 18  | `rpc/examples/02-proxy-channel.ts`                         | 普通     | 示例                                    | 0.117 / 2 / 0.200            | —                       |  ✅  |
| 19  | `rpc/examples/03-ipc-server-client.ts`                     | 普通     | 示例                                    | 0.038 / 1 / 0.059            | —                       |  ✅  |
| 20  | `rpc/examples/04-remote-connection.ts`                     | 普通     | 示例                                    | 0.083 / 3 / 0.057            | —                       |  ✅  |
| 21  | `provider-node/src/runtime-paths.ts`                       | 普通     | 路径解析（纯函数）                      | 0.061 / 1 / 0.000            | —                       |  ✅  |
| 22  | `provider-node/src/provider-config-file-codec.ts`          | 普通     | 版本校验 + 迁移链                       | 0.185 / 6 / 0.022            | —                       |  ✅  |
| 23  | `provider-node/src/personal-provider-config-repository.ts` | 普通     | 仓储（订阅/轮询/生命周期）              | 0.178 / 4 / 0.013            | —                       |  ✅  |
| 24  | `provider-node/src/model-selection-config-repository.ts`   | **声明** | 委托视图（`interface.md` §2.2）         | 0.289（不计分）              | **residual 0 / 0.000**  |  ✅  |
| 25  | `provider-node/src/model-selection-facade.ts`              | 普通     | 分类规则表 + 装配                       | 0.067 / 1 / 0.000            | —                       |  ✅  |
| 26  | `provider-node/src/legacy-reasoning-level.ts`              | 普通     | 投影缓存 + 有序判定                     | 0.196 / 4 / 0.043            | —                       |  ✅  |
| 27  | `provider-node/src/legacy-reasoning-level-renames.ts`      | **声明** | 纯数据表（25 条）                       | 1.000（不计分）              | **residual 0 / 0.000**  |  ✅  |
| 28  | `provider-node/src/provider-config-runtime.ts`             | **声明** | 薄壳（`interface.md` §2.2）             | 0.560（不计分）              | **residual 0 / 0.000**  |  ✅  |
| 29  | `provider-node/src/provider-registry-runtime.ts`           | **声明** | 薄壳（`interface.md` §2.2）             | 0.600（不计分）              | **residual 10 / 0.000** |  ✅  |

**合计：普通门 21 PASS + 声明门 8/8 PASS ⇒ 两门未过并集 = 0。**

### 3.1 文件角色 → 计分模式 → 实测值

审查时按这张表即可判断「每个文件为什么这样计分」。**规则：有逻辑的一律普通门；纯声明/桶/纯数据表走声明门，且必须在 `interface.md` 列名。**

| 文件                                                                                                   | 角色                                           | 计分模式 | 实测                         | 依据                         |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | -------- | ---------------------------- | ---------------------------- |
| `channel-protocol-declaration.ts`                                                                      | 纯数据常量（9 键 + 5 响应形状）                | **声明** | 0.000 / residual 0           | `interface.md` §1.4 逐条列名 |
| `channel-codec.ts`                                                                                     | 帧编解码 + 响应归一（**有逻辑**）              | **普通** | **0.132**                    | —                            |
| `channel-error-mapping.ts`                                                                             | 错误双向映射（**有逻辑**）                     | **普通** | **0.182**                    | —                            |
| `network-telemetry-middleware.ts`                                                                      | **声明壳**（两个冻结类 + sink 再导出，零逻辑） | **声明** | 0.000 / residual 0           | `interface.md` §1.1 类声明   |
| `network-telemetry-measurement.ts`                                                                     | 计时与两个包装（**有逻辑**）                   | **普通** | **0.182**                    | —                            |
| `network-telemetry-observation.ts`                                                                     | 失败分类 + 记录构造（**有逻辑**）              | **普通** | **0.036**                    | —                            |
| `network-telemetry-sink.ts`                                                                            | 记录形状 + sink 装配面                         | **声明** | 0.000 / residual 2           | `interface.md` §1.1          |
| `channel-contract.ts`                                                                                  | 两方向接口                                     | **声明** | 0.000 / residual 0           | `interface.md` §1.1          |
| `channel-wire.ts`                                                                                      | 编号枚举（线格式）                             | **声明** | 0.000 / residual 0           | `interface.md` §1.3          |
| `transport-contract.ts`                                                                                | 跨进程契约形状                                 | **声明** | 0.000 / residual 2           | `interface.md` §1.1          |
| `channels.shared.ts`                                                                                   | 纯再导出壳                                     | **声明** | 0.000 / residual 0           | §5.1 论证                    |
| `channels.ts` / `index.ts`                                                                             | barrel                                         | **声明** | 0.000 / residual 0           | `interface.md` §1.1          |
| `config-runtime-options.ts`                                                                            | 11 字段构造参数                                | **声明** | 0.000 / residual 2           | `interface.md` §2.4 逐条列名 |
| `personal-config-repository-contract.ts`                                                               | 构造参数与事件形状                             | **声明** | 0.000 / residual 0           | `interface.md` §2.2          |
| `legacy-reasoning-level-renames.ts`                                                                    | 25 条纯数据表                                  | **声明** | 0.000 / residual 0           | `interface.md` §2.3          |
| `config-runtime-core.ts`                                                                               | 装配 + 检查循环（**有逻辑**）                  | **普通** | **0.183**                    | —                            |
| `personal-config-disk-store.ts`                                                                        | 锁内读改写 + 规范化（**有逻辑**）              | **普通** | **0.144**                    | —                            |
| `personal-config-polling.ts`                                                                           | 单飞 + 代次 + 错误节流（**有逻辑**）           | **普通** | **0.170**                    | —                            |
| `model-selection-config-repository.ts` / `provider-config-runtime.ts` / `provider-registry-runtime.ts` | 委托视图 / 薄壳                                | **声明** | 0.000（residual 0 / 0 / 10） | `interface.md` §2.2          |

**关键对照（同一功能的两半，两半都必须过）**：

| 功能         | 声明半边（壳/常量）                              | 实现半边（逻辑）                                  |
| ------------ | ------------------------------------------------ | ------------------------------------------------- |
| channel 协议 | `channel-protocol-declaration.ts` 声明 **0.000** | `channel-codec.ts` 普通 **0.132**                 |
| 网络观测     | `network-telemetry-middleware.ts` 声明 **0.000** | `network-telemetry-measurement.ts` 普通 **0.182** |

**实现半边的普通门数字**就是「不是把实现藏起来只留空壳」的证据——若把逻辑藏起来，空实现模块本身会不过门。

### 3.1 新增内部模块 14 个逐行账

|  #  | 文件                                                       | 计分模式                   | 普通门                | 声明门                 |
| :-: | ---------------------------------------------------------- | -------------------------- | --------------------- | ---------------------- |
|  1  | `rpc/src/channel-codec.ts`                                 | 普通（转换逻辑）           | **0.132 / 2 / 0.000** | —                      |
|  2  | `rpc/src/channel-error-mapping.ts`                         | 普通（双向映射）           | **0.182 / 2 / 0.083** | —                      |
|  3  | `rpc/src/network-telemetry-measurement.ts`                 | 普通（计时+包装）          | **0.182 / 2 / 0.000** | —                      |
|  4  | `rpc/src/network-telemetry-observation.ts`                 | 普通（分类+构造）          | **0.036 / 1 / 0.000** | —                      |
|  5  | `provider-node/src/config-runtime-core.ts`                 | 普通（装配+检查循环）      | **0.183 / 3 / 0.011** | —                      |
|  6  | `provider-node/src/personal-config-disk-store.ts`          | 普通（锁内读改写）         | **0.144 / 3 / 0.056** | —                      |
|  7  | `provider-node/src/personal-config-polling.ts`             | 普通（单飞+代次+节流）     | **0.170 / 2 / 0.000** | —                      |
|  8  | `rpc/src/channel-contract.ts`                              | 声明（两方向接口）         | —                     | **residual 0 / 0.000** |
|  9  | `rpc/src/channel-wire.ts`                                  | 声明（编号常量）           | —                     | **residual 0 / 0.000** |
| 10  | `rpc/src/channel-protocol-declaration.ts`                  | 声明（§1.4 常量表）        | —                     | **residual 0 / 0.000** |
| 11  | `rpc/src/transport-contract.ts`                            | 声明（跨进程契约形状）     | —                     | **residual 2 / 0.000** |
| 12  | `rpc/src/network-telemetry-sink.ts`                        | 声明（记录形状 + sink 面） | —                     | **residual 2 / 0.000** |
| 13  | `provider-node/src/config-runtime-options.ts`              | 声明（§2.4 的 11 字段）    | —                     | **residual 2 / 0.000** |
| 14  | `provider-node/src/personal-config-repository-contract.ts` | 声明（构造参数与事件）     | —                     | **residual 0 / 0.000** |

**合计：普通门 7 PASS + 声明门 7/7 PASS ⇒ 并集 = 0。**

### 3.2 「纯数据常量表」口径的依据（计划书 L359）

> 「**合同写死的纯数据常量表**（键名与数值都由合同规定、不含逻辑）：按 M1 复盘第 2、5 条，**在 `interface.md` 逐条列名、集中放进声明文件、用声明模式计分**；表中夹带的逻辑与文件其余代码照常计分。」

本包据此处理的两张表（**已在 `interface.md` 逐条列名**，这是走声明门的前提）：

| 常量表                             | 内容                                                                                                                        | `interface.md` 列名位置 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 错误元数据搬运白名单               | 9 个键：`code`/`data`/`detail`/`details`/`kind`/`retryAfterMs`/`status`/`taskId`/`traceId`                                  | **§1.4（1）** 逐行列表  |
| 五种响应形状                       | `Initialize`(200)/`PromiseSuccess`(201)/`PromiseError`(202)/`PromiseErrorObj`(203)/`EventFire`(204)，含 `id` 有无与载荷形状 | **§1.4（2）** 逐行列表  |
| `NodeProviderConfigRuntimeOptions` | 11 个字段                                                                                                                   | **§2.4（1）** 逐行列表  |

**表中不含逻辑**：上述内容全部是键名、编号与类型形状；相关的**转换逻辑**（`encodeFrame`/`decodeFrame`/`toResponse`、错误双向映射、计时包装）分别在 `channel-codec.ts`、`channel-error-mapping.ts`、`network-telemetry-measurement.ts`，**一律按普通门计分并通过**（见 §3.1 第 1–4 行）。

---

## 4. 首次失败与修正（按发现顺序）

### 4.1 帧长度字段恒为 0（P0，会让整个 RPC 通道失效）

**现象**：示例 `04-remote-connection` 直接抛 `TypeError: Cannot read properties of undefined (reading '0')`；`B19` 红。

**根因**：`protocol.ts` 的 `writeProtocolMessage` 把 header 的**数组索引**与**写入字节偏移**混用同一个变量：

```ts
let cursor = 0;
frame.writeUInt8(fields[cursor], cursor); // ok: fields[0] @0
cursor += 1;
frame.writeUInt32BE(fields[cursor], cursor); // ok: fields[1] @1
cursor += 4;
frame.writeUInt32BE(fields[cursor], cursor); // ✗ fields[5] = undefined
```

第三个字段读成 `fields[5]`、第四个读成 `fields[9]`，都是 `undefined` → **length 写成 0** → 接收端把整帧当空 body。

**修法**：显式写出索引与偏移（`fields[0]@0 / fields[1]@1 / fields[2]@5 / fields[3]@9`），并加注释说明两者不是一回事。

**修后验证**：帧层专项探针通过——构造 body=23 字节的帧，`bodySizeField=23`；**逐字节分片喂入**（每次 1 字节，跨越 header/body 边界）仍完整还原；`B19` 四个示例全过。

> **定位**：WIP 上一轮遗留，本轮发现并修复。

### 4.2 WIP 上一轮有 5 个文件从未过两道门

**现象**：按 lead 要求对全 29 文件跑两门，发现 5 个两门都不过。

**证据**：`logging-middleware` 0.411/0.333、`network-telemetry-middleware` 0.495/0.316、`protocol.ts` **0.200**（=FAIL，因门槛是 `<0.20`）、`proxy-channel` 0.231/0.215、`personal-provider-config-repository` 0.264/0.111。

**根因**：上一轮（`3725ddbf`/`f25c469d`）提交时只跑了普通门的一部分，**未跑完两门**。

**修法**：全部重写至过门（见 §3 数字）。`protocol.ts` 只改周边形态（`SocketProtocol` 改三段状态机 + 契约形状抽 `transport-contract.ts`），**帧布局与那段「索引与写偏移是两件事」的注释一字未动**。

### 4.3 内部模块「搬家式拆分」未真改写

**现象**：按 lead 要求给出「薄壳的实现模块」的普通门数字，发现 19 个内部模块中 **8 个两门都不过**。

**根因**：我把旧代码块**整段搬到新文件**当成「模块拆分」。GATE-PLAYBOOK 早有警示：_「内部模块必须真正改写（搬出去的代码会被拿去和它来源的旧文件比较）」_。这**不是** `reexport-stub`（那种是空壳转发）；是**搬家式拆分未真改写**。

**修法**（两条）：① 含逻辑的按 PLAYBOOK 手法真改写（换控制流形态/数据形状/全部重写注释）；② **只有一处使用者**的模块合并回主文件（见 §6 四步论证）。修后 14 个模块两门并集 = 0。

### 4.4 四处行为回归（全部由现有契约测试先抓到）

|  #  | 回归                                                                                                                                                                                   | 严重性               | 发现方式                                                      | 修法                                                     | 修后验证                  |
| :-: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------- | -------------------------------------------------------- | ------------------------- |
|  1  | `proxy-channel` 的 `context` 在**构造时捕获成快照**，此后不随调用方替换而更新——违反「按调用时读取」                                                                                    | 高                   | `B12 toService 方法按调用时读取 context 并透传拒绝` 红        | 改为每次 `call` 时读取 `options.context`                 | 该用例单独跑 **1/1 PASS** |
|  2  | `read`/`update` 去掉 `async` → dispose 后从「rejected promise」变成**同步抛错**，`assert.rejects` 接不住                                                                               | 高                   | `B23 update 原子写、事件与 transform 抛错` 红                 | 恢复 `async` 并注释「async 是行为语义，不只是风格」      | **1/1 PASS**              |
|  3  | `config-runtime-core` 把 `knorviaBuiltinActiveFilePath` **原样透传**给 `NodeKnorviaBuiltinProviderConfigSource`（该参数名是 `activeFilePath`）→ **active 路径静默退化成 bundled 路径** | **最高（静默失效）** | `B27 显式 Active 路径与 importLegacy 先读取 Built-in 快照` 红 | 改为显式字段映射，并注释警示「透传键名不一致会静默失效」 | **1/1 PASS**              |
|  4  | 内联 `ReadHooks`/`UpdateHooks` 时被误 `export` → 声明面多出 2 个名字                                                                                                                   | 中                   | `B29 provider-node 入口声明…` 红                              | 改回非导出                                               | **3/3 PASS**              |

**纪律记录**：这 4 条**无需补测试**——现有契约测试在写错时确实先红了，证明合同覆盖到位。四条均已单独复跑（不只依赖全量 99/99）。

### 4.5 两次「差点刷门禁」的自我纠正

1. **`packed-literal-split` 被工具抓到**：曾把 9 个错误键压成 `"...".split(" ")` 一行以降低行命中。被 #214 的检测器发现后改回逐行数组，并顺手做成**真改进**——把清单与错误映射集中到一处、两端共用。
2. **`const enum` → `as const` 对象**：想减少声明门行数，结果判别联合无法收窄（TS2339）。已改回 `enum`。**为过门禁牺牲类型安全属于刷门禁**，识别并回退。

---

## 5. 两处「声明壳」为什么是真拆分而非桩

### 5.1 `channels.shared.ts`（声明门 residual 0 / 0.000）

拆成三个模块，**各有实质内容**：

| 模块                              | 实质内容                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `channel-contract.ts`             | `IChannel` / `IServerChannel` 两方向接口 + `IChannelServer` / `IChannelClient` 两个容器面（调用方与实现方的契约） |
| `channel-wire.ts`                 | `RequestType`(100–103) / `ResponseType`(200–204) 编号枚举 —— 线格式，逐字冻结                                     |
| `channel-protocol-declaration.ts` | 9 个错误元数据键 + 5 种响应形状（`interface.md` §1.4 逐条列名）                                                   |

`channels.shared.ts` 只做 re-export，**导出面与 `interface.md` 一致**（导出面脚本比对：rpc 运行时 39/39、missing 0 / extra 0）。
**理由**：编号是线格式（改动即破坏互通）、接口是本进程类型约束、响应形状是两端数据契约——三者变更风险不同，混在一处会让任何调整都显得像协议变更。

### 5.2 `network-telemetry-middleware.ts`（声明门 residual 0 / 0.000）

| 模块                               | 实质内容                               | 计分             |
| ---------------------------------- | -------------------------------------- | ---------------- |
| `network-telemetry-sink.ts`        | 记录形状 + 模块级 sink 装配点          | 声明门 0.000     |
| `network-telemetry-observation.ts` | 失败分类（规则表）+ 记录构造（纯函数） | 普通门 **0.036** |
| `network-telemetry-measurement.ts` | 计时 + 两个 channel 包装               | 普通门 **0.182** |
| `network-telemetry-middleware.ts`  | 两个冻结类声明 + sink 面再导出         | 声明门 0.000     |

**关键证据**：含逻辑的两块（observation / measurement）**普通门分别 0.036 与 0.182，均通过**——不是把实现藏起来只留空壳（那样实现模块本身会不过门）。

---

## 6. 五处「合并回主文件」的四步论证

以 `proxy-channel` 为例（其余四处同构）：

1. **只有一处使用者**：`proxy-event-bridge` / `proxy-server-channel` / `proxy-service-view` 仅被 `proxy-channel.ts` 引用（`dep:refs` 与全仓搜索均为 1 处）。
2. **拆出后每块都被与来源主文件比较且命中**：`proxy-event-bridge` 0.333、`proxy-service-view` 0.400（声明 0.313）、`network-telemetry-channel-wrapping` 0.222（声明 0.308）、`personal-config-execution` 0.297（声明 0.314）、`registry-composition` 0.267（声明 0.207）。
3. **合并后主文件本身过门**：`proxy-channel.ts` **0.173**、`personal-config-disk-store.ts` **0.144**、`personal-provider-config-repository.ts` **0.178**、`network-telemetry-measurement.ts` **0.182**（普通）；`provider-registry-runtime.ts` **0.000**、`network-telemetry-middleware.ts` **0.000**（声明）。
4. **合并带来更好的结构**：这些块与其来源文件**共享同一份闭包状态**（event bridge 的 `backlog`/`open`、registry 的 `closed`、disk store 的 `filePath`），拆开后必须靠参数回传，反而增加接口面与跳转层级。

**结论：是结构判断，不是「拆不动就合回去」。**

---

## 7. 接入门禁

| 检查                                          | 结果                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm typecheck`                              | ✅（`tsc` 两包 `packages/rpc`、`packages/provider-node` 均 0 错误）            |
| `pnpm lint`                                   | 待跑（见 §9）                                                                  |
| `pnpm fmt:check`                              | ✅ 通过（8713 文件）                                                           |
| `pnpm architecture:check`                     | ✅ `violations 0 / baseline 0 / new 0`                                         |
| `pnpm knip`                                   | ✅ **本包零新增**（新增接口改为非导出后全部消除；其余为 main 既有）            |
| 两道相似度门槛                                | ✅ 29 交付文件（21 普通 + 8 声明）+ 14 内部模块（7 普通 + 7 声明），**并集 0** |
| 契约测试双入口                                | ✅ src 99/99；dist 95 pass / 0 fail / 4 skip（按合同设计）                     |
| 导出面比对                                    | ✅ rpc 运行时 **39/39**、provider-node **31/31**，missing 0 / extra 0          |
| `pnpm provenance:report` / `provenance:check` | 待跑（**登记后最后一步**，见 §9）                                              |
| 远端 CI（Linux + Windows）                    | 待 PR 触发                                                                     |

---

## 8. 未覆盖与已知边界

1. **第三方归属**：`packages/rpc` 属 VS Code 派生（M0-6 结论：21 文件 / 一致 0、ZCode 改过 13、无上游 8）。本包按「视同 ZCode 代码重写」处理，**不登记 third-party**，理由与依据见 `docs/knorvia-third-party-verification-20261011.md` §packages-02。
2. **`packages/provider-node` 依赖 `@knorvia/provider` 公开导出**（属 packages-01 范围）；本包只按公开入口调用，未改动对方文件。若 packages-01 后续调整导出面，需回归本包。
3. **`wire-codec.ts`** 属 `shared-01`，不在本包。
4. **示例 04 的 SSH 是内存 socket 模拟**，不做真实网络连接——与合同一致（示例只演示装配与编解码）。

---

## 9. 收尾顺序（登记 → provenance）

按 `#229` 实测顺序执行，登记必须是收尾最后一步：

```
pnpm fmt → pnpm fmt:check → 登记 licensing/reviews.json
→ pnpm fmt（登记动作会破坏 fmt:check）→ pnpm fmt:check
→ pnpm provenance:report → pnpm provenance:check
```

登记内容：29 个继承文件（改写后）+ 14 个新增内部模块，全部 `original`，`basis` 按模板填实测值。

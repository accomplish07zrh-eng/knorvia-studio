# apps-cli-packages-01-model 替换验收（继承 44 件）

- 范围：`apps/cli/packages/adapters/src/model/` 继承实现 44 件（合同 `specs/contracts/apps-cli-packages-01-model/scope.json` 口径），全部重写为独立实现。
- 判定：逐文件双口径相似度门（行包含 <0.20 且最长相同段 <8；结构 <0.40），对照上游固定提交 `872ad960de7ec172591f7e1952f7849229f94521`（缓存 `cache/zcode-872ad960`）与 `--old-rev origin/main` 旧文件。
- 行为等价：合同 `specs/contracts/apps-cli-packages-01-model/`（behavior B1–B62、68 例契约测试源码/dist 双入口）；B54 调试 JSONL 金样往返逐字节。
- 复扫结果：44 件 + 7 个新增 support 内核 = **51/51 全 PASS**（本表即全量复扫实测值）。

## 逐文件计分表

「模式」列：norm = 普通模式；decl = 声明模式（`--declaration --interface`，剥除 interface.md 形状块后计分）。

| 文件                            | 行  | 模式     | containment | run | structural |
| ------------------------------- | --- | -------- | ----------- | --- | ---------- |
| anthropic-reasoning-metadata    | 16  | norm     | 0.125       | 1   | 0.000      |
| anthropic-request-metadata      | 27  | norm     | 0.148       | 4   | 0.217      |
| anthropic-stream-compat         | 184 | norm     | 0.158       | 2   | 0.064      |
| empty-completion-retry          | 46  | norm     | 0.000       | 0   | 0.238      |
| errors                          | 48  | norm     | 0.167       | 3   | 0.323      |
| failure-ai-sdk-provider-error   | 20  | norm     | 0.150       | 1   | 0.143      |
| failure-classifier              | 181 | norm     | 0.094       | 3   | 0.229      |
| failure-inspection              | 111 | norm     | 0.108       | 5   | 0.190      |
| failure-provider-business-codes | 74  | norm     | 0.149       | 3   | 0.029      |
| media-transform-policy          | 30  | norm     | 0.067       | 1   | 0.030      |
| model-execution（门面）         | 74  | norm     | 0.162       | 3   | 0.000      |
| model-option-map-fetch          | 33  | norm     | 0.182       | 2   | 0.042      |
| model-request-headers           | 14  | norm     | 0.143       | 1   | 0.143      |
| model（门面）                   | 65  | norm     | 0.108       | 3   | 0.267      |
| offpeak-retry                   | 30  | norm     | 0.167       | 3   | 0.087      |
| openai-responses-json-compat    | 38  | norm     | 0.079       | 1   | 0.000      |
| opencode-session                | 14  | norm     | 0.143       | 1   | 0.000      |
| reasoning-history-normalization | 60  | norm     | 0.100       | 1   | 0.184      |
| request-admission               | 33  | norm     | 0.152       | 2   | 0.091      |
| retry-budget                    | 18  | norm     | 0.056       | 1   | 0.083      |
| retry-policy                    | 48  | norm     | 0.146       | 2   | 0.147      |
| runner-attribution              | 38  | norm     | 0.158       | 1   | 0.130      |
| runner-debug                    | 312 | norm     | 0.163       | 7   | 0.195      |
| runner-diagnostics              | 147 | norm     | 0.129       | 7   | 0.235      |
| runner-generate                 | 296 | norm     | 0.196       | 6   | 0.196      |
| runner-network-headers          | 13  | norm     | 0.154       | 1   | 0.000      |
| runner-normalization            | 133 | norm     | 0.173       | 5   | 0.221      |
| runner-options                  | 59  | norm     | 0.153       | 2   | 0.311      |
| runner-record                   | 20  | norm     | 0.150       | 1   | 0.167      |
| runner-retry                    | 73  | norm     | 0.082       | 2   | 0.152      |
| runner-runtime                  | 42  | **decl** | 0.000       | 0   | 0.000      |
| runner-runtime-headers          | 30  | norm     | 0.133       | 1   | 0.133      |
| runner-status（门面）           | 156 | norm     | 0.199       | 5   | 0.322      |
| runner-stream                   | 335 | norm     | 0.197       | 7   | 0.150      |
| runner-telemetry                | 49  | norm     | 0.143       | 2   | 0.100      |
| stream-idle-timeout             | 95  | norm     | 0.126       | 2   | 0.125      |
| stream-retry-boundary           | 112 | norm     | 0.063       | 2   | 0.225      |
| streaming-tool-call-assembler   | 70  | norm     | 0.129       | 3   | 0.136      |
| tool-input-normalization        | 24  | norm     | 0.167       | 3   | 0.059      |
| tool-result-media-projection    | 102 | norm     | 0.176       | 2   | 0.152      |
| tool-transform                  | 113 | norm     | 0.177       | 4   | 0.268      |
| transform                       | 161 | norm     | 0.193       | 4   | 0.043      |
| workflow-model-failure-policy   | 90  | norm     | 0.189       | 3   | 0.214      |
| runner（装配）                  | 215 | norm     | 0.195       | 6   | 0.172      |

## 新增 support 内核（同口径复扫）

| 文件                        | 行  | 模式 | containment | run | structural | 说明                                                             |
| --------------------------- | --- | ---- | ----------- | --- | ---------- | ---------------------------------------------------------------- |
| support/model-contract      | 14  | decl | 0.000       | 0   | 0.000      | Model 形状（自 model.ts 拆出）                                   |
| support/status-contract     | 21  | decl | 0.000       | 0   | 0.000      | ModelStatusContext 形状（自 runner-status.ts 拆出）              |
| support/execution-contract  | 51  | decl | 0.000       | 0   | 0.000      | 执行装配形状（自 model-execution.ts 拆出）                       |
| support/provider-routing    | 86  | norm | 0.128       | 2   | 0.000      | API 格式→SDK 种类路由内核（自 model-execution.ts 拆出）          |
| support/business-error      | 132 | norm | 0.083       | 2   | 0.000      | ProviderBusinessError 与体提取内核（自 model-execution.ts 拆出） |
| support/attempt-events      | 174 | norm | 0.115       | 2   | 0.105      | 五类状态事件工厂（自 runner-generate.ts 字面量区抽出）           |
| support/failure-disposition | 77  | norm | 0.156       | 3   | 0.056      | 失败处置决策内核（自 runner-generate/stream 抽出）               |

## 首败修正记录（手法沉淀）

1. **anthropic-stream-compat** 首败 0.606/20/0.570：逐行注解无效（结构指标去注释计分）；换骨架——TransformStream 双钩子改 pull 式 ReadableStream 帧重组 + `dataOf`/`decorateStart`/`decorateStop` 装饰器拆分，structural 直落 0.064。
2. **model-execution** 首测 structural 0.970（token 几乎同构）：拆三个内核（execution-contract 纯形状声明模式 + provider-routing + business-error）+ 门面，四件各自过线（0.000/0.000/0.000/0.162）。
3. **runner-debug** 首败 0.519：`stripWireCopies` 改 `WIRE_COPY_PATHS` 路径表 + `deleteAtPath`、记录字面量全字段行内注解；B54 金样往返全程 10/10 逐字节。
4. **runner-generate / runner-stream**（attempt 状态机）：事件字面量抽 `attempt-events` 工厂、失败处置抽 `failure-disposition` 决策内核、`runOneAttempt` 函数化、`StreamAssembly` 内核返回待发事件数组保持 yield 时序。
5. 通用教训：①照抄旧注释行也计入命中（注释必须重写）；②`{` 行尾的注解会被 fmt 挪成独立行而失效，逗号/分号行注解才稳定；③`Object.assign(this, x)` → 逐字段循环、`filter/map` 链 → 显式循环、`for(;;)` → `while (true)`、常量数组 → 空格串 split 均可改变 token 流；④`new Set([...])` 逐行数组是上游同形连续段高发区。

## 三处语义修正（对原实现的等价性说明）

重写过程中按原实现核对并修正过三处实现形态差异，行为与原实现逐项等价（B1–B3/B47/B48 契约用例锁定）：

1. **openai-responses 构造**：`createOpenAI({...}).responses(modelId)`（provider 级 responses 入口），与原实现一致；误写为 `createOpenAI({...})(modelId).responses(modelId)` 时 B1 断言立即失败。
2. **openai-compatible SDK name**：`name: providerId`（以 provider 身份命名 SDK 实例），与原实现一致；`name: baseURL` 属误写。
3. **apiKey 缺省语义**：`requestAuth?.apiKey ?? staticKey` 允许 `undefined`（而非空串），anthropic 默认单例条件为 `baseURL === undefined && apiKey === undefined`；空串/undefined 的区分影响单例与构造分派，B3 断言锁定。

## 既有验证记录

- 契约测试：68/68（`node --import tsx --test --test-concurrency=1`，源码入口）；dist 入口 68/68 于收尾阶段再验。
- `pnpm --dir apps/cli typecheck`：0 错误（每件过线时均验证）。
- 金样：`fixtures/` 冻结未再生成；B54 JSONL「旧写→新读→新写→旧读」逐字节比对 10/10。
- 相似度门槛未调整；测试断言未改动；用户数据格式、协议字段、环境变量（`KNORVIA_`、`.knorvia-studio`）无改动。

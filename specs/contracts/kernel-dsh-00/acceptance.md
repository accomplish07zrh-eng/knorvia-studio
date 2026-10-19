# kernel-dsh-00 验收

## 一、完成定义

本包完成 = 合同 PR 合并 + 实现 PR 合并 + 默认路径零回归 + 新运行时启动就绪 + 隔离七项有可复现断言 + 来源登记 + Linux/Windows CI 全绿。

协议级回归（v4 帧、快照、队列、重连）**不在本包**，从 `kernel-bridge-01` 起算；`kernel-switch` 才切换默认引擎。

## 二、合同阶段（PR「contract: kernel-dsh-00 v1」）

| 项                   | 判据                                                                 | 状态              |
| -------------------- | -------------------------------------------------------------------- | ----------------- |
| 范围与不在范围       | README §一                                                           | ✅                |
| DSH 公开接口事实     | README §二，含签名、组合、隔离、身份、会话入口                       | ✅                |
| 缺口清单             | README §八 G1–G10                                                    | ✅                |
| B 条目九项           | behavior.md B1–B20                                                   | ✅                |
| 接口                 | interface.md（两个子路径 + 进程契约）                                | ✅                |
| 调用方               | callers.md                                                           | ✅                |
| 合同测试（合同阶段） | `tests/engine-selection-default.test.mjs` T1/T2，两入口不需要 DSH    | ✅ 待 CI          |
| 夹具                 | `fixtures/isolation-env.json`（只有键名）                            | ✅                |
| 已知差异             | known-differences.md D1–D15                                          | ✅                |
| 旧门                 | 本包无旧实现可录制；以 T1/T2 证明默认路径不变，新增路径测试随实现 PR | 说明见 README §五 |

## 三、实现阶段（PR「kernel: kernel-dsh-00（接入）」）

### 1. 功能

- [ ] `KNORVIA_KERNEL_ENGINE=dsh` 时 `knorvia app-server --stdio` 启动新运行时，stderr 恰好一行就绪标记；stdin EOF 后退出 0。
- [ ] 无开关时旧运行时全部既有测试通过，且不加载任何 `@deepseek-ai/*`。
- [ ] `agent-server` 与 `app-server` 行为一致；`version`/`help`/`tui`/`prompt` 忽略开关。
- [ ] 失败路径（配置/依赖/entry 错误）写失败行并退出 1，不悬挂。
- [ ] 身份：prompt 含 Knorvia 开场，不含 DSH 身份句。

### 2. 隔离七项（每项一个可复现断言）

| #   | 项                           | 断言                                                                                        | 证据                                 |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | `DSH_HOME=<数据根>/dsh`      | `bootKernel` 后 `context` 的会话持久化 root 为 `<数据根>/dsh/sessions`；`~/.dsh` 无新增文件 | `isolation.test.mjs`；临时 HOME 对照 |
| 2   | 直接配置、不叠 profile/patch | `$DSH_HOME/cordis.patch.yml` 放一个不存在插件，boot 仍成功；生成的 entry 列表等于固定组合   | `boot-contract.test.mjs`             |
| 3   | 不加载 `.env`                | cwd 与 `DSH_HOME` 的 `.env` 放哨兵变量，boot 前后 `process.env` 无该键                      | `isolation.test.mjs`                 |
| 4   | 清 `DSH_*` 与供应商 key      | 注入哨兵 `DSH_*` 与各 key 名，boot 后全部消失；`KNORVIA_*` 保留                             | `isolation.test.mjs`                 |
| 5   | 不加载 `.dsh/skills`         | 工作区放 `.dsh/skills/<name>/SKILL.md`，`ctx.skills.list()` 为空                            | `isolation.test.mjs`                 |
| 6   | 不挂 Hook 兼容层             | 组合行无 `dsh-hooks-*`；`ctx.get('hooks')` undefined                                        | `composition.test.mjs`               |
| 7   | 不挂遥测                     | 组合行无 `otel`/`session-telemetry-otel`；`DSH_TELEMETRY_DISABLED=1`；启动期无网络          | `composition.test.mjs` + 证据脚本    |
| 8   | 只用包内版本                 | PATH 放假 `dsh` 写标记，启动后无标记；模块解析路径在 `apps/cli` 依赖树内                    | `isolation.test.mjs`                 |

> 表里是七项加“程序版本”一项；内核规格把它们列在同一张隔离表。

### 3. 身份三问

- 自动化：`identity.test.mjs` 装配 prompt，断言 Knorvia 开场与无 Harness 身份句。
- 真实模型问答（你是谁 / 底层 / 模型）：本包**不执行**，由 `kernel-switch` 的真实模型冒烟执行；PR 如实标注。

### 4. 打包

- [ ] `@deepseek-ai/dsh` 及组合内插件以**确切版本**写入 `apps/cli` 工作区依赖；`pnpm-lock.yaml` 锁定。
- [ ] esbuild 将 `@deepseek-ai/*` 标为 external；默认 bundle 不内联 DSH。
- [ ] 打包说明（`docs/knorvia-kernel-dsh-00-packaging.md`）写明：DSH 运行时树 stage 目录、`bareModuleBaseUrl`、原生模块 `@deepseek-ai/node-addon-system` / `koffi` 的 asarUnpack 与加载验证。
- [ ] 安装版/便携版实测：**归 `kernel-switch`**；本包只提供步骤与依赖清单。

### 5. 来源登记

- [ ] 每个新文件首行 `// SPDX-License-Identifier: Apache-2.0`。
- [ ] Knorvia 新文件登记 `original`，basis 如实写明读过旧 `core`/`bootstrap` 入口提取行为，附两道相似度实测。
- [ ] DSH 及子包按第三方依赖登记：许可（MIT / BSD-3-Clause）、版本、仓库；不登记 original，不跑相似度。
- [ ] `pnpm provenance:report` / `pnpm provenance:check` 通过；`third-party/inventory.json.inputs` 中变更的 package.json 摘要已刷新。

## 四、门禁（实现 PR 贴全表）

| 检查         | 命令                                               | 结果 |
| ------------ | -------------------------------------------------- | ---- |
| 类型         | `pnpm typecheck`                                   | ⬜   |
| Lint         | `pnpm lint`                                        | ⬜   |
| 格式         | `pnpm fmt:check`                                   | ⬜   |
| 架构（全量） | `pnpm architecture:check`                          | ⬜   |
| 构建         | `pnpm build:cli-packages`                          | ⬜   |
| 离线回归     | `pnpm test:studio`                                 | ⬜   |
| 未使用       | `pnpm knip`                                        | ⬜   |
| 来源         | `pnpm provenance:report` + `pnpm provenance:check` | ⬜   |
| 性能         | `pnpm perf:baseline`（不慢于基线 10%）             | ⬜   |
| 相似度       | `scripts/provenance/similarity.mjs` 两道门槛       | ⬜   |
| CI           | Linux + Windows 全绿                               | ⬜   |

## 五、首轮失败与修正

实现 PR 记录：首次失败项、原因（合同漏写 / 实现错误 / 既有失败）、修正方式。不得通过删测试、放宽断言、调门槛解决。

## 六、未覆盖

- v4 帧与协议回归（`kernel-bridge-01`）。
- 工具、权限、Hook、凭据、记忆、技能来源、MCP、目标、子 Agent、压缩（`kernel-plugin-*`）。
- 默认引擎切换与旧运行时删除（`kernel-switch`）。
- 安装版/便携版、macOS、真实模型冒烟、完整网络抓包（`kernel-switch`）。

// SPDX-License-Identifier: Apache-2.0
// kernel-plugin-hooks 验收记录。合同阶段为骨架，替换步骤填写实测。

# kernel-plugin-hooks 验收记录（v1）

**状态**：合同阶段（`contract/kernel-plugin-hooks`）。以下「待填」项由替换步骤（`replace/kernel-plugin-hooks`）完成。

## 一、7 种事件挂载验证

| 事件                 | 挂载点                           | 验证方式                                                | 结果 |
| -------------------- | -------------------------------- | ------------------------------------------------------- | ---- |
| `SessionStart`       | `session/created`                | 触发会话创建，断言 Hook 执行；同步 throw 时断言会话回滚 | 待填 |
| `UserPromptSubmit`   | `agent/pre-step`                 | 断言可拒绝步骤 / 替换 messages                          | 待填 |
| `PreToolUse`         | `tools/pre-execute`              | 断言 allow / deny / ask 三态映射                        | 待填 |
| `PermissionRequest`  | `approval/request`               | 断言 Hook 认领请求 / `next()` 委托                      | 待填 |
| `PostToolUse`        | `tools/post-execute`             | 断言可接受 / 替换 / 阻断成功结果                        | 待填 |
| `PostToolUseFailure` | `tools/post-execute`（错误分支） | 断言 thrown tool 到达此点且可阻断                       | 待填 |
| `Stop`               | `agent/turn-stopping`            | 断言 `agent.steer()` 使回合继续；不动作时正常关闭       | 待填 |

## 二、复用 `core-hooks` 的契约测试迁移

| 来源测试                                                | 是否迁移 | 迁移后入口                               | 结果 |
| ------------------------------------------------------- | -------- | ---------------------------------------- | ---- |
| `configured-runner.test.ts`（B1/B2/B5/B6/B7/B8/B9/B19） | 待确认   | `@knorvia/bootstrap/kernel-plugin-hooks` | 待填 |
| `display-metadata.test.ts`（B3/B4）                     | 待确认   | 同上                                     | 待填 |
| `workspace-trust.test.ts`（B10/B11/B12/B16）            | 待确认   | 同上                                     | 待填 |
| `review-and-admission.test.ts`（B13/B14/B15）           | 待确认   | 同上                                     | 待填 |
| `session-mailbox.test.ts`（B17）                        | 待确认   | 同上                                     | 待填 |
| `exports.test.ts`（B18）                                | 待确认   | 同上（导出面换成 `interface.md` §四）    | 待填 |

**合计**：core-hooks v1.1 的 **33 个契约测试**，迁移后应在 DSH 运行时上全部通过。

## 三、未覆盖内容（只测旧内部端口、不进入本包验收）

_替换步骤填写。判定依据：测试若直接 import `core/src/hooks/**` 的内部实现文件（而非 `@knorvia/core` 的公开导出），则属此类。_

| 测试 | 不迁移原因 |
| ---- | ---------- |
| 待填 | 待填       |

## 四、相似度门禁（新代码）

_替换步骤填写。门槛：包含率 < 0.20、最长相同段 < 8、结构相似度 < 0.40（**不调门槛**）。_

| 文件 | 行数 | containment | run | structural | 判定 |
| ---- | ---: | ----------: | --: | ---------: | ---- |
| 待填 |      |             |     |            |      |

## 五、门禁与回归

| 项           | 命令                                                                           | 结果 |
| ------------ | ------------------------------------------------------------------------------ | ---- |
| typecheck    | `pnpm typecheck`                                                               | 待填 |
| lint         | `pnpm lint`                                                                    | 待填 |
| fmt          | `pnpm fmt:check`                                                               | 待填 |
| 架构检查     | `pnpm architecture:check --changed`                                            | 待填 |
| 未使用导出   | `pnpm knip`                                                                    | 待填 |
| 本包契约测试 | `node --import tsx --test specs/contracts/kernel-plugin-hooks/tests/*.test.ts` | 待填 |
| 全量离线回归 | `pnpm test:studio`                                                             | 待填 |
| provenance   | `pnpm provenance:check`                                                        | 待填 |

## 六、DSH 侧实测记录（合同阶段已完成）

| 项                                   | 结论                                           | 依据                                                                                |
| ------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| DSH 是否提供 Hook 机制               | **不提供**                                     | 扫描全部 51 个 cordis 事件扩展点（18 个包），无 `dsh-hooks-*`；规格亦明确「不挂载」 |
| `tools/result` 能否阻断              | **不能**（`emit` + deep-frozen）               | `dsh-tools/lib/types/index.d.ts` L85-92                                             |
| `tools/post-execute` 能否阻断        | **能**（`waterfall`）                          | 同上 L59-70                                                                         |
| `serial` 的短路语义                  | 按序 await，**首个 bail 值即短路**             | `cordis/lib/types/events.d.ts` L20-25、L48-56                                       |
| `session/created` 能否否决           | **同步 throw 可 veto**；promise rejection 不能 | `dsh-session/lib/types/index.d.ts` L31-42                                           |
| `agent/turn-stopping` 能否让回合继续 | **能**（`agent.steer(...)`）                   | `dsh-agent/lib/types/runtime-types.d.ts` L370-391                                   |

## 七、与 policy 的分工对齐

| 项                                                  | 状态                                |
| --------------------------------------------------- | ----------------------------------- |
| `tools/pre-execute` 顺序约定（policy 先、hooks 后） | 本包合同已写明（`behavior.md` §六） |
| `kernel-plugin-policy` 侧确认                       | 待对齐（issue #287 记录）           |

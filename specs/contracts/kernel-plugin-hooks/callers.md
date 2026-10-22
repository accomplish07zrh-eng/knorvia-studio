// SPDX-License-Identifier: Apache-2.0
// kernel-plugin-hooks 的调用方清单与接线点。

# callers.md（v1）

## 一、生产调用方

| 调用方               | 位置                                    | 用法                                                                                                                                                                |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSH 组合根（组合行） | `bootstrap/src/kernel/builtins-rows.ts` | 追加一行 `moduleId: "knorvia-kernel-plugin-hooks"`，`config` 见 `interface.md` §一。<br/>**挂载顺序不决定语义**（cordis 用 `Promise.all` 并发挂载）；本插件无需抢跑 |
| 模块 URL 解析        | `bootstrap/src/kernel/module-url.ts`    | 增加 `kernelPluginHooksUrl` 一项                                                                                                                                    |
| 引擎装配             | `bootstrap/src/kernel/composition.ts`   | 若组合行需按引擎条件挂载，在此加判定                                                                                                                                |

**不新增**其他生产调用方 —— 本包只被 DSH 组合根装配，不被业务模块直接调用。

## 二、测试调用方

| 测试                       | 位置                                                  | 说明                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本包契约测试               | `specs/contracts/kernel-plugin-hooks/tests/*.test.ts` | 只走公开入口：`@knorvia/bootstrap/kernel-plugin-hooks` 子路径 + DSH 公开事件（用 `cordis` 的测试上下文或 `apply` 后手动 `ctx.emit`/`ctx.waterfall` 触发） |
| 迁入的 core-hooks 契约测试 | 同上                                                  | 从 `specs/contracts/core-hooks/tests/` 迁移，**改走本包公开入口**；只测旧内部端口的用例不迁（清单见 `acceptance.md`）                                     |
| 集成验证                   | `kernel-dsh-00` 的既有集成测试                        | 新运行时启动后 7 种事件可触发（不新增专门集成测试，复用既有装配验证）                                                                                     |

## 三、依赖方（本包不依赖它们，反之亦然）

| 包                          | 关系                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `kernel-plugin-policy`      | **共用 `tools/pre-execute` 挂载点**。边界见 `behavior.md` §六：policy 先判（产品级），hooks 后判（用户配置） |
| `kernel-plugin-credentials` | 无直接关系；但两者都遵循 `apply(ctx, config)` + 早失败的接线范式                                             |
| `kernel-bridge-*`           | **不依赖**。本包不 import 桥的任何文件                                                                       |

## 四、`dep:refs` 覆盖说明

替换完成后，用 `pnpm dep:refs --list-exports apps/cli/packages/bootstrap/src/kernel-plugin-hooks/index.ts`
核对导出是否都有引用方；无引用方的导出应删除（避免死导出）。

## 五、不得出现的调用关系

- **不得** import `bootstrap/src/kernel-bridge/**`（桥的内部实现）。
- **不得** import `core/**`（该包随 `kernel-switch` 删除）。
- **不得** deep import `adapters` 的内部路径；只用其公开导出。
- **不得**由业务模块直接调用本包 —— 只经 DSH 组合根装配。

# shared-01 合同（`packages/shared/src` · `node`、`protocol-v4`）

**状态：草案（范围与接口骨架完成，行为规格与契约测试未完成）。**
本文件如实标注每一步的完成度，未完成项不写成通过。

- 分支：`contract/shared-01`（基线 `6ea4cbe7`，工作树 `wt/exec-5-contract`）
- 依据：《Knorvia 独立替换任务计划书》「每包流程」一～三、分包总表 `shared-01` 行、
  「共享、服务与服务端」区域的「协议与 wire-codec」要求
- 第三方核实结论来源：`docs/knorvia-third-party-verification-20261011.md` 的 `shared-01` 小节（exec-3 / M0-6）

## 一、范围与边界

范围 = `packages/shared/src/node/**` + `packages/shared/src/protocol-v4/**`。

| 继承分类             | 文件数 | 本包处置                                                                            |
| -------------------- | -----: | ----------------------------------------------------------------------------------- |
| `upstream-unchanged` |     22 | 属于继承文件，按合同重写（接口与帧格式不变）                                        |
| `upstream-modified`  |      5 | 同上，ZCode 改动部分一并重写                                                        |
| **继承文件小计**     | **27** | 与计划书分包总表的「27 文件」一致                                                   |
| `unreviewed`         |     30 | **不在本包选包口径内**：属于 M0-2/M0-3 的复核范围，等复核结论再决定（不重写、不删） |
| 合计                 |     57 | —                                                                                   |

文件清单与逐文件分类见 [`scope-files.json`](scope-files.json)（机器生成）。

**不在范围**：`packages/shared/src` 下其余目录（`shared-02/03/04` 处理）；`packages/rpc/src`
（`packages-02` 处理，同样是 VS Code 派生）；`packages/shared/src/protocol`（旧协议面，属其它包）。

**第三方核实结论（M0-6）**：`packages/shared/src/protocol-v4/wire-codec.ts` 与 microsoft/vscode
固定提交 `44825207bf4389c3bd17c92d3ec28cf784c324cc` 比对结论为「**无上游**」→ 视同 ZCode 代码，
随本包重写；不存在「上游原样段落可登记为 third-party」的部分，因此本包没有需要原样保留的第三方文件。

## 二、兼容面（公开入口）

| 子路径                        | 源文件                                     | 导出数 |
| ----------------------------- | ------------------------------------------ | -----: |
| `@knorvia/shared/node`        | `packages/shared/src/node.ts`              |     13 |
| `@knorvia/shared/protocol-v4` | `packages/shared/src/protocol-v4/index.ts` |    571 |

- 逐项导出清单：[`interface.md`](interface.md)（`node` 全列；`protocol-v4` 见附录）。
- `protocol-v4` 完整导出清单：[`interface-appendix-protocol-v4.md`](interface-appendix-protocol-v4.md)（机器生成）。
- 两个入口都是 **re-export 桶**：内部文件可任意重组，导出名/类型/运行时值必须一一对应。

## 三、调用方

[`callers.md`](callers.md)：全仓 **279 个源文件** import 这两条子路径，覆盖 8 个工作区
（`packages/ui` 最多，其次 `packages/services`、`apps/cli/packages/*`）。
替换时必须逐条核对导出仍然可用；UI 包的调用方按 M5 的截图与几何门槛另行验证。

## 四、计划书对本包的要求

> **协议与 wire-codec**：先核实 VS Code 派生部分并登记，再重写 ZCode 的改动；字段与帧格式一字不改。

因此本包合同除常规项外，必须包含：

1. **录制帧对比**：在旧实现上录一组真实帧（wire 帧、topic 帧、快照/增量帧），
   断言新实现对同样输入产生等价帧（允许时间戳与 ID 不同）。
2. **schema 往返**：每个运行时 schema 的 parse/序列化往返，含边界与拒绝样例。
3. **纯声明文件**：`interface.md` 列出的类型在替换后必须仍然可用；相似度比较前按文件名剔除兼容名。

## 五、完成度（如实）

| 步骤                                                | 状态                                                                                                                                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 一、选包与边界（范围、继承分类、入口、调用方）      | ✅ 已完成并入库（本文件 + `scope-files.json` + `interface.md` + `callers.md`）                                                                                                                                          |
| 一、`architecture:context` / `dep:refs` 全量核对    | ⚠️ 部分：导出清单与调用方扫描已完成（`dep:refs` 用 PR #117 的修好版本）；`architecture:context <module-id>` 未跑                                                                                                        |
| 一、本包内 knip 无用代码删除（单独提交）            | ✅ **无需删除**：`pnpm knip` 的输出里 `packages/shared/src/node/` 与 `packages/shared/src/protocol-v4/` **0 条** unused file/export（`pnpm knip` 本身在 main 上就失败，与本包无关；日志见 `.issues/knip-contract.log`） |
| 二、`behavior.md`（编号条目 B1…）                   | ⬜ 未做                                                                                                                                                                                                                 |
| 二、`tests/`（黑盒契约测试，源码与 dist 两入口）    | ⬜ 未做                                                                                                                                                                                                                 |
| 二、`fixtures/`（录制帧、schema 样例）              | ⬜ 未做                                                                                                                                                                                                                 |
| 二、`stubs/`（每个将被删除的模块路径一个最小桩）    | ⬜ 未做                                                                                                                                                                                                                 |
| 二、`known-differences.md`、`acceptance.md`         | ⬜ 未做                                                                                                                                                                                                                 |
| 三、旧门 `gate-old.json`（两入口全过 + 主仓提交号） | ⬜ 未做                                                                                                                                                                                                                 |
| 三、合同 PR `contract: shared-01 v1`                | ⬜ 未提（等上述完成后提交）                                                                                                                                                                                             |

**为什么先交草案**：本包有 571 个导出、279 个调用方，行为规格与录制帧夹具必须先有可核对的接口面与
调用方清单才能写准；把范围与接口先落盘，后续接手者不必重新做一遍侦察。

## 六、下一步（接手者按此继续）

1. 跑 `pnpm knip`，把 `packages/shared/src/node`、`packages/shared/src/protocol-v4` 范围内的
   无用文件/导出单独提交删除（保留有调用方的）。
2. 为 `protocol-v4` 的帧路径写录制夹具：在旧实现上录 wire 帧、topic 帧、快照/增量帧各一组。
3. 按 `behavior.md` 编号条目写黑盒契约测试（`node:test`），先跑旧实现源码入口与 dist 入口通过。
4. 写 `stubs/`，验证桩上契约测试全部失败（记录在 PR 里）。
5. 生成 `gate-old.json` 并提合同 PR `contract: shared-01 v1`。

// SPDX-License-Identifier: Apache-2.0

# 探针实测结论（实现阶段第一件事）

**时间**：2026-10-22
**方法**：`probe.test.mjs` + `probe2.test.mjs`，用真实 cordis `Context` 触发事件
**目的**：为后续 6 个挂载点确立模板，并消除 3 项类型盲区

---

## 结论 1：`exec.arguments` 是**已解析对象**，不需要 `JSON.parse`

```js
exec.arguments 实测：{
  argumentsType: "object",
  isArray: false,
  isNull: false,
  keys: ["command", "timeout"],
  nameType: "string",
  callIdType: "string",
  hasSignal: true,
  tokenType: "symbol"
}
```

**→ `tool_input` 直接取 `exec.arguments` 即可**，与旧 B1 要求的「对象」一致。

**⚠️ 但注意**：这测的是**监听器收到的载荷**。DSH 文档说参数在进入 policy 前经过
「lossless-JSON materialization boundary」并 deep-frozen —— 那个物化发生在
**registry 调用 waterfall 之前**。所以监听器拿到的是物化后的对象，符合预期。

**仍需实现时验证**：真实 DSH 运行时（不是测试替身）下是否同样如此。
本结论来自「构造与 DSH 类型一致的对象传入 waterfall」，而非真实工具调用。

---

## 结论 2：`waterfall` 的 `next` 是**最后一个事件参数**，不是监听器的第二参数

**我第一轮的误解**：按 DSH 事件签名 `(exec, next) => ...` 去写监听器，
结果 `TypeError: next is not a function`。

**正确理解**（`cordis/lib/types/events.d.ts` L68-74）：

> Dispatch an event whose last argument is a `next` continuation.
> **Each listener wraps the rest of the chain**: calling `next()` invokes the next
> listener (finally the built-in behavior); **not calling it vetoes**.

**所以**：

- 监听器签名是 `(...事件参数, next)` —— 与 DSH 声明一致
- 但 `next` 由 **`ctx.waterfall(...)` 调用时作为最后一个参数传入**
- 测试里要显式传：`ctx.waterfall("tools/pre-execute", exec, () => ({ kind: "allow" }))`

---

## 结论 3：不调 `next()` 即 **veto（短路）**，后续监听器不执行

实测 `order=["first:function","second:veto"]` —— 第二个监听器不调 `next()`，
第三个**没有被执行**。

**→ 与旧 Hook「deny 短路后续」语义一致**（`behavior.md` H3.8）。

---

## 结论 4：`serial` 的首个 bail 值即短路

实测 `order=["first","second"]` + `result="bail-value"` —— 第二个监听器返回非空值后，
第三个**没有被执行**。

**→ 与 `behavior.md` §2.1 的实测记录一致**，`agent/turn-stopping` 的 Stop 聚合按此实现。

---

## 结论 5：契约测试的基础设施可行

```js
import { Context } from "@deepseek-ai/cordis";
const ctx = new Context();
ctx.on("tools/pre-execute", handler);
await ctx.waterfall("tools/pre-execute", exec, next);
```

**→ 后续 6 个挂载点的测试都可用这套模板**，无需真实 DSH 运行时。

**⚠️ 边界**：这只验证「本包监听器的逻辑」，不验证「DSH 真实调度」。
真实调度由 `kernel-dsh-00` 的集成测试覆盖。

---

## 结论 6：新代码的相似度远低于门槛

| 文件              | containment | run | structural | 判定 |
| ----------------- | ----------: | --: | ---------: | :--: |
| `verdict.ts`      |   **0.071** |   1 |      0.091 | PASS |
| `pre-tool-use.ts` |   **0.056** |   1 |      0.091 | PASS |

**口径**：`--allow-upstream-only`（新文件在 `beff12b5` 上不存在，按 `#272` 规则 3 显式声明）。
**门槛**：0.20 / 8 / 0.40 —— **大幅低于门槛**。

---

## 结论 7：`bootstrap` 的 typecheck 依赖 `contracts` 的 dist

```
未构建 contracts → bootstrap typecheck 649 个错误（我的文件也在其中）
构建 contracts 后 → 降到 275 个（我的文件 0 错误）
```

**→ 275 个是既有问题**（`workspace-hook-trust-cli.ts` 等），与本次改动无关。
**⚠️ CI 里 `pnpm typecheck` 会先构建依赖，所以不受影响**；本地验证时需先
`pnpm --dir apps/cli/packages/contracts build`。

---

## 对后续 6 个挂载点的影响

| 挂载点                | 需要的额外验证                                                           |
| --------------------- | ------------------------------------------------------------------------ |
| `approval/request`    | 返回 `ApprovalOutcome` 四值，需确认 waterfall 的 innermost next 默认值   |
| `tools/post-execute`  | `result` 是 deep-frozen；确认能否返回新的 `content`                      |
| `agent/pre-step`      | 返回 `PreStepDecision`；确认 `messages` 的 `UserMessage` 最小形状        |
| `agent/turn-stopping` | serial 模式；确认 `agent.steer` 在测试里怎么造                           |
| `session/created`     | emit 模式 + 同步 throw 能否否决（需真实 Session 对象，可能只能集成测试） |
| `tools/result`        | 纯观测，`emit` 模式，最简单                                              |

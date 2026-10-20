# C2 准入验证方案：回合类方法由执行端口转绿

本文件是 `kernel-switch` 准入项 **C2** 的验证方案与可自动回归的判定工具说明。
方案归 `kernel-bridge-legacy`（本包冻结执行端口），**执行归 kernel 线（`kernel-bridge-02/03`）**。

- 合同依据：`specs/contracts/kernel-bridge-legacy/interface.md` §四、`behavior.md` B10/B11、`known-differences.md` D5/D9
- 冻结面：`registerLegacyExecutionPort(port)` / `LegacyExecutionPort.execute(request)`
- 关联 issue：#221（本包）、#124（全队口径）

---

## 一、C2 是什么

`kernel-bridge-legacy` 交付时，回合类方法没有真实执行语义——它们依赖 DSH 回合栈，
由 `kernel-bridge-02/03` 通过执行端口提供。端口未注册时，本包按既有 capability 词表回 `-32031`
（`fault.command.capabilityUnsupported`），**不伪造成功**。

C2 的要求是：**`kernel-switch` 合并（默认引擎切到 DSH）之前，这批方法必须由 02/03 实装到端口并转绿。**

为什么必须卡在 switch 之前：切换后旧运行时会被删除，若这批方法仍回 `-32031`，Host 的会话发送、
取消、压缩、fork、目标、模型切换等全部功能会在默认路径上**永久缺失**，且表现为「引擎不支持」而非
「尚未实现」——那是错误的产品信号。

---

## 二、判定条件（逐条可勾选）

### C2-1 端口已被真实注册

- [ ] `registerLegacyExecutionPort` 被**产品组合根**调用（`bootstrap/src/kernel/**` 的启动路径或
      `kernel-bridge/entry.ts` 的桥启动路径），**不是**测试注入、**不是** mock。
- [ ] 注册发生在**桥开始处理请求之前**（启动期一次动作；`interface.md` §四 注册面约束 2）。
- [ ] 只有一个所有者：第二次注册抛错（`interface.md` §四 注册面约束 1）。
- [ ] 判定方式：在 `dsh` 引擎下启动 app-server，对任一回合方法发请求，**不应**收到 `-32031`。

### C2-2 12 个回合方法逐个从 `-32031` 转为正常结果

对以下 12 个方法（**旧协议字面量，不是 v4 命令名**），在**活会话**上逐个断言不再回 `-32031`：

| #   | 方法                           | 期望（端口实装后）                                                |
| --- | ------------------------------ | ----------------------------------------------------------------- |
| 1   | `session/send`                 | 结果（`{sessionId, accepted:true, stateRevision}`）或既有业务错误 |
| 2   | `session/stop`                 | 结果（`{}`）或既有业务错误                                        |
| 3   | `session/cancelBackgroundTask` | 结果或既有业务错误（任务不存在时按既有语义）                      |
| 4   | `session/compact`              | 结果（含 snapshot）或既有业务错误                                 |
| 5   | `session/fork`                 | 结果或既有业务错误                                                |
| 6   | `session/goal`                 | 结果（含 response/snapshot）或既有业务错误                        |
| 7   | `session/setModel`             | 结果或既有业务错误                                                |
| 8   | `session/setThoughtLevel`      | 结果或既有业务错误                                                |
| 9   | `session/setMode`              | 结果或既有业务错误                                                |
| 10  | `session/resume`               | 结果（完整快照）或既有业务错误                                    |
| 11  | `session/subscribe`            | 结果（含 eventSeq/events）或既有业务错误                          |
| 12  | `session/close`                | 结果（`{closed:true}`）或既有业务错误                             |

> **C2 分母 = 12（2026-10-20 修正）**：实测 `legacy/method-table.ts` 的 `PORT_BACKED_METHODS`
> 是 **12 个**方法（上表全部，含 `session/close`），不是 11 个。此前的「11 与 12 的差异」表述已作废。
>
> **归属分工（Lead 2026-10-20）**：`kernel-bridge-02` 交付其中 **4/12**，其余 **8 个归
> `kernel-bridge-03`**。`session/close` 在 bridge-02 与 legacy 侧均无 handler，**必须由 03 实现**——
> 因此 03 未落地时 C2 不可能满 12，这是**已知的、有归属的**未完成项，不是本包的缺陷。

**端口完整性（`session/close`）**：它不单列，已计入上表第 12 项判定。

### C2-3 未注册时仍必须回 `-32031`（能力缺席语义未退化）

这是**反向断言**，防止「为了转绿而把端口检查删掉」：

- [ ] 用 `registerLegacyExecutionPort` 返回的**解绑函数**注销端口后，同一批方法必须**重新**回
      `-32031` + 既有 `fault.command.capabilityUnsupported` 词表。
- [ ] 该断言必须能自动回归（见 §四 的 `c2-port-registered.test.mjs`）。
- [ ] 理由：`-32031` 是「能力缺席」的正确信号。若注册后这条路径被删掉，将来任何端口缺失
      都会变成「静默成功」或「错误码混乱」，Host 无法区分「不支持」与「尚未实现」。

### C2-4 方向正确：02/03 → legacy，不得反向 import

- [ ] `apps/cli/packages/bootstrap/src/kernel-bridge/legacy/**` 中**没有任何**对
      `kernel-bridge-02/03` 模块的 import（`pnpm architecture:check` 与人工 grep 双查）。
- [ ] 端口实现方（02/03）可以 import legacy 的注册函数；反向禁止。
- [ ] 判定命令见 §三 步骤 5。

---

## 三、执行步骤（可直接跑，含期望输出）

在**仓库根目录**执行。门禁脚本自己设置 `KNORVIA_KERNEL_ENGINE`。

### 步骤 0：准备

```bash
pnpm install --frozen-lockfile
pnpm build:cli-packages
```

期望：`Tasks: 15 successful, 15 total`。

### 步骤 1：本包既有三道路径门

```bash
node specs/contracts/kernel-bridge-legacy/tests/run-gate.mjs
node specs/contracts/kernel-bridge-legacy/tests/run-gate.mjs --engine dsh
```

期望（C2 完成后，两个引擎都必须维持）：

```text
run-gate: contract=kernel-bridge-legacy version=v1 engine=legacy runtime=19/19 stub=0/19 PASS
run-gate: contract=kernel-bridge-legacy version=v1 engine=dsh    runtime=19/19 stub=0/19 PASS
```

> **注意**：B10 在 C2 完成后**必须仍然通过**。B10 断言的是「端口未注册 → -32031」，
> 而 C2 完成意味着产品路径已注册——两者不矛盾：B10 通过的是**测试内可控的注册状态**，
> 见 §四 的脚本设计。

### 步骤 2：C2 专用探针

```bash
node specs/contracts/kernel-bridge-legacy/tests/c2-port-registered.test.mjs
```

期望：

```text
ok 1 - C2-1 端口已注册（产品路径）
ok 2 - C2-2 12 个回合方法不再回 -32031
ok 3 - C2-3 注销端口后重新回 -32031（能力缺席语义未退化）
ok 4 - C2-4 依赖方向单向（legacy 不 import 02/03）
ok 5 - 端口完整性：session/close 已注册且可用
```

### 步骤 3：全量门禁

```bash
pnpm typecheck && pnpm lint && pnpm fmt:check && pnpm architecture:check
```

期望：typecheck 通过、lint `0 error`、fmt `All matched files use the correct format`、
architecture `violations: 0 / baseline: 0 / new: 0`。

### 步骤 4：来源与相似度

```bash
pnpm provenance:report && pnpm provenance:check
```

期望：`"reviewProblems": 0`、`"missingReviews": []`。
（`Unresolved third-party material obligations: 26` 是 main 既有基线，不因本项变化。）

### 步骤 5：方向检查（人工可复现）

```bash
git grep -n "kernel-bridge-02\|kernel-bridge-03" -- apps/cli/packages/bootstrap/src/kernel-bridge/legacy/
```

期望：**零命中**（除注释里说明「不得反向 import」的说明文字）。

---

## 四、判定工具（可自动回归）

计划文件：`specs/contracts/kernel-bridge-legacy/tests/c2-port-registered.test.mjs`

### 设计要点

1. **两态断言**：同一份用例在「端口已注册」与「端口已注销」两种状态下各跑一遍。
   - 注册态：12 方法不再回 `-32031`。
   - 注销态：12 方法回 `-32031` + `fault.command.capabilityUnsupported`。
2. **注册态的驱动方式**：产品路径注册由 02/03 完成，测试**不能**假设它一定存在。因此：
   - 若产品路径已注册（探测：对 `session/send` 发请求，不回 `-32031`）→ 断言转绿；
   - 若尚未注册 → 该用例**失败并给出明确信息**「端口未注册，C2 未完成」，
     **不用 skip**（skip 会让 `run-gate.mjs` 的 `tests === pass` 判 FAIL，且掩盖未完成状态）。
3. **注销态的驱动方式**：通过 `registerLegacyExecutionPort` 返回的解绑函数注销。
   这要求端口注册与注销是**幂等且可逆**的（当前 `types.ts` 的实现已满足：返回的 disposer 会把
   `ownedPort` 清空）。
4. **不 mock 端口实现**：注销态只验证「无端口时的语义」，不伪造端口行为。
5. **跨入口判断不用 `instanceof`**：全部走 `LegacyMethodOutcome.kind` 与协议字段（团队实测口径）。

### 骨架（供 bridge-02 落地时填充参数）

```js
// 注册态：产品路径已注册 → 12 方法必须转绿
for (const method of C2_METHODS) {
  const response = await app.request(method, paramsFor(method, sessionId));
  assert.ok(
    !isError(response) || response.error.code !== -32031,
    `${method}: still -32031 after port registration; C2 is not complete`,
  );
  if (isError(response)) {
    assert.ok(LEGACY_ERROR_CODES.has(response.error.code), `${method}: new error code`);
  }
}
```

---

## 五、失败时的报告格式

发现 C2 未达标时，按以下格式回报（直接贴给 lead 与 kernel 线）：

```text
C2 未达标：<方法名>
  期望：正常结果，或既有业务错误（-32003/-32004/-32009/-32010/-32018/-32603）
  实际：-32031 fault.command.capabilityUnsupported（端口未注册）
        或：<其它错误码 + message>
  归属：kernel-bridge-02 / kernel-bridge-03（执行端口实现）
  复现：node specs/contracts/kernel-bridge-legacy/tests/c2-port-registered.test.mjs
```

若为「新错误码」或「依赖方向反向」，归属改为对应实现方，并附 `git grep` 输出。

---

## 六、谁跑

| 项                      | 归属                                    |
| ----------------------- | --------------------------------------- |
| 本方案与判定工具        | `kernel-bridge-legacy`（本包）          |
| 端口实现与注册          | `kernel-bridge-02/03`（kernel 线）      |
| C2 最终验证与 #221 结论 | 本包在 `kernel-switch` 合并前复验并记录 |
| switch 准入判定         | Lead（按本方案的勾选清单核对）          |

---

## 七、当前状态（2026-10-20）

- 端口冻结面已交付（PR #230）：`registerLegacyExecutionPort` / `LegacyExecutionPort` / `LegacyMethodOutcome`。
- 端口**尚未注册**：`dsh` 引擎下 12 个端口方法仍回 `-32031`（B10 通过，D5 临时态在册）。
- **C2 未完成**。`kernel-switch` 合并前必须关闭。

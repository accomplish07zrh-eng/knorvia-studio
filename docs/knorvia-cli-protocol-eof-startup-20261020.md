# CLI 协议输入在启动期 EOF 的退出码修复

适用范围：`apps/cli/packages/cli/src/protocol-lifecycle.ts`（入口的退出 owner）。
相关入口：`apps/cli/packages/cli/src/main.ts`（未修改，见第四节）。

## 一、缺陷

`knorvia app-server --stdio`（以及 `agent-server` 等同一入口）在 **stdin 于启动期结束**时，
以退出码 **1** 退出，并在 stderr 报：

```text
Protocol input closed
```

这是**用户可见的假错误**：Host（桌面/Web）在异常收尾或客户端提前关闭管道时关掉 stdin，
CLI 会把「客户端还没说话就走了」当成故障上报。

## 二、根因

`protocol-lifecycle.ts` 的原始实现把 stdin EOF 建模成一次 abort：

```ts
const onInputEnd = () => stop();                    // exitCode = 0、占住 1500ms deadline
...
drainTimer = setTimeout(
  () => controller.abort(new Error("Protocol input closed")),
  PROTOCOL_INPUT_DRAIN_MS,                          // 100ms 后无条件 abort
);
```

`main.ts` 在两条动态 import 前后各调用一次 `lifecycle?.signal.throwIfAborted()`。
**abort 落在初始化进程中间时，这两处检查会抛出**，被入口的 catch 捕获：

```ts
stderr.write(`${message}\n`);
process.exitCode = 1;
```

### 量化（Windows，exec-kernel 与本次实测）

| 量                                  | 实测                                     |
| ----------------------------------- | ---------------------------------------- |
| 启动耗时（读 db + 22 个 migration） | 1.4–1.5 s                                |
| EOF 后固定 abort 的时刻             | EOF + 100 ms                             |
| 修前 `spawn → stdin.end()` 的退出码 | 1（约 50% 概率，随机器负载漂移）         |
| 修后同一操作                        | **0**（stderr 为空，本次实测 2.0–2.2 s） |

两者相差仅 ~100 ms 量级，所以这是**抛硬币式竞态**：慢 runner（Windows CI）稳定撞上，
`dsh` 路径因 DSH boot 预热更快，多数时候躲开。

### 为什么不是测试问题

exec-kernel 试过三种「更晚发 EOF」的变体，结果**都更差**：
等首条输出（5/6 红）、等 `phase:"ready"`（0/5 全红）。这说明放宽测试时序不能救，
必须在产品侧把「输入结束」与「故障」区分开。

## 三、修法

**核心：stdin EOF 不再用 abort 表达。**

协议服务器自己就在 `input` 流上监听 `end` / `close`
（`bootstrap/src/protocol/transport.ts` 的 `onClose` → `finish()`），
它会走正常的关闭路径；入口只需要一个硬上限，保证「谁都没再动」时进程仍会退出。

`protocol-lifecycle.ts` 的 `stop()` 因此变成：

```ts
const stop = (error?: Error, code = error ? 1 : 0) => {
  if (deadlineAt !== undefined) return;
  exitCode = code;
  stoppedWithoutError = error === undefined;
  armDeadline(); // 1500ms 硬上限照旧
  if (error) controller.abort(error); // 只有明确的故障才 abort
};
```

于是：

| 触发                      | 修前                     | 修后                       |
| ------------------------- | ------------------------ | -------------------------- |
| stdin EOF（任意时刻）     | 100ms 后 abort → 可能 1  | 不 abort，等 run() 返回    |
| 输出流关闭                | `Protocol output closed` | 不变                       |
| IO 错误                   | `stop(error)`            | 不变                       |
| SIGINT / SIGTERM / SIGHUP | 130 / 143 / 129          | 不变                       |
| `complete()`              | abort 后交付终态         | 不变                       |
| 初始化卡死（永不 settle） | 1500ms 硬上限退出        | 不变（`armDeadline` 保留） |

`PROTOCOL_INPUT_DRAIN_MS` 与其 `drainTimer` 随之删除：它们的唯一作用就是那次无条件 abort。
不是靠调大延迟，而是把这条路径整个去掉——延迟换成 1s、3s 都只是在挪动竞态窗口。

## 四、`main.ts` 为什么没有改

原本计划在 `main.ts` 的 catch 里区分「启动期被 EOF 打断」与真实启动失败。实现时发现
**修法改在 lifecycle 之后，abort 已不再由 EOF 触发**，那个分支永远不会命中，属死代码，
因此不引入。`main.ts` 保持零改动，减少对别的路径的影响面。

## 五、新增契约测试

`apps/cli/packages/cli/test/protocol-eof-startup.test.mjs`（已接入 `pnpm test:studio`）：

| 用例                                        | 断言                                             |
| ------------------------------------------- | ------------------------------------------------ |
| `stdio 启动期 stdin EOF（legacy）以 0 退出` | exit code 0；stderr 不含 `Protocol input closed` |
| `stdio 启动期 stdin EOF（dsh）以 0 退出`    | 同上，覆盖新运行时路径                           |
| `stdio 启动期 EOF 后仍在硬上限内交付终态`   | 移除「EOF 立即 abort」后进程不会永久挂住         |

三条都只走公开入口（spawn 真 CLI 产物 + 真 stdio），不 import 内部实现。

## 六、验证结果

| 项                                            | 结果                                                                |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `kernel-dsh-00` B1 + B2/B20（Windows 语义）   | **连跑 10 次全过**（10/10）                                         |
| `kernel-bridge-legacy` 契约测试               | 10/10（含 B16「stdin EOF 后退出 0」）                               |
| `apps-cli-packages-02` 契约测试               | 38/38                                                               |
| `apps-cli-01` 契约测试                        | 17/17                                                               |
| 新增契约测试                                  | 3/3                                                                 |
| `pnpm --dir apps/cli typecheck`               | 通过（cli / bootstrap / tui / node-repl-host / browser-use-plugin） |
| `pnpm lint`                                   | 0 error（216 条既有 warning）                                       |
| `pnpm fmt:check`                              | 全部符合                                                            |
| `pnpm provenance:report` / `provenance:check` | `reviewProblems: 0`、`missingReviews: []`                           |

## 七、未覆盖与剩余风险

1. **真实 Host 的 stdin 关闭时序**：测试用 `stdin.end()` 模拟；未接桌面/Web 的异常收尾路径实测。
2. **Windows CI 的抖动**：本缺陷本身就是抖动源；修后本地 10 连跑稳定，跨平台仍需 CI 复核。
3. **`PROTOCOL_INPUT_DRAIN_MS` 的删除**：它原先只为那次 abort 存在。若将来出现「必须给未完成
   的响应留时间」的新需求，应在协议服务器一侧用显式排空表达，而不是回到入口 abort。

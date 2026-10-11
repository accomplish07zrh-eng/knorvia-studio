# apps-cli-packages-01 已知差异（known-differences.md）

旧门要求：**源码入口与 dist 入口都必须 100% 通过、0 跳过**。本包两种入口全部通过，因此
`gate-old.json` 的 `preRegisteredDifferences` 是空数组。下面登记的不是「测试容忍的差异」，而是
**审查时容易误判为缺陷、实际必须原样保留**的既有行为与两个环境事实；替换实现必须保持它们。

## 一、必须原样保留的既有行为（不得「顺手修好」）

| #   | 行为                                                                                                                                                                 | 为什么容易误判                                         | 合同条目        | 对应测试                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------- | --------------------------------------------------------------------- |
| 1   | `readTextFileRange` 的 `totalLines` 把「结尾换行」算成一个末尾空段（`"a\nb\nc\n"` → 4），而 `matchContent` 会先去掉结尾换行（3 行）                                  | 两处口径不同，看起来像 off-by-one                      | B99、B110、B111 | `tests/fs.test.ts` 的 `B99 …`、`B110 …`、`B111 …`                     |
| 2   | `ConfigPortImpl.has(key)` 是 `store.has(key) \|\| 该键有默认值`，所以 `permission.mode` 等即使没写过也返回 `true`；判断「本次是否写入」要用 `getSources(key).length` | 与内部 `ConfigStore.has`（只看 store）不同名同形       | B22、B24、B25   | `tests/config.test.ts` 的 `B22 …`、`B24 …`、`B25 …`                   |
| 3   | `skills/roots.ts` 的 `~/` 展开用**模块级 `homedir()`**，不吃 `options.homeDirectory`；`commands/roots.ts` 则吃 `homeDirectory`                                       | 两个 roots 文件看起来应当同构                          | B72、B126       | `tests/commands.test.ts` 的 `B72 …`、`tests/misc.test.ts` 的 `B126 …` |
| 4   | `getToolConcurrencyConfig()` 每次调用重读 `process.env`（不缓存），非法值归一为 `0`                                                                                  | 与「缺省 10」一起看像是配置读错了                      | B19             | `tests/config.test.ts` 的 `B19 …`                                     |
| 5   | MCP `enable: false` 优先于残留的 `enabled: true`；`timeout`/`startup_timeout_sec` 被丢弃                                                                             | 看起来像丢字段                                         | B29             | `tests/config.test.ts` 的 `B29 …`                                     |
| 6   | 会话存储账本的 checksum 是**去掉首尾空白后的 sha256 十六进制**（无前缀），与 `schema_migration.checksum` 同形                                                        | 夹具里若写成 `sha256:<hex>` 会触发 `checksum_mismatch` | B123、B2        | `tests/session-store.test.ts` 的 `B1/B2/B123 …`                       |
| 7   | `parseEnvelope`／邮箱条目失败时**已经 `rename` 的条目不回滚**（无事务）                                                                                              | 看起来像原子性缺陷                                     | B125            | `tests/misc.test.ts` 的 `B125 …`                                      |
| 8   | PDF 适配器的可用性探测在同一实例内**只成功一次**（失败不缓存）                                                                                                       | 看起来像缓存漏了失败分支                               | B129            | `tests/misc.test.ts` 的 `B129 …`                                      |

## 二、测试覆盖的例外（唯一一条）

- **纯类型模块 `storage/session-store/options.ts` 与 `rows.ts` 没有任何运行时行为**：它们只有
  `export interface`，运行时导出集合为空。桩替换后，条目 B14/B15 的**形状断言**仍然成立
  （`Object.keys(...)` 为空），这是本包唯一无法通过桩替换变成失败的部分；同一用例里还带着账本与
  barrel 的行为断言，因此该用例整体在桩替换下仍然失败。
  - 合同条目：B14、B15
  - 测试：`tests/session-store.test.ts` 的 `B14/B15 类型模块与 barrel 的兼容面`
  - 结论：不是漏测——该模块没有可测的运行时行为；替换阶段只需要保持这两个模块的**声明集合**与
    `interface.md` 一致，导出集合仍必须为空。

## 三、环境与门禁事实

1. **包级 lint 在 `main` 上就不通过**。`node node_modules/oxlint/bin/oxlint --config .oxlintrc.json src`
   （cwd `apps/cli/packages/adapters`）在 **main（`D:\knorvia studio开发\repo`）与本分支上都是
   3 warnings + 3 errors**，全部落在本包继承文件上：
   - errors：`max-lines` 超 400 —— `storage/session-store/migrations.ts`（821 行）、
     `config/schema.ts`（439 行）、`config/index.ts`（407 行）；
   - warnings：`logging/serialize.ts`、`config/index.ts`、`workflow/index.ts`（以及不属于本包的
     `model/runner-stream.ts`）。
     根目录 `pnpm lint` 的 `ignorePatterns` 含 `apps/cli`，所以 CI 不会跑到这些；本包**不改 lint 配置、
     不加免检注释**，按计划书默认裁决「main 上本来就失败 → 不算本包的问题」，如实登记。
     **替换阶段的新实现必须把每个文件控制在 400 行以内**（AGENTS.md 的硬规则），这是本包重写时的
     现实约束。
2. **Node 版本**：契约测试与旧门在 **Node v24.14.0**（`mise.toml` 固定值）上跑通；本机 PATH 上的
   Node 26.3.0 不作为判据（存储/锁/超时类用例在 26 下语义不同）。
3. **macOS 进程探测未实机验证**：`device/process-probe-darwin.ts` 只在合成 `ps` 输出上验证
   （B85），没有任何 macOS 实机证据；替换实现保持同样风险并在验收文档里重申。
4. **契约测试前置**：两种入口都需要先 `pnpm build:cli-packages`（测试自带的
   `tests/entry.mjs` 从 `apps/cli/packages/contracts/dist/index.js` 载入同一份契约产物）。

## 四、相似度门槛的交接（重写阶段用）

替换阶段按 Lead 的 `GATE-PLAYBOOK.md` 执行：不要沿用旧文件边界、不要保留同一语句序列，注释/日志/
错误文案全部重写，必要重合（协议字段名、外部可见字符串、`KNORVIA_*` 键名、数据目录
`.knorvia-studio`）写进本文件的第五节目录并给理由与测试。门槛不因此放宽。

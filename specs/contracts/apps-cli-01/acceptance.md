# apps-cli-01 合同验收（acceptance.md）

合同版本 **v1**（2026-10-19）。本文件按计划书「每包流程 · 二、合同」与「验收清单 · 合同审查」逐项给出证据。

## 一、范围与保留项（合同阶段不删文件）

- 包 ID：`apps-cli-01`（M2），目标为 `apps/cli` 开发脚本与 `apps/cli/tools/prompt-trajectory`。
- 合同范围 **3 个脚本**（全部继承文件）：`clean-dist.mjs`（`upstream-unchanged`）、
  `count-ts-lines.mjs`（`upstream-modified`）、`generate-bash-command-registry.mjs`（`upstream-modified`）。
- `apps/cli/tools/prompt-trajectory` 的 **14 个文件**已在 M0-5（`f47d5717`，早于本合同）随基线删除。
  本分支 `66bf2194` 曾清掉 `apps/cli/package.json` 中两个失效入口、`06ed43f4` 曾删除
  `apps/cli/scripts/shadow-replay.mjs`（266 行，`knip` 无引用、仓库无运行期调用），二者现分别由正向提交
  `0d656a91`、`5cba59a1` 还原保留。**合同阶段不删文件**，是否清理 `shadow-replay.mjs` 与这两个 `--filter`
  已失效的入口，留待替换 PR 评估。
- 不在范围：`apps/cli/tools/typescript`（无关工具包）、`packages/core` 中的生成物（属
  `core-tool-handlers-01`）、其他 `apps/cli/packages/**`。
- 清单与依据：`README.md` §一/§二；保留与还原依据：`callers.md` §四、`known-differences.md` §四。

## 二、合同产物

| 文件                   | 内容                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `README.md`            | 范围、保留项（合同不删文件）、入口语义、B1–B19 → 测试对照表（无空行）、旧门命令与结果、风险 |
| `behavior.md`          | B1–B19，每条含输入/输出/错误语义/时序与并发/幂等/资源释放/平台差异/状态所有者/日志级别/断言 |
| `interface.md`         | 3 个模块路径、6 个导出签名、CLI 参数、摘要 JSON、生成文件模板                               |
| `callers.md`           | 12 个 `clean` 调用方、1 个 `lint:count`、2 个 registry 入口、`check` 链与生成物消费方       |
| `tests/`               | 3 个 `node:test` 文件（17 用例）+ `entry.mjs`（源码/进程双入口与夹具）                      |
| `fixtures/`            | 计数目录树、报告黄金文件、生成器摘要（全部合成数据）                                        |
| `stubs/`               | 3 个最小桩 + `targets.txt`；桩只保留导出名并抛出 `not implemented: apps-cli-01`             |
| `known-differences.md` | 必须保留的行为、Windows 哈希修复、未覆盖分支、环境事实                                      |
| `acceptance.md`        | 本文件                                                                                      |
| `gate-old.json`        | 旧门结果（源码入口 + 进程入口 + 桩替换）                                                    |

## 三、旧门结果

命令（仓库根目录，Node v24.14.0）：

```text
node scripts/contract-gate.mjs \
  --contract specs/contracts/apps-cli-01 \
  --tests "*.test.mjs" \
  --env KNORVIA_CLI01_ENTRY=source \
  --dist-env KNORVIA_CLI01_ENTRY=process \
  --stub-root specs/contracts/apps-cli-01/stubs \
  --stub-targets specs/contracts/apps-cli-01/stubs/targets.txt \
  --json specs/contracts/apps-cli-01/gate-old.json
```

| 项                    | 结果                                         |
| --------------------- | -------------------------------------------- |
| 用例数                | **17**（3 个测试文件）                       |
| 源码入口              | **17 / 17 通过**，0 失败，**0 跳过**，0 todo |
| 进程入口（`dist` 槽） | **17 / 17 通过**，0 失败，**0 跳过**，0 todo |
| 预登记失败            | **0**（没有放宽或登记测试例外）              |
| 断言放宽              | **无**                                       |
| 桩替换（3 个目标）    | **0 通过 / 17 失败**（`allFail: true`）      |

逐用例结果与输出尾部见 `gate-old.json`。

测试入口：

- 源码入口在测试进程内 `import` 脚本；进程入口用 `node <script>` 执行，等价于 `package.json`
  脚本与 CI 的调用方式。两者跑同一组断言，只有加载方式不同。
- `node scripts/test-studio.mjs --list` 已确认 3 个合同测试文件被 `test:studio` 收录
  （M0-10；本次输出为 1025 个离线测试文件、19 个合同目录）。

## 四、逐项检查

- [x] 范围、相邻文件、可变接口写清；`callers.md` 覆盖 12 个 `clean` 调用方、`lint:count`、
      `registry:check`/`registry:generate` 及 `check` 链，并记录 `dep:refs` 对 `.mjs` 的限制。
- [x] `behavior.md` 每条都有测试，对照表没有空行（B7/B8、B11/B12 各共用一个用例）。
- [x] 测试只走公开入口：`import` 脚本路径或执行脚本文件；不读实现内部。
- [x] 时序类没有 `sleep` 或固定超时凑结果；所有等待都是子进程退出。
- [x] 无存储/配置往返面；生成器有幂等往返（B17）、默认路径往返（B19）。
- [x] 旧门两入口全过；预登记失败为空；断言未放宽。
- [x] 桩只含 `interface.md` 的模块路径与导出名，函数体/顶层抛 `not implemented: apps-cli-01`。
- [x] 夹具只含合成占位内容（`a.ts`、`x\r\ny` 等），不含真实用户数据、凭据或内部地址。

## 五、首次失败与修正记录（如实记录，不是放宽断言）

起草与首次运行时有 4 处修正，都是**改测试/改合同以匹配旧实现的真实行为**，或修测试基建：

1. **B19 原预期写反**：初稿假设“无参数时默认输出相对 cwd”，实测旧实现固定相对**脚本目录**。
   改为断言 cwd 干扰文件保持原样、仓库文件字节不变，并同步改合同（`README.md`、`behavior.md`）。
2. **进程入口的异步导出**：`tests/entry.mjs` 的 `runJsonCall` 初次漏了 `await`，
   `collectTypeScriptFiles`/`measureTypeScriptFiles` 返回的 Promise 被序列化成 `{}`，导致 B7/B8、B9
   误报。修测试 helper 后通过；实现未改。
3. **编号空档**：初稿从 B5 开始（B4 在起草期被合并），合同发布前统一顺延为 B4–B19，没有删除或
   放宽任何用例。
4. **补充断言**：加入“`--output` 相对 cwd 解析”和“`formatReport([])` 的空输入输出”两处断言；
   旧实现直接通过，没有为通过修改实现。

## 六、未覆盖 / 留给替换阶段

1. `clean-dist` 的删除失败分支、生成器的版本不符/超限/导入失败分支没有黑盒测试；行为要求见
   `known-differences.md` §三。
2. Windows 上的生成器重建与哈希修复未实机执行；POSIX 已由 B15/B16/B18 锁定。
3. 替换实现必须保持 `interface.md` 的 6 个导出与 CLI 契约；生成文件必须在 POSIX 上逐字节不变。
4. 新实现每个文件第一行加 SPDX；相似度按两道门槛对旧文件与上游固定提交跑，不得超过。
5. `apps/cli/pnpm-lock.yaml` 的过期 importer 不在本包修复；来源登记在替换阶段收尾最后一步完成。
6. `shadow-replay.mjs` 与 `apps/cli/package.json` 中两个 `--filter` 已指向不存在包的
   `prompt-trajectory:model-io`、`prompt-trajectory:prompt` 入口，合同阶段保留；是否在替换 PR 删除，由
   替换阶段按计划书/规格评估并在替换 PR 里写明依据（见 §一）。

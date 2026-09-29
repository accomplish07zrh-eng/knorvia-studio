<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP stdio 进程边界来源依据

本批逐文件范围是三份候选生产源、七份冻结 fixture/suite，以及规格、验收和本依据。根与合同准备者完整接触旧三源；独立源码作者和测试作者仅接收批准行为、有限声明与依赖政策，分别先设计后产出，未互读候选/测试。当前整合复核读取冻结输入、测试、候选和验收回执，但不修改它们，也没有重新实现生产逻辑。

程序性分工、MIT头、标准 ABI 名称、通用算法和测试通过都不能单独证明原创或法律结论。源码作者披露其保留此前 MCP/进程边界上下文；测试作者披露此前相关审阅摘要；目录隔离不是 OS sandbox 或全过程 clean-room。SDK、Koffi、kernel32 ABI 与其他依赖继续保留各自权利。

## 关键冻结证据

| 证据                                       | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| 批准行为 behavior.md                       | `00b912d5624bd66f8e42234c9c4324aced4b8fc837a567fea311a9c47165be87` |
| 依赖政策 dependency-policy.md              | `475431f1557dd3a914db7dd655e869cfd98b3e5412022c04f7e08582c100cf48` |
| 测试 design.md                             | `ba1a1ec29f4804558a368641cba846cd7b237d87ebc89f560a3dd5edffba0903` |
| 测试 report.md                             | `8fd0e15396cdada1672a8c455b4811aa835e410dc9c3dec629c5d740ac5d4ac3` |
| 测试 test-freeze.json                      | `1cb9bb0c72f505ce3ddb7e29db2cd12cee3b1c4651adeef8b6653b93c4cbeeab` |
| 候选 design.md                             | `a6303b4bf9987e1d49b62fdd1403932dad5c5a47ede0942f9d7e255d2cb56cbd` |
| 候选 implementation-report.md              | `a00db5865777b605b962478dffa88c3baafe9fdda0c922b3c31c2eb9c10c4aae` |
| 候选 frozen-source-hashes.json             | `2afda2be5d6ca49179a48047cf87ad24288650f5f242c088203d1b49c5b98e05` |
| old-first TAP                              | `c1de3cd66faa90e9d548d3e327b5321d1d64dc7b8b20c07da342f49a800e94c5` |
| candidate TAP                              | `0f62e4c78d116547efdf2c7417273c14f6c601aa9f2286ea7753d9eb41187f3f` |
| 前批 Linux job 109357508893 raw-log JSON   | `ac5e3e9b6a9820da7cddcc8ff01ff3e0890b8a2101303353a8436a5f62d15346` |
| 前批 Windows job 109357509230 raw-log JSON | `248c559a2f3dcac3968643a3d59529feb755edec1e7199bc850d0127a31ada9b` |

三候选源的逐文件摘要为：

| 路径                                                     | bytes | SHA-256                                                            |
| -------------------------------------------------------- | ----: | ------------------------------------------------------------------ |
| apps/cli/packages/adapters/src/mcp/stdio-transport.ts    |  4578 | `18ab12ca560aea99315715cebbc6471a43d7dd0a06b87afcb1c5b0ea852edf91` |
| apps/cli/packages/adapters/src/mcp/process-tree.ts       |  5676 | `3c228a891be1eceab9f72ff0b9b89fd31f087a81de376b0648e96d3834a6a087` |
| apps/cli/packages/adapters/src/mcp/windows-job-object.ts |  5479 | `b0fb1db068b5a36ae1ae1e7d9e5c0ff2cc1bebc363e9ff951781745e89ce1ce9` |

冻结七测试源摘要为：

| 文件                                   | SHA-256                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| mcp-process-boundary.fixture.ts        | `32b55762245c82af864b1efc8074576297694d7763fc1542238df692d2444fa6` |
| mcp-process-boundary-system.fixture.ts | `78dbc2cb0ccb9739875077a618343621a033a78f7479c20cf584a0fda99fde25` |
| mcp-process-boundary-meta.test.ts      | `087f515833cd54157a27846aabe0a656fc3a1f75f2af3ab8690a638798c5866f` |
| mcp-process-boundary-transport.test.ts | `f2c0a054284b88f190eecb4d61a3f5c2d1080b1ba5c1e7656ad1991570536c56` |
| mcp-process-boundary-tree.test.ts      | `8311053e07febbe808b2ffa984198404fb9a47767021cc6e6d9ac2e091f0149e` |
| mcp-process-boundary-job.test.ts       | `072c14f37995307d62e6f305e72818337b0527da08545e330b9fb148bdbf365c` |
| mcp-process-boundary-native.test.ts    | `b36f15700a8dede3930a78182b2cf7fe5bd09bc8fd55562df1e086a1ae5fa459` |

## 复核结论与限制

105个已声明输入/冻结/回执项目重新计算后0不匹配；两验收副本的非映射内容与冻结测试一致，映射 fixture 只改变批准的 URL。整合前主仓三目标与 old-first 三 hash 一致，因此旧36首次通过直接绑定整合前基线；整合后三源与candidate receipt及候选三 hash一致。

前批 official-auth original 提交的远端 run `36553647376` 精确受检 SHA 为 `020a0b3b286413425b34d2890f85e9923e56d430`。Linux/Windows 原始日志分别记录3576项中的3569通过+7平台跳过和3576全过，均0失败/取消。该证据只说明前一提交的跨平台质量门；当前三候选尚未在这次 run 中出现。

候选采用不同的职责组织和具体表达，同时保持批准合同的receiver、capture/live read、错误阶段和已知限制。未发现逐行搬运证据或候选自报但未披露的验证缺口。作者报告已经明确排除实际 SDK runtime、真实 OS/native、整合和许可结论；acceptance 只补上 owned-seam 行为等价，未扩大声明。

主仓三源仍与冻结候选逐字节一致；七测试增加标准MIT头与可移植URL绑定，meta suite另有擦除后JavaScript完全相同的unknown类型修正。首次strict类型2条诊断与修正均保留；运行断言和超时未变。主仓source36、确切CLI可达编译产物36、完整3612及根/CLI类型、lint、架构和构建均通过，详见验收。最终逐文件摘要绑定reviews.json，冻结输入与机械变换另有收据，不把测试字节变化称为断言重写。

## 主仓整合证据

| 证据                                                         | SHA-256                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| knorvia-process-boundary-integration.json                    | dbd8a90a16ec322828ad96edb2e426c4cb08bc96b5b41cb7ff15508c1e58a375 |
| knorvia-process-boundary-type-correction.json                | 55dd15f0085129098f0df6ed810d63051e8002099bf24a5ada891d239c4c33f3 |
| knorvia-process-boundary-type-erasure.json                   | 80f98c0c4a56f1b0c1620f243fa8e1802d814dfffcdad79747779e5dc377d2d3 |
| knorvia-process-boundary-first-strict-types.log              | 0719cc625bb3db34030288cf557ba12f3145e54678f003026907986cb6436aad |
| knorvia-process-boundary-runtime-main-source/receipt.json    | 7c4a6f96d4d0f3519d1744908967eabf675cbec24c00cf5ae43a36c6fa1118f4 |
| knorvia-process-boundary-runtime-main-compiled/receipt.json  | 8d77caeb4aa63d9b4b9f9defa3754e568a974e865432718c1883a7bcdfeac50a |
| knorvia-process-boundary-runtime-main-compiled/artifact.json | aaeda3993e933b2ed4aaf0988fcb6ceb39188795d8359252bbcfc530d7522f9d |
| knorvia-process-boundary-full-first.log                      | 14a17efee750c48e38d507a4d79d87672ef9bc55dafd10bf85ac7164b3959bae |

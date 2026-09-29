<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP stdio 进程边界验收

2026-09-29。三份独立候选已接入主仓。冻结旧版、候选、主仓源码和实际CLI可达编译产物均通过相同36项行为验收；完整离线回归3612项通过。真实OS/native ABI未由本批替身测试证明，逐文件来源判断仍不等于整仓许可迁移完成。

## 冻结运行与身份

整合前的主仓三目标与 old-first baseline 逐字节一致；整合后三目标与 candidate 逐字节一致：

| 文件                  | 整合前/old SHA-256                                                 | candidate SHA-256                                                  |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| stdio-transport.ts    | `0d76c1a59df04849cba48673f646b1c46a514f89c95365bcb101018ea6a78e04` | `18ab12ca560aea99315715cebbc6471a43d7dd0a06b87afcb1c5b0ea852edf91` |
| process-tree.ts       | `a4a5b0df0cc235656e1d089a906acc6f75a6cd24df87c012c0500748a3b23807` | `3c228a891be1eceab9f72ff0b9b89fd31f087a81de376b0648e96d3834a6a087` |
| windows-job-object.ts | `1ed1993c06d4cc31af7fd892a9e809d2ffa8c35cf2428805242258f5393e784d` | `b0fb1db068b5a36ae1ae1e7d9e5c0ff2cc1bebc363e9ff951781745e89ce1ce9` |

冻结 old baseline 首次运行36/36、exit 0；随后 candidate 首次运行相同36项也是36/36、exit 0。TAP SHA-256 分别为 `c1de3cd66faa90e9d548d3e327b5321d1d64dc7b8b20c07da342f49a800e94c5` 与 `0f62e4c78d116547efdf2c7417273c14f6c601aa9f2286ea7753d9eb41187f3f`。本轮没有无理由重跑它们。

前一 official-auth original 提交 `020a0b3b286413425b34d2890f85e9923e56d430` 的 GitHub Actions run `36553647376` 已有真实远端日志：Linux job `109357508893` 为3576 total、3569 pass、7 platform skip、0 fail/cancel，242865.500891ms；Windows job `109357509230` 为3576 pass、0 fail/skip/cancel，379741.1117ms。两份 raw-log JSON SHA-256 分别为 `ac5e3e9b6a9820da7cddcc8ff01ff3e0890b8a2101303353a8436a5f62d15346` 与 `248c559a2f3dcac3968643a3d59529feb755edec1e7199bc850d0127a31ada9b`。这是前一提交的远端证据，不是当前 process-boundary 批次 CI，也不替代整合后的新验证。

独立复核重新核对了9个批准输入、45个测试冻结清单项目、41个候选冻结清单项目、两套 source/mapping/TAP receipts，共105项，hash/bytes 0不匹配。两份验收副本各14个非映射文件与冻结源逐字一致；fixture 与冻结版的差异精确等于四个预定 URL 替换。`test-freeze.json` SHA-256 为 `1cb9bb0c72f505ce3ddb7e29db2cd12cee3b1c4651adeef8b6653b93c4cbeeab`。

## 合同与测试复核

- 两 fixture 不读取候选私有字段。它们使用公开导出、公开 getter/method、受控 SDK `_process`/dispose 接入 seam、child event、回调与外部副作用 trace。own `_dispose` descriptor 是合同明确要求的 SDK 边界，不是新实现私有结构探针。
- 所有 product process/platform/kill/execFile/clock/sleep/timer、child、SDK、Job API 与 Koffi/native 行为都由 owned seam 提供。真实文件读取仅用于显式目标与 esbuild；未知 CommonJS dependency fail closed。3秒真实 timer 只约束测试门闩。
- 编译后的唯一运行时字面量 `import("koffi")` 位于 Windows Job 模块；同文件的 `typeof import("koffi")` 是类型查询并被擦除。fixture 只替换这一精确 literal dependency call，拒绝所有剩余 dynamic import；没有 native `require("koffi")` 路由。
- 36项覆盖 send/meta shallow semantics、provider/SDK errors、first exit、platform guards、late attach/reattach races、ordinary close、concurrent dispose、Windows taskkill、POSIX DFS与升级窗口、EPERM、controller ownership、native load cache、ABI字段/绑定顺序和有限资源补偿。
- 代码逐条对照批准合同，没有发现行为差异。未单列穷举的 accessor/Proxy、并行 start排列和声明外 Promise 返回，不构成当前缺陷；候选保持合同规定的receiver、live/captured read和error phase。

## 保留的首次失败

不能把静态过程描述为“全部首次通过”：

- 测试首轮 strict/noUncheckedIndexedAccess 类型检查 exit 1，共3项诊断；首轮94规则 lint exit 1，共5个 unsafe optional-chain warning；首轮 format exit 1，共8个自有文件。修正只收紧测试类型/存在性断言并格式化，没有改行为断言。最终三项 exit 0。
- 候选三源的首轮正式 TypeScript、94规则 lint 和 formatter 均 exit 0，且最终源码变化只有格式化。另行的直接 `node --check` parse-only 实验中，stdio/tree exit 0，Windows Job 在 TypeScript type alias 处 exit 1；随后 stdin `--input-type=module-typescript --check` 三源均因模块/类型语法处理失败。最终先 `stripTypeScriptTypes` 再 `node --check` 三源 exit 0。原失败日志均保留，不能改写成 direct parse 首次全过。

## 主仓整合与验证

三源保持候选字节不变。七测试先只加标准MIT头及可移植URL绑定，精确hash与独立整合计划吻合。首次主仓strict类型出现2条TS2339：真实SDK的private \_process与OwnedSdk的public字段使instanceof断言后类型交集变成never。只在断言左操作数加unknown类型转换；冻结与整合测试擦除类型后生成的JavaScript完全相同（SHA-256 1c776f6d2723c3867a05a04301d03c4962aa443c3e577ea6500d113696c567e8），保留原失败日志与类型修正收据。没有改断言、超时、依赖路由或候选源码。

| 对象          | 结果                   |    耗时ms |
| ------------- | ---------------------- | --------: |
| main-source   | 36/36，0失败/跳过/取消 | 2897.8681 |
| main-compiled | 36/36，0失败/跳过/取消 | 2924.3533 |

修正后的strict/noUncheckedIndexedAccess类型检查、10文件94规则lint（0警告/错误）、11目标格式检查通过。根typecheck含desktop main和5422组中英文键；根lint2784文件、CLI lint97文件均0警告/错误；CLI typecheck、architecture changed（0违例）通过。CLI构建17/17成功、12缓存，26.807秒。主仓old-first与仓外candidate已通过的36项没有重复运行。

三份确切编译产物与CLI bundle sourcemap逐字节一致，并由同36项断言直接验收：

| 产物                  | 字节 | SHA-256                                                          |
| --------------------- | ---: | ---------------------------------------------------------------- |
| stdio-transport.js    | 3631 | c70b7e851362bfc7d29fe56d9f5642895b81b3a75ab1a38c91661e659d4f4734 |
| process-tree.js       | 5164 | 81340b3a09e666a097213b334a633549501ebd8f6200ffe075bbd83aca70125e |
| windows-job-object.js | 5869 | 22a8ac56a130b8931ae0b195d3a6f30326ce008ecaef1e2c2df902738080a112 |

完整离线 **3612/3612**，0失败/跳过/取消，495373.064ms。Node24.14.0、pnpm10.33.2、本地Cua归档；回归期间主仓源码和测试保持不变。对小范围类型或文档修正不重复整仓测试；这一轮全量用于三生产边界的完整切换。

三源共501物理行（136/185/180），各有效行117/164/170；15733字节，原三源655行20269字节。CLI尚不属于受控架构模块，因此根另行检查公共导出、单一owner、依赖方向和SDK接入点。

这些结果不代表真实child/process group/taskkill、真实Koffi/kernel32 ABI、当前批次远端CI或安装程序已经验收。适用第三方声明和根Apache/preview保持；全量独立替换及稳定发行仍在进行。

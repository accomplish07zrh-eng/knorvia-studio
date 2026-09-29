<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 插件来源与持久状态独立实现依据

根代理从公开接口及先行批准的行为合同设计、编写 33 个模块；八个公共门面替换旧模块，其余 25 个模块分担事务所有权、来源租约、校验、目录及记录更新。旧函数体、旧 bundle、私有测试没有作为作者输入。首稿在独立验收前冻结；后续只按有限事实包修改默认官方分区序列化和下载错误 URL 语义。主仓源逐字节匹配最终 v3。

测试由另一作者从合同独立编写，另由验收者建立冻结旧版基线再运行候选。测试夹具的问题不冒充产品缺陷，所有初次失败和解释保留。根在候选验收通过后审阅可移植加载器、入口与来源记录；没有按私有测试倒写首稿。全线程包含大量相邻系统上下文，根还曾为模型合同读过两个旧模型错误处理模块，因此这里是有限角色分离，不声称全线程 clean-room，也不把测试通过当成版权结论。

## 冻结与检查

| 证据                        | SHA-256                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| 初始合同输入 manifest       | `571e4352660961f493a402436ca1caa9b1f6d1b895b7bcedcba08b4d32a27476` |
| v3 源码 manifest            | `6711db1d9804dd8358e544df43ffb78f1d10dbcb77241dc708603db8e00cf8a8` |
| 33 源码 aggregate           | `0903a8c657b00e70917a6044974bb8288146bb5c997dcf95b33273cbc4734a77` |
| 最终独立 suite-v5 manifest  | `df2c4203c36f19d2da064bca315e20345987f39f2b568f9b403756b276290e27` |
| 最终 old005 收据            | `2d5b31d00cc1f1a1ab0f97b5d010f99bc24af5ceea58ac6247d01c06025342b9` |
| candidate002 收据           | `7964b3fc061e3d35468a16cd8d30b2cca739ad8a5608e7a705dee0fd13def0d7` |
| 可移植测试原始复制清单      | `b3f0cde92cce6651366e03ff7621d9a68342c5b332974709163d2c34b89a0c4f` |
| 可移植 source/dist 验收收据 | `2c9ba49fadc323529362591c6f7032a76e14d437b28b682ea3cea686455b9d9a` |
| 案例语义比较                | `241a2254da63db8169a51aa847fbd80440fc7218c212deb97c727aadb7e3c016` |
| 公共声明来源复核            | `fe70ab39a1684c9257440082d5aeca0fcb8d7441029bbb7da1e4145536a2d3d0` |

源码 aggregate 为排序后的 basename、NUL、精确 SHA-256、NUL、十进制字节数、LF 串接后取摘要。最终源码 134188 字节。严格公开 API 双向类型/导出名、闭合类型程序、94 规则 lint 和格式均通过；首次格式和工具失败仍保留。

旧门最终是 225 通过、24 项先登记缺陷；候选、主仓源码、确切编译产物均为 249/249。先行批准的卸载安全边界及事务修复不要求模仿旧缺陷。详见[验收记录](../../docs/knorvia-plugin-storage-runtime-acceptance.md)和[规格](../../specs/knorvia-plugin-storage-runtime.md)。

## 复制声明单独归属

仓内测试 `apps/cli/packages/adapters/test/plugin-storage-contract/fixtures/public-declarations/` 中以下 10 文件来自合同准备时提交 `ea6d871207d75be3bd5e1de5830eaf5dd8be2a9e` 的 `apps/cli/packages/adapters/dist/plugins/` 生成声明。它们用于核对既有公开签名，保持 Apache-2.0 来源，不归为新原创。以下是复制前的原始摘要；当前排版与说明头的摘要由逐文件清单另外记录。

| 文件                       | 原始 SHA-256                                                       |
| -------------------------- | ------------------------------------------------------------------ |
| atomic-directory.d.ts      | `c89e4b5e1e3407417947d34c85e6dddb44517773182d2275594a43688339156b` |
| github-archive-source.d.ts | `96f26735df947399102f68e0ff09f5b0c9f54613f3dedc11f2ffccabe5841b26` |
| helpers.d.ts               | `08138361bc0539125661684076f35c828e398c5f79aed16446161e9d703d4e6b` |
| marketplace.d.ts           | `669cb7eb04902fcbf1681eab2ab10219217c755c2a6999a154cf9f7245d678da` |
| official-marketplace.d.ts  | `e359952de45d219b8f171e9460b99fc1c7dc2d6fa5a50d7ee2be430b7965eb3d` |
| plugin-components.d.ts     | `b1ccf6c2f60d8763a9d86765207fd7876ef4450c04b1c460851d4a7f2ff90b78` |
| source-errors.d.ts         | `8ccd43806e72f0646ec685e2f85fec76d094b890b77d506b059cf600612e5e2b` |
| types.d.ts                 | `d397aae375da29bfc0d295f080ad7474b1e06d2ee7f01704340862afbc1ba969` |
| version-compare.d.ts       | `9897e9bd1a30ae44d83939951379bf4bb6f95048b64c2916b99f37b39959ee5b` |
| zip-source.d.ts            | `22cbbfcbad0fcdd846b74e153a61e6588c3edb52b69b42950d8ce483bd3b440a` |

原可移植草稿对这些文件机械加了 MIT/Knorvia 原创头，根在复制前复核并纠正；没有以兼容声明的存在证明实现原创。来源账中的 `mcp.d.ts` 未复制，原清单的 11 项计数不能冒充实际复制数。独立测试作者另外编写的 `fixtures/declaration-stubs/contracts.d.ts` 是测试支撑，其初始摘要为 `60917c51a83bb55c6ac197e384db60366c412505c1ddafb1eb7d85c38b1f2ba5`，没有复制产品声明；本项目新测试表达按用户授权采用 MIT。专项 lint 配置来自现有项目规则，其性质单独记录，不当成核心实现重写。

## 许可范围

本批独立编写的 33 源码、测试表达、规格和记录按文件采用 MIT。复制声明、功能配置及第三方依赖单列，semver、yauzl、共享协议和未替换模块不因调用这些代码而成为 Knorvia 原创。根许可证及旧发行记录保持。当前摘要和每个文件的复核决定见 `licensing/reviews.json`、`licensing/current-files.json`；列表通过只证明记录与文件匹配，不证明全量迁移完成。

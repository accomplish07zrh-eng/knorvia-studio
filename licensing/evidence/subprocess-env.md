<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 子进程网络环境投影来源依据

只支持本批一源、三测试支撑及三新文档的逐文件审阅，不宣称整仓MIT、全流程clean-room或法律保证。根完整读旧源、声明及execution/MCP/Git调用边界，作者保留自身上下文；源码访问限制不能被描述成全流程隔离。

先行设计审阅指出overlay大小写、POSIX继承访问和精确公共键声明需澄清。根以12项纯观察定稿合同，作者仅读behavior、public-api、shared声明及摘要清单，先写design再写候选。目标对象是唯一可变所有者，公开函数直接排序metadata移除、保留reader覆盖、proxy、no-proxy与CA，小助手区分平台读/删/写和源字符串非空判断；不提前快照源，不新增缓存/框架/回滚或sanitizer。公共reader继续拥有JSON验证，相关实现和权利不归本批原创。

候选122行/3437字节，最初未格式化114行稿按字节保留。Node24语法、strict/noUncheckedIndexedAccess类型、普通格式和94规则lint首轮全通过，无源修正或隐藏失败。编译器实际194程序输入：1候选、1批准shared声明、192标准/第三方声明，其他产品正文0。该清单不是全部工具IO追踪；自动声明读入不是人工全文阅读。作者未读旧正文、历史、测试、探针或构建实现，未执行候选、环境/CA/网络/模型或产品build。根完整复读最终源和报告后才运行新旧验收，未按测试结果修订候选。

| 证据                      | SHA-256                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| behavior.md               | 08a6383da36dfb584508d57d6d0299531b5bbfd88f2b918042956d2beb277066 |
| public-api.d.ts           | 89dd063538329b4bb719e8f0e88b1c50033a09fe2a52d7fe50577d2d28389649 |
| shared.d.ts               | 6bd9b6b1d0d12d99630302c833ef7ccdd3c11ddce6f30135eb8f595c6ccfa4e0 |
| 设计审阅                  | 5e41dfc797dccb2aaff349e1a7c1157740dac0ed485c2bb8c7266add5c7a5107 |
| 作者design.md             | 37ba360f51893b75d105d53c4f325b4dedf854f7c2299886e2847258d3facbda |
| implementation-report.md  | c2ad34c8ca5ebb890069a9c430c7a58aee85c833d1e08e063c192adccee2bb41 |
| compiler-inputs.json      | 49742d793b9c7a734fed19b412697378bce1e72863921130a66a8a6d9ca077c3 |
| frozen-source-hashes.json | 41304670c0238fa408e16d25b7392f125f5d9776b0229f2f8f93feeaf311b390 |
| 旧source.ts               | e32de5be5ff402d4022fa720f857766ec246ed7082a821adb7a203322cd0c532 |
| 旧module.mjs              | d70d691286e8fd40fca441d55cf7e183f29d0a566736e7c804e45703f1524889 |
| 新subprocess-env.ts       | 6b84c86f122a079249466dd14abb38cabae6364203b6b815466e026c0f26758a |

subprocess-env-inputs/rebuild/tests/baseline/candidate等外部证据位于任务缓存根，未随源码提交。旧基线仅冻结环境投影正文，保留shared reader和常量为实际依赖，未冻结全部历史。批准合同保持原字节，仓内规格另含所有权图并经过formatter。

根新写71项有限纯行为测试并核对主仓旧/新和真实编译入口；测试不等于实际子进程或完整跨平台运行保证。固定键、公开声明、普通ECMAScript操作、MIT头和测试成功不能单独证明权属。具体质量与全量结果见[验收](../../docs/knorvia-subprocess-env-acceptance.md)。只将摘要审阅确认的一源及新测试/文档列为本批MIT，根Apache-2.0及依赖保留权利继续有效。

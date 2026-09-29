<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 代理规则与同步CA配置来源依据

本记录只支持本批一源及新测试/文档的逐文件判断，不宣称整仓MIT、全流程clean-room或法律保证。根Apache-2.0、保留共享环境读取及其他公共/第三方边界权利仍有效。

## 批准输入与独立组织

根完整读旧配置及HTTP、fetch调用边界，完成纯输入观察，再写草案。作者只读草案作设计审阅，提出无状态选择与共享token matcher、空端口、bracket结构和URL默认端口歧义。根根据额外26项纯观察定稿，保留空端口/配对域名括号/裸端口文本比较，批准修复非空端口丢失和坏括号截断。

作者全文读取三份批准产品输入及摘要清单，先写设计再写候选。没有读取旧正文、测试、探针、历史、构建实现或真实配置。原作者上下文及自己的设计审阅仍保留，根已读旧代码的事实不被隐藏；不能据此声称全流程隔离。共享声明只覆盖本合同使用的五个公共符号，根随后以仓内实际声明严格类型检查。

| 批准输入        | SHA-256                                                          |
| --------------- | ---------------------------------------------------------------- |
| behavior.md     | bac220a9c32f0c16b800c00f11fd6ed8b8818deb4fe9b9c3792d6506d261a7e8 |
| public-api.d.ts | 4317c3bb20ff009c19f902afe5856a7925a559bc0a825f6b2354b9a7a713e18c |
| shared.d.ts     | 6bd9b6b1d0d12d99630302c833ef7ccdd3c11ddce6f30135eb8f595c6ccfa4e0 |

独立表达为一个无状态模块，按分支直接构造精确结果，统一显式/捕获匹配，端口先于wildcard，CA仅在loader做同步IO。URL默认端口恢复采用不同默认端口的special scheme并交native URL处理authority/control/slash，不复制解析器。公共函数名、类型、常量、字符串、短同步IO和URL表达属于兼容或标准约束，不能单凭相似/不同、MIT头、行数或测试通过判权属。

## 静态过程与范围

候选首轮正常格式、Node24语法和strict/noUncheckedIndexedAccess类型通过；94规则lint有3项多余转义警告而退出1。作者先按字节归档首稿，再仅移除多余转义，未关闭规则；最终四项检查0。没有按根运行测试反馈改动候选。源正常格式205行，旧266行，净减61行，没有为了行数拆分或压缩。

编译器实际程序194文件：1候选、1批准shared声明及192标准/Node/第三方声明，其他产品正文0。两个允许公共包路径精确映射批准声明，skipLibCheck=true；自动声明读入不是作者人工全文阅读，也不是全部工具IO的系统级追踪。根完整复读候选及报告，取得冻结源码后才作运行验收。

| 外部冻结依据                 | SHA-256                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| 批准摘要清单                 | 2c25b007ad6a9f4d8646c7b049556afbac228e5bceb161371dd5526fdf0a7226 |
| 作者design.md                | 70ba0b085c972aef08712b0af6b0713c417fca13ac8d69869adbff2a5d0f408f |
| 作者implementation-report.md | f322a96c47af3ac0e3a9d785e56172be3fa154ccb52473dd88d028ff21c25c91 |
| compiler-inputs.json         | 6f71a6c9fff4bbd2158e29ad40c51b95561dfcb2db9e099f83b5cf81c287ed6d |
| frozen-source-hashes.json    | 02cfe3d36d2d481a19ddc00b669c6887a9ee766fd631286725881091e5a426f8 |
| 旧source.ts                  | c230386f1c2ebb721b60f94211b483889319df5ad2e592deaed06fed9443ad52 |
| 旧module.mjs                 | 0a6c3974b21c083a5148a85315a20beaa17c354652d5011fa6b34c19367075ab |
| 新http-config.ts             | c650cf940d2aec2fe1916acad709780b4cac10adc6625251be5c77cf44fe5be0 |

外部目录network-config-inputs、network-config-rebuild、network-config-baseline-df01bb2、network-config-tests均位于任务缓存根。旧基线仅冻结配置正文，shared公共实现仍实际依赖，不是整条依赖链冻结。主仓规格后来经过formatter，批准behavior.md保持原字节。仓外证据未随源码提交。

根新写四份测试文件，覆盖112项有限匹配/选择/自有文件行为；旧20项真实失败与两项首轮环境夹具问题分开记录。后续仓内构建入口、驱动下载、陈旧产物等准备错误和真正的新源码/编译验收见[记录](../../docs/knorvia-network-config-acceptance.md)，不将失败隐藏为成功。只把已经逐文件审阅的一源、四测试支撑和三新文档纳入本批MIT；共享reader/常量、Node及其他第三方库不计为本批原创。全量替换及稳定发布仍继续。

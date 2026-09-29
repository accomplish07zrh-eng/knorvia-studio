<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# Fetch代理传输的独立实现依据

本记录只支持本批两源、六测试支撑及三份新文档的逐文件审阅，不宣称整仓MIT、全流程clean-room或法律保证。根已读旧入口、公共声明、模型/MCP调用边界及HTTP桥，作者保留自己的既有上下文；这些访问限制不能被描述成全流程隔离。

## 输入与组织

根先以自有回环及合成生命周期观察写纯行为合同，作者审阅后根补齐取消Error身份、准备优先级、活跃监听和被动晚事件规则。作者按批准behavior、public API和config声明先写design再写两个模块，不读旧源、测试、探针、历史或产品构建正文。已批准ProxyAgent声明复用早先阅读并重新核验摘要；第三方正文未复制。配置仍通过其公开函数处理，本批不把该依赖或第三方库重新判为原创。

工厂独占原选项及成功CA缓存，完整准备后调用私有流所有者。后者分开外层Promise待决和原生资源活动状态，保留返回Response后的取消，选定同一Error并按message→request释放；卸下活动回调后用模块级被动处理器处置晚事件。空body立即释放、异步转换失败纳入本次Promise。该结构来自明确的两种生命周期合同，不是将原单源按行拆开或替换变量名。兼容符号、常量、短标准表达、MIT头和测试通过均不能单独证明权属。

## 作者过程与有限修订

首候选72+223=295行。静态检查前作者自行发现非HTTP直接调用处于解析catch中可能重复调用同步抛错fetch，归档早稿后调整；这是编写期推理修正，不是已运行的产品失败。正常格式、Node24语法、strict/noUncheckedIndexedAccess类型及94规则lint首轮均通过。

根首次46项运行通过。后来四项旧测均通过、首候选失败两项：GET/HEAD没有保留CA读取前的异步规范化完成边界。根只交付delivery-addendum纯行为说明；作者先按字节归档25份首候选文件，再增加独立async准备并让所有method等待其完成，未改私有owner。修订一83+223=306行，四静态检查首轮通过；原报告/清单未覆写，修订证据另加前缀。根全文复读最终两源并按冻结摘要整合，未再按测试改变候选。

修订编译器程序239文件：2候选实现、1批准config声明及236标准/第三方声明；其他产品实现0。编译器输入清单不是操作系统全文件访问跟踪，自动读入声明不等于人工全文阅读。作者没有运行候选、测试、网络/CA/模型或主仓build；实际运行、编译与集成由根验收。根的严格类型测试夹具修正、旧失败和新结果见[验收](../../docs/knorvia-proxy-fetch-acceptance.md)。

## 冻结证据

| 内容                                | SHA-256                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| behavior.md                         | 2b302f2d84f6f1e504ee00e855e88cfe78fb1efee906f37bd720554e04dac7c7 |
| public-api.d.ts                     | cb6c50cc69de3d90c352d6483cdd60f9ee097da7c83bdd2c4544cca1ef85c7df |
| http-config.d.ts                    | 4317c3bb20ff009c19f902afe5856a7925a559bc0a825f6b2354b9a7a713e18c |
| delivery-addendum.md                | 8c7772873bea3c18df754eb8122a3934cac653217f6a1eb9c030fec27ed0e19e |
| ProxyAgent声明                      | 4097f438a41b67a056c0a826fbac2bcdb75c6b46726b6f80f354e70870f2b7d7 |
| design.md                           | e0d53a2cecf36ded2ea9c52c13f57ac342d4e603f42b4c11e4fec3e56291f3df |
| 首implementation-report.md          | 415948717eb277f5dd5c1af542498f6e8c38386edb3661d96a7b68e18dfa347f |
| revision1-report.md                 | f46b7d80f7936f8d82fe07e714b35b2a07225d1ca6a5629ce6185054036eeb16 |
| revision1-source-hashes.json        | 26fb256bd43f9cb7c99d0f52022bd108242b33aacf9f22a9911c2a3a3000bbbb |
| revision1-compiler-inputs.json      | fd4441f9a8bef8e496bdc3b4b066540924740240fc37b2eeafbd49a76fc4e692 |
| first-candidate-archive-hashes.json | f283880c7bdeca7352f84ce7d055676b2ce3f8dc075863c28208b092cb5656f4 |
| 旧source.ts                         | 914d6b18bea867f03dd284271b621ed933df824bbc731e7681b7a5bf45f538af |
| 旧module.mjs                        | e04376633d6232ee58be6edb8d4b7a118d651e39da62b0c6b1a8c93285141036 |
| 最终proxy-fetch.ts                  | 8f749b6feedc7da6747ea9a538f77171d31dbedcd77cb337635d4d95b450e9c2 |
| 最终proxy-fetch-exchange.ts         | 56b7ace6f6a1f0ddbaabaa34bca9070f95227af372031ff2d3c54ae693c9dd2f |

外部目录proxy-fetch-inputs、proxy-fetch-rebuild、proxy-fetch-tests及各baseline/candidate/runtime目录在任务缓存根，未随源码提交。旧基线只冻结fetch正文，其运行使用当时已验证的新config dist和原ProxyAgent，未冻结全部依赖历史。批准输入与首稿保持原字节，仓内规格另含流程图并经过formatter。测试及文档由根新写，行为补充只传给作者，未传测试或旧实现。新MIT仅限本批逐文件摘要审阅；全量替换和最终稳定发布仍在继续。

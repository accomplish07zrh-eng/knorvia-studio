<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 认证适配器独立实现依据

五份认证源码由实现作者依据先行公开接口、声明和行为合同独立编写；另一作者先冻结 30 个行为案例，验收者先建立旧版 source/dist 基线，再检查候选。首稿没有把旧函数体、旧 bundle 或私有测试作为实现输入。根按有限失败事实修复备用加密密钥的 OS platform 来源，形成单独冻结的 v2，主仓接入该版本的确切字节。

根在合同准备时接触了五个公开夹具，在最终验收后审阅永久测试基础设施与来源；全线程还包含大量相邻系统上下文。这是有限角色分离，不宣称全线程 clean-room，也不把行为等价当作版权结论。

## 固定证据

| 证据                                  | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| 平台端口作者合同 manifest             | `d314c3df399aad0d335b08d61cf8d278fbe937e50d262ce465a3fdd09cf2aa4a` |
| 认证补充合同 manifest                 | `d1d3182394d887cf74be36425ab65f0bb1d853b8710c3d6a412d683937ff4082` |
| 封存旧版输入包                        | `2140c2e7284d38465255c01ebceaf62ea60d84a7b11a51226fee89dea2a7715d` |
| 最终测试 v3 manifest                  | `84d10848b37b74342838a17d464ad7c068b76de4ffb6da76990eb8451f628ab7` |
| CASE-MAP                              | `7bd6d53c86ce06422f86edd93a77ab7a7cd22ac96fe490ae0af04e61a2d7cbad` |
| PUBLIC-FACTS                          | `415d4b153b467e5468804c2d97ded5b1411686d1e458aaef5ec6641bcf81b869` |
| 候选 v1 manifest                      | `1b2173efdb7f31f58272568ec2258985dd4ac0a04d99e2f865586e4c04a30e43` |
| 候选 v2 manifest                      | `696c0fb3527bacb7824f0acb2aa280c695722a8754b84b9307dbe87a060cc9e1` |
| 候选 v2 五源码 aggregate              | `d29e58d28c6cebd0ab9262b245dff64c6f75d8db3290bedb1072568a8b0631d9` |
| 旧版 source v3 验收 manifest          | `74c82f8c8e522423a05a8b33166eae12aa9236b18f995ac157eed64d44e6ff9b` |
| 旧版 dist 及候选 v1 验收 manifest     | `7b1dddcc0749b734c93f19d12d882d5f481868fdfe121445a22a0a96ea642893` |
| 候选 v2 两组最终验收 manifest         | `6431b1be71f46a5eef32537b5159b4d8d5f4d4280c6f63ad1999a334350182ae` |
| 候选 v2 source 原始 130 文件 manifest | `af89b3c88ef230a66dc7377f17f88c73f78e9f156521deddb13c71af12822550` |
| 候选 v2 dist 原始 130 文件 manifest   | `d3e1cf26d20eef5eb745c69fe546742fc1d3fac7b2b3b40a669769303b38dd97` |

旧版最终两组各 30/30。候选 v1 source 为 29/30、dist 未运行；v2 两组各 30/30。旧版夹具失败、候选首次失败、声明探针边界及永久接入漏拷贝公共事实的首败均见[验收记录](../../docs/knorvia-auth-adapter-runtime-acceptance.md)。没有失败豁免或新增重试来获得通过。

## 测试复制与保留声明

永久测试最初从冻结 v3 精确复制 33 份载荷，后补复制被遗漏的 `PUBLIC-FACTS.json`，源摘要见上表。13 个案例文件的正文和 CASE-MAP 不变，仅案例源码加上准确许可说明头。入口、子进程协调器、目标图和 API 校验采用单独编写或明确记录的可移植调整；未改变行为断言、案例身份或时限。永久回归不装入封存旧实现，不伪造当前旧门通过标记。

`test/auth-runtime-contract/retained-contract/` 下六份 `.d.ts` 是合同阶段保留的兼容声明，来自既有 Apache-2.0 模块的公开签名，继续保留该来源。它们只用于类型对照，不列为本项目新原创或独立实现成果；当前逐文件摘要单列于 reviews 和 current-files。标准 MIT 许可正文只记标准许可文本性质；测试 package.json 只记功能配置性质，均不以“未匹配上游”推定原创。

## 许可范围

五份独立源码、新测试表达、规格及本次验收/来源记录按用户授权采用 [MIT](../MIT.txt)。公开兼容声明、共享文件锁/原子文件端口、Node API 和其他第三方依赖保留各自许可。文件级决定以 `licensing/reviews.json` 中匹配当前摘要的条目为准；源码中的初始待复核注释不代替最终来源记录。

根 LICENSE、NOTICE、第三方声明和历史发行不追溯重标。文件系统、日志和设备候选尚未获准接入主仓，不能计为完成。全量独立替换及最终稳定发布继续属于未完成目标。

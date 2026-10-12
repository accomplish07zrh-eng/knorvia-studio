// SPDX-License-Identifier: Apache-2.0
// 受保护模型内容上的宿主侧原子性标记。
// 标记值是不透明的策略标识符，归「验证了产出该内容的工具」的那个权威所有；宿主管线只做相等比较
// （注册表接线、预算闸门、hook 投影），「保护什么、怎么证明」的领域语义留在产出方。

/** 宿主签发的受保护内容标记；`kind` 取值由拥有该策略的产出方定义，宿主不解释它。 */
export type ModelContentProtection = { kind: string };

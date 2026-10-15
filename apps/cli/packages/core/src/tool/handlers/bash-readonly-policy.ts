// SPDX-License-Identifier: Apache-2.0
// 只读策略的公开入口：主链与写选项探测来自 argv 模块，sed 就地判定来自危险性复核模块。
export {
  evaluateBashReadonlyPolicy,
  hasKnownBashWriteOption,
} from "./bash-readonly-policy-argv.js";
export { isSedInPlaceOption } from "./bash-readonly-policy-callbacks.js";

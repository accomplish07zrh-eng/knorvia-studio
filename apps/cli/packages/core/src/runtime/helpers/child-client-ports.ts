// SPDX-License-Identifier: Apache-2.0
// 子端口派生的兼容面（B16）：实现见 ./permission/child-port-derivation.js。
import * as derivation from "./permission/child-port-derivation.js";

export type ClientFacingPorts = derivation.ClientFacingPorts;
export type ChildClientPortsContext = derivation.ChildClientPortsContext;
export const deriveChildClientPorts = derivation.deriveChildClientPorts;

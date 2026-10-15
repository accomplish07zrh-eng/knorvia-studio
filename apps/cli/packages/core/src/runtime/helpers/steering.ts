// SPDX-License-Identifier: Apache-2.0
// steering 度量/预览/分叉克隆的兼容面（B18/B19）：实现见 ./steering/input-measurement.js 与
// ./steering/fork-clone.js。
import * as measurement from "./steering/input-measurement.js";
import * as fork from "./steering/fork-clone.js";

export const MAX_TURN_STEER_INPUT_BYTES = measurement.MAX_TURN_STEER_INPUT_BYTES;
export const measureUtf8Bytes = measurement.measureUtf8Bytes;
export const previewInput = measurement.previewInput;
export const findLatestUserMessageFromEnd = measurement.findLatestUserMessageFromEnd;
export const cloneMessageForFork = fork.cloneMessageForFork;
export const clonePartForFork = fork.clonePartForFork;

// SPDX-License-Identifier: Apache-2.0
// Personal provider 配置文件的「规范化」阶段。
//
// 职责边界很窄但很关键：把任意形态的层数据压成**规范文档**，
// 再序列化成落盘文本。规范化的意义是让「落盘字节」与「revision 的哈希输入」一致——
// 只要这两者一致，同一个逻辑内容就永远得到同一个 revision，轮询才能靠它判等。
import {
  decodeProviderConfigFile,
  encodeProviderConfigFile,
} from "./provider-config-file-codec.js";
import type { ProviderConfigLayerUpdate } from "@knorvia/provider";

/**
 * 把层数据规范化。
 *
 * 走「编码 → 解码」一趟而不是直接返回入参：编码器会剔除未知字段、补齐键序，
 * 解码器再读出规范形态；这一趟就是规范化的定义本身。
 */
export function canonicalLayer(layer: ProviderConfigLayerUpdate): ProviderConfigLayerUpdate {
  return decodeProviderConfigFile(encodeProviderConfigFile(layer));
}

/** 规范层 → 落盘文本（两空格缩进的 JSON）。 */
export function serializeLayer(layer: ProviderConfigLayerUpdate): string {
  return JSON.stringify(encodeProviderConfigFile(layer), null, 2);
}

/**
 * 盘上文档是否已经是规范形态。
 *
 * 判据是比较「原文文档」与「规范化后重新编码的结果」：相等说明无需重写。
 * 用 JSON 序列化比较而不是深比较，因为这里要回答的正是「字节是否一致」。
 */
export function isCanonicalDocument(
  document: unknown,
  decoded: ProviderConfigLayerUpdate,
): boolean {
  return JSON.stringify(document) === JSON.stringify(encodeProviderConfigFile(decoded));
}

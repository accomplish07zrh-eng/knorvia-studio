// SPDX-License-Identifier: Apache-2.0
// locale 的冻结形状集中在这里：取值与探测入参结构由合同锁定，运行时模块只引用。
import type { SupportedLocale } from "@knorvia/contracts";

/** 没有偏好时的落点；也是无法识别任何候选时的最终去处。 */
export const DEFAULT_LOCALE: SupportedLocale = "en-US";

/** 目录清单与顺序：探测结果只可能是这中间的一个。 */
export const SUPPORTED_LOCALES = ["en-US", "zh-CN"] as const satisfies readonly SupportedLocale[];

/**
 * 探测入参。两个来源各自可选：`env` 是环境变量快照（由调用方给，模块不读 `process.env`），
 * `intlLocale` 是宿主 Intl 解析出的标签。
 */
export interface LocaleDetectionInput {
  env?: Record<string, string | undefined>;
  intlLocale?: string | null;
}

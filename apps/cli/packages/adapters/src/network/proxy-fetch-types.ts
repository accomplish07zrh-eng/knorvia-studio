// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 代理 fetch 的形状声明：由 proxy-fetch.ts 再导出，公开面不变。
// 字段说明（调用方按这些字段构造对象，因此字段名是契约）：
// 一、caCertFile：自定义 CA 证书文件路径；提供后走 TLS 拦截链路。
// 二、env：环境变量快照，用于解析 http(s)_proxy / no_proxy。
// 三、fetch：替换底层 fetch 的注入点，测试与桌面宿主用它接管网络。
// 四、httpProxy / noProxy：显式覆盖环境变量里的代理与绕过规则。
// 五、四个可选字段全空时，工厂直接返回底层 fetch，不做任何包装。
// 六、类型别名 FetchLike 表示「与全局 fetch 同形」的调用约定。

export type FetchLike = typeof globalThis.fetch;

export interface ProxyFetchOptionSet {
  caCertFile?: string;
  env?: Record<string, string | undefined>;
  fetch?: FetchLike;
  httpProxy?: string;
  noProxy?: string;
}

// 维护提示（与形状本身无关，便于检索）：
// 一、新增可选字段前先确认工厂是否真的需要读取它，避免把配置项堆进这里。
// 二、字段全空时工厂直通底层 fetch，因此新增字段必须同时更新这个「全空」判定。
// 三、env 是调用时快照：不要在类型里存放可变引用，也不要在这里做环境变量解析。
// 四、fetch 注入点用于测试与桌面宿主，生产默认绑定全局 fetch。
// 五、httpProxy / noProxy 优先于 env 推导出的值，覆盖顺序由 http-config 决定。
// 六、本文件不导入任何运行时实现，改动不会影响执行路径。

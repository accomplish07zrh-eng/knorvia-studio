# 代理请求取消失效修复（2026-10-08）

## 现象

全量离线测试在高负载下偶发失败：`proxy-fetch-native.test.ts` 的「响应体读取中途取消」用例结果为 `pending`。用户随后要求顺手修复。

## 原因（已确认）

`createNetworkProxyFetch` 的 `prepareRequest` 用临时 `new Request(input, init)` 规范化请求，只保留 `request.signal` 交给代理交换层。Node 内置 fetch（undici）的 `Request.signal` 通过弱引用跟随调用方的 signal：临时 Request 被垃圾回收后，调用方取消不再传到该 signal，代理交换层收不到 abort，不销毁响应流，正在进行的读取永久挂起。

证据：在子进程中取消前强制 `gc()`，修复前 3/3 挂起、修复后 3/3 正确拒绝；高负载下 GC 更频繁，因此只在全量测试中偶发。实际影响：通过代理的流式请求，用户点击停止后可能无法真正中断网络读取。

## 处理

- `prepareRequest` 优先使用调用方原始 `init.signal`；输入为 Request 且未传 init.signal 时用输入 Request 自身的 signal（由调用方持有）；两者都没有时才用临时 Request 的 signal（只是永不取消的占位）。
- 回归测试：子进程以 `--expose-gc` 运行，取消前强制垃圾回收，使原问题确定性复现；取结果改为等待请求链结束（上限 20s）后再保留 500ms 观察期捕获逃逸异常，不再以固定等待代替完成。

## 验收

- 修复前回归用例确定性失败，修复后通过；高负载下重复运行通过。
- 适配器其余测试与全量离线测试通过。

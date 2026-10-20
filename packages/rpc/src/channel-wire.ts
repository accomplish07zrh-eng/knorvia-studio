// SPDX-License-Identifier: Apache-2.0
// 请求与响应帧的种类编号（线格式的一部分）。
//
// 这些数值与 VS Code IPC 同源，改动会让新旧版本无法互通，因此逐字冻结。
//
// 用普通 `enum` 而不是 `const enum`：后者在 `isolatedModules` 下无法跨模块再导出，
// 而本模块要经 `channels.shared.ts` 转发。普通 enum 的成员同样是字面量类型，
// 判别联合（`IRawResponse`）的类型收窄不受影响。
export enum RequestType {
  Promise = 100,
  PromiseCancel = 101,
  EventListen = 102,
  EventDispose = 103,
}

export enum ResponseType {
  Initialize = 200,
  PromiseSuccess = 201,
  PromiseError = 202,
  PromiseErrorObj = 203,
  EventFire = 204,
}

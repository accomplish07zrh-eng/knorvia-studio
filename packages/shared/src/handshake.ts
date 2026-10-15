// SPDX-License-Identifier: Apache-2.0
// Desktop stdio 握手消息形状（纯声明）。
export type HelloMessage = {
  type: /* 判别标签 */ "knorvia-hello";
  version: /* 协议版本 */ string;
  platform: /* 平台标识 */ string;
  arch: /* 架构标识 */ string;
  pid: /* 进程号 */ number;
};

export type HelloAckMessage = {
  type: /* 判别标签 */ "knorvia-hello-ack";
  version: /* 协议版本 */ string;
  clientId: /* 分配的客户端标识 */ string;
};

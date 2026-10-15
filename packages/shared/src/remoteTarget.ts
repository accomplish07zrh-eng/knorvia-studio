// SPDX-License-Identifier: Apache-2.0
// 远程连接目标形态与 secret 剥离（B34）。
import type { RemoteAssetInstallMode } from "./remoteAssetInstallMode.js";
import type { RemoteResourcePackageSelection } from "./remoteResourcePackages.js";

export type SSHConnectOptions = {
  kind: /* 判别标签 */ "ssh";
  host: /* 主机名或 IP */ string;
  port?: /* 端口；缺省 22 */ number;
  username: /* 登录用户名 */ string;
  sshConfigAlias?: /* ssh config 别名 */ string;
  password?: /* 会话口令（不入共享键） */ string;
  privateKeyPath?: /* 私钥路径（参与身份键） */ string;
  privateKeyPassphrase?: /* 私钥口令（不入共享键） */ string;
  assetInstallMode?: /* 资源安装模式 */ RemoteAssetInstallMode;
  resourcePackages?: /* 资源包选择 */ RemoteResourcePackageSelection;
};

export type WSLConnectOptions = {
  kind: /* 判别标签 */ "wsl";
  distro?: /* 发行版；缺省占位 */ string;
  user?: /* 登录用户；缺省占位 */ string;
};

export type DockerConnectOptions = {
  kind: /* 判别标签 */ "docker";
  container: /* 容器名 */ string;
};

export type RemoteTarget = SSHConnectOptions | WSLConnectOptions | DockerConnectOptions;

// 删除只应存在于当前连接流程中的 secret，供长期内存状态和跨进程回包使用。
export function stripRemoteTargetSecrets(target: RemoteTarget): RemoteTarget {
  if (target.kind !== "ssh") {
    return target; // wsl/docker 形态没有 secret 字段，原样返回
  }
  const {
    password: _password, // 会话口令不入长期状态
    privateKeyPassphrase: _privateKeyPassphrase, // 私钥口令同样剔除
    ...stripped
  } = target;
  return stripped;
}

// SPDX-License-Identifier: Apache-2.0
// 共享凭据存储的形状声明：由 shared-credentials.ts 原样再导出，公开面不变。
// 字段与方法说明（调用方按这些名字读写，字段名/方法名是契约）：
// filePath：最终使用的凭据文件绝对路径（只读）。
// read / write / delete / deleteIfValue / deleteIfValues / deleteManyIfValue /
// list / resolveFilePath 等：见各方法签名，语义与实现侧注释一致。
// 选项侧 baseDir/env/filePath：分别表示基目录、环境变量快照与显式文件路径。
import type { KnorviaCredentialCipher } from "./credential-cipher.js";

export interface SharedKnorviaCredentialStoreOptions {
  baseDir?: string;
  cipher?: KnorviaCredentialCipher;
  env?: Record<string, string | undefined>;
  filePath?: string;
}

export interface SharedKnorviaCredentialStore {
  readonly filePath: string;
  delete(key: string): Promise<void>;
  deleteIfValue(key: string, expectedValue: string): Promise<boolean>;
  deleteIfValues(
    expectedValues: Readonly<Record<string, string>>,
  ): Promise<Record<string, boolean>>;
  deleteManyIfValue(
    guardKey: string,
    expectedGuardValue: string,
    keysToDelete: readonly string[],
  ): Promise<boolean>;
  load(key: string): Promise<string | null>;
  loadMany(keys: readonly string[]): Promise<Record<string, string | null>>;
  onDidChange?(listener: () => void | Promise<void>): () => void;
  save(key: string, value: string): Promise<void>;
  saveMany(entries: Readonly<Record<string, string>>): Promise<void>;
  saveReplacing(key: string, value: string, replacedKeys: readonly string[]): Promise<void>;
}

// SPDX-License-Identifier: Apache-2.0
// Retained public compatibility declaration.

export interface KnorviaCredentialCipher {
  decrypt(value: string): string;
  encrypt(value: string): string;
}

export interface KnorviaCredentialCipherOptions {
  env?: Record<string, string | undefined>;
}

export declare function createKnorviaCredentialCipher(
  options?: KnorviaCredentialCipherOptions,
): KnorviaCredentialCipher;

export declare function isEncryptedKnorviaCredentialValue(value: string): boolean;

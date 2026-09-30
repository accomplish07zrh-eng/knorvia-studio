// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import {
  openUrlInBrowser as targetOpen,
  type BrowserOpenOptions as TargetBrowserOpenOptions,
  type BrowserOpenResult as TargetBrowserOpenResult,
} from "target/browser";
import {
  openUrlInBrowser as referenceOpen,
  type BrowserOpenOptions as ReferenceBrowserOpenOptions,
  type BrowserOpenResult as ReferenceBrowserOpenResult,
} from "reference/browser";
import {
  createKnorviaCredentialCipher as targetCreateCipher,
  isEncryptedKnorviaCredentialValue as targetIsEncrypted,
  type KnorviaCredentialCipher as TargetCipher,
  type KnorviaCredentialCipherOptions as TargetCipherOptions,
} from "target/credential-cipher";
import {
  createKnorviaCredentialCipher as referenceCreateCipher,
  isEncryptedKnorviaCredentialValue as referenceIsEncrypted,
  type KnorviaCredentialCipher as ReferenceCipher,
  type KnorviaCredentialCipherOptions as ReferenceCipherOptions,
} from "reference/credential-cipher";
import {
  MCP_OAUTH_CALLBACK_DENIED_ERROR_CODE as targetDeniedCode,
  createLocalhostOAuthCallbackServer as targetCreateCallback,
  type LocalhostOAuthCallback as TargetCallback,
  type LocalhostOAuthCallbackServer as TargetCallbackServer,
  type McpOAuthCallbackDeniedError as TargetDeniedError,
} from "target/localhost-callback";
import {
  MCP_OAUTH_CALLBACK_DENIED_ERROR_CODE as referenceDeniedCode,
  createLocalhostOAuthCallbackServer as referenceCreateCallback,
  type LocalhostOAuthCallback as ReferenceCallback,
  type LocalhostOAuthCallbackServer as ReferenceCallbackServer,
  type McpOAuthCallbackDeniedError as ReferenceDeniedError,
} from "reference/localhost-callback";
import {
  createSharedKnorviaCredentialStore as targetCreateStore,
  loadSharedKnorviaCredentialSync as targetLoadSync,
  resolveSharedKnorviaCredentialsPath as targetResolvePath,
  type SharedKnorviaCredentialStore as TargetStore,
  type SharedKnorviaCredentialStoreOptions as TargetStoreOptions,
} from "target/shared-credentials";
import {
  createSharedKnorviaCredentialStore as referenceCreateStore,
  loadSharedKnorviaCredentialSync as referenceLoadSync,
  resolveSharedKnorviaCredentialsPath as referenceResolvePath,
  type SharedKnorviaCredentialStore as ReferenceStore,
  type SharedKnorviaCredentialStoreOptions as ReferenceStoreOptions,
} from "reference/shared-credentials";
import {
  createKnorviaCredentialCipher,
  createLocalhostOAuthCallbackServer,
  createSharedKnorviaCredentialStore,
  isEncryptedKnorviaCredentialValue,
  loadSharedKnorviaCredentialSync,
  MCP_OAUTH_CALLBACK_DENIED_ERROR_CODE,
  openUrlInBrowser,
  resolveSharedKnorviaCredentialsPath,
} from "target-root";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() => Value extends Left ? 1 : 2
      ? true
      : false
    : false;
type Assert<Value extends true> = Value;

type Checks = [
  Assert<Equal<TargetBrowserOpenOptions, ReferenceBrowserOpenOptions>>,
  Assert<Equal<TargetBrowserOpenResult, ReferenceBrowserOpenResult>>,
  Assert<Equal<typeof targetOpen, typeof referenceOpen>>,
  Assert<Equal<TargetCipher, ReferenceCipher>>,
  Assert<Equal<TargetCipherOptions, ReferenceCipherOptions>>,
  Assert<Equal<typeof targetCreateCipher, typeof referenceCreateCipher>>,
  Assert<Equal<typeof targetIsEncrypted, typeof referenceIsEncrypted>>,
  Assert<Equal<TargetCallback, ReferenceCallback>>,
  Assert<Equal<TargetCallbackServer, ReferenceCallbackServer>>,
  Assert<Equal<TargetDeniedError, ReferenceDeniedError>>,
  Assert<Equal<typeof targetDeniedCode, typeof referenceDeniedCode>>,
  Assert<Equal<typeof targetCreateCallback, typeof referenceCreateCallback>>,
  Assert<Equal<TargetStore, ReferenceStore>>,
  Assert<Equal<TargetStoreOptions, ReferenceStoreOptions>>,
  Assert<Equal<typeof targetCreateStore, typeof referenceCreateStore>>,
  Assert<Equal<typeof targetLoadSync, typeof referenceLoadSync>>,
  Assert<Equal<typeof targetResolvePath, typeof referenceResolvePath>>,
];

const rootReachability = [
  createKnorviaCredentialCipher,
  createLocalhostOAuthCallbackServer,
  createSharedKnorviaCredentialStore,
  isEncryptedKnorviaCredentialValue,
  loadSharedKnorviaCredentialSync,
  MCP_OAUTH_CALLBACK_DENIED_ERROR_CODE,
  openUrlInBrowser,
  resolveSharedKnorviaCredentialsPath,
] as const;
void (null as unknown as Checks);
void rootReachability;

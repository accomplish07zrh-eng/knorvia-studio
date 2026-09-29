// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export const credentialSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
function defaultStore() {
  return {
    filePath: "fixture",
    async load() { return null; }, async loadMany() { return {}; }, async save() {}, async saveMany() {},
    async saveReplacing() {}, async delete() {}, async deleteIfValue() { return false; },
    async deleteIfValues() { return {}; }, async deleteManyIfValue() { return false; },
  };
}
export function createSharedKnorviaCredentialStore() {
  const seams = globalThis[key];
  return seams.invoke("credentials.createStore", this, [], seams.getValue("credentials.store", defaultStore()));
}
`;

export const oauthSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
export function createCredentialKeyPrefix(serverName, serverUrl, config) {
  const seams = globalThis[key];
  return seams.invoke("oauth.credentialKey", this, [serverName, serverUrl, config], "mcp:" + serverName + ":" + serverUrl);
}
`;

export const oauthProviderSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
export function createMcpOAuthTokenProvider(input) {
  const seams = globalThis[key];
  return seams.invoke("oauth.createProvider", this, [input], { fixture: "auth-provider", input });
}
`;

export const oauthCredentialsSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
export function loadCredentialPair(store, prefix) {
  const seams = globalThis[key];
  return Promise.resolve(seams.invoke("oauth.loadCredentialPair", this, [store, prefix], undefined));
}
`;

export const oauthErrorsSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
export function classifyInteractiveAuthorizationTrigger(error) {
  const seams = globalThis[key];
  return seams.invoke("oauth.classifyTrigger", this, [error], error && error.fixtureOAuthTrigger);
}
export function createInteractiveAuthorizationRequiredError(input) {
  return Object.assign(new Error("interactive authorization required"), input, { code: "MCP_OAUTH_INTERACTIVE_REQUIRED" });
}
export function createTemporaryRefreshFailureError(input) {
  return Object.assign(new Error("temporary refresh failure"), input, { code: "MCP_OAUTH_TEMPORARY_REFRESH_FAILURE" });
}
`;

export const oauthInteractiveSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
export const MCP_OAUTH_AUTHORIZATION_TRANSACTION_TTL_MS = 300000;
export function runMcpInteractiveAuthorization(input) {
  const seams = globalThis[key];
  return Promise.resolve(seams.invoke("oauth.runInteractive", this, [input], { status: "authorized" }));
}
`;

export const officialAuthSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
const retainedKey = Symbol.for("knorvia.mcp.independent.retained-exports");
export class OfficialMcpAuthError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}
export function createOfficialMcpAuthFetch(input) {
  const seams = globalThis[key];
  return seams.invoke("official.createFetch", this, [input], () => seams.getValue("official.fetch", input.baseFetch));
}
(globalThis[retainedKey] ??= {}).OfficialMcpAuthError = OfficialMcpAuthError;
`;

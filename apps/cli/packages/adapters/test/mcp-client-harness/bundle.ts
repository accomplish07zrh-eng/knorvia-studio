// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CandidateExports } from "./types.ts";
import {
  contractsSource,
  descriptorSource,
  networkSource,
  poolSource,
  sharedSource,
  telemetrySource,
  timeoutSource,
} from "./shim-product-core.ts";
import {
  credentialSource,
  oauthCredentialsSource,
  oauthErrorsSource,
  oauthInteractiveSource,
  oauthProviderSource,
  oauthSource,
  officialAuthSource,
} from "./shim-product-auth.ts";
import { emptySource, processTreeSource, stdioTransportSource } from "./shim-product-runtime.ts";
import { cryptoSource, sdkSource, sdkStdioSource, timersSource } from "./shim-sdk.ts";

interface ResolveArgs {
  importer: string;
  kind: string;
  namespace: string;
  path: string;
}

interface ResolveResult {
  external?: boolean;
  namespace?: string;
  path?: string;
}

interface BuildApi {
  onLoad(
    options: { filter: RegExp; namespace: string },
    callback: (args: { path: string }) => { contents: string; loader: "js" },
  ): void;
  onResolve(
    options: { filter: RegExp },
    callback: (args: ResolveArgs) => ResolveResult | undefined,
  ): void;
}

interface BuildResult {
  metafile?: { inputs: Record<string, unknown> };
  outputFiles?: Array<{ contents: Uint8Array }>;
}

interface EsbuildApi {
  build(options: Record<string, unknown>): Promise<BuildResult>;
}

const requireFromToolchain = createRequire(import.meta.url);
const esbuild = requireFromToolchain("esbuild") as EsbuildApi;
const fixtureRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultTarget = fileURLToPath(new URL("../../src/mcp/index.ts", import.meta.url));

const shimSources: Record<string, string> = {
  "@knorvia/contracts": contractsSource,
  "@knorvia/shared": sharedSource,
  "@modelcontextprotocol/client": sdkSource,
  "@modelcontextprotocol/client/stdio": sdkStdioSource,
  "../auth/shared-credentials.js": credentialSource,
  "../device/process.js": emptySource,
  "./descriptor.js": descriptorSource,
  "./network.js": networkSource,
  "./oauth-credentials.js": oauthCredentialsSource,
  "./oauth-errors.js": oauthErrorsSource,
  "./oauth-interactive.js": oauthInteractiveSource,
  "./oauth-provider.js": oauthProviderSource,
  "./oauth.js": oauthSource,
  "./official-auth.js": officialAuthSource,
  "./pool.js": poolSource,
  "./process-tree.js": processTreeSource,
  "./resource-telemetry.js": emptySource,
  "./stdio-transport.js": stdioTransportSource,
  "./telemetry.js": telemetrySource,
  "./timeout.js": timeoutSource,
  "./windows-job-object.js": emptySource,
  "node:crypto": cryptoSource,
  "node:timers": timersSource,
};

const allowedNodeModules = new Set(["node:path", "node:util"]);
let candidatePromise: Promise<CandidateExports> | undefined;

function candidatePlugin(target: string): Record<string, unknown> {
  const candidateRoot = path.dirname(target);
  return {
    name: "independent-mcp-client-boundary",
    setup(build: BuildApi) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") {
          if (path.resolve(args.path) !== target)
            throw new Error(`Unexpected entry point: ${args.path}`);
          return { path: target };
        }
        if (Object.hasOwn(shimSources, args.path))
          return { namespace: "fixture-shim", path: args.path };
        if (allowedNodeModules.has(args.path)) return { external: true, path: args.path };
        if (args.namespace === "fixture-shim")
          throw new Error(`Unexpected shim import: ${args.path}`);
        if (args.path.startsWith(".")) {
          const extension = path.extname(target);
          const fileName = path.basename(args.path).replace(/\.js$/u, extension);
          if (
            /^client-[a-z0-9-]+\.(?:ts|js)$/u.test(fileName) &&
            path.extname(fileName) === extension
          ) {
            return { path: path.join(candidateRoot, fileName) };
          }
        }
        throw new Error(`Unexpected candidate import ${args.path} from ${args.importer}`);
      });
      build.onLoad({ filter: /.*/, namespace: "fixture-shim" }, (args) => ({
        contents: shimSources[args.path] ?? "throw new Error('missing fixture shim')",
        loader: "js",
      }));
    },
  };
}

function auditInputs(inputs: Record<string, unknown>, target: string): void {
  const candidateRoot = path.dirname(target).replaceAll("\\", "/").toLowerCase();
  for (const rawInput of Object.keys(inputs)) {
    const input = rawInput.replaceAll("\\", "/");
    if (input.startsWith("fixture-shim:")) continue;
    const normalized = path.resolve(fixtureRoot, input).replaceAll("\\", "/").toLowerCase();
    if (normalized === target.replaceAll("\\", "/").toLowerCase()) continue;
    if (
      path.dirname(normalized) === candidateRoot &&
      /^client-[a-z0-9-]+\.(?:ts|js)$/u.test(path.basename(normalized)) &&
      path.extname(normalized) === path.extname(target)
    )
      continue;
    throw new Error(`Bundle read escaped the candidate allowlist: ${rawInput}`);
  }
}

async function buildAndLoad(): Promise<CandidateExports> {
  const target = path.resolve(process.env.MCP_CLIENT_TEST_TARGET ?? defaultTarget);
  const result = await esbuild.build({
    absWorkingDir: fixtureRoot,
    bundle: true,
    entryPoints: [target],
    format: "esm",
    legalComments: "none",
    metafile: true,
    write: false,
    platform: "node",
    plugins: [candidatePlugin(target)],
    sourcemap: false,
    target: "node24",
  });
  if (!result.metafile) throw new Error("esbuild did not return a metafile");
  auditInputs(result.metafile.inputs, target);
  const output = result.outputFiles?.[0];
  if (!output) throw new Error("esbuild did not return a bundle");
  // 每个测试进程使用自己的内存模块，避免并发 suite 读写同一生成文件。
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(output.contents).toString("base64")}`;
  return (await import(moduleUrl)) as CandidateExports;
}

export function loadCandidate(): Promise<CandidateExports> {
  return (candidatePromise ??= buildAndLoad());
}

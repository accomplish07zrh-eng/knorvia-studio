// New fixtures under retained root Apache-2.0; prior source exposure is disclosed
// in specs/knorvia-remote-identity-helpers-20260930.md. No production license grant.
import type * as Workspace from "../src/remote-workspace-identity.js";
import type * as Ssh from "../src/remoteSshHostKey.js";
import type * as Wsl from "../src/wslUserValidation.js";
import type { RemoteTarget, SSHConnectOptions } from "../src/remoteTarget.js";

export const remoteModuleRoot = new URL(
  `../${process.env.KNORVIA_REMOTE_TEST_TARGET ?? "src"}/`,
  import.meta.url,
);
export async function loadRemoteHelpers() {
  const [workspace, ssh, wsl] = await Promise.all([
    import(new URL("remote-workspace-identity.js", remoteModuleRoot).href) as Promise<
      typeof Workspace
    >,
    import(new URL("remoteSshHostKey.js", remoteModuleRoot).href) as Promise<typeof Ssh>,
    import(new URL("wslUserValidation.js", remoteModuleRoot).href) as Promise<typeof Wsl>,
  ]);
  return { ...workspace, ...ssh, ...wsl };
}
export type RemoteHelpers = Awaited<ReturnType<typeof loadRemoteHelpers>>;
export const sshTarget: SSHConnectOptions = {
  kind: "ssh",
  host: " EXAMPLE.INVALID ",
  username: " fixture-user ",
};
export function observeRemote(run: () => unknown): unknown {
  try {
    const result = run();
    return result === undefined ? { valueType: "undefined" } : JSON.parse(JSON.stringify(result));
  } catch (error) {
    const fault = error as Error;
    return { thrown: { name: fault.name, message: fault.message } };
  }
}
interface ContractCase {
  name: string;
  run(api: RemoteHelpers): unknown;
}

export function remoteContractCases(): ContractCase[] {
  const cases: ContractCase[] = [];
  const add = (name: string, run: ContractCase["run"]) => cases.push({ name, run });
  const paths = [
    "",
    "/",
    "///",
    "fixture/project",
    "/fixture/project/",
    "\\fixture\\project\\",
    "//fixture///project//",
    "/fixture/./../project",
    "/fixture:name:part",
    " /fixture/project ",
    "/fixture\nproject",
    "/fixture\u2028project",
    "/%2fproject",
    "c:\\fixture\\project",
    "/项目/🌍",
    "/\ud800",
    " / ",
  ];
  const targets: RemoteTarget[] = [
    sshTarget,
    { kind: "wsl" },
    { kind: "wsl", distro: " Fixture Distro ", user: " fixture-user " },
    { kind: "wsl", distro: " ", user: " " },
    { kind: "docker", container: " fixture-container " },
  ];
  targets.forEach((target, targetIndex) =>
    paths.forEach((path, pathIndex) => {
      add(`workspace/build-${targetIndex}-${pathIndex}`, (api) => {
        const identity = api.buildRemoteWorkspaceIdentity(path, target);
        return {
          identity,
          parsed: api.parseRemoteWorkspaceIdentity(identity),
          predicate: api.isRemoteWorkspaceIdentity(identity),
        };
      });
    }),
  );
  const identities = [
    "",
    "/fixture/project",
    "remote:",
    "Remote:ssh:h:22:u:/fixture",
    " remote:ssh:h:22:u:/fixture",
    "remote:unknown:x:/fixture",
    "remote:ssh:h:22:u:/fixture",
    "remote:ssh:h:22:u:/",
    "remote:ssh:h:22:u:/fixture:other",
    "remote:ssh:h:22:u:/fixture\nother",
    "remote:ssh:h:22:u:/fixture\u2028other",
    "remote:ssh:h:22:u:relative",
    "remote:ssh::22:u:/fixture",
    "remote:ssh:h::u:/fixture",
    "remote:ssh:h:22::/fixture",
    "remote:ssh:h:22:u:",
    "remote:ssh:h:port:u:/fixture",
    "remote:ssh:h:22:u:/fixture//./..",
    "remote:ssh:h/name:port:user/name:/fixture",
    "remote:ssh: : : :/fixture",
    "remote:ssh:[2001:db8::1]:22:u:/fixture",
    "remote:wsl:d:/fixture",
    "remote:wsl:d:u:/fixture",
    "remote:wsl:d:u/other:/fixture",
    "remote:wsl:d:/fixture:user:/next",
    "remote:wsl:d:/",
    "remote:wsl:d::/fixture",
    "remote:wsl::/fixture",
    "remote:wsl:d:u:relative",
    "remote:wsl:d:u:/fixture:other",
    "remote:wsl:d:/:/fixture",
    "remote:wsl:d:/fixture\n",
    "remote:docker:c:/fixture",
    "remote:docker:c:/",
    "remote:docker:c:/fixture:other",
    "remote:docker::/fixture",
    "remote:docker:c:relative",
    "remote:docker:c:/fixture ",
    "remote:docker:c:/fixture\u0000other",
  ];
  identities.forEach((identity, index) =>
    add(`workspace/parse-${index}`, (api) => ({
      parsed: api.parseRemoteWorkspaceIdentity(identity),
      predicate: api.isRemoteWorkspaceIdentity(identity),
    })),
  );
  for (const port of [undefined, null, 0, -1, 22, 22.5, NaN, Infinity]) {
    // Null is a historical runtime input outside the declared optional-number type.
    const target = { ...sshTarget, port } as unknown as SSHConnectOptions;
    add(`workspace/port-${String(port)}`, (api) =>
      api.buildRemoteWorkspaceIdentity("/fixture", target),
    );
    add(`ssh/port-${String(port)}`, (api) => api.buildSshRemoteHostKey(target));
  }
  add("workspace/ipv6-build", (api) => {
    const identity = api.buildRemoteWorkspaceIdentity("/fixture", {
      ...sshTarget,
      host: " [2001:db8::1] ",
    });
    return { identity, parsed: api.parseRemoteWorkspaceIdentity(identity) };
  });
  const privatePaths = [
    undefined,
    "",
    " ",
    "/",
    "/a/./b/../id",
    "/../../id",
    "/a/..",
    "//server/share/a/../id",
    "//server/share/../../../id",
    "//server",
    "//server/..",
    "///server//share/a",
    "//./../a/..",
    "//..",
    "~/a/../../id",
    "~/../id",
    "~user/a/../../id",
    "a/../../id",
    "../../id",
    "a/..",
    "././",
    "c:\\fixture\\keys\\..\\id",
    "c:/../../id",
    "c:/",
    "c:",
    "c:../../id",
    "c:id/../next",
    "d:/a//b/./../id/",
    "Z:/a/../../id",
    "é:/a/../id",
    "K:/../id",
    "c:/../a\nb",
    "c:../a\rb",
    "c:/../a\u2028b",
    "c:/../a\u2029b",
    "a\u0000b/../id",
    " /fixture/keys/id ",
    "/fixture/./.../../id",
    "\\\\server\\share\\a\\..\\id",
    "\\\\server",
    "a//b\\c/../id",
  ];
  privatePaths.forEach((privateKeyPath, index) =>
    add(`ssh/path-${index}`, (api) => api.buildSshRemoteHostKey({ ...sshTarget, privateKeyPath })),
  );
  const authTargets = [
    sshTarget,
    { ...sshTarget, password: "" },
    { ...sshTarget, password: "synthetic-password" },
    { ...sshTarget, password: undefined },
    { ...sshTarget, privateKeyPath: " " },
    { ...sshTarget, privateKeyPath: "/fixture/id", password: "synthetic-password" },
    { ...sshTarget, privateKeyPassphrase: "synthetic-passphrase" },
    { ...sshTarget, passwordCredentialKey: "fixture-credential-key" },
    { ...sshTarget, passwordCredentialKey: " " },
    { ...sshTarget, passwordCredentialKey: "fixture-key", privateKeyPath: " " },
    Object.assign(Object.create({ password: "synthetic-inherited" }), sshTarget),
  ];
  authTargets.forEach((target, index) =>
    add(`ssh/auth-${index}`, (api) => api.buildSshRemoteHostKey(target)),
  );
  add("ssh/getter-order", (api) => {
    const reads: string[] = [];
    const target = { kind: "ssh" } as SSHConnectOptions;
    const values = {
      host: " FIXTURE.INVALID ",
      port: 22,
      username: " fixture-user ",
      password: undefined,
      passwordCredentialKey: "fixture-key",
      privateKeyPath: " ",
      privateKeyPassphrase: "synthetic-passphrase",
    };
    for (const [field, value] of Object.entries(values))
      Object.defineProperty(target, field, {
        enumerable: true,
        get: () => {
          reads.push(field);
          return value;
        },
      });
    return { key: api.buildSshRemoteHostKey(target), reads };
  });
  add("ssh/getter-changing-path", (api) => {
    let reads = 0;
    const target = {
      ...sshTarget,
      get privateKeyPath() {
        return reads++ === 0 ? "/fixture/id" : "";
      },
    };
    return { key: api.buildSshRemoteHostKey(target), reads };
  });
  const users = [
    "",
    " ",
    "fixture-user",
    " fixture-user ",
    "a b",
    "a:b",
    "a/b",
    "a\\b",
    "a\u0000b",
    "a\tb",
    "a\nb",
    "a\rb",
    "a\u001fb",
    "a\u007fb",
    "a\u0080b",
    "a\u0085b",
    "a\u009fb",
    "a\u2028b",
    "a\u2029b",
    "\ufefffixture\u00a0",
    "中文用户",
    "😀".repeat(32),
    "😀".repeat(33),
    "a".repeat(64),
    "a".repeat(65),
    "\ud800",
    "\udfff",
    ":",
    "/",
    "\\",
  ];
  users.forEach((value, index) =>
    add(`wsl/user-${index}`, (api) => {
      const parsed = api.wslUserSchema.safeParse(value);
      return {
        valid: api.isValidWslUser(value),
        schema: parsed.success
          ? { success: true, data: parsed.data }
          : { success: false, issues: parsed.error.issues },
      };
    }),
  );
  for (const [index, value] of [undefined, null, 1, false, {}, []].entries()) {
    add(`wsl/type-${index}`, (api) => {
      const parsed = api.wslUserSchema.safeParse(value);
      return parsed.success
        ? { success: true, data: parsed.data }
        : { success: false, issues: parsed.error.issues };
    });
    add(`wsl/native-type-${index}`, (api) => api.isValidWslUser(value as unknown as string));
    add(`workspace/native-path-type-${index}`, (api) =>
      api.buildRemoteWorkspaceIdentity(value as unknown as string, sshTarget),
    );
    add(`workspace/native-parse-type-${index}`, (api) =>
      api.parseRemoteWorkspaceIdentity(value as unknown as string),
    );
  }
  return cases;
}

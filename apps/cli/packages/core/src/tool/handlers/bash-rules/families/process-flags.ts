// SPDX-License-Identifier: Apache-2.0
// 进程/网络/容器/测试族的旗标画像：ps/pgrep/lsof/ss/netstat/man/tput/pyright/test、
// docker logs/inspect 与 gh 的仓库旗标组。取值语义以各命令公开手册为准。
import { flagChart } from "../flag-builder.js";
import type { SafeFlagValue } from "../policy-shapes.js";

// 精确取值的小画像：字面量保持 none/string/number 的精确语义，供展开组合。
const PROCESS_DISPLAY_PRESETS = {
  tput: {
    "-T": "string",
    "-V": "none",
    "-x": "none",
  },
  dockerInspect: {
    "-f": "string",
    "-s": "none",
    "--format": "string",
    "--size": "none",
    "--type": "string",
  },
  ghRepo: {
    "-R": "string",
    "--repo": "string",
  },
  ghJsonRepo: {
    "-R": "string",
    "--repo": "string",
    "--json": "string",
  },
  ghLimitRepo: {
    "-L": "number",
    "--limit": "number",
    "-R": "string",
    "--repo": "string",
    "--json": "string",
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, SafeFlagValue>>>>;

export const TPUT_SAFE_FLAGS = PROCESS_DISPLAY_PRESETS.tput;
export const DOCKER_INSPECT_SAFE_FLAGS = PROCESS_DISPLAY_PRESETS.dockerInspect;
export const GH_REPO_FLAGS = PROCESS_DISPLAY_PRESETS.ghRepo;
export const GH_JSON_REPO_FLAGS = PROCESS_DISPLAY_PRESETS.ghJsonRepo;
export const GH_LIMIT_REPO_FLAGS = PROCESS_DISPLAY_PRESETS.ghLimitRepo;

export const PS_SAFE_FLAGS = flagChart(
  "-A -F -H -L -N -T -V -a -c -d -e -f -j -l -m -w -ww -y --deselect --forest --headers --help " +
    "--info --no-headers --version",
  [
    ["-C", "string"],
    ["-G", "string"],
    ["-U", "string"],
    ["-g", "string"],
    ["-n", "string"],
    ["-p", "string"],
    ["-q", "string"],
    ["-s", "string"],
    ["-t", "string"],
    ["-u", "string"],
    ["--pid", "string"],
    ["--quick-pid", "string"],
    ["--sid", "string"],
    ["--sort", "string"],
    ["--tty", "string"],
    ["--user", "string"],
    ["--width", "number"],
  ],
);

export const PYRIGHT_SAFE_FLAGS = flagChart(
  "--dependencies --outputjson --stats --verbose --version --warnings",
  [
    ["--level", "string"],
    ["--pythonplatform", "string"],
    ["--pythonversion", "string"],
  ],
);

export const MAN_SAFE_FLAGS = flagChart("-a -d -f -h -k -w --all --apropos --whatis", [
  ["-S", "string"],
  ["-s", "string"],
]);

export const NETSTAT_SAFE_FLAGS = flagChart("-L -a -g -i -l -m -n -r -s -v", [
  ["-I", "string"],
  ["-f", "string"],
]);

export const LSOF_SAFE_FLAGS = flagChart(
  "-? -C -E -F -H -K -L -N -O -P -Q -R -S -T -U -V -X -a -b -g -h -i -l -n -o -r -s -t -v -x",
  [
    ["-A", "string"],
    ["-c", "string"],
    ["-d", "string"],
    ["-e", "string"],
    ["-k", "string"],
    ["-p", "string"],
    ["-u", "string"],
  ],
);

export const PGREP_SAFE_FLAGS = flagChart(
  "-L -V -a -c -f -i -l -n -o -v -w -x --count --exact --full --help --ignore-case --inverse " +
    "--lightweight --list-full --list-name --logpidfile --newest --oldest --version",
  [
    ["-F", "string"],
    ["-G", "string"],
    ["-O", "string"],
    ["-P", "string"],
    ["-U", "string"],
    ["-d", "string"],
    ["-g", "string"],
    ["-r", "string"],
    ["-s", "string"],
    ["-t", "string"],
    ["-u", "string"],
    ["--delimiter", "string"],
    ["--euid", "string"],
    ["--group", "string"],
    ["--ns", "string"],
    ["--nslist", "string"],
    ["--older", "string"],
    ["--parent", "string"],
    ["--pgroup", "string"],
    ["--pidfile", "string"],
    ["--runstates", "string"],
    ["--session", "string"],
    ["--terminal", "string"],
    ["--uid", "string"],
  ],
);

export const SS_SAFE_FLAGS = flagChart(
  "-0 -4 -6 -E -H -M -O -S -V -Z -a -b -d -e -h -i -l -m -n -o -p -s -t -u -w -x -z --all --bpf " +
    "--cgroup --contexts --context --dccp --events --extended --help --inet-sockopt --info --ipv4 " +
    "--ipv6 --listening --memory --mptcp --no-header --numeric --oneline --options --packet " +
    "--processes --raw --sctp --summary --tcp --tipc --tipcinfo --tos --udp --unix --version " +
    "--vsock",
  [
    ["-A", "string"],
    ["-f", "string"],
    ["--family", "string"],
    ["--query", "string"],
    ["--socket", "string"],
  ],
);

// test/[ 的每个一元与二元判定符都消费一个操作数。
export const TEST_SAFE_FLAGS = flagChart("", [
  ["-b", "string"],
  ["-c", "string"],
  ["-d", "string"],
  ["-e", "string"],
  ["-ef", "string"],
  ["-eq", "string"],
  ["-f", "string"],
  ["-g", "string"],
  ["-G", "string"],
  ["-ge", "string"],
  ["-gt", "string"],
  ["-h", "string"],
  ["-k", "string"],
  ["-L", "string"],
  ["-le", "string"],
  ["-lt", "string"],
  ["-N", "string"],
  ["-n", "string"],
  ["-ne", "string"],
  ["-nt", "string"],
  ["-O", "string"],
  ["-ot", "string"],
  ["-p", "string"],
  ["-r", "string"],
  ["-s", "string"],
  ["-S", "string"],
  ["-t", "string"],
  ["-u", "string"],
  ["-w", "string"],
  ["-x", "string"],
  ["-z", "string"],
]);

export const DOCKER_LOGS_SAFE_FLAGS = flagChart("-f -t --details --follow --timestamps", [
  ["-n", "string"],
  ["--since", "string"],
  ["--tail", "string"],
  ["--until", "string"],
]);

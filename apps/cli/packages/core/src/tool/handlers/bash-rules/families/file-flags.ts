// SPDX-License-Identifier: Apache-2.0
// 文件检查与系统信息族的旗标画像：fd/sort/base64/摘要和/date/hostname。
// 依据各命令公开手册整理——只收录读取与展示类旗标。
import { flagChart } from "../flag-builder.js";

export const FD_SAFE_FLAGS = flagChart(
  "-0 -1 -F -H -I -L -V -a -g -h -i -p -q -s --absolute-path --case-sensitive --fixed-strings " +
    "--follow --full-path --glob --help --hidden --ignore-case --no-ignore --no-ignore-parent " +
    "--no-ignore-vcs --no-require-git --one-file-system --print0 --prune --quiet --regex " +
    "--show-errors --strip-cwd-prefix --version",
  [
    ["-E", "string"],
    ["-S", "string"],
    ["-c", "string"],
    ["-d", "number"],
    ["-e", "string"],
    ["-j", "number"],
    ["-o", "string"],
    ["-t", "string"],
    ["--and", "string"],
    ["--base-directory", "string"],
    ["--batch-size", "number"],
    ["--changed-before", "string"],
    ["--changed-within", "string"],
    ["--color", "string"],
    ["--exact-depth", "number"],
    ["--exclude", "string"],
    ["--extension", "string"],
    ["--format", "string"],
    ["--hyperlink", "string"],
    ["--ignore-file", "string"],
    ["--max-buffer-time", "string"],
    ["--max-depth", "number"],
    ["--max-results", "number"],
    ["--min-depth", "number"],
    ["--owner", "string"],
    ["--path-separator", "string"],
    ["--search-path", "string"],
    ["--size", "string"],
    ["--threads", "number"],
    ["--type", "string"],
  ],
);

export const SORT_SAFE_FLAGS = flagChart(
  "-C -M -R -V -b -c -d -f -g -h -i -m -n -r -s -u -z --check --check-char-order " +
    "--dictionary-order --general-numeric-sort --help --human-numeric-sort --ignore-case " +
    "--ignore-leading-blanks --ignore-nonprinting --merge --month-sort --numeric-sort " +
    "--random-sort --reverse --stable --unique --version --version-sort --zero-terminated",
  [
    ["-S", "string"],
    ["-k", "string"],
    ["-t", "string"],
    ["--batch-size", "number"],
    ["--buffer-size", "string"],
    ["--field-separator", "string"],
    ["--key", "string"],
    ["--parallel", "number"],
    ["--sort", "string"],
  ],
);

export const BASE64_SAFE_FLAGS = flagChart("-D -d -h --decode --help --ignore-garbage --version", [
  ["-b", "number"],
  ["-i", "string"],
  ["--break", "number"],
  ["--input", "string"],
  ["--wrap", "number"],
]);

export const SHA_SUM_SAFE_FLAGS = flagChart(
  "-b -c -t -w -z --binary --check --help --ignore-missing --quiet --status --strict --tag --text --version --warn --zero",
);

export const DATE_SAFE_FLAGS = flagChart(
  "-I -R -u --debug --help --rfc-email --universal --utc --version",
  [
    ["-d", "string"],
    ["-r", "string"],
    ["--date", "string"],
    ["--iso-8601", "string"],
    ["--reference", "string"],
    ["--rfc-3339", "string"],
  ],
);

export const HOSTNAME_SAFE_FLAGS = flagChart(
  "-A -V -a -d -f -h -i -I -s -v --alias --all-fqdns --all-ip-addresses --domain --fqdn --help " +
    "--ip-address --long --short --verbose --version",
);

// SPDX-License-Identifier: Apache-2.0
// 文本工具族的旗标画像：cat/head/tail/wc/grep/rg/sed/jq/file/tree/xargs。
// 每张画像依据命令的公开手册整理——只收录不改写文件、不访问外部资源的旗标。
import { flagChart } from "../flag-builder.js";

// 词法类选项的通用形态：以 "-" 起头且第二位是字母数字，用于识别「看起来像旗标」的词。
export const OPTION_PATTERN = /^-[a-zA-Z0-9_-]/;

export const TREE_SAFE_FLAGS = flagChart(
  "-A -C -D -F -J -N -Q -S -U -X -a -c -d -f -g -h -i -l -n -p -q -r -s -t -u -v -x " +
    "--device --dirsfirst --du --fflinks --filesfirst --fromfile --fromtabfile --gitignore --help " +
    "--hyperlink --ignore-case --inodes --info --matchdirs --metafirst --nolinks --noreport --prune " +
    "--si --version",
  [
    ["-H", "string"],
    ["-I", "string"],
    ["-L", "number"],
    ["-P", "string"],
    ["-T", "string"],
    ["--authority", "string"],
    ["--charset", "string"],
    ["--filelimit", "number"],
    ["--gitfile", "string"],
    ["--hintro", "string"],
    ["--houtro", "string"],
    ["--infofile", "string"],
    ["--scheme", "string"],
    ["--sort", "string"],
    ["--timefmt", "string"],
  ],
);

export const CAT_SAFE_FLAGS = flagChart(
  "-A -E -T -b -e -n -s -t -v --number --number-nonblank --show-all --show-ends " +
    "--show-nonprinting --show-tabs --squeeze-blank",
);

export const HEAD_TAIL_SAFE_FLAGS = flagChart("-q -v --quiet --silent --verbose", [
  ["-c", "number"],
  ["-n", "number"],
  ["--bytes", "number"],
  ["--lines", "number"],
]);

export const WC_SAFE_FLAGS = flagChart(
  "-L -c -l -m -w --bytes --chars --lines --max-line-length --words",
);

export const RG_SAFE_FLAGS = flagChart(
  "-F -H -L -N -S -c -h -i -l -n -s -u -v -w -x --case-sensitive --count --count-matches --files " +
    "--files-with-matches --fixed-strings --follow --hidden --ignore-case --invert-match --json " +
    "--line-number --line-regexp --no-filename --no-ignore --no-ignore-parent --no-ignore-vcs " +
    "--no-line-number --pcre2 --smart-case --unrestricted --with-filename --word-regexp",
  [
    ["-A", "number"],
    ["-B", "number"],
    ["-C", "number"],
    ["-T", "string"],
    ["-e", "string"],
    ["-g", "string"],
    ["-m", "number"],
    ["-t", "string"],
    ["--after-context", "number"],
    ["--before-context", "number"],
    ["--context", "number"],
    ["--glob", "string"],
    ["--ignore-file", "string"],
    ["--iglob", "string"],
    ["--max-count", "number"],
    ["--max-depth", "number"],
    ["--max-filesize", "string"],
    ["--regexp", "string"],
    ["--sort", "string"],
    ["--sortr", "string"],
    ["--type", "string"],
    ["--type-not", "string"],
  ],
);

export const GREP_SAFE_FLAGS = flagChart(
  "-E -F -G -H -I -L -P -R -a -b -c -h -i -l -n -o -q -r -s -T -u -U -v -V -w -x -Z -z " +
    "--basic-regexp --binary --byte-offset --count --dereference-recursive --extended-regexp " +
    "--files-with-matches --files-without-match --fixed-strings --help --ignore-case --initial-tab " +
    "--invert-match --line-buffered --line-number --line-regexp --max-count --no-group-separator " +
    "--no-filename --no-ignore-case --no-messages --null --null-data --only-matching --perl-regexp " +
    "--quiet --recursive --silent --text --unix-byte-offsets --version --with-filename --word-regexp",
  [
    ["-A", "number"],
    ["-B", "number"],
    ["-C", "number"],
    ["-D", "string"],
    ["-d", "string"],
    ["-e", "string"],
    ["-f", "string"],
    ["-m", "number"],
    ["--after-context", "number"],
    ["--before-context", "number"],
    ["--binary-files", "string"],
    ["--color", "string"],
    ["--colour", "string"],
    ["--context", "number"],
    ["--directories", "string"],
    ["--devices", "string"],
    ["--exclude", "string"],
    ["--exclude-dir", "string"],
    ["--exclude-from", "string"],
    ["--file", "string"],
    ["--group-separator", "string"],
    ["--include", "string"],
    ["--label", "string"],
    ["--regexp", "string"],
  ],
);

export const SED_SAFE_FLAGS = flagChart(
  "-E -n -r -s -u -z --debug --help --posix --quiet --regexp-extended --separate --silent " +
    "--unbuffered --version --zero-terminated",
  [
    ["-e", "string"],
    ["-l", "number"],
    ["--expression", "string"],
    ["--line-length", "number"],
  ],
);

export const XARGS_SAFE_FLAGS = flagChart("-0 -r -t -x", [
  ["-E", "EOF"],
  ["-I", "{}"],
  ["-L", "number"],
  ["-P", "number"],
  ["-d", "char"],
  ["-n", "number"],
  ["-s", "number"],
]);

export const FILE_SAFE_FLAGS = flagChart(
  "-0 -L -b -c -h -i -k -l -n -p -r -s -v --apple --brief --check-encoding --dereference --help " +
    "--keep-going --list --mime --mime-encoding --mime-type --no-buffer --no-dereference " +
    "--preserve-date --print0 --raw --special-files --version",
  [
    ["-F", "string"],
    ["-f", "string"],
    ["-m", "string"],
    ["--exclude", "string"],
    ["--exclude-quiet", "string"],
    ["--magic-file", "string"],
    ["--separator", "string"],
  ],
);

export const JQ_SAFE_FLAGS = flagChart(
  "-C -M -S -c -e -n -r -s --color-output --compact-output --exit-status --monochrome-output " +
    "--null-input --raw-output --slurp --sort-keys --tab",
  [["--indent", "number"]],
);

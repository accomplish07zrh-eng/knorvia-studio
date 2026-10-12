// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// M0-1 记账第二轮已复核的许可判定数据：第 2 类的 SPDX 正文比对结果、第 4 类第三方通知正文的
// 许可归属、以及 lobe-icons 许可正文的登记信息。正文比对过程见 bookkeeping-round2.mjs 的
// verifySpdx，数据只被该工具读取。

export const RECORDS = {
  schemaVersion: 1,
  spdxTag: "v3.29.0",
  spdxExactMatches: {
    "third-party/upstream/43070e2d4e532684de521b885f385d0841030efa2b1a20bafb76133a5e1379c1.txt":
      "Apache-2.0",
    "third-party/upstream/58d1e17ffe5109a7ae296caafcadfdbe6a7d176f0bc4ab01e12a689b0499d8bd.txt":
      "Apache-2.0",
    "third-party/upstream/a60eea817514531668d7e00765731449fe14d059d3249e0bc93b36de45f759f2.txt":
      "Apache-2.0",
    "third-party/upstream/cc3273e0694ea5896145e0677699b53471b03ea43021ddc50e7923fbb9f5023c.txt":
      "Google-Patent-WebM",
    "third-party/upstream/cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30.txt":
      "Apache-2.0",
  },
  upstreamNoticeLicenses: {
    "third-party/upstream/0164b7ab9ba129d156250887a12cd86e1ee6de9f021ae2ab2566e65e6b4edeb6.txt": {
      license: "Zlib",
      component: "Arm Neon implementation within libjpeg-turbo",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/02421fcfbfb1d656ef0b6ff4cd3c39f2946f08c3219fa42db482add7ce1f53ea.txt": {
      license: "Zlib",
      component: "zlib 1.3.1 bundled in FreeType",
      evidence: ["licensing/evidence/material-closure-20261002.json"],
    },
    "third-party/upstream/0c778720761a0b9ed03b83d55cc1dff2cd79e367528cfb8988176c4dc2b1dd27.txt": {
      license: "Zlib",
      component: "Arm Neon implementation within libjpeg-turbo",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/0d33f8c63be2bd52f40ab4754f0312fa5a510d4a01bd76869254d3b210850d9d.txt": {
      license: "libpng-2.0",
      component: "Arm palette material within libpng",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/12dffc8d88e81ef2fda9bb2142599751cced9564ec87cea683538980b1c42d75.txt": {
      license: "MIT",
      component: "Zilong Tan fasthash code within HarfBuzz",
      evidence: ["licensing/evidence/skia-harfbuzz-nested-notices-20261002.json"],
    },
    "third-party/upstream/1f7dca26d2d328c3dbb9b6fe3b15ec3cda08ffe2288e47b73d617454b256f959.txt": {
      license: "MIT",
      component: "MIT-licensed notice snapshot retained for the pinned dependency set",
      evidence: ["third-party/inventory.json"],
    },
    "third-party/upstream/23c23145f6eac25c28cdcc03d38506a5712a9a8cffb5bd5301457f6173ea696e.txt": {
      license: "MIT",
      component: "kurbo solve_itp port within HarfBuzz",
      evidence: ["licensing/evidence/skia-harfbuzz-nested-notices-20261002.json"],
    },
    "third-party/upstream/35213d2e8040f799a87200ed2fb6aa5c471cce8ab200826d2eb94f60b714b513.txt": {
      license: "FTL",
      component: "Adobe CFF interpreter material within FreeType",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/368cca1106be99d39ecd32a38d8305585d802a475effb66380b91ffc9bcf709b.txt": {
      license: "BSD-3-Clause",
      component: "Chromium BSD license for zlib contributions",
      evidence: ["licensing/evidence/skia-zlib-notices-20261002.json"],
    },
    "third-party/upstream/3e38787d12d0ac72ff96fb090cdb02dab1ba3930978501fc9091f1754471faf8.txt": {
      license: "CC0-1.0",
      component: "SipHash implementation within Expat",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/442042c9409b2655e490f26c7da9a4075399495519b79918c1fd51b6ed458ad5.txt": {
      license: "FTL",
      component: "Adobe CFF interpreter material within FreeType",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/5285d96f6aa3188193d5fbefd8710ed6a46af185e0a43817c17acee5f4b1ab3d.txt": {
      license: "MIT",
      component: "FreeType hashing routines",
      evidence: ["licensing/evidence/material-closure-20261002.json"],
    },
    "third-party/upstream/55b223e3f0fdcf0c262d3ff37aeb32ba063d300e53b97d56057bd3a34c8ae989.txt": {
      license: "BSD-3-Clause",
      component: "Chromium zlib CRC32 SIMD attribution",
      evidence: ["licensing/evidence/skia-zlib-notices-20261002.json"],
    },
    "third-party/upstream/6787208f83f659ccbc2223b2fde952ffa6f7e8aca62f1a8a2bf5bc51bb1b2383.txt": {
      license: "MIT",
      component: "fontTools solver port within HarfBuzz",
      evidence: ["licensing/evidence/skia-harfbuzz-fonttools-20261002.json"],
    },
    "third-party/upstream/866e6fa48cb8810d36d8d85a3085d7aa1c4317d3731f0ef84919428fee87bf71.txt": {
      license: "BSD-3-Clause",
      component: "nteract contributors notice snapshot retained for the pinned dependency set",
      evidence: ["third-party/inventory.json"],
    },
    "third-party/upstream/9059c5a7575258863d7694c333dc1c7d211087be94fd63db7622a9a5ab72036f.txt": {
      license: "FTL",
      component: "Adobe CFF interpreter material within FreeType",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/926f434136ee825ea37627e6283d3cf9b544c75d229c34a7e993729b2fd68076.txt": {
      license: "FTL",
      component: "Adobe CFF interpreter material within FreeType",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/9fe1a90bd32659d7953616283dc2bffaa165518aae9ace026040c42c559ba606.txt": {
      license: "Unicode-3.0",
      component: "Unicode 17 data used by HarfBuzz generated tables",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499.txt": {
      license: "CC0-1.0",
      component: "CC0 dedication referenced by Expat SipHash",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/a385735ac3240f1bf6f32884cb7c888d0e4f37c863eb9a1b40c6ba7e7192750a.txt": {
      license: "Zlib",
      component: "Arm Neon implementation within libjpeg-turbo",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/a76c3d70aed9b52b78196199da23e207ae6a01513ade15f40cfffe172b74b345.txt": {
      license: "Zlib",
      component: "Mark Adler/Chromium zlib fast-inflate attribution",
      evidence: ["licensing/evidence/skia-zlib-notices-20261002.json"],
    },
    "third-party/upstream/a8df3fb9aac5e61c2bd8cd45066240916d08aabd8cfd38f7f2d39757e90bb832.txt": {
      license: "FTL",
      component: "Adobe CFF interpreter material within FreeType",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/aca9c8fbe556e770221641d454905105c1c9ab7dac5491ceafa9793323ed72a4.txt": {
      license: "BSD-3-Clause",
      component: "Chromium zlib CPU detection attribution",
      evidence: ["licensing/evidence/skia-zlib-notices-20261002.json"],
    },
    "third-party/upstream/b48e789ef8667646edc2b727cafc882d814a7f16dc7eed31d3b397e2d33ca691.txt": {
      license: "Zlib",
      component: "Arm Neon implementation within libjpeg-turbo",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/b6d3d72e3ecc9d33d5de6d6547f68c577c203d623585adb6455d20216cced592.txt": {
      license: "Zlib",
      component: "Intel zlib CRC folding attribution",
      evidence: ["licensing/evidence/skia-zlib-notices-20261002.json"],
    },
    "third-party/upstream/bd36c8b474855fa294c2ec5c184544478ef3720aad37d65a6296a4f264fd2d3b.txt": {
      license: "FTL OR GPL-2.0-or-later",
      component: "FreeType license scope",
      evidence: ["licensing/evidence/material-closure-20261002.json"],
    },
    "third-party/upstream/c7c439b79bd9a71954f3509a8bd9ad05d44887114aa259beb8084e8e15ddbeb9.txt": {
      license: "FTL",
      component: "Adobe CFF interpreter material within FreeType",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/ca7047566630aa93a701f06df3817e2b7cfd7f12807281b2e09013b8f9132c70.txt": {
      license: "BSD-3-Clause",
      component: "ARM/Chromium zlib chunk-copy attribution",
      evidence: ["licensing/evidence/skia-zlib-notices-20261002.json"],
    },
    "third-party/upstream/cb95728cc2b4a3502bb8e69c019e0e5f01c0a218a855168e9c19d4df51582cd5.txt": {
      license: "ISC",
      component: "Grigori Goronzy UCD implementation within HarfBuzz",
      evidence: ["licensing/evidence/skia-harfbuzz-nested-notices-20261002.json"],
    },
    "third-party/upstream/cdb6b2a4e60de61211f8759676ea2251ed3a42d0d3d7b4e83eaccf4af1c15472.txt": {
      license: "BSD-3-Clause",
      component: "Adobe Glyph List / Zapf Dingbats data within FreeType",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/d38239a23bfadf84d2f89504f3f6e435ed200a30fe329a9c198f5000017b48a2.txt": {
      license: "FTL",
      component: "Adobe CFF interpreter material within FreeType",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/d38d82f865590ced088d26ebbb6abb1eae0b49e12cba492c14f323e73656a9a2.txt": {
      license: "FTL",
      component: "Adobe CFF interpreter material within FreeType",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/df694330c5856149838d49b822ec23986329fd8413bde5e816874f0ee04d1c56.txt": {
      license: "Zlib",
      component: "Chromium zlib 1.3.0.1 original zlib notice",
      evidence: ["licensing/evidence/skia-zlib-notices-20261002.json"],
    },
    "third-party/upstream/dfe146342f94e1595214e12a377ff40d383db36dadbc09b8cc071ef354114dc3.txt": {
      license: "BSD-3-Clause",
      component: "Chromium zlib slide-hash SIMD attribution",
      evidence: ["licensing/evidence/skia-zlib-notices-20261002.json"],
    },
    "third-party/upstream/e184ca99561e85dd1eda33fd6b9f2b09f4df94636b540532ad7358ffbae23fe1.txt": {
      license: "Zlib",
      component: "Arm Neon implementation within libjpeg-turbo",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
    "third-party/upstream/e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96.txt": {
      license: "Unicode-3.0",
      component: "Unicode 17 data used by HarfBuzz generated tables",
      evidence: ["licensing/evidence/skia-source-notice-pass-20261002.json"],
    },
  },
  lobeIconsLicense: {
    path: "third-party/ui/lobe-icons-LICENSE.txt",
    license: "MIT",
    evidence: [
      "packages/desktop/electron-builder.config.js",
      "packages/ui/src/assets/cli-icons/kernel-icon-sources.json",
    ],
  },
  item4OriginalCandidates: [
    "third-party/source-verification-20261003/README.md",
    "third-party/source-verification-20261003/apache-distribution-matrix.json",
    "third-party/source-verification-20261003/boolbase-published-tags.json",
    "third-party/source-verification-20261003/bounded-inherited-source-facts.json",
    "third-party/source-verification-20261003/bounded-svg-source-facts.json",
    "third-party/source-verification-20261003/canvas-published-artifacts.json",
    "third-party/source-verification-20261003/cloud-gui-preparation.json",
    "third-party/source-verification-20261003/evidence-registration-correction.md",
    "third-party/source-verification-20261003/inherited-implementation-next.md",
    "third-party/source-verification-20261003/input-bindings.json",
    "third-party/source-verification-20261003/native-projection-scope.json",
    "third-party/source-verification-20261003/npm-archive-headers.json",
    "third-party/source-verification-20261003/pinned-source-headers.json",
    "third-party/source-verification-20261003/product-runtime-closures.json",
    "third-party/source-verification-20261003/quickjs-original-notice-reads.json",
    "third-party/source-verification-20261003/quickjs-source-binding.json",
    "third-party/source-verification-20261003/quickjs-source-commit.json",
    "third-party/source-verification-20261003/quickjs-wasm-artifacts.json",
    "third-party/source-verification-20261003/react-skill-adaptations.diff",
    "third-party/source-verification-20261003/react-skill-identification.json",
    "third-party/source-verification-20261003/react-skill-identification.md",
    "third-party/source-verification-20261003/react-upstream-license-availability.json",
    "third-party/source-verification-20261003/unified-source-intake.md",
  ],
};

// 本轮新增的工具文件自登记。三者都是 Node 标准库实现，作者只读了第一轮报告、台账与上游指纹，
// 没有参照任何被替换的产品实现；license 与各文件头的 SPDX 标识一致。
const OWN_TOOL_BASIS =
  "New tooling authored for the M0-1 round-2 bookkeeping task. It reads the round-1 report, " +
  "licensing/current-files.json, licensing/upstream-baseline.json, Git history, the pinned upstream " +
  "fingerprints and the SPDX license texts, and writes only licensing/reviews.json; no product " +
  "implementation source was consulted or copied. The similarity routine follows the algorithm documented " +
  "in the round-1 report section 4. Node built-ins only. Bookkeeping review only; not a claim of " +
  "independent replacement of any upstream implementation.";
const OWN_EVIDENCE = [
  "docs/knorvia-provenance-bookkeeping-20261010.md",
  "licensing/upstream-baseline.json",
  "docs/knorvia-provenance-bookkeeping-round2-20261011.md",
];

export const OWN_FILES = [
  {
    path: "scripts/provenance/bookkeeping-round2.mjs",
    license: "MIT",
    basis: OWN_TOOL_BASIS,
    evidence: OWN_EVIDENCE,
  },
  {
    path: "scripts/provenance/bookkeeping-round2-similarity.mjs",
    license: "MIT",
    basis: OWN_TOOL_BASIS,
    evidence: OWN_EVIDENCE,
  },
  {
    path: "scripts/provenance/bookkeeping-round2-history.mjs",
    license: "MIT",
    basis: OWN_TOOL_BASIS,
    evidence: OWN_EVIDENCE,
  },
  {
    path: "scripts/provenance/bookkeeping-round2-records.mjs",
    license: "MIT",
    basis:
      "New data module produced by this round's bookkeeping tool. It records only the licence " +
      "determinations that were reviewed against SPDX license-list-data v3.29.0 and the evidence files " +
      "named in licensing/reviews.json; no product implementation source was consulted or copied. " +
      "Bookkeeping review only; not a claim of independent replacement of any upstream implementation.",
    evidence: [
      "docs/knorvia-provenance-bookkeeping-round2-20261011.md",
      "licensing/upstream-baseline.json",
    ],
  },
];
